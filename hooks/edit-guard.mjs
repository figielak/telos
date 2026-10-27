#!/usr/bin/env node
// PreToolUse Edit/Write hook: protected configs and task scope (std+). Deny → exit 2 + reason on
// stderr; warn → additionalContext on stdout, exit 0. Unreadable input is reported, not fatal.
import { readFileSync } from 'node:fs';

import { editGuard } from '../lib/edit-guard.mjs';
import { findRoot } from '../lib/repo.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch (err) {
  process.stderr.write(`telos edit guard: unreadable hook input (${err.message}); edit not checked\n`);
  process.exit(0);
}

let verdict;
try {
  const root = findRoot(input.cwd || process.cwd());
  verdict = root ? editGuard(root, input) : { decision: 'allow' };
} catch (err) {
  verdict = { decision: 'deny', reason: `internal error (${err.message}); fix .telos/ state or report it` };
}

if (verdict.decision === 'deny') {
  process.stderr.write(`telos edit guard: ${verdict.reason}\n`);
  process.exit(2);
}
if (verdict.decision === 'warn') {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', additionalContext: `telos scope: ${verdict.reason}` } })}\n`);
}
