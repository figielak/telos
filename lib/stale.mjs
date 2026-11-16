import { parseArgs } from 'node:util';

import { isAreaName, loadAreas, pathMatches } from './areas.mjs';
import { UsageError } from './errors.mjs';
import { changedSince, headMetadata, porcelainFiles, refExists } from './git.mjs';
import { brokenReferences } from './refs.mjs';

// Staleness (12:D-01..D-03): which area notes may no longer match the code, from git alone.
// One `git diff --name-only <anchor>..HEAD` per distinct anchor plus one `git status`.

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const covers = (area, file) => area.header.paths.some((p) => pathMatches(file, p));

/**
 * @typedef {{ name: string, state: 'fresh' | 'stale' | 'unanchored', commit: string | null,
 *   reason?: string, files: string[], dirty: string[], broken: { raw: string, problem: string }[] }} AreaState
 *   `files`: covered paths changed since the anchor or dirty (sorted, unique); `dirty`: the dirty subset;
 *   `broken`: backticked references in the body to a missing file or past its end (12:D-02).
 */

/**
 * Staleness of every area (or the given ones), without any model call.
 * @param {string} root repo root
 * @param {{ areas?: ReturnType<typeof loadAreas> }} [opts]
 * @returns {{ error: string | null, areas: AreaState[], changed: string[] }} `changed`: every path
 *   changed since any anchor or dirty, for the unmapped count; `error` when git is unavailable.
 */
export function staleAreas(root, { areas = loadAreas(root) } = {}) {
  const { head, warnings } = headMetadata(root);
  if (!head) return { error: warnings[0], areas: [], changed: [] };
  const dirty = new Set(porcelainFiles(root));
  const diffs = new Map();
  for (const area of areas) {
    const commit = area.header?.commit;
    if (commit && !diffs.has(commit)) diffs.set(commit, refExists(root, commit) ? changedSince(root, commit) : undefined);
  }
  const changed = new Set(dirty);
  for (const files of diffs.values()) for (const f of files ?? []) changed.add(f);

  const states = areas.map((area) => ({ ...judge(area), broken: brokenReferences(root, area.text) }));
  return { error: null, areas: states, changed: [...changed].sort(byText) };

  function judge(area) {
    if (!area.header) return { name: area.name, state: 'unanchored', commit: null, reason: 'invalid header (run telos area lint)', files: [], dirty: [] };
    const { commit } = area.header;
    const diff = diffs.get(commit);
    if (diff === undefined) return { name: area.name, state: 'unanchored', commit, reason: `commit ${commit.slice(0, 7)} not found`, files: [], dirty: [] };
    if (diff === null) return { name: area.name, state: 'unanchored', commit, reason: `git diff from ${commit.slice(0, 7)} failed`, files: [], dirty: [] };
    const own = [...dirty].filter((f) => covers(area, f)).sort(byText);
    const files = [...new Set([...diff.filter((f) => covers(area, f)), ...own])].sort(byText);
    return { name: area.name, state: files.length ? 'stale' : 'fresh', commit, files, dirty: own };
  }
}

/**
 * Changed paths no area covers, `.telos/` excluded (memory, not code).
 * @param {ReturnType<typeof loadAreas>} areas @param {string[]} changed
 */
export function unmappedFiles(areas, changed) {
  const anchored = areas.filter((a) => a.header);
  return changed.filter((f) => !f.startsWith('.telos/') && !anchored.some((a) => covers(a, f)));
}

export const STALE_CAP = 6000;
const SHOWN_FILES = 3;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Up to SHOWN_FILES names, then `+K more`. */
const list = (items) => [...items.slice(0, SHOWN_FILES), ...(items.length > SHOWN_FILES ? [`+${items.length - SHOWN_FILES} more`] : [])].join(', ');

