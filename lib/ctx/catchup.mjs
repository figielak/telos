import { loadAreas } from '../areas.mjs';
import { load as loadConfig } from '../config.mjs';
import { anchorNames, fitDelta } from '../delta.mjs';
import { UsageError } from '../errors.mjs';
import { autoCommitLine, deltaOf } from './close.mjs';
import { CAP } from './index.mjs';

// Bundle for /telos:catchup (13-03): the close delta without phase bookkeeping, for work done
// without Telos. Read-only; the skill edits the listed areas and runs the closing commands.

export const NOTHING = 'Nothing to catch up';

export function catchupBundle({ root, args }) {
  if (args.length) throw new UsageError('usage: ctx catchup');
  const cfg = loadConfig(root);
  const areas = loadAreas(root);
  if (!areas.length) return 'REFUSED: no area files; run /telos:map first';
  const delta = deltaOf(root, areas);
  if (delta.error) return `REFUSED: ${delta.error}`;
  // 13:D-05: an empty delta ends here, before any model work.
  if (!delta.areas.length && !delta.unmapped.length) return NOTHING;
  const anchor = anchorNames(delta);
  const closing = [
    ...(anchor.length ? [`- \`telos area anchor ${anchor.join(' ')}\``] : []),
    '- only when you recorded a decision: `telos history add quick quick "<decision: reason>"`',
  ];
  const head = [
    'Target: catch up the area notes with changes made without Telos',
    autoCommitLine(cfg, 'docs(telos): catch up'),
    ['Closing commands (in order, after the area notes are updated):', ...closing].join('\n'),
  ].join('\n');
  return `${head}\n${fitDelta(delta, CAP - head.length - 1)}`;
}
