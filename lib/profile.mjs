import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { PROFILES, atLeast, load } from './config.mjs';
import { UsageError } from './errors.mjs';
import { addHistory } from './history.mjs';
import { telosDir } from './repo.mjs';
import { render } from './template.mjs';

// `telos profile <p>` (SPEC §3): only config.profile changes; every other config value, CLAUDE.md
// and all files stay. Missing target files are created first, then the switch is published and
// logged; a failure restores config and HISTORY, so the old profile stays effective and a retry works.

/** Files each profile adds on top of the previous one; a trailing `/` marks a directory. */
export const PROFILE_FILES = {
  minimal: ['PROJECT.md', 'MAP.md', 'ROADMAP.md', 'STATUS.md'],
  standard: ['HISTORY.md', 'LESSONS.md'],
  deep: ['decisions/'],
};

/** @returns {string[]} files a profile needs, cumulative over the lower profiles */
export function requiredFiles(profile) {
  return PROFILES.filter((p) => atLeast({ profile }, p)).flatMap((p) => PROFILE_FILES[p]);
}

const today = () => new Date().toLocaleDateString('sv-SE');

/** Create the target's missing standard/deep files; minimal files belong to `telos init`. */
function provision(root, profile) {
  const created = [];
  for (const file of requiredFiles(profile).filter((f) => !PROFILE_FILES.minimal.includes(f))) {
    const path = join(telosDir(root), file);
    if (fs.existsSync(path)) continue;
    if (file.endsWith('/')) fs.mkdirSync(path);
    else fs.writeFileSync(path, render(file, file === 'HISTORY.md' ? { date: today(), profile } : {}), { flag: 'wx' });
    created.push(file);
  }
  return created;
}

/** Replace config.json via a synced temp file; `raw` keeps the user's keys, order and values. */
export function publishConfig(root, raw) {
  const dir = telosDir(root);
  const tmp = join(dir, `.config.json.${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(tmp, 'wx', 0o644);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(raw, null, 2)}\n`);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, join(dir, 'config.json'));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Byte copies of the files a switch may change, restorable on failure. */
function backup(root, names) {
  const saved = names.map((name) => {
    const path = join(telosDir(root), name);
    return { path, text: fs.existsSync(path) ? fs.readFileSync(path) : null };
  });
  return () => {
    for (const { path, text } of saved) {
      if (text === null) fs.rmSync(path, { force: true });
      else fs.writeFileSync(path, text);
    }
  };
}

/**
 * Switch `.telos/config.json` to `profile`.
 * @param {string} root repo root
 * @param {string} profile target profile
 * @param {{ publish?: typeof publishConfig }} [opts] test seam for the config write
 * @returns {{ from: string, to: string, created: string[], changed: boolean }}
 * @throws {UsageError} unknown profile; {Error} invalid config or failed write (config restored)
 */
export function switchProfile(root, profile, { publish = publishConfig } = {}) {
  if (!PROFILES.includes(profile)) throw new UsageError(`profile must be one of ${PROFILES.join(', ')}`);
  const cfg = load(root);
  const raw = JSON.parse(fs.readFileSync(join(telosDir(root), 'config.json'), 'utf8'));
  const from = cfg.profile;
  const created = provision(root, profile);
  if (from === profile) return { from, to: profile, created, changed: false };

  // addHistory needs a standard+ config: log before publishing when the old profile allows it,
  // else after; either way a failure rolls back both files.
  const restore = backup(root, ['config.json', 'HISTORY.md', 'HISTORY-archive.md']);
  const log = fs.existsSync(join(telosDir(root), 'HISTORY.md'))
    ? () => addHistory(root, { kind: 'profile', ref: 'telos', text: `${from} → ${profile}` })
    : () => {};
  const logFirst = atLeast(cfg, 'standard');
  try {
    if (logFirst) log();
    publish(root, { ...raw, profile });
    if (!logFirst) log();
  } catch (err) {
    restore();
    throw err;
  }
  return { from, to: profile, created, changed: true };
}

/** @type {import('./cli.mjs').Command} */
export const profileCommand = {
  help: '<minimal|standard|deep>',
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    if (args.length !== 1) throw new UsageError(`usage: profile ${profileCommand.help}`);
    let result;
    try {
      result = switchProfile(root, args[0]);
    } catch (err) {
      if (err instanceof UsageError) throw err;
      stderr.write(`telos profile: ${err.message}\n`);
      return 1;
    }
    const { from, to, created, changed } = result;
    stdout.write(`${changed ? `profile: ${from} → ${to}` : `profile: already ${to}`}\n`);
    stdout.write(`Created: ${created.length ? created.join(', ') : 'none'}\n`);
    return 0;
  },
};
