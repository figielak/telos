import { readFileSync } from 'node:fs';

import { UsageError } from '../errors.mjs';
import { splitComment } from '../frontmatter.mjs';
import { catchupBundle } from './catchup.mjs';
import { closeBundle } from './close.mjs';
import { mapBundle } from './map.mjs';
import { planBundle } from './plan.mjs';
import { sharedBundle } from './shared.mjs';
import { statusBundle } from './status.mjs';

// `telos ctx <bundle>` prints a self-contained step (14-02): the context, then the instructions from
// `shared/<name>.md`, so any agent can run a step as "run `telos ctx <name>` and follow its output".
// Context first: the instructions say "the context above", and `REFUSED:` and first-line contracts
// (`Map validation:`) stay on line 1.

export const CAP = 6000;
/** Instructions are fixed text, capped apart from the context; shared/map.md measured 5239 chars (14-02). */
export const INSTRUCTIONS_CAP = 5600;
export const BUNDLE_CAP = CAP + INSTRUCTIONS_CAP;
export const MARKER = '…[truncated by telos ctx]';
export const INSTRUCTIONS_HEADING = '## Instructions';

/**
 * @typedef {{ root: string, cwd: string, args: string[] }} BundleContext
 * @type {Record<string, (ctx: BundleContext) => string>} Later phases add one line per bundle.
 */
export const bundles = {
  catchup: catchupBundle,
  close: closeBundle,
  map: mapBundle,
  plan: planBundle,
  shared: sharedBundle,
  status: statusBundle,
};

/** The `shared/<name>.md` each bundle carries; catch-up shares the close instructions (13-04). */
export const INSTRUCTIONS = { catchup: 'close', close: 'close', map: 'map', plan: 'plan', status: 'status' };

/** Outputs that end the step before any model work: no instructions follow. */
const FINAL = /^(REFUSED:|Nothing to catch up$)/;

/**
 * Render `telos ctx <name>`: the capped context, then its instructions unless the step ends here.
 * @param {string} name a key of `bundles` @param {BundleContext} ctx
 */
export function renderBundle(name, ctx) {
  const context = cap(bundles[name](ctx).trimEnd());
  const shared = INSTRUCTIONS[name];
  if (!shared || FINAL.test(context)) return context;
  return `${context}${SEPARATOR}${sharedBundle({ args: [shared] })}`;
}

const SEPARATOR = `\n\n${INSTRUCTIONS_HEADING}\n`;

/** The context part of `telos ctx` output (what the bundle function returned, capped). */
export function contextOf(text) {
  const at = text.indexOf(SEPARATOR);
  return at < 0 ? text : `${text.slice(0, at)}\n`;
}

/** Hard-cap a bundle at `limit` chars, ending with MARKER when cut. */
export function cap(text, limit = CAP) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - MARKER.length - 1).trimEnd()}\n${MARKER}`;
}

/**
 * Drop HTML comments and frontmatter `# comment`s: template guidance costs nothing in bundles.
 * Lines left empty by a removed comment disappear; blank-line runs collapse to one.
 * @param {string} text
 */
export function stripComments(text) {
  const SENTINEL = '\u0000';
  const lines = text.replace(/<!--[\s\S]*?-->/g, SENTINEL).split('\n');
  const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  const kept = [];
  lines.forEach((line, i) => {
    let out = line;
    if (i > 0 && i < fmEnd) out = splitComment(out).value;
    if (out.includes(SENTINEL)) {
      out = out.replaceAll(SENTINEL, '').trimEnd();
      if (!out.trim()) return;
    }
    kept.push(out);
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Read a file for a bundle, comments stripped. */
export function excerpt(path) {
  return stripComments(readFileSync(path, 'utf8'));
}

/** @type {import('../cli.mjs').Command} */
export const ctxCommand = {
  help: 'Print a step\'s context and instructions: ctx <bundle> [args]',
  run({ args, root, cwd, stdout }) {
    const [name, ...rest] = args;
    if (!name) throw new UsageError(`needs a bundle name (known: ${Object.keys(bundles).join(', ')})`);
    const bundle = Object.hasOwn(bundles, name) ? bundles[name] : null;
    if (!bundle) {
      stdout.write(`telos ctx: '${name}' not available yet\n`);
      return 0;
    }
    stdout.write(`${renderBundle(name, { root: root ?? cwd, cwd, args: rest })}\n`);
    return 0;
  },
};
