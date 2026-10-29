import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync } from 'node:fs';
import { extname, join } from 'node:path';

import { load as loadConfig, requireMessage } from './config.mjs';
import { UsageError } from './errors.mjs';
import { getLine } from './status.mjs';

export const DOCS_SCAN_LIMITS = Object.freeze({
  fileBytes: 65536, totalBytes: 4 << 20, changes: 256, symbols: 256,
  documents: 128, matches: 128, entries: 2048, depth: 32, omissions: 128,
  gitBytes: 2 << 20, report: 6000,
});

const EXCLUDED = new Set(['.git', '.telos', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  'coverage', '.next', '.nuxt', '.cache', '__pycache__', 'venv', '.venv', 'generated']);
const DOC_EXT = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc', '.html', '.htm']);
const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const excluded = (path) => path.split('/').some((part) => EXCLUDED.has(part))
  || /(?:\.min\.js|\.bundle\.js|\.map|\.lock)$/.test(path)
  || /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(path);

function literalPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\\x00-\x1f\x7f:]/.test(value)
    || value.split('/').includes('..')) throw new Error('expected a literal repo-relative path without traversal');
  const path = value.split('/').filter((p) => p && p !== '.').join('/');
  if (!path) throw new Error('expected a nonempty repo-relative path');
  return path;
}

// Inspect each component before opening anything; missing old paths are valid diff evidence.
function inspect(root, path) {
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let stat;
    try { stat = lstatSync(current); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
    if (stat.isSymbolicLink()) throw new Error('symlink skipped');
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('non-directory path component');
    if (i === parts.length - 1) return stat;
  }
}

function git(root, args, overrides = [], encoding = 'utf8') {
  try {
    return execFileSync('git', ['-C', root, '-c', 'core.fsmonitor=false', ...overrides, '--literal-pathspecs', ...args], {
      encoding, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
      maxBuffer: encoding ? DOCS_SCAN_LIMITS.gitBytes : DOCS_SCAN_LIMITS.fileBytes + 1,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' },
    });
  } catch { throw new Error(`git ${args[0]} evidence unavailable (failure, 10 s timeout or ${DOCS_SCAN_LIMITS.gitBytes}-byte limit); restore git evidence and retry.`); }
}

function publicSymbols(text, path) {
  const names = new Set();
  if (extname(path) === '.py') {
    for (const match of text.matchAll(/^(?:async\s+)?(?:def|class)\s+([A-Za-z]\w*)\b/gm)) names.add(match[1]);
  } else {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
    for (const match of code.matchAll(/^\s*export\s+(?:(?:default|declare|async|abstract)\s+)*(?:function\s*\*?|class|const|let|var|interface|type|enum|namespace)\s+([\w$]+)/gm)) names.add(match[1]);
    for (const match of code.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]+)\}/gm)) {
      for (const entry of match[1].split(',')) {
        const name = /^(?:type\s+)?[\w$]+(?:\s+as\s+([\w$]+))?$/.exec(entry.trim());
        if (name) names.add(name[1] ?? entry.trim().replace(/^type\s+/, ''));
      }
    }
    for (const match of code.matchAll(/^\s*(?:module\.)?exports\.([\w$]+)\s*=/gm)) names.add(match[1]);
  }
  return [...names];
}

