import { closeSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { basename, join, posix } from 'node:path';

import { detect } from './detect.mjs';
import { UsageError } from './errors.mjs';
import { headMetadata, isRepo, porcelainFiles, recentPathCounts } from './git.mjs';

const EXCLUDED = new Set([
  '.git', '.telos', '.planning', 'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage',
  '.cache', '.next', '.nuxt', '.output', '.astro', '.turbo', '.parcel-cache', '.svelte-kit',
  '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.nox',
]);
const LOCKS = /^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|uv\.lock|poetry\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|bz2|xz|7z|tar|woff2?|ttf|otf|eot|mp[34]|mov|wav|ogg|exe|dll|so|dylib|class|pyc|pyo|wasm|bin|sqlite3?|db)$/i;
const SOURCE = /\.(?:[cm]?[jt]sx?|astro|vue|svelte|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|sh)$/i;
const SAMPLE_BYTES = 65536;
const MANIFEST_BYTES = 262144;
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const byPath = (a, b) => lexical(a.path, b.path);
const unsupported = (path) => /[\x00-\x1f\x7f`\u2028\u2029]/.test(path);
const display = (value) => JSON.stringify(value);
const isManifest = (path) => /^(package\.json|pyproject\.toml|requirements\.txt|astro\.config\.[^/]+)$/.test(basename(path));

function sampleFile(path, limit) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(limit);
    const length = readSync(fd, buffer, 0, limit, 0);
    const bytes = buffer.subarray(0, length);
    if (bytes.some((b) => b < 32 && ![9, 10, 13].includes(b))) return null;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true }); }
    catch { return null; }
  } finally { closeSync(fd); }
}

function inventory(root, note) {
  const files = [], texts = new Map();
  function walk(dir, prefix = '') {
    let children;
    try { children = readdirSync(dir, { withFileTypes: true }); }
    catch (err) {
      if (!prefix) throw err;
      note('Unreadable entries omitted', prefix);
      return;
    }
    children.sort((a, b) => lexical(a.name, b.name));
    for (const entry of children) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (unsupported(path)) { note('Unsupported paths omitted', path); continue; }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!EXCLUDED.has(entry.name)) walk(join(dir, entry.name), path);
        continue;
      }
      if (!entry.isFile() || LOCKS.test(entry.name) || BINARY.test(entry.name)) continue;
      try {
        const absolute = join(root, path);
        const stat = lstatSync(absolute);
        if (!stat.isFile()) continue;
        const text = sampleFile(absolute, isManifest(path) ? MANIFEST_BYTES : SAMPLE_BYTES);
        if (text === null) continue;
        const lines = text ? text.split('\n').length - Number(text.endsWith('\n')) : 0;
        files.push({ path, size: stat.size, lines });
        if (isManifest(path)) texts.set(path, text);
      } catch { note('Unreadable entries omitted', path); }
    }
  }
  walk(root);
  return { files: files.sort(byPath), texts };
}

function treeRows(files) {
  const rows = new Map();
  for (const file of files) {
    const parts = file.path.split('/');
    for (let depth = 1; depth <= Math.min(3, parts.length); depth++) {
      const path = parts.slice(0, depth).join('/');
      const directory = depth < parts.length;
      const row = rows.get(path) ?? { path, directory, count: 0 };
      row.count++;
      rows.set(path, row);
    }
  }
  return [...rows.values()].sort(byPath);
}

function manifestEvidence(files, texts, note) {
  const manifests = [], declared = [];
  const add = (path, evidence, value) => manifests.push({ path, evidence, value });
  for (const file of files.filter((f) => texts.has(f.path))) {
    const { path, size } = file;
    const text = texts.get(path);
    add(path, 'manifest/config data; never executed', `${size} bytes`);
    if (size > MANIFEST_BYTES) { note('Oversized manifests omitted from parsing', path); continue; }
    if (basename(path) === 'package.json') {
      let pkg;
      try {
        pkg = JSON.parse(text);
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('expected object');
      } catch { note('Malformed manifests', path); continue; }
      const target = (value, evidence) => {
        if (typeof value === 'string') {
          const candidate = posix.normalize(posix.join(posix.dirname(path), value));
          if (!candidate.startsWith('../') && !posix.isAbsolute(value)) declared.push({ path: candidate, reason: `${path} ${evidence} candidate` });
        } else if (value && typeof value === 'object') {
          for (const key of Object.keys(value).sort(lexical)) target(value[key], `${evidence}.${key}`);
        }
      };
      for (const key of ['name', 'scripts', 'main', 'bin', 'exports', 'engines', 'dependencies', 'devDependencies']) {
        if (pkg[key] === undefined) continue;
        if (pkg[key] && typeof pkg[key] === 'object') {
          for (const name of Object.keys(pkg[key]).sort(lexical)) add(path, `${key}.${name}`, pkg[key][name]);
        } else add(path, key, pkg[key]);
      }
      for (const key of ['main', 'bin', 'exports']) target(pkg[key], key);
    } else if (basename(path) === 'pyproject.toml') {
      let section = '';
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const table = /^\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
        if (table) { section = table[1]; add(path, 'table', section); continue; }
        const pair = /^(?:([\w.-]+)|"([^"]+)"|'([^']+)')\s*=\s*(.*)$/.exec(line);
        if (!pair) { note('Unparsed TOML lines (partial evidence)', path); continue; }
        const key = pair[1] ?? pair[2] ?? pair[3];
        add(path, `${section}.${key}`, pair[4]);
        if (section === 'project.scripts') {
          const module = /^["']([\w.]+):[\w.]+["']/.exec(pair[4])?.[1]?.replaceAll('.', '/');
          if (module) {
            for (const base of ['', 'src/']) declared.push({
              path: posix.join(posix.dirname(path), `${base}${module}.py`),
              reason: `${path} project.scripts.${key} candidate`,
            });
          }
        }
      }
    } else {
      for (const [i, line] of text.split(/\r?\n/).entries()) {
        if (line.trim()) add(path, `data line ${i + 1}`, line.trim());
      }
    }
  }
  return { manifests, declared };
}

/** Deterministic, read-only repository evidence; works without git or Telos initialization. */
export function scanRepo(root) {
  const warnings = [], omissions = new Map();
  const note = (reason, path) => {
    const row = omissions.get(reason) ?? { count: 0, path };
    row.count++;
    omissions.set(reason, row);
  };
  const { files, texts } = inventory(root, note);
  const metadata = headMetadata(root);
  warnings.push(...metadata.warnings);
  const { manifests, declared } = manifestEvidence(files, texts, note);
  const detectedInputs = ['package.json', 'pyproject.toml', 'requirements.txt'];
  const safeDetection = detectedInputs.every((path) => {
    try {
      const stat = lstatSync(join(root, path));
      return stat.isFile() && stat.size <= MANIFEST_BYTES && texts.has(path);
    } catch (err) { return err.code === 'ENOENT'; }
  });
  if (safeDetection) {
    try {
      const detection = detect(root);
      manifests.push({ path: '.', evidence: 'detected stack', value: detection.stack });
      for (const [key, value] of Object.entries(detection.checks).sort(([a], [b]) => lexical(a, b))) {
        manifests.push({ path: '.', evidence: `check ${key} (${detection.evidence[key]})`, value });
      }
      if (detection.evidence.error) note('Manifest detection error', detection.evidence.error);
    } catch { warnings.push('Manifest detection unavailable; see inventory and partial evidence.'); }
  } else warnings.push('Manifest detection omitted: unreadable, oversized or symlink input.');
  const eligible = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    if (/(?:^|\/)src\/pages\/.+\.astro$/.test(file.path)) declared.push({ path: file.path, reason: 'Astro src/pages candidate' });
    if (/(?:^|\/)(?:__main__|main|app)\.py$/.test(file.path)) declared.push({ path: file.path, reason: 'Python main/app module candidate' });
  }
  const entryMap = new Map();
  for (const entry of declared) {
    if (eligible.has(entry.path) && !entryMap.has(entry.path)) entryMap.set(entry.path, entry);
  }
  const entries = [...entryMap.values()].sort(byPath);
  const tests = files.filter((f) => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|(?:^|\/)(?:test_[^/]+\.py|[^/]+(?:\.test|\.spec)\.[^/]+)$/.test(f.path));
  const largest = [...files].sort((a, b) => b.size - a.size || byPath(a, b));
  const history = metadata.head ? recentPathCounts(root) : [];
  if (history === null) warnings.push('Git history unavailable; churn omitted.');
  const changed = (history ?? []).filter((f) => eligible.has(f.path));
  const suggestions = [], suggested = new Set();
  for (const [candidates, reason] of [[entries, 'entry candidate'], [changed, 'recent churn'], [largest, 'size']]) {
    for (const candidate of candidates) {
      const file = eligible.get(candidate.path);
      if (suggestions.length >= 8 || suggested.has(file.path) || !file.lines) continue;
      if (!SOURCE.test(file.path) && !entries.some((e) => e.path === file.path)) continue;
      suggested.add(file.path);
      suggestions.push({ path: file.path, start: 1, end: Math.min(file.lines, 80), reason: candidate.reason ?? reason });
    }
  }
  const dirty = porcelainFiles(root).filter((path) => !unsupported(path)).sort(lexical);
  for (const [reason, row] of [...omissions].sort(([a], [b]) => lexical(a, b))) {
    const example = display(row.path).slice(0, 140);
    warnings.push(`${reason}: ${row.count} (example ${example})`);
  }
  return { head: metadata.head, files, tree: treeRows(files), manifests, entries, tests, largest, changed, suggestions, dirty, warnings };
}

/** Fit complete rows, keeping section labels, metadata, warning evidence and omission counts. */
export function renderScan(scan, maxChars = 8000) {
  const sections = [
    ['Tree (depth 3; directory counts cover all eligible files)', scan.tree.map((r) => r.directory ? `${r.path}/ (${r.count} files)` : r.path)],
    ['Manifests / stack / scripts / checks', scan.manifests.map((r) => `${r.path}: ${r.evidence} = ${display(r.value)}`)],
    ['Entries (candidates, not proven flows)', scan.entries.map((r) => `${r.path}: ${r.reason}`)],
    ['Tests', scan.tests.map((r) => r.path)],
    ['Largest (bytes)', scan.largest.map((r) => `${r.path}: ${r.size}`)],
    ['Changed (last 100 commits)', scan.changed.map((r) => `${r.path}: ${r.count}`)],
    ['Suggestions', scan.suggestions.map((r) => `${r.path}:${r.start}-${r.end}: ${r.reason}`)],
    ['Dirty (git work tree / index)', scan.dirty],
    ['Warnings', scan.warnings],
  ];
  const selected = sections.map(() => []);
  const header = `HEAD: ${scan.head ?? 'unavailable'}\nFiles: ${scan.files.length}\n`;
  const compose = () => header + sections.map(([label, rows], i) => {
    const omitted = rows.length - selected[i].length;
    return `${label}:\n${selected[i].map((row) => `  ${row}\n`).join('')}${omitted ? `  (${omitted} rows omitted)\n` : rows.length ? '' : '  (none)\n'}`;
  }).join('');
  if (!Number.isInteger(maxChars) || maxChars < compose().length) throw new RangeError('Scan budget too small for metadata and section labels.');
  // Reserve warnings before distributing remaining space one row per section at a time.
  const omission = (n) => n ? `  (${n} rows omitted)\n`.length : 0;
  let used = compose().length;
  const add = (i, row) => {
    const remaining = sections[i][1].length - selected[i].length;
    const delta = row.length + 3 + omission(remaining - 1) - omission(remaining);
    if (used + delta <= maxChars) { selected[i].push(row); used += delta; }
  };
  for (const row of sections[8][1]) add(8, row);
  const longest = Math.max(...sections.slice(0, 8).map(([, rows]) => rows.length));
  for (let at = 0; at < longest; at++) {
    for (let i = 0; i < 8; i++) {
      const row = sections[i][1][at];
      if (row !== undefined) add(i, row);
    }
  }
  return compose();
}

/** CLI adapter: no initialization, options or positional arguments required. */
export const mapScanCommand = {
  help: 'Deterministic repository inventory, capped at 2000 estimated tokens: map-scan',
  needsTelos: false,
  run({ args, root, cwd, stdout, stderr }) {
    if (args.length) throw new UsageError('map-scan takes no arguments or options');
    try {
      stdout.write(renderScan(scanRepo(root && isRepo(root) ? root : cwd)));
      return 0;
    } catch (err) {
      stderr.write(`telos map-scan: ${err.message}\n`);
      return 1;
    }
  },
};
