import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { UsageError } from '../errors.mjs';
import { stripComments } from './index.mjs';

// `telos ctx shared <name>` prints `shared/<name>.md`, a skill's long instructions. Skills cannot
// `cat` plugin files: Claude Code only allows reading inside the session's working directories.

const DIR = fileURLToPath(new URL('../../shared/', import.meta.url));

export function sharedBundle({ args }) {
  const [name] = args;
  if (!/^[a-z][a-z-]*$/.test(name ?? '')) throw new UsageError(`invalid shared name '${name ?? ''}'`);
  const path = `${DIR}${name}.md`;
  if (!existsSync(path)) return `telos ctx: no shared instructions '${name}'`;
  return stripComments(readFileSync(path, 'utf8')).trim();
}
