import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadConfig } from '../config.mjs';
import { telosDir } from '../repo.mjs';
import { view } from '../status.mjs';
import { stackLine } from './stack.mjs';

const POINTERS = ['STATUS.md', 'ROADMAP.md', 'PROJECT.md', 'MAP.md'];

/** Bundle for /telos:status: the status view, live stack line and file pointers. */
export function statusBundle({ root }) {
  const path = join(telosDir(root), 'STATUS.md');
  if (!existsSync(path)) return 'Telos not initialized. Run /telos:init.';
  const cfg = loadConfig(root);
  return [
    ...view(root, readFileSync(path, 'utf8')),
    stackLine(root, cfg),
    `Files: ${POINTERS.map((f) => `.telos/${f}`).join(' · ')}`,
  ].join('\n');
}
