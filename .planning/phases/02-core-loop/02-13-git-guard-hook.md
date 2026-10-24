---
id: 02-13
title: Git guard hook (PreToolUse Bash)
type: code
status: approved
critical: true
effort: normal
depends: [02-12]
decisions: [D-10]
scope: [hooks/, lib/git-guard.mjs, test/git-guard.test.mjs, README.md]
---
## Goal
Block the git commands Telos forbids (SPEC §8, §10) before they run, with a one-line reason,
without false positives on quoted text or unrelated commands.

## Read first
- SPEC.md §8 (PreToolUse Bash row), §10 (Rules for the agent)
- hooks/hooks.json (from 02-12)

## Files
- lib/git-guard.mjs (create: pure `check`)
- hooks/git-guard.mjs (create: stdin → check → exit 0 | 2)
- hooks/hooks.json (modify: PreToolUse matcher `Bash`)
- test/git-guard.test.mjs (create)
- README.md (modify: Hooks section)

## Constraints
- all profiles; no `.telos/` → allow silently
- block = exit 2 + `telos git guard: <rule> — <why>` on stderr (D-10)
- the pushed-HEAD check is the only git call (`git branch -r --contains HEAD`), injected into `check` for tests

## Tests (write first)
- one table-driven case per Edge case (`check(cmd, { headPushed })`)
- wrapper: allowed command → exit 0 no output; blocked → exit 2 with reason; malformed stdin → exit 0

## Interface
```js
/** @returns {null | { rule: string, why: string }} */
export function check(command: string, opts: { headPushed: () => boolean }): null | { rule, why }
export function splitCommands(command: string): string[][]  // shell-ish tokens per simple command
```
Rules: `push`, `no-verify`, `add-all`, `amend-pushed`, `reset-hard`.

## Edge cases
- `git push`, `git push -n origin x`, `git -C sub push`, `FOO=1 git push` → push
- `npm test && git push`, `a; git push`, `x | git push` → push
- `bash -c "git push"` / `sh -c 'git add .'` → recursed, blocked
- `git commit --no-verify -m x`, `git commit -nm x` → no-verify; `git merge --no-verify` → no-verify
- `git add -A`, `git add --all`, `git add .`, `git add ./`, `git add :/` → add-all
- `git add src/a.ts .telos/STATUS.md` → allowed; `git add -u` → allowed
- `git commit --amend` with `headPushed() = true` → amend-pushed; `false` → allowed
- `git reset --hard`, `git reset --hard HEAD~1` → reset-hard; `git reset HEAD a.ts`, `git reset --soft HEAD~1` → allowed
- `echo "git push"`, `git commit -m "do not git push"`, `git log --grep=push` → allowed
- `gitk`, `ls`, empty string → allowed
- unbalanced quote → tokenized best-effort, never throws

## Steps
1. test/git-guard.test.mjs: table of the Edge cases.
2. lib/git-guard.mjs `splitCommands`: tokenizer with `'`, `"`, `\`, separators `&& || ; |`, newlines.
3. lib/git-guard.mjs `check`: strip env assignments, find `git` + global options (`-C`, `-c`), match subcommand rules; recurse into `sh|bash|zsh -c <arg>`.
4. hooks/git-guard.mjs + hooks.json entry; README; `claude plugin validate .`; suite.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] `claude plugin validate .` → exit 0
- [ ] in a headless session with the plugin, `git push` is blocked with the telos reason

## Result
