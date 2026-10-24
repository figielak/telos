import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { UsageError } from './errors.mjs';
import { findRoot, telosDir } from './repo.mjs';
import { statusCommand } from './status.mjs';

/**
 * @typedef {{ write(s: string): unknown }} Writer
 * @typedef {{ args: string[], cwd: string, root: string | null, stdout: Writer, stderr: Writer }} RunContext
 * @typedef {{ help: string, needsTelos?: boolean, run(ctx: RunContext): number | void | Promise<number | void> }} Command
 */

export { UsageError };

/** @type {Record<string, Command>} Later phases add one line per command. */
export const commands = {
  status: statusCommand,
};

const NOT_INITIALIZED = 'Telos not initialized. Run /telos:init.';

const version = () =>
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function help(registry) {
  const names = Object.keys(registry);
  const width = Math.max(0, ...names.map((n) => n.length));
  const lines = names.map((n) => `  ${n.padEnd(width)}  ${registry[n].help}`);
  return ['Usage: telos <command> [args]', '', 'Commands:', ...lines, '',
    'Options:', '  -h, --help     show this help', '  -v, --version  print version', ''].join('\n');
}

/**
 * Run the CLI. Exit codes: 0 ok, 1 failure / not initialized, 2 usage error.
 * @param {string[]} argv arguments after the executable
 * @param {{ commands?: Record<string, Command>, cwd?: string, stdout?: Writer, stderr?: Writer }} [opts]
 * @returns {Promise<number>}
 */
export async function main(argv, opts = {}) {
  const { commands: registry = commands, cwd = process.cwd(),
    stdout = process.stdout, stderr = process.stderr } = opts;

  // Global flags come before the command; everything after it belongs to the command.
  const at = argv.findIndex((a) => !a.startsWith('-'));
  const globals = at < 0 ? argv : argv.slice(0, at);
  let flags;
  try {
    flags = parseArgs({ args: globals, options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    } }).values;
  } catch (err) {
    stderr.write(`telos: ${err.message}\n`);
    return 2;
  }

  if (flags.version) { stdout.write(`${version()}\n`); return 0; }
  if (flags.help) { stdout.write(help(registry)); return 0; }
  if (at < 0) { stderr.write(help(registry)); return 2; }

  const name = argv[at];
  const command = Object.hasOwn(registry, name) ? registry[name] : null;
  if (!command) {
    stderr.write(`telos: unknown command '${name}'. Run telos --help.\n`);
    return 2;
  }

  const root = findRoot(cwd);
  if (command.needsTelos && !(root && existsSync(telosDir(root)))) {
    stderr.write(`${NOT_INITIALIZED}\n`);
    return 1;
  }

  try {
    return (await command.run({ args: argv.slice(at + 1), cwd, root, stdout, stderr })) ?? 0;
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(`telos ${name}: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}