/** `docs/ 4, src/apix/ 1, ./ 1`: the busiest directories (two levels at most) of `files`. */
function topDirs(files) {
  const counts = new Map();
  for (const file of files) {
    const dirs = file.split('/').slice(0, -1).slice(0, 2);
    const key = dirs.length ? `${dirs.join('/')}/` : './';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list([...counts].sort((a, b) => b[1] - a[1] || byText(a[0], b[0])).map(([dir, n]) => `${dir} ${n}`));
}

/** Report lines of one area; none when it is fresh with valid references. */
function areaLines(a) {
  const lines = [];
  if (a.state === 'stale') {
    lines.push(`${a.name}: stale · ${plural(a.files.length, 'file')} since ${a.commit.slice(0, 7)} (${list(a.files)})`
      + (a.dirty.length ? ` · ${a.dirty.length} uncommitted` : ''));
  } else if (a.state === 'unanchored') lines.push(`${a.name}: unanchored · ${a.reason}`);
  for (const b of a.broken) lines.push(`${a.name}: broken ref ${b.raw} · ${b.problem}`);
  return lines;
}

/** @returns {boolean} whether an area needs attention (12:D-04) */
export const needsReview = (a) => a.state !== 'fresh' || a.broken.length > 0;

/**
 * The `telos stale` report, ≤ STALE_CAP chars; area lines past the cap are counted, not dropped silently.
 * @param {{ areas: AreaState[], unmapped: string[] | null }} report `unmapped` null when not shown
 */
export function renderStale({ areas, unmapped }) {
  const rows = areas.flatMap(areaLines);
  const fresh = areas.filter((a) => !needsReview(a)).length;
  const tail = [
    `fresh: ${plural(fresh, 'area')}`,
    ...(unmapped?.length ? [`unmapped: ${plural(unmapped.length, 'file')} (${topDirs(unmapped)})`] : []),
    ...(areas.some((a) => a.state !== 'fresh') ? ['Next: check each listed area against its files, fix the note, then telos area anchor <name>'] : []),
  ];
  const omission = (n) => `… ${plural(n, 'more line')} omitted; narrow with telos stale --area <name>`;
  let shown = rows;
  const size = (lines) => lines.join('\n').length + 1;
  if (size([...rows, ...tail]) > STALE_CAP) {
    shown = [];
    for (const row of rows) {
      if (size([...shown, row, omission(rows.length), ...tail]) > STALE_CAP) break;
      shown.push(row);
    }
    shown.push(omission(rows.length - shown.length));
  }
  return `${[...shown, ...tail].join('\n')}\n`;
}

const STALE_USAGE = '[--area <name>]... [--check]';

/** @type {import('./cli.mjs').Command} */
export const staleCommand = {
  help: `Areas whose paths changed since their anchor, broken references: stale ${STALE_USAGE}`,
  needsTelos: true,
  run({ args, root, stdout, stderr }) {
    let values, positionals;
    try {
      ({ values, positionals } = parseArgs({ args, allowPositionals: true,
        options: { area: { type: 'string', multiple: true }, check: { type: 'boolean' } } }));
    } catch (err) {
      throw new UsageError(`${err.message}; use stale ${STALE_USAGE}`);
    }
    if (positionals.length) throw new UsageError(`unexpected argument '${positionals[0]}'; use stale ${STALE_USAGE}`);
    let areas = loadAreas(root);
    if (values.area) {
      for (const name of values.area) {
        if (!isAreaName(name)) throw new UsageError(`invalid area name ${JSON.stringify(name)}`);
        if (!areas.some((a) => a.name === name)) { stderr.write(`telos stale: no area '${name}'; see telos area list\n`); return 1; }
      }
      areas = areas.filter((a) => values.area.includes(a.name));
    }
    if (!areas.length) { stdout.write('No areas. Create one: telos area new <name> --paths a,b\n'); return 0; }
    const report = staleAreas(root, { areas });
    if (report.error) { stderr.write(`telos stale: ${report.error}\n`); return 1; }
    stdout.write(renderStale({ areas: report.areas, unmapped: values.area ? null : unmappedFiles(areas, report.changed) }));
    return values.check && report.areas.some(needsReview) ? 1 : 0;
  },
};
