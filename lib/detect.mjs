import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

// Reads manifests only and never executes anything (D-07): a check command is
// emitted only with evidence (script, dependency, config file, lockfile).

const JS_MANAGERS = [
  ['pnpm', 'pnpm-lock.yaml'], ['yarn', 'yarn.lock'], ['bun', 'bun.lock'], ['bun', 'bun.lockb'], ['npm', 'package-lock.json'],
];
const RUN = { npm: 'npm run', pnpm: 'pnpm run', yarn: 'yarn', bun: 'bun run' };
const EXEC = { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' };
const PY_MANAGERS = [['uv', 'uv.lock', 'uv run '], ['poetry', 'poetry.lock', 'poetry run ']];

/**
 * @typedef {{ name: string, stack: string[], versions: Record<string, string>,
 *   packageManager: string | null, checks: Record<string, string>, evidence: Record<string, string> }} Detection
 */

/** `^5.1.0` → `5`, `~5.6.2` → `5.6`, `5.1.0` → `5`; ranges like `>=1` or tags → undefined. */
export function majorVersion(range) {
  const m = /^\s*([~^]?)v?(\d+)(?:\.(\d+))?/.exec(String(range));
  if (!m) return undefined;
  return m[1] === '~' && m[3] !== undefined ? `${m[2]}.${m[3]}` : m[2];
}

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const hasFile = (root, pattern) => readdirSync(root).some((f) => pattern.test(f));

function detectJs(root, pkg, out) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depEvidence = (name) => (pkg.dependencies?.[name] ? `package.json dependencies.${name}` : `package.json devDependencies.${name}`);
  const scripts = pkg.scripts ?? {};

  const declared = /^(pnpm|yarn|bun|npm)@/.exec(pkg.packageManager ?? '')?.[1];
  const lock = JS_MANAGERS.find(([, file]) => existsSync(join(root, file)));
  const pm = declared ?? lock?.[0] ?? 'npm';
  out.packageManager = pm;
  out.evidence.packageManager = declared ? 'package.json packageManager' : lock ? lock[1] : 'package.json (no lockfile, npm default)';

  const isAstro = Boolean(deps.astro) || hasFile(root, /^astro\.config\./);
  const isTs = Boolean(deps.typescript) || existsSync(join(root, 'tsconfig.json'));
  if (isAstro) { out.stack.push('astro'); out.evidence.astro = deps.astro ? depEvidence('astro') : 'astro.config.*'; }
  if (isTs) { out.stack.push('typescript'); out.evidence.typescript = deps.typescript ? depEvidence('typescript') : 'tsconfig.json'; }
  if (!isAstro && !isTs) out.stack.push('javascript');

  for (const id of ['astro', 'typescript']) {
    const v = deps[id] && majorVersion(deps[id]);
    if (v) out.versions[id] = v;
  }
  if (pkg.engines?.node) out.versions.node = pkg.engines.node;

  const run = (script) => `${RUN[pm]} ${script}`;
  const exec = (cmd) => `${EXEC[pm]} ${cmd}`;
  const set = (key, cmd, why) => { out.checks[key] = cmd; out.evidence[key] = why; };
  const script = (key, ...names) => {
    const name = names.find((n) => scripts[n]);
    if (name) set(key, run(name), `package.json scripts.${name}`);
    return Boolean(name);
  };

  if (!script('build', 'build') && isAstro) set('build', exec('astro build'), out.evidence.astro);
  if (!script('types', 'typecheck', 'types')) {
    const parts = [];
    if (isAstro) parts.push(exec('astro check'));
    if (isTs) parts.push(exec('tsc --noEmit'));
    if (parts.length) set('types', parts.join(' && '), [isAstro && out.evidence.astro, isTs && out.evidence.typescript].filter(Boolean).join(', '));
  }
  if (!script('lint', 'lint')) {
    if (deps.eslint) set('lint', exec('eslint .'), depEvidence('eslint'));
    else if (deps['@biomejs/biome']) set('lint', exec('biome check .'), depEvidence('@biomejs/biome'));
  }
  if (!script('test', 'test')) {
    if (deps.vitest) set('test', exec('vitest run'), depEvidence('vitest'));
    else if (deps.jest) set('test', exec('jest'), depEvidence('jest'));
  }
  if (deps.vitest) set('test_related', exec('vitest related --run {files}'), depEvidence('vitest'));
  else if (deps.jest) set('test_related', exec('jest --findRelatedTests {files}'), depEvidence('jest'));
  if (!script('e2e', 'e2e', 'test:e2e') && deps['@playwright/test']) set('e2e', exec('playwright test'), depEvidence('@playwright/test'));
}

