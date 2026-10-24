// Task `scope` matching (SPEC §4.3.1): shared by lint-plan, accept and the scope hook.

const globCache = new Map();

/** `*` matches within one path segment, `**` across segments; the whole path must match. */
function globRegExp(glob) {
  if (!globCache.has(glob)) {
    const source = glob.split('**').map((part) =>
      part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
    globCache.set(glob, new RegExp(`^${source}$`));
  }
  return globCache.get(glob);
}

/**
 * @param {string} path repo-relative file path
 * @param {string[]} scope entries: `*` (everything), `dir/` (prefix), `path` (file or directory), glob
 * @returns {boolean}
 */
export function inScope(path, scope) {
  const p = path.replace(/^\.\//, '');
  return scope.some((s) => {
    if (s === '*') return true;
    if (s.includes('*')) return globRegExp(s).test(p);
    if (s.endsWith('/')) return p.startsWith(s);
    return p === s || p.startsWith(`${s}/`);
  });
}
