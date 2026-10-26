import { basename } from 'node:path';

// Git guard (SPEC §8, §10; 02:D-10): the git commands Telos forbids, checked before Bash runs them.
// Pure: the only git fact it needs (is HEAD pushed?) comes in as `headPushed`, asked lazily.

const SEPARATORS = ['&&', '||', ';', '|', '&', '\n', '(', ')'];
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'time', 'nohup']);
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const COMMIT_WITH_VALUE = new Set(['m', 'F', 'c', 'C', 't']);
const ADD_ALL_PATHS = new Set(['.', './', ':/', ':/:', '*']);

const RULES = {
  push: 'the user pushes; Telos never runs git push',
  'no-verify': 'hooks must run; fix the failure instead of skipping them',
  'add-all': 'stage the task\'s files by explicit path, not the whole tree',
  'amend-pushed': 'HEAD is already on a remote branch; make a new commit instead',
  'reset-hard': 'it discards work irreversibly; ask the user to run it themselves',
};

/**
 * Shell-ish tokenizer: quotes (`'`, `"`), backslash escapes, and separators
 * (`&& || ; | &`, newlines, parentheses) between simple commands. Never throws.
 * @param {string} command
 * @returns {string[][]} tokens of each non-empty simple command
 */
export function splitCommands(command) {
  const out = [];
  let tokens = [];
  let token = '';
  let started = false;
  let quote = null;
  const endToken = () => {
    if (started) tokens.push(token);
    token = '';
    started = false;
  };
  const endCommand = () => {
    endToken();
    if (tokens.length) out.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) token += command[++i];
      else token += ch;
    } else if (ch === '\'' || ch === '"') {
      quote = ch;
      started = true;
    } else if (ch === '\\' && i + 1 < command.length) {
      token += command[++i];
      started = true;
    } else if (/\s/.test(ch) && ch !== '\n') {
      endToken();
    } else {
      const sep = SEPARATORS.find((s) => command.startsWith(s, i));
      if (sep) {
        endCommand();
        i += sep.length - 1;
      } else {
        token += ch;
        started = true;
      }
    }
  }
  endCommand();
  return out;
}

/** @returns {string[]} the command without env assignments and wrappers (`env`, `command`, …) */
function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (ENV_ASSIGN.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}

/** @returns {string | null} the script of `sh -c '<script>'` (also `-lc`, `-ec`, …) */
function shellScript(tokens) {
  if (!SHELLS.has(basename(tokens[0] ?? ''))) return null;
  const i = tokens.findIndex((t, n) => n > 0 && /^-[a-z]*c[a-z]*$/.test(t));
  return i > 0 ? tokens[i + 1] ?? null : null;
}

/** @returns {{ sub: string, args: string[] } | null} subcommand after git's global options */
function gitCall(tokens) {
  if (basename(tokens[0] ?? '') !== 'git') return null;
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) i += GLOBAL_WITH_VALUE.has(tokens[i]) ? 2 : 1;
  return i < tokens.length ? { sub: tokens[i], args: tokens.slice(i + 1) } : null;
}

/** `git commit` flags, skipping option values (`-m <msg>`, `-mn` = message "n"). */
function commitFlags(args) {
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    if (a.startsWith('--')) {
      flags.add(a.split('=')[0]);
      if (['--message', '--file', '--reuse-message', '--reedit-message', '--template'].includes(a)) i++;
    } else if (a.startsWith('-') && a.length > 1) {
      for (const [n, ch] of [...a.slice(1)].entries()) {
        flags.add(`-${ch}`);
        if (COMMIT_WITH_VALUE.has(ch)) {
          if (n === a.length - 2) i++;
          break;
        }
      }
    }
  }
  return flags;
}

/** @returns {string | null} the rule a single git call breaks */
function gitRule({ sub, args }, opts) {
  if (sub === 'push') return 'push';
  if (sub === 'commit') {
    const flags = commitFlags(args);
    if (flags.has('--no-verify') || flags.has('-n')) return 'no-verify';
    if (flags.has('--amend') && opts.headPushed()) return 'amend-pushed';
    return null;
  }
  if (args.includes('--no-verify')) return 'no-verify';
  if (sub === 'add' && args.some((a) => a === '--all' || /^-[a-zA-Z]*A[a-zA-Z]*$/.test(a) || ADD_ALL_PATHS.has(a))) {
    return 'add-all';
  }
  if (sub === 'reset' && args.includes('--hard')) return 'reset-hard';
  return null;
}

/**
 * @param {string} command a Bash tool command
 * @param {{ headPushed: () => boolean }} opts asked only for `git commit --amend`
 * @returns {null | { rule: string, why: string }}
 */
export function check(command, opts) {
  for (const raw of splitCommands(command ?? '')) {
    const tokens = stripPrefix(raw);
    const script = shellScript(tokens);
    if (script !== null) {
      const inner = check(script, opts);
      if (inner) return inner;
      continue;
    }
    const call = gitCall(tokens);
    const rule = call && gitRule(call, opts);
    if (rule) return { rule, why: RULES[rule] };
  }
  return null;
}
