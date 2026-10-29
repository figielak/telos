#!/usr/bin/env node
// Stop hook (std+): run format + types once on the edited files; report failures only (exit 2),
// never rerun while stop_hook_active is set. Deep adds a nonblocking map-staleness reminder.
import { readFileSync } from 'node:fs';

import { stopChecks } from '../lib/edited.mjs';
import { composeStop, mapStaleness, remindOnce } from '../lib/map-stale.mjs';
import { findRoot } from '../lib/repo.mjs';

let report = null;
let advisory = null;
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = findRoot(input.cwd || process.cwd());
  if (root) {
    report = await stopChecks(root, input);
    if (!report) advisory = remindOnce(root, input.session_id, mapStaleness(root, input));
  }
} catch {}
const out = composeStop(report, advisory);
if (out.stdout) process.stdout.write(out.stdout);
if (out.stderr) process.stderr.write(out.stderr);
process.exit(out.exit);
