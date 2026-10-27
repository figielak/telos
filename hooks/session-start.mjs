#!/usr/bin/env node
// SessionStart hook (startup|resume|clear|compact): print the compact Telos status; after a
// compaction (std+) also the task and edited paths saved by PreCompact. Silent on any problem.
import { readFileSync } from 'node:fs';

import { findRoot } from '../lib/repo.mjs';
import { sessionText } from '../lib/session.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {}
try {
  const cwd = input.cwd || process.cwd();
  const text = sessionText(findRoot(cwd) ?? cwd, { source: input.source, sessionId: input.session_id });
  if (text) process.stdout.write(`${text}\n`);
} catch {}
