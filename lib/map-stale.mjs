import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { load } from './config.mjs';
import { porcelainFiles } from './git.mjs';
import { telosDir } from './repo.mjs';

// Deep Stop reminder (SPEC §8): new top-level directories or declared entry points since the
// commit in the MAP header. Mechanical and advisory: names and manifests only, never file contents
// of sources, no refresh and never a blocking exit.

const HEADER = /^<!-- telos-map: commit ([0-9a-f]{40}) · /;
const EXCLUDED = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', '__pycache__',
  'venv', 'generated', 'tmp']);
const SHOWN = 5;
const GIT = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 2 << 20, timeout: 5000,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } };

const git = (root, args) => execFileSync('git', ['-C', root, ...args], GIT);
const included = (dir) => !dir.startsWith('.') && !EXCLUDED.has(dir);
const list = (items) => items.slice(0, SHOWN).join(', ') + (items.length > SHOWN ? `, +${items.length - SHOWN} more` : '');

/** @returns {string[]} `package.json <field>` and `pyproject.toml project.scripts.<name>` entry keys */
function entryKeys(pkgText, pyText) {
  const keys = [];
  try {
    const pkg = JSON.parse(pkgText ?? 'null');
    const walk = (value, key) => {
      if (typeof value === 'string') keys.push(`package.json ${key}`);
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const name of Object.keys(value).sort()) walk(value[name], `${key}.${name}`);
      }
    };
    if (pkg && typeof pkg === 'object') for (const field of ['main', 'bin', 'exports']) walk(pkg[field], field);
  } catch { /* a malformed manifest declares nothing here */ }
  let section = '';
  for (const line of (pyText ?? '').split(/\r?\n/)) {
    const table = /^\s*\[([^\]]+)\]/.exec(line);
    if (table) section = table[1].trim();
    else if (section === 'project.scripts') {
      const name = /^\s*["']?([\w.-]+)["']?\s*=/.exec(line)?.[1];
      if (name) keys.push(`pyproject.toml project.scripts.${name}`);
    }
  }
  return keys;
}

const atCommit = (root, commit, path) => { try { return git(root, ['show', `${commit}:${path}`]); } catch { return null; } };
const current = (root, path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null);

/**
 * Deep only: a one-line advisory when top-level directories or declared entry points appeared since
 * the MAP header commit; null when silent (lower profiles, no or broken baseline, stop_hook_active).
 * @param {string} root
 * @param {{ stop_hook_active?: boolean }} input Stop hook input
 * @returns {string | null}
 */
export function mapStaleness(root, input) {
  if (input?.stop_hook_active) return null;
  try {
    if (load(root).profile !== 'deep') return null;
    const base = HEADER.exec(readFileSync(join(telosDir(root), 'MAP.md'), 'utf8'))?.[1];
    if (!base) return null;
    git(root, ['cat-file', '-e', `${base}^{commit}`]);
    const dirs = (rev) => git(root, ['ls-tree', '-d', '--name-only', '-z', rev]).split('\0').filter(Boolean);
    const before = new Set(dirs(base));
    let now = [];
    try { now = dirs('HEAD'); } catch { /* no HEAD: only work tree paths count */ }
    for (const path of porcelainFiles(root)) if (path.includes('/')) now.push(path.split('/')[0]);
    const added = [...new Set(now)].filter((d) => included(d) && !before.has(d)).sort().map((d) => `${d}/`);
    const old = new Set(entryKeys(atCommit(root, base, 'package.json'), atCommit(root, base, 'pyproject.toml')));
    const entries = entryKeys(current(root, 'package.json'), current(root, 'pyproject.toml')).filter((k) => !old.has(k));
    if (!added.length && !entries.length) return null;
    const what = [added.length && `new top-level ${list(added)}`, entries.length && `new entry points ${list(entries)}`].filter(Boolean);
    return `telos map: .telos/MAP.md (commit ${base.slice(0, 7)}) may be stale — ${what.join('; ')}; run /telos:map --refresh when convenient (advisory).`;
  } catch {
    return null;
  }
}

/**
 * Show an advisory once per session: a repeat of the last one shown in `session` is silenced.
 * @returns {string | null}
 */
export function remindOnce(root, session, advisory) {
  if (!advisory) return null;
  try {
    const dir = join(telosDir(root), '.cache');
    const id = createHash('sha256').update(String(session ?? 'none')).digest('hex').slice(0, 16);
    const path = join(dir, `map-stale-${id}`);
    if (existsSync(path) && readFileSync(path, 'utf8') === advisory) return null;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, advisory);
  } catch { /* an unwritable cache only means the reminder may repeat */ }
  return advisory;
}

/**
 * Stop hook output: a check failure blocks alone (exit 2, stderr); an advisory alone is a
 * nonblocking `systemMessage` with exit 0.
 * @returns {{ exit: number, stderr: string, stdout: string }}
 */
export function composeStop(report, advisory) {
  if (report) return { exit: 2, stderr: `${report}\n`, stdout: '' };
  return { exit: 0, stderr: '', stdout: advisory ? `${JSON.stringify({ systemMessage: advisory })}\n` : '' };
}
