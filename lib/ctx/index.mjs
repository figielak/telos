import { readFileSync } from 'node:fs';

import { UsageError } from '../errors.mjs';
import { splitComment } from '../frontmatter.mjs';
import { approveBundle } from './approve.mjs';
import { doBundle } from './do.mjs';
import { initBundle } from './init.mjs';
import { planBundle } from './plan.mjs';
import { quickBundle } from './quick.mjs';
import { statusBundle } from './status.mjs';

// `telos ctx <bundle>` prints the context a skill injects via !`telos ctx …` (SPEC §2).

export const CAP = 6000;
export const MARKER = '…[truncated by telos ctx]';

/**
 * @typedef {{ root: string, cwd: string, args: string[] }} BundleContext
 * @type {Record<string, (ctx: BundleContext) => string>} Later phases add one line per bundle.
 */
export const bundles = {
  approve: approveBundle,
  do: doBundle,
  init: initBundle,
  plan: planBundle,
  quick: quickBundle,
  status: statusBundle,
};

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
  help: 'Print the context bundle for a skill: ctx <bundle> [args]',
  run({ args, root, cwd, stdout }) {
    const [name, ...rest] = args;
    if (!name) throw new UsageError(`needs a bundle name (known: ${Object.keys(bundles).join(', ')})`);
    const bundle = Object.hasOwn(bundles, name) ? bundles[name] : null;
    if (!bundle) {
      stdout.write(`telos ctx: '${name}' not available yet\n`);
      return 0;
    }
    stdout.write(`${cap(bundle({ root: root ?? cwd, cwd, args: rest }).trimEnd())}\n`);
    return 0;
  },
};
