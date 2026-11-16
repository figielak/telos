import { loadAreas, pathMatches } from './areas.mjs';
import { changedSince, headMetadata, porcelainFiles, refExists } from './git.mjs';

// Staleness (12:D-01..D-03): which area notes may no longer match the code, from git alone.
// One `git diff --name-only <anchor>..HEAD` per distinct anchor plus one `git status`.

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const covers = (area, file) => area.header.paths.some((p) => pathMatches(file, p));

/**
 * @typedef {{ name: string, state: 'fresh' | 'stale' | 'unanchored', commit: string | null,
 *   reason?: string, files: string[], dirty: string[] }} AreaState
 *   `files`: covered paths changed since the anchor or dirty (sorted, unique); `dirty`: the dirty subset.
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

  const states = areas.map((area) => {
    if (!area.header) return { name: area.name, state: 'unanchored', commit: null, reason: 'invalid header (run telos area lint)', files: [], dirty: [] };
    const { commit } = area.header;
    const diff = diffs.get(commit);
    if (diff === undefined) return { name: area.name, state: 'unanchored', commit, reason: `commit ${commit.slice(0, 7)} not found`, files: [], dirty: [] };
    if (diff === null) return { name: area.name, state: 'unanchored', commit, reason: `git diff from ${commit.slice(0, 7)} failed`, files: [], dirty: [] };
    const own = [...dirty].filter((f) => covers(area, f)).sort(byText);
    const files = [...new Set([...diff.filter((f) => covers(area, f)), ...own])].sort(byText);
    return { name: area.name, state: files.length ? 'stale' : 'fresh', commit, files, dirty: own };
  });
  return { error: null, areas: states, changed: [...changed].sort(byText) };
}

/**
 * Changed paths no area covers, `.telos/` excluded (memory, not code).
 * @param {ReturnType<typeof loadAreas>} areas @param {string[]} changed
 */
export function unmappedFiles(areas, changed) {
  const anchored = areas.filter((a) => a.header);
  return changed.filter((f) => !f.startsWith('.telos/') && !anchored.some((a) => covers(a, f)));
}