/** Find bounded documentation candidates from a phase tag through index and work tree; never writes. */
export function scanDocs(root, { phase, scopes = [] } = {}) {
  root = realpathSync(root);
  if (phase !== undefined && !/^\d{2}$/.test(phase)) throw new UsageError('phase must be NN (two digits)');
  if (!Array.isArray(scopes)) throw new UsageError('scopes must be literal repo-relative paths');
  scopes = scopes.map((path) => {
    try { const normalized = literalPath(path); inspect(root, normalized); return normalized; }
    catch (err) { throw new UsageError(`invalid scope ${JSON.stringify(path)}: ${err.message}`); }
  });
  inspect(root, '.telos/config.json');
  const cfg = loadConfig(root);
  if (cfg.profile !== 'deep') throw new Error(requireMessage('deep'));

  const omissions = [];
  let extraOmissions = 0, totalBytes = 0;
  function omit(path, reason) {
    if (omissions.length < DOCS_SCAN_LIMITS.omissions) omissions.push({ path, reason });
    else extraOmissions++;
  }
  function read(path) {
    try {
      const stat = inspect(root, path);
      if (!stat?.isFile()) throw new Error('missing or non-regular file');
      if (stat.size > DOCS_SCAN_LIMITS.fileBytes) throw new Error(`file byte limit (${DOCS_SCAN_LIMITS.fileBytes})`);
      if (totalBytes + stat.size > DOCS_SCAN_LIMITS.totalBytes) throw new Error(`total byte limit (${DOCS_SCAN_LIMITS.totalBytes})`);
      const fd = openSync(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        if (!fstatSync(fd).isFile()) throw new Error('non-regular file');
        const bytes = Buffer.alloc(Math.min(DOCS_SCAN_LIMITS.fileBytes, DOCS_SCAN_LIMITS.totalBytes - totalBytes) + 1);
        let size = 0, n;
        while (size < bytes.length && (n = readSync(fd, bytes, size, bytes.length - size, null))) size += n;
        return decode(bytes.subarray(0, size));
      } finally { closeSync(fd); }
    } catch (err) { omit(path, err.message); return null; }
  }
  function decode(bytes) {
    if (bytes.length > DOCS_SCAN_LIMITS.fileBytes) throw new Error(`file byte limit (${DOCS_SCAN_LIMITS.fileBytes})`);
    if (totalBytes + bytes.length > DOCS_SCAN_LIMITS.totalBytes) throw new Error(`total byte limit (${DOCS_SCAN_LIMITS.totalBytes})`);
    totalBytes += bytes.length;
    if (bytes.includes(0) || bytes.some((b) => b < 9 || (b > 13 && b < 32))) throw new Error('binary file skipped');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('binary/non-UTF-8 file skipped'); }
  }
  if (phase === undefined) {
    const text = read('.telos/STATUS.md');
    phase = text === null ? null : /^(\d{2})(?:-|$)/.exec(getLine(text, 'Phase'))?.[1];
    if (!phase) throw new Error('No phase in STATUS; pass NN to telos docs-scan.');
  }
  const baseline = `telos/${phase}-start`;
  let hash;
  try { hash = git(root, ['rev-parse', '--verify', `${baseline}^{commit}`]).trim(); }
  catch { throw new Error(`Missing baseline ${baseline}; restore the phase tag from approval (/telos:approve), then retry. No history fallback.`); }
  // Even raw work-tree diffs/status can invoke clean filters. Disable every configured driver.
  const filterNames = new Set(git(root, ['config', '--null', '--name-only', '--list']).split('\0')
    .map((key) => /^filter\.(.+)\.(?:clean|smudge|process|required)$/.exec(key)?.[1]).filter(Boolean));
  const filterOverrides = [];
  for (const name of filterNames) {
    if (/[=\r\n]/.test(name)) throw new Error('Cannot safely disable a Git filter with an unsupported name; remove that filter configuration and retry.');
    for (const key of ['clean', 'smudge', 'process', 'required']) filterOverrides.push('-c', `filter.${name}.${key}=${key === 'required' ? 'false' : ''}`);
  }
  const report = { baseline, changed: [], symbols: [], matches: [], omissions };
  const changed = new Set(), evidence = new Map();
  const selected = (path) => !scopes.length || scopes.some((scope) => path === scope || path.startsWith(`${scope}/`));
  for (const entry of git(root, ['ls-files', '--stage', '-z']).split('\0')) {
    if (entry.startsWith('160000 ')) {
      const path = entry.slice(entry.indexOf('\t') + 1);
      if (selected(path)) omit(path, 'submodule skipped; work tree not traversed');
    }
  }
  let changeLimit = false;
  function add(path, mode, blob, worktree = false, paired = false) {
    if (!paired && !selected(path)) return;
    try { if (literalPath(path) !== path) throw new Error('noncanonical path'); inspect(root, path); }
    catch (err) { omit(path, err.message); return; }
    if (excluded(path)) { omit(path, 'generated/vendor/state tree skipped'); return; }
    if (!changed.has(path) && changed.size >= DOCS_SCAN_LIMITS.changes) { changeLimit = true; return; }
    changed.add(path);
    if (mode !== '100644' && mode !== '100755' && mode !== '000000') {
      omit(path, mode === '120000' ? 'symlink skipped' : 'non-regular git entry skipped'); return;
    }
    if (mode === '000000') return;
    const key = worktree ? `worktree:${path}` : `${blob}:${path}`;
    evidence.set(key, { path, blob, worktree });
  }
  function collect(revisions) {
    const out = git(root, ['diff', '--no-ext-diff', '--no-textconv', '--no-relative',
      `--ignore-submodules=${revisions.length ? 'none' : 'all'}`,
      '--raw', '-z', '--abbrev=64', '-M', ...revisions, '--'], filterOverrides);
    const fields = out.split('\0');
    for (let i = 0; i < fields.length - 1;) {
      const match = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z]\d*)$/.exec(fields[i++]);
      if (!match) throw new Error('Malformed git diff evidence; retry with valid git output.');
      const [, oldMode, mode, oldBlob, blob, status] = match;
      const oldPath = fields[i++];
      const path = /^[RC]/.test(status) ? fields[i++] : oldPath;
      if (!path || !oldPath) throw new Error('Truncated git diff evidence.');
      // Either side of a rename selects both paths and their before/after evidence.
      if (!selected(path) && !selected(oldPath)) continue;
      add(oldPath, oldMode, oldBlob, false, true);
      add(path, mode, blob, /^0+$/.test(blob), true);
    }
  }
  collect([`${hash}..HEAD`]);
  collect(['--cached', 'HEAD']);
  collect([]);
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], filterOverrides).split('\0');
  for (let i = 0; i < status.length - 1; i++) {
    if (status[i].startsWith('?? ')) add(status[i].slice(3), '100644', null, true);
    if (/[RC]/.test(status[i].slice(0, 2))) i++;
  }
  if (changeLimit) omit('(changes)', `changed path limit (${DOCS_SCAN_LIMITS.changes}); additional paths and symbols omitted`);
  report.changed = [...changed].sort();
  const symbolKeys = new Set(), blobs = new Map();
  let symbolLimit = false;
  for (const { path, blob, worktree } of evidence.values()) {
    if (DOC_EXT.has(extname(path))) continue;
    if (!JS_EXT.has(extname(path)) && extname(path) !== '.py') { omit(path, 'unsupported source language; path references only'); continue; }
    let text;
    if (worktree) text = read(path);
    else {
      if (!blobs.has(blob)) {
        try {
          const size = Number(git(root, ['cat-file', '-s', blob]).trim());
          if (!Number.isSafeInteger(size) || size < 0 || size > DOCS_SCAN_LIMITS.fileBytes) throw new Error(`file byte limit (${DOCS_SCAN_LIMITS.fileBytes})`);
          if (totalBytes + size > DOCS_SCAN_LIMITS.totalBytes) throw new Error(`total byte limit (${DOCS_SCAN_LIMITS.totalBytes})`);
          // Buffer output preserves binary detection and invalid UTF-8 without replacement.
          const bytes = git(root, ['cat-file', 'blob', blob], [], null);
          blobs.set(blob, { text: decode(bytes) });
        } catch (err) { blobs.set(blob, { error: err.message }); }
      }
      const result = blobs.get(blob);
      if (result.error) omit(path, result.error);
      text = result.text ?? null;
    }
    if (text === null) continue;
    for (const name of publicSymbols(text, path)) {
      const key = `${path}:${name}`;
      if (symbolKeys.has(key)) continue;
      if (report.symbols.length >= DOCS_SCAN_LIMITS.symbols) { symbolLimit = true; break; }
      symbolKeys.add(key);
      report.symbols.push({ path, name });
    }
  }
  if (symbolLimit) omit('(symbols)', `symbol candidate limit (${DOCS_SCAN_LIMITS.symbols})`);
  report.symbols.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

  const docs = new Set(), visited = new Set();
  let entries = 0, traversalLimit = false, documentLimit = false;
  function visit(path, depth = 0, counted = false) {
    if (visited.has(path)) return;
    visited.add(path);
    if ((!counted && ++entries > DOCS_SCAN_LIMITS.entries) || depth > DOCS_SCAN_LIMITS.depth) { traversalLimit = true; return; }
    try {
      path = literalPath(path);
      if (excluded(path)) throw new Error('generated/vendor/state tree skipped');
      const stat = inspect(root, path);
      if (!stat) throw new Error('configured documentation missing');
      if (stat.isDirectory()) {
        const dir = opendirSync(join(root, path));
        const children = [];
        let overflow = false;
        try {
          let entry;
          while ((entry = dir.readSync())) {
            if (entries >= DOCS_SCAN_LIMITS.entries) { traversalLimit = true; overflow = true; break; }
            entries++;
            children.push(entry.name);
          }
        } finally { dir.closeSync(); }
        if (overflow) { omit(path, 'traversal entry limit; directory omitted'); return; }
        for (const child of children.sort()) visit(`${path}/${child}`, depth + 1, true);
      } else if (stat.isFile()) {
        if (docs.size >= DOCS_SCAN_LIMITS.documents) documentLimit = true;
        else docs.add(path);
      } else throw new Error('non-regular document skipped');
    } catch (err) { omit(path, err.message); }
  }
  for (const path of [cfg.docs.readme, ...cfg.docs.paths]) visit(path.replace(/\/$/, ''));
  if (traversalLimit) omit('(documents)', `traversal entry/depth limit (${DOCS_SCAN_LIMITS.entries}/${DOCS_SCAN_LIMITS.depth})`);
  if (documentLimit) omit('(documents)', `document candidate limit (${DOCS_SCAN_LIMITS.documents})`);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = [
    ...report.changed.map((path) => ({ pattern: new RegExp(`(^|[^\\w./@+-])(?:\\./)?${escape(path)}(?=$|[^\\w./@+-])`), reason: `path: ${path}` })),
    ...report.symbols.map(({ name, path }) => ({ pattern: new RegExp(`(^|[^\\w$])${escape(name)}(?=$|[^\\w$])`), reason: `symbol: ${name} (${path})` })),
  ];
  let matchLimit = false;
  for (const path of [...docs].sort()) {
    const text = read(path);
    if (text === null) continue;
    let previous;
    for (const [index, line] of text.split('\n').entries()) {
      const reasons = candidates.filter(({ pattern }) => pattern.test(line)).map(({ reason }) => reason);
      if (!reasons.length) { previous = null; continue; }
      if (previous) {
        previous.end = index + 1;
        previous.reasons = [...new Set([...previous.reasons, ...reasons])];
      } else if (report.matches.length >= DOCS_SCAN_LIMITS.matches) { matchLimit = true; break; }
      else {
        previous = { path, start: index + 1, end: index + 1, reasons };
        report.matches.push(previous);
      }
    }
  }
  if (matchLimit) omit('(matches)', `match candidate limit (${DOCS_SCAN_LIMITS.matches})`);
  if (extraOmissions) omissions.push({ path: '(omissions)', reason: `${extraOmissions} additional omissions; detail limit (${DOCS_SCAN_LIMITS.omissions})` });
  return report;
}

