#!/usr/bin/env node
// PreToolUse Edit/Write hook: a nonblocking warning when the edit recreates a Delete-zone path.
// The warning goes to additionalContext on stdout; the hook never blocks and exits 0.
import { readFileSync } from 'node:fs';

import { deleteGuard } from '../lib/delete-guard.mjs';
import { editTarget } from '../lib/edit-guard.mjs';
import { findRoot } from '../lib/repo.mjs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch (err) {
  process.stderr.write(`telos edit guard: unreadable hook input (${err.message}); edit not checked\n`);
  process.exit(0);
}

let warning = null;
try {
  const root = findRoot(input.cwd || process.cwd());
  const target = root && editTarget(root, input);
  warning = target && deleteGuard(root, { path: target.path, sessionId: input.session_id });
} catch {}
if (warning) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', additionalContext: warning } })}\n`);
}
