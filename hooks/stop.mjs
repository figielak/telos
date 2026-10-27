#!/usr/bin/env node
// Stop hook (std+): run format + types once on the edited files; report failures only (exit 2),
// never rerun while stop_hook_active is set.
import { readFileSync } from 'node:fs';

import { stopChecks } from '../lib/edited.mjs';
import { findRoot } from '../lib/repo.mjs';

let report = null;
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = findRoot(input.cwd || process.cwd());
  if (root) report = await stopChecks(root, input);
} catch {}
if (report) {
  process.stderr.write(`${report}\n`);
  process.exit(2);
}
