#!/usr/bin/env node
// SessionStart hook (startup|resume|clear): print the compact Telos status; silent on any problem.
import { readFileSync } from 'node:fs';

import { findRoot } from '../lib/repo.mjs';
import { sessionText } from '../lib/session.mjs';

let cwd = process.cwd();
try {
  cwd = JSON.parse(readFileSync(0, 'utf8')).cwd || cwd;
} catch {}
try {
  const text = sessionText(findRoot(cwd) ?? cwd);
  if (text) process.stdout.write(`${text}\n`);
} catch {}
