#!/usr/bin/env node
// PostToolUse Edit/Write hook (std+): queue the edited path for the Stop checks. Never prints.
import { readFileSync } from 'node:fs';

import { recordEdit } from '../lib/edited.mjs';
import { findRoot } from '../lib/repo.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const root = findRoot(input.cwd || process.cwd());
  if (root) recordEdit(root, input);
} catch {}
