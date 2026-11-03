import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { UsageError } from '../../lib/errors.mjs';
import { canonical, guardWorkDir, TELOS_ROOT, within, WorkspaceError } from './workspace.mjs';

// What a session may read and how it is configured (bench/PROTOCOL.md §5.1 items 1, 3–5). The dedicated
// OS user and the launcher that enforce `readable` are set up in the pilot (07-08) and the session runner.

/** Plugin runtime roots (D-08); everything else in the checkout stays out of the export. */
export const RUNTIME = Object.freeze(['.claude-plugin', 'agents', 'bin', 'hooks', 'lib', 'shared', 'skills', 'templates']);
const NEVER = new Set(['bench', 'test', '.telos']);
/** Names Claude Code loads as instructions from every directory above its working dir (PROTOCOL §5.1 item 4, §5.2). */
const INSTRUCTIONS = Object.freeze(['CLAUDE.md', 'CLAUDE.local.md', '.claude']);
/** Hosts the session sandbox may reach: the model API only (PROTOCOL §5.1 item 5). */
export const MODEL_HOSTS = Object.freeze(['api.anthropic.com']);
const refuse = (reason) => { throw new WorkspaceError(`REFUSED: ${reason}`); };

/**
 * Copy the tracked runtime files of `telosDir` into a fresh `outDir`, keeping file modes and inner symlinks.
 * @returns {string[]} exported repo-relative paths, sorted
 */
