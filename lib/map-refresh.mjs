import { posix } from 'node:path';

import { pathMatches } from './areas.mjs';

// Path-only exclusions mirror map-scan; content/symlink eligibility comes from scan evidence.
const EXCLUDED = new Set([
  '.git', '.telos', '.planning', 'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage',
  '.cache', '.next', '.nuxt', '.output', '.astro', '.turbo', '.parcel-cache', '.svelte-kit',
  '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.nox',
]);
const LOCKS = /^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|uv\.lock|poetry\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|bz2|xz|7z|tar|woff2?|ttf|otf|eot|mp[34]|mov|wav|ogg|exe|dll|so|dylib|class|pyc|pyo|wasm|bin|sqlite3?|db)$/i;
const FIXED = new Set(['structure', 'areas', 'find']);
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const unsupported = (path) => typeof path !== 'string' || !path || /[\x00-\x1f\x7f`\\:\u2028\u2029]/.test(path)
  || path !== path.trim() || posix.isAbsolute(path) || path.split('/').some((part) => !part || part === '.' || part === '..');
const excluded = (path) => path.split('/').slice(0, -1).some((part) => EXCLUDED.has(part))
  || LOCKS.test(posix.basename(path)) || BINARY.test(path);
const within = (path, dir) => dir === '.' || path.startsWith(`${dir.replace(/\/$/, '')}/`);
const matches = (path, ref) => ref.directory ? within(path, ref.path) : path === ref.path;
const nonempty = (block) => block.text.includes('\n')
  && block.text.slice(block.text.indexOf('\n') + 1).replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim().length > 0;

function referenceError(units) {
  const kinds = new Map();
  for (const unit of units) {
    for (const ref of unit.refs) {
      const path = ref.directory ? ref.path.replace(/\/$/, '') : ref.path;
      if (unsupported(path) || /[*?\[\]]/.test(path)) return `Unsupported or ambiguous MAP reference ${JSON.stringify(ref.path)} in ${unit.id}.`;
      const previous = kinds.get(path);
      if (previous !== undefined && previous !== ref.directory) return `Ambiguous file/directory MAP reference ${JSON.stringify(path)}.`;
      kinds.set(path, ref.directory);
    }
  }
  return null;
}

function records(changes) {
  if (!Array.isArray(changes)) return { error: 'Unreadable diff changes: expected an array.' };
  const paths = [];
  for (const change of changes) {
    if (!change || typeof change.status !== 'string') return { error: 'Invalid diff record: status is missing.' };
    const paired = /^[RC]\d{1,3}$/.test(change.status) && Number(change.status.slice(1)) <= 100;
    if (!paired && !/^[AMDT]$/.test(change.status)) return { error: `Unsupported or ambiguous diff status ${JSON.stringify(change.status)}.` };
    const structural = change.status !== 'M';
    const endpoints = paired ? [change.oldPath, change.path] : [change.path];
    for (const path of endpoints) {
      if (unsupported(path)) return { error: `Unsupported or ambiguous diff path ${JSON.stringify(path)}.` };
      if (!excluded(path)) paths.push({ path, structural, addition: path === change.path && (paired || change.status === 'A') });
    }
  }
  return { paths, error: null };
}

/**
 * Pure impact plan from inspectMap output, the loaded area files and scan-filtered committed
 * changes (11-03). Editable units are the nonempty index sections and every area file. A changed
 * path selects the index sections whose refs match it and the areas whose header paths cover it;
 * a structural change (add, delete, rename, copy) also selects Structure, and the Areas index when
 * it touches an area or adds a path no area covers (a new-area candidate). Refresh is always
 * incremental: area files carry authored Decisions, Rejected and Pitfalls, so a diff never forces
 * a rebuild. Raw MAP blocks remain owned by inspectMap; this function never changes them.
 * @param {{ map: object | null, areas?: { name: string, header: { paths: string[] } | null }[],
 *   changes: object[], baselineAvailable: boolean, error: string | null }} input
 */
export function planRefresh({ map, areas = [], changes, baselineAvailable, error }) {
  const affectedIds = new Set(), affectedAreas = new Set(), candidates = new Set();
  let editable = [], units = [];
  const affected = () => units.filter((unit) => affectedIds.has(unit.id)).length + affectedAreas.size;
  const result = (mode, reason) => ({
    mode, reason, affected: affected(), total: units.length + areas.length,
    // Empty Structure/Areas can be a write target but count neither as affected nor in the total.
    blocks: editable.filter((block) => affectedIds.has(block.id)).map((block) => block.id),
    areas: areas.filter((area) => affectedAreas.has(area.name)).map((area) => area.name),
    newAreaPaths: [...candidates].sort(lexical),
  });
  if (!map || map.state !== 'built' || !map.header) return result('full', 'MAP baseline is missing, not built or invalid; build a full MAP.');
  editable = map.blocks.filter((block) => FIXED.has(block.id));
  units = editable.filter(nonempty);
  if (!areas.length && !units.some((unit) => unit.refs.length)) return result('full', 'MAP baseline has no area files and no usable references; build a full MAP.');
  if (!baselineAvailable) return result('full', 'MAP baseline commit is unavailable; build a full MAP.');
  if (error) return result('refused', `Committed diff unavailable: ${String(error)}`);
  const broken = areas.find((area) => !area.header);
  if (broken) return result('refused', `Area file .telos/areas/${broken.name}.md has an invalid header; fix it (telos area lint).`);
  const ambiguous = referenceError(units);
  if (ambiguous) return result('refused', ambiguous);
  const diff = records(changes);
  if (diff.error) return result('refused', diff.error);
  for (const { path, structural, addition } of diff.paths) {
    for (const unit of units) if (unit.id !== 'areas' && unit.refs.some((ref) => matches(path, ref))) affectedIds.add(unit.id);
    const owners = areas.filter((area) => area.header.paths.some((p) => pathMatches(path, p)));
    for (const area of owners) affectedAreas.add(area.name);
    if (!structural) continue;
    affectedIds.add('structure');
    if (owners.length) affectedIds.add('areas');
    if (addition && !owners.length) { candidates.add(path); affectedIds.add('areas'); }
  }
  if (!affectedIds.size && !affectedAreas.size) return result('noop', 'No relevant changes; update provenance only and preserve the MAP body and area files.');
  return result('incremental', `${affected()}/${units.length + areas.length} editable units affected; update only the selected index blocks and area files.`);
}
