import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { atLeast, load, requireMessage } from './config.mjs';
import { UsageError } from './errors.mjs';
import { telosDir } from './repo.mjs';
import { getLine } from './status.mjs';
import { loadTask, phaseTasks, TaskError } from './tasks.mjs';

const TIMEOUT_MS = 600_000;
const OUTPUT_BYTES = 64 * 1024;
const OUTPUT_LINES = 30;
const LINE_CHARS = 500;
const USAGE = 'usage: check [--level quick|full] [--files <path>…] [--task NN-MM|--phase NN]';

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

function validateOptions({ level = 'full', files = [], timeoutMs = TIMEOUT_MS, task, phase } = {}) {
  if (!['quick', 'full'].includes(level)) throw new UsageError(USAGE);
  if (task !== undefined && !/^\d{2}-\d{2}$/.test(task)) throw new UsageError(USAGE);
  if (phase !== undefined && !/^\d{2}$/.test(phase)) throw new UsageError(USAGE);
  // Selectors pick the full-check target (D-02); quick checks have none.
  if ((task !== undefined && phase !== undefined) || ((task ?? phase) !== undefined && level !== 'full')) {
    throw new UsageError(USAGE);
  }
  if (!Array.isArray(files) || files.some((f) => typeof f !== 'string' || !f || f.includes('\0'))) {
    throw new UsageError('files must be non-empty paths without NUL bytes');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new UsageError('timeoutMs must be a positive integer');
  return { level, files, timeoutMs, task, phase };
}

function fileArgument(root, file) {
  const path = resolve(root, file);
  if (!inside(root, path)) throw new UsageError(`file path outside repo: ${file}`);
  let existing = path;
  while (true) {
    try {
      lstatSync(existing);
      if (!inside(realpathSync(root), realpathSync(existing))) throw new UsageError(`file path outside repo: ${file}`);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // An existing but dangling symlink must not fall back to its parent.
      try { lstatSync(existing); throw new UsageError(`unresolved symlink path: ${file}`); }
      catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
      existing = dirname(existing);
    }
  }
  const rel = `./${relative(root, path).split(sep).join('/')}`;
  return `'${rel.replaceAll("'", "'\\''")}'`;
}

function failureOutput(buffers) {
  return Buffer.concat(buffers).toString('utf8').trimEnd().split(/\r?\n/).slice(0, OUTPUT_LINES)
    .filter((line) => line.length).map((line) => line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}…` : line);
}

function substitute(command, args) {
  if (!command.includes('{files}')) return command;
  const unsafe = () => { throw new Error('unsafe {files} placeholder: use an unquoted standalone word outside shell substitutions and here-documents'); };
  if (/`|\$\(|\$\{|<</.test(command)) unsafe();
  const boundary = (char) => char === undefined || /[\s;&|()]/.test(char);
  let quote, escaped = false, comment = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (command.startsWith('{files}', i)) {
      if (quote || escaped || comment || !boundary(command[i - 1]) || !boundary(command[i + 7])) unsafe();
      i += 6;
    } else if (comment) {
      if (char === '\n') comment = false;
    } else if (escaped) escaped = false;
    else if (char === '\\' && quote !== "'") escaped = true;
    else if (quote) { if (char === quote) quote = undefined; }
    else if (char === "'" || char === '"') quote = char;
    else if (char === '#' && boundary(command[i - 1])) comment = true;
  }
  return command.replaceAll('{files}', () => args);
}

function run(root, name, command, timeoutMs) {
  return new Promise((resolveResult) => {
    const grouped = process.platform !== 'win32';
    const child = spawn('sh', ['-c', `exec 2>&1\n${command}`], {
      cwd: root, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const buffers = [];
    let bytes = 0, note, spawnError;
    const terminate = () => {
      if (!child.pid) return;
      try {
        if (grouped) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch (error) { if (error.code !== 'ESRCH') spawnError = error; }
    };
    const timer = setTimeout(() => {
      note ??= `timeout ${timeoutMs / 1000}s`;
      terminate();
    }, timeoutMs);
    const collect = (chunk) => {
      const remaining = OUTPUT_BYTES - bytes;
      if (remaining > 0) buffers.push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > OUTPUT_BYTES) {
        note ??= `output exceeded ${OUTPUT_BYTES} bytes`;
        terminate();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      terminate();
      if (!note && !spawnError && code === 0) {
        resolveResult({ name, verdict: 'PASS' });
      } else {
        resolveResult({ name, verdict: 'FAIL', note: note ?? spawnError?.message ?? (signal ? `signal ${signal}` : `exit ${code}`),
          output: failureOutput(buffers) });
      }
    });
  });
}

/**
 * Run the named configured checks in order with bounded output/time; unconfigured names SKIP.
 * Shared by `telos check` and the Stop hook (format + types on edited files).
 * @param {string} root
 * @param {{ names: string[], files?: string[], timeoutMs?: number }} options
 */
export async function runNamed(root, { names, ...options }) {
  const { files, timeoutMs } = validateOptions(options);
  root = resolve(root);
  const config = load(root);
  const args = files.map((file) => fileArgument(root, file)).join(' ');
  const checks = [];
  for (const name of names) {
    const command = config.checks[name];
    if (!command) checks.push({ name, verdict: 'SKIP' });
    else {
      let expanded;
      try { expanded = substitute(command, args); }
      catch (error) { checks.push({ name, verdict: 'FAIL', note: error.message, output: [] }); continue; }
      checks.push(await run(root, name, expanded, timeoutMs));
    }
  }
  const configured = checks.some((check) => check.verdict !== 'SKIP');
  return { checks, ok: configured && checks.every((check) => check.verdict !== 'FAIL'),
    ...(!configured ? { note: 'UNVERIFIED: no configured checks for this level.' } : {}) };
}

/**
 * Full-check target (D-02): `--task`, `--phase`, or the STATUS phase on deep. Deep critical code
 * tasks in the target require `checks.e2e`. Null when nothing is selected below deep (unchanged).
 * @returns {{ label: string, e2e: string[] } | { error: string } | null}
 */
function fullTarget(root, config, { task, phase }) {
  const deep = atLeast(config, 'deep');
  if (task === undefined && phase === undefined && !deep) return null;
  let tasks, label;
  try {
    if (task !== undefined) {
      tasks = [loadTask(root, task)];
      label = `task ${task}`;
    } else {
      let nn = phase;
      if (nn === undefined) {
        const statusPath = join(telosDir(root), 'STATUS.md');
        const current = existsSync(statusPath) ? getLine(readFileSync(statusPath, 'utf8'), 'Phase') : '';
        if (!/^\d{2}-/.test(current)) return { error: 'REFUSED: no phase in STATUS; pass --phase NN or --task NN-MM' };
        nn = current.slice(0, 2);
      }
      tasks = phaseTasks(root, nn);
      if (!tasks.length) return { error: `REFUSED: phase ${nn} has no task files; pass an existing --phase NN or --task NN-MM` };
      label = `phase ${nn}`;
    }
  } catch (error) {
    if (!(error instanceof TaskError)) throw error;
    return { error: `REFUSED: ${error.message}; pass an existing --task NN-MM or --phase NN` };
  }
  const e2e = deep ? tasks.filter((t) => t.meta.type === 'code' && t.meta.critical === true).map((t) => t.id) : [];
  return { label: `${label} · ${e2e.length ? `e2e required for critical code ${e2e.join(', ')}` : 'no e2e required'}`, e2e };
}

/**
 * Run configured checks sequentially with bounded output/time; never write Telos state or git.
 * Full checks on deep, or with `task`/`phase`, also report `target`; required e2e that is missing
 * or failing makes `ok` false.
 */
export async function runChecks(root, options = {}) {
  const { level, files, timeoutMs, task, phase } = validateOptions(options);
  root = resolve(root);
  const config = load(root);
  if (!atLeast(config, 'standard')) return { checks: [], ok: false, note: requireMessage('standard') };
  const names = level === 'full' ? ['build', 'types', 'lint', 'test']
    : [files.length && config.checks.test_related ? 'test_related' : 'test', 'lint', 'types'];
  const target = level === 'full' ? fullTarget(root, config, { task, phase }) : null;
  if (!target) return runNamed(root, { names, files, timeoutMs });
  if ('error' in target) return { checks: [], ok: false, note: target.error };
  const result = await runNamed(root, { names: target.e2e.length ? [...names, 'e2e'] : names, files, timeoutMs });
  if (target.e2e.length && !config.checks.e2e) {
    return { ...result, ok: false, target: target.label,
      note: `UNVERIFIED: e2e required for critical code ${target.e2e.join(', ')} but checks.e2e is not configured; `
        + 'add it to .telos/config.json (Telos never guesses or installs one).' };
  }
  return { ...result, target: target.label };
}

function parse(args) {
  const options = { files: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--level') {
      if (!['quick', 'full'].includes(args[i + 1])) throw new UsageError(USAGE);
      options.level = args[++i];
    } else if (args[i] === '--files') {
      const start = ++i;
      while (i < args.length && !args[i].startsWith('-')) options.files.push(args[i++]);
      if (i === start) throw new UsageError(USAGE);
      i--;
    } else if (args[i] === '--task' || args[i] === '--phase') {
      const key = args[i].slice(2);
      if (options[key] !== undefined || args[i + 1] === undefined || args[i + 1].startsWith('-')) throw new UsageError(USAGE);
      options[key] = args[++i];
    } else throw new UsageError(USAGE);
  }
  return validateOptions(options);
}

/** @type {import('./cli.mjs').Command} */
export const checkCommand = {
  help: 'Run configured verification commands: check [--level quick|full] [--files <path>…] [--task NN-MM|--phase NN]',
  needsTelos: true,
  async run({ args, root, stdout, stderr }) {
    const options = parse(args);
    let result;
    try { result = await runChecks(root, options); }
    catch (error) {
      if (error instanceof UsageError) throw error;
      stderr.write(`telos check: ${error.message}\n`);
      return 1;
    }
    if (result.target) stdout.write(`Target: ${result.target}\n`);
    if (result.checks.length) {
      stdout.write(`TELOS CHECK  ${result.checks.map((c) => `${c.name}:${c.verdict}`).join('  ')}\n`);
      for (const check of result.checks.filter((c) => c.verdict === 'FAIL')) {
        stdout.write(`${check.name}: ${check.note}\n`);
        for (const line of check.output.slice(0, OUTPUT_LINES - 1)) stdout.write(`${check.name}: ${line}\n`);
      }
    }
    if (result.note) stdout.write(`${result.note}\n`);
    return result.ok ? 0 : 1;
  },
};
