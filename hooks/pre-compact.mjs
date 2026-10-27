#!/usr/bin/env node
// PreCompact hook (std+): save session identity, STATUS task and queued edited paths to
// .telos/.cache/session for the compact SessionStart. Never prints.
import { readFileSync } from 'node:fs';

import { saveSession } from '../lib/compaction.mjs';
import { findRoot } from '../lib/repo.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = findRoot(input.cwd || process.cwd());
  if (root) saveSession(root, input);
} catch {}
