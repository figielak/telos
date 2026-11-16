#!/usr/bin/env node
// SessionStart hook (startup|resume|clear|compact): print the compact Telos status.
// Silent on any problem.
import { readFileSync } from 'node:fs';

import { findRoot } from '../lib/repo.mjs';
import { sessionText } from '../lib/session.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {}
try {
  const cwd = input.cwd || process.cwd();
  const text = sessionText(findRoot(cwd) ?? cwd);
  if (text) process.stdout.write(`${text}\n`);
} catch {}
