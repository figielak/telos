import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';

import { editTarget } from './edit-guard.mjs';
import { deleteZoneEntries } from './history.mjs';
import { telosDir } from './repo.mjs';

const MARKER = 'telos delete-zone warning\n';
const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
const targetFor = (root, path) => editTarget(root, { tool_name: 'Edit', tool_input: { file_path: path } });
const under = (path, parent) => path === parent || path.startsWith(`${parent}/`);

function warnedBefore(root, path, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false;
  const key = createHash('sha256').update(JSON.stringify([sessionId, path])).digest('hex');
  const dir = join(telosDir(root), '.cache');
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.lstatSync(dir).isDirectory()) return false;
    const marker = join(dir, `delete-guard-${key}`);
    try {
      fs.writeFileSync(marker, MARKER, { flag: 'wx', mode: 0o600 });
      return false;
    } catch (err) {
      if (err.code !== 'EEXIST') return false;
    }
    const fd = fs.openSync(marker, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      return stat.isFile() && stat.size === Buffer.byteLength(MARKER) && fs.readFileSync(fd, 'utf8') === MARKER;
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}

/** Return a nonblocking Delete-zone warning, once per canonical target/session when cache permits. */
export function deleteGuard(root, { path, sessionId }) {
  let found;
  let matches;
  try {
    const entries = deleteZoneEntries(root);
    found = targetFor(root, path);
    if (!found) return;
    matches = entries.filter((entry) => {
      if (!entry.path) return false;
      const parents = targetFor(root, entry.path)?.candidates ?? [entry.path];
      return found.candidates.some((candidate) => parents.some((parent) => under(candidate, parent)));
    });
  } catch { return; }
  if (!matches.length) return;
  if (warnedBefore(root, found.candidates.at(-1), sessionId)) return;
  return `telos delete-zone: ${found.path} recreates a removed path.\n` + matches.map((entry) => {
    const command = `telos history add revert ${quote(entry.ref)} 'Restore on user request' --path ${quote(entry.path)}`;
    return `- \`${entry.path}\` — ${entry.reason} (${entry.ref}, ${entry.date}). `
      + `If the user asked for this, proceed and remove the entry (\`${command}\`).`;
  }).join('\n');
}
