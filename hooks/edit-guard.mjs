#!/usr/bin/env node
// PreToolUse Edit/Write hook: protected configs, task scope and Delete-zone (std+). Deny → exit 2 + reason on
// stderr; warn → additionalContext on stdout, exit 0. Unreadable input is reported, not fatal.
import { readFileSync } from 'node:fs';

import { deleteGuard } from '../lib/delete-guard.mjs';
import { editGuard, editTarget } from '../lib/edit-guard.mjs';
import { findRoot } from '../lib/repo.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch (err) {
  process.stderr.write(`telos edit guard: unreadable hook input (${err.message}); edit not checked\n`);
  process.exit(0);
}

let verdict;
let root;
try {
  root = findRoot(input.cwd || process.cwd());
  verdict = root ? editGuard(root, input) : { decision: 'allow' };
} catch (err) {
  verdict = { decision: 'deny', reason: `internal error (${err.message}); fix .telos/ state or report it` };
}

if (verdict.decision === 'deny') {
  process.stderr.write(`telos edit guard: ${verdict.reason}\n`);
  process.exit(2);
}
const target = root && editTarget(root, input);
const deletion = target && deleteGuard(root, { path: target.path, sessionId: input.session_id });
const warnings = [verdict.decision === 'warn' ? `telos scope: ${verdict.reason}` : null, deletion].filter(Boolean);
if (warnings.length) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', additionalContext: warnings.join('\n') } })}\n`);
}