function detectPython(root, pyproject, requirements, out) {
  out.stack.push('python');
  out.evidence.python = pyproject !== null ? 'pyproject.toml' : 'requirements.txt';
  const text = `${pyproject ?? ''}\n${requirements ?? ''}`;
  const source = pyproject !== null ? 'pyproject.toml' : 'requirements.txt';

  const requires = /^requires-python\s*=\s*["']([^"']+)["']/m.exec(pyproject ?? '')?.[1];
  if (requires) out.versions.python = requires;

  const manager = PY_MANAGERS.find(([, file]) => existsSync(join(root, file)));
  const prefix = manager?.[2] ?? '';
  if (!out.packageManager) {
    out.packageManager = manager?.[0] ?? 'pip';
    out.evidence.packageManager = manager?.[1] ?? `${source} (no lockfile, pip default)`;
  }

  const mentions = (name) => new RegExp(`(^|["'\\s\\[])${name}([<>=~!\\[;\\s"']|$)`, 'm').test(text);
  const set = (key, cmd, why) => {
    if (out.checks[key]) return; // JS checks win in mixed repos
    out.checks[key] = `${prefix}${cmd}`; out.evidence[key] = why;
  };

  if (mentions('ruff') || existsSync(join(root, 'ruff.toml')) || /^\[tool\.ruff/m.test(pyproject ?? '')) {
    set('lint', 'ruff check .', existsSync(join(root, 'ruff.toml')) ? 'ruff.toml' : `${source} ruff`);
  }
  if (mentions('pytest') || existsSync(join(root, 'pytest.ini')) || /^\[tool\.pytest/m.test(pyproject ?? '')) {
    set('test', 'pytest', `${source} pytest`);
  }
  if (mentions('mypy') || existsSync(join(root, 'mypy.ini')) || /^\[tool\.mypy/m.test(pyproject ?? '')) {
    set('types', 'mypy .', `${source} mypy`);
  } else if (mentions('pyright') || existsSync(join(root, 'pyrightconfig.json')) || /^\[tool\.pyright/m.test(pyproject ?? '')) {
    set('types', 'pyright', `${source} pyright`);
  }
}

/**
 * Detect stack, versions, package manager and check commands from manifests.
 * @param {string} root repo root
 * @returns {Detection}
 */
export function detect(root) {
  const dir = resolve(root);
  /** @type {Detection} */
  const out = { name: basename(dir), stack: [], versions: {}, packageManager: null, checks: {}, evidence: {} };

  const pkgText = readText(join(dir, 'package.json'));
  if (pkgText !== null) {
    try {
      const pkg = JSON.parse(pkgText);
      if (typeof pkg.name === 'string' && pkg.name) out.name = pkg.name.replace(/^@[^/]+\//, '');
      detectJs(dir, pkg, out);
    } catch (e) {
      out.evidence.error = `package.json: ${e.message}`;
    }
  }

  const pyproject = readText(join(dir, 'pyproject.toml'));
  const requirements = readText(join(dir, 'requirements.txt'));
  if (pyproject !== null || requirements !== null) {
    const name = /^\[project\][^[]*?^name\s*=\s*["']([^"']+)["']/ms.exec(pyproject ?? '')?.[1];
    if (name && pkgText === null) out.name = name;
    detectPython(dir, pyproject, requirements, out);
  }
  return out;
}