/** Render whole evidence rows within 6000 characters, retaining coverage and omission status. */
export function renderDocsScan(scan) {
  const q = (value) => JSON.stringify(value);
  const rows = [
    `Baseline: ${scan.baseline} → HEAD + index + work tree (including untracked)`,
    'Heuristic candidates only; no semantic completeness guarantee. Literal paths, simple JS/TS exports and Python top-level public definitions.',
    `Limits: ${Object.entries(DOCS_SCAN_LIMITS).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    `Doc matches (${scan.matches.length}):`, ...scan.matches.map((m) => `- ${q(m.path)}:${m.start}-${m.end} — ${m.reasons.map(q).join('; ')}`),
    `Omissions (${scan.omissions.length}):`, ...scan.omissions.map((o) => `- ${q(o.path)}: ${q(o.reason)}`),
    `Changed paths (${scan.changed.length}):`, ...scan.changed.map((path) => `- ${q(path)}`),
    `Symbol candidates (${scan.symbols.length}):`, ...scan.symbols.map((s) => `- ${q(s.name)} in ${q(s.path)}`),
  ];
  const result = [];
  let used = 0, omitted = 0;
  for (const row of rows) {
    if (used + row.length + 1 > DOCS_SCAN_LIMITS.report - 200) { omitted++; continue; }
    result.push(row); used += row.length + 1;
  }
  result.push(`Coverage: ${scan.omissions.length || omitted ? 'incomplete' : 'bounded heuristic scan completed'}; ${scan.omissions.length} scan omission records; ${omitted} report rows omitted. Inspect omissions before doc-sync.`);
  return `${result.join('\n')}\n`;
}

/** @type {import('./cli.mjs').Command} */
export const docsScanCommand = {
  help: '[NN] [--scope path]… (deep, read-only documentation candidates)',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    const scopes = [];
    let phase;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--scope' && args[i + 1] && !args[i + 1].startsWith('--')) scopes.push(args[++i]);
      else if (phase === undefined && /^\d{2}$/.test(args[i])) phase = args[i];
      else throw new UsageError(`usage: docs-scan ${docsScanCommand.help}`);
    }
    try { stdout.write(renderDocsScan(scanDocs(root, { phase, scopes }))); }
    catch (err) {
      if (err instanceof UsageError) throw err;
      stderr.write(`${err.message.startsWith('Requires deep profile.') ? '' : 'telos docs-scan: '}${err.message}\n`);
      return 1;
    }
    return 0;
  },
};