export function exportPlugin(telosDir, outDir) {
  const src = canonical(telosDir);
  const out = canonical(outDir);
  const home = canonical(TELOS_ROOT);
  if (within(out, src) || within(src, out) || within(out, home) || within(home, out)) {
    throw new UsageError(`export dir ${outDir} must not overlap the plugin source or the Telos checkout`);
  }
  const paths = execFileSync('git', ['-C', src, 'ls-files', '-z', '--', ...RUNTIME], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\0').filter(Boolean)
    .filter((p) => !p.split('/').some((s) => NEVER.has(s)))
    .sort();
  rmSync(out, { recursive: true, force: true });
  const exported = [];
  for (const p of paths) {
    const from = join(src, p);
    let st;
    try { st = lstatSync(from); } catch { continue; }
    const to = join(out, p);
    mkdirSync(dirname(to), { recursive: true });
    if (st.isSymbolicLink()) {
      const link = readlinkSync(from);
      const target = relative(src, resolve(dirname(from), link));
      if (!within(resolve(src, target), src) || !RUNTIME.includes(target.split('/')[0]) || target.split('/').some((s) => NEVER.has(s))) {
        refuse(`symlink ${p} in the plugin export points outside the runtime (${link})`);
      }
      symlinkSync(link, to);
    } else if (st.isFile()) {
      copyFileSync(from, to);
      chmodSync(to, st.mode & 0o777);
    } else continue;
    exported.push(p);
  }
  mkdirSync(out, { recursive: true });
  chmodSync(out, 0o700); // closed to the benchmark user until a C/D session opens it read-only
  return exported;
}

/**
 * Fresh per-run `CLAUDE_CONFIG_DIR` (settings + optional credentials only) and a minimal environment.
 * `configTemplate`: `{ settings?, credentials?, allowedDomains?, passEnv? }` — base settings (shared permission
 * mode and allow list, D-09), a credentials file to copy, model API hosts, host env names to pass through.
 * @returns {{env: object, settingsPath: string, readable: string[]}}
 */
export function sessionEnv(cell, { configTemplate = {}, workDir } = {}) {
  const root = guardWorkDir(workDir);
  const dir = join(root, 'config', cell.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = configTemplate.settings ?? {};
  const permissions = base.permissions ?? {};
  const settings = {
    ...base,
    autoMemoryEnabled: false,
    permissions: { ...permissions, allow: [...(permissions.allow ?? [])],
      deny: [...new Set([...(permissions.deny ?? []), 'WebFetch', 'WebSearch'])] },
    sandbox: { ...base.sandbox, enabled: true, allowUnsandboxedCommands: false,
      network: { ...base.sandbox?.network, allowedDomains: [...(configTemplate.allowedDomains ?? MODEL_HOSTS)] } },
  };
  const settingsPath = join(dir, 'settings.json');
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  if (configTemplate.credentials) {
    copyFileSync(configTemplate.credentials, join(dir, '.credentials.json'));
    chmodSync(join(dir, '.credentials.json'), 0o600);
  }
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    LANG: process.env.LANG ?? 'C.UTF-8',
    HOME: dir,
    CLAUDE_CONFIG_DIR: dir,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Telos Bench', GIT_AUTHOR_EMAIL: 'bench@example.invalid',
    GIT_COMMITTER_NAME: 'Telos Bench', GIT_COMMITTER_EMAIL: 'bench@example.invalid',
  };
  for (const name of configTemplate.passEnv ?? []) if (process.env[name] !== undefined) env[name] = process.env[name];
  const telos = cell.variant === 'C' || cell.variant === 'D';
  const readable = [join(root, 'copies', cell.id), ...(telos ? [join(root, 'plugin')] : []), dir];
  return { env, settingsPath, readable };
}

/** Instruction files in the directories above `path`, up to `/`, that a session started below it would load. */
export function ancestorInstructions(path) {
  const found = [];
  for (let up = dirname(canonical(path)); ; up = dirname(up)) {
    for (const name of INSTRUCTIONS) if (existsSync(join(up, name))) found.push(join(up, name));
    if (dirname(up) === up) return found;
  }
}

/**
 * Open `paths` (the running cell's copy and config dir) to the work dir's group, which the benchmark OS user
 * belongs to (PROTOCOL §5.1 item 1): their trees become group-writable, `readOnly` trees (the plugin export, C/D only)
 * group-readable, and every ancestor up to `workDir` group read + traverse, since the sandbox (bwrap) reads each parent
 * of a mount. Other cells' dirs stay closed. Refused when an instruction file lies above a path (§5.2 canaries).
 * Symlinks are left as they are.
 */
export function grantSession(paths, { workDir, readOnly = [] } = {}) {
  const root = guardWorkDir(workDir);
  const open = (p, write) => {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) return;
    const bits = write ? 0o060 : 0o040;
    if (st.isDirectory()) {
      chmodSync(p, (st.mode & 0o7700) | 0o2010 | bits);
      for (const name of readdirSync(p)) open(join(p, name), write);
    } else chmodSync(p, (st.mode & 0o7700) | bits | ((st.mode & 0o100) ? 0o010 : 0));
  };
  for (const [list, write] of [[paths, true], [readOnly, false]]) {
    for (const path of list) {
      const p = canonical(path);
      if (!within(p, root) || p === root) throw new UsageError(`session path ${path} is not inside the work dir ${workDir}`);
      const loaded = ancestorInstructions(p);
      if (loaded.length) refuse(`instruction files above ${path} would reach the session: ${loaded.join(', ')}`);
      for (let up = dirname(p); within(up, root); up = dirname(up)) {
        chmodSync(up, (lstatSync(up).mode & 0o7700) | 0o050);
        if (up === root) break;
      }
      open(p, write);
    }
  }
}

/**
 * Give the host back what the session user wrote under `paths`: Claude Code creates transcripts and session dirs
 * 0700/0600 whatever the umask. Run as that user through `launcher`, it adds group rw (x on dirs) to the files it
 * owns, never through a symlink, so the host can read transcripts and delete the dirs. → find's exit code.
 */
export function handBack(paths, launcher) {
  const r = spawnSync(launcher[0], [...launcher.slice(1), 'sh', '-c', 'find "$@" -uid "$(id -u)" ! -type l -exec chmod g+rwX {} +', 'sh', ...paths],
    { stdio: 'ignore', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } });
  return r.status;
}

/** Close `paths` to everyone but the host user once the cell is graded. */
export function revokeSession(paths) {
  for (const p of paths) chmodSync(p, lstatSync(p).mode & 0o7700);
}
