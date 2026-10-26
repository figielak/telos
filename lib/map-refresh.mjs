import { posix } from 'node:path';

// Path-only exclusions mirror map-scan; content/symlink eligibility comes from scan evidence.
const EXCLUDED = new Set([
  '.git', '.telos', '.planning', 'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage',
  '.cache', '.next', '.nuxt', '.output', '.astro', '.turbo', '.parcel-cache', '.svelte-kit',
  '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.nox',
]);
const LOCKS = /^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|uv\.lock|poetry\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|bz2|xz|7z|tar|woff2?|ttf|otf|eot|mp[34]|mov|wav|ogg|exe|dll|so|dylib|class|pyc|pyo|wasm|bin|sqlite3?|db)$/i;
const FIXED = new Set(['structure', 'entry-points', 'flows', 'find']);
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

function nearestAreas(path, areas) {
  let depth = -1;
  const nearest = new Set();
  for (const area of areas) {
    for (const ref of area.refs) {
      const dir = ref.directory ? ref.path.replace(/\/$/, '') : posix.dirname(ref.path);
      if (!within(path, dir)) continue;
      const candidateDepth = dir === '.' ? 0 : dir.split('/').length;
      if (candidateDepth > depth) { depth = candidateDepth; nearest.clear(); }
      if (candidateDepth === depth) nearest.add(area.id);
    }
  }
  return [...nearest];
}

/**
 * Pure impact plan from inspectMap output and scan-filtered committed changes. Editable units
 * are nonempty fixed sections and individual Areas. Empty Structure can be an update target
 * for structural changes, but contributes neither to the baseline total nor affected count.
 * Raw MAP blocks remain owned by inspectMap; this function never changes their text/offsets.
 */
export function planRefresh({ map, changes, baselineAvailable, error }) {
  const affectedIds = new Set(), candidates = new Set();
  let units = [];
  const result = (mode, reason, targets = []) => ({
    mode, reason, affected: units.filter((unit) => affectedIds.has(unit.id)).length,
    total: units.length, blocks: targets,
    newAreaPaths: [...candidates].sort(lexical),
  });
  if (!map || map.state !== 'built' || !map.header) return result('full', 'MAP baseline is missing, not built or invalid; build a full MAP.');
  const editable = map.blocks.filter((block) => FIXED.has(block.id) || block.id.startsWith('area:'));
  units = editable.filter(nonempty);
  if (!units.some((unit) => unit.refs.length)) return result('full', 'MAP baseline has no usable references in nonempty editable units.');
  if (!baselineAvailable) return result('full', 'MAP baseline commit is unavailable; build a full MAP.');
  if (error) return result('refused', `Committed diff unavailable: ${String(error)}`);
  const ambiguous = referenceError(units);
  if (ambiguous) return result('refused', ambiguous);
  const diff = records(changes);
  if (diff.error) return result('refused', diff.error);
  const areas = units.filter((unit) => unit.id.startsWith('area:'));
  for (const { path, structural, addition } of diff.paths) {
    for (const unit of units) if (unit.refs.some((ref) => matches(path, ref))) affectedIds.add(unit.id);
    if (!structural) continue;
    affectedIds.add('structure');
    const exact = areas.filter((area) => area.refs.some((ref) => !ref.directory && ref.path === path)).map((area) => area.id);
    const nearest = exact.length ? exact : nearestAreas(path, areas);
    if (!exact.length && nearest.length > 1) return result('refused', `Ambiguous Area ownership for ${JSON.stringify(path)}: ${nearest.join(', ')}.`);
    for (const id of nearest) affectedIds.add(id);
    if (addition && !nearest.length) candidates.add(path);
  }
  const blocks = editable.filter((unit) => affectedIds.has(unit.id)).map((unit) => unit.id);
  if (!blocks.length && !candidates.size) return result('noop', 'No relevant changes; update provenance only and preserve the MAP body.');
  const affected = units.filter((unit) => affectedIds.has(unit.id)).length;
  if (affected * 10 > units.length * 3) return result('full', `${affected}/${units.length} editable units affected: strictly more than 30%; rebuild the MAP.`, blocks);
  return result('incremental', `${affected}/${units.length} editable units affected: at most 30%; update only selected blocks and new Area candidates.`, blocks);
}
