#!/usr/bin/env node
// PreToolUse Bash hook: block forbidden git commands (exit 2 + reason); allow on any problem.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { check } from '../lib/git-guard.mjs';
import { findRoot, telosDir } from '../lib/repo.mjs';

let found = null;
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const cwd = input.cwd || process.cwd();
  const root = findRoot(cwd);
  if (root && existsSync(telosDir(root))) {
    const headPushed = () => {
      const r = spawnSync('git', ['-C', cwd, 'branch', '-r', '--contains', 'HEAD'], { encoding: 'utf8' });
      return r.status === 0 && r.stdout.trim() !== '';
    };
    found = check(String(input.tool_input?.command ?? ''), { headPushed });
  }
} catch {}
if (found) {
  process.stderr.write(`telos git guard: ${found.rule} — ${found.why}\n`);
  process.exit(2);
}
