// End-to-end memory core: init → roadmap add → phase file → ctx plan → tick tasks → ctx close →
// closing commands → SessionStart. Every step runs the real CLI or hook in a temp git repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { contextOf } from '../lib/ctx/index.mjs';

const BIN = fileURLToPath(new URL('../bin/telos', import.meta.url));
const HOOK = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));

function cli(root, ...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `telos ${args.join(' ')}: ${r.stderr}`);
  return args[0] === 'ctx' ? contextOf(r.stdout) : r.stdout;
}

/** Run each backticked command of a bundle section with its placeholders filled. */
function runCommands(root, section, fill) {
  const commands = [...section.matchAll(/^- `telos (.+)`$/gm)].map((m) => fill(m[1]));
  for (const command of commands) {
    const r = spawnSync('sh', ['-c', `"${process.execPath}" "${BIN}" ${command}`], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
  return commands;
}

test('a phase goes from plan to close with one file and only CLI state changes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'telos-e2e-core-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q', root]);
  const read = (rel) => readFileSync(join(root, rel), 'utf8');

  // init: the memory files and a version 2 config, no profile.
  assert.match(cli(root, 'init', '--checks', '{"test":"node -e 0"}', '--stack', 'javascript'), /^Created: config\.json/m);
  assert.equal(JSON.parse(read('.telos/config.json')).version, 2);

  // roadmap add, then the plan bundle offers the phase skeleton.
  assert.match(cli(root, 'roadmap', 'add', 'greeting', 'Greet the user by name', 'greet("Ada") returns "Hello, Ada"'), /^- 01-greeting \[planned\]/);
  let plan = cli(root, 'ctx', 'plan', '01');
  assert.match(plan, /^Target: 01-greeting \[planned\] Greet the user by name/m);
  assert.match(plan, /^Phase file: \.telos\/phases\/01-greeting\.md \(missing; write it from this skeleton\)$/m);
  assert.match(plan, /^Checks: test=node -e 0$/m);
  assert.ok(plan.length <= 6000);

  // The agent writes the one phase file and records the plan through the CLI.
  const skeleton = plan.split('(missing; write it from this skeleton)\n')[1].split('\n## Notes')[0];
  const phase = `${skeleton.replace('- [ ] **01-01 <title>**', '- [ ] **01-01 Add greet()**\n  - `src/greet.mjs`; accept: `node -e 0`\n- [ ] **01-02 Document greet()**')}\n## Notes\n- none\n`;
  mkdirSync(join(root, '.telos/phases'));
  writeFileSync(join(root, '.telos/phases/01-greeting.md'), phase);
  cli(root, 'roadmap', 'set', '01', 'active');
  cli(root, 'status', 'set', 'phase=01-greeting', 'task=01-01', 'next=01-01 Add greet()');
  plan = cli(root, 'ctx', 'plan');
  assert.match(plan, /^Phase file: \.telos\/phases\/01-greeting\.md \(exists, 0\/2 done; edit it in place\)$/m);

  // An unchecked task blocks the close.
  const tick = (id) => writeFileSync(join(root, '.telos/phases/01-greeting.md'),
    read('.telos/phases/01-greeting.md').replace(`- [ ] **${id}`, `- [x] **${id}`));
  tick('01-01');
  assert.match(cli(root, 'status'), /^Phase: 01-greeting \[active\] · Task: 01-01 \[done\]$/m);
  let close = cli(root, 'ctx', 'close');
  assert.match(close, /^Close: blocked\n- \[ \] 01-02 Document greet\(\)$/m);

  // All ticked: ready, with the configured checks and the exact closing commands.
  tick('01-02');
  close = cli(root, 'ctx', 'close');
  assert.match(close, /^Plan: \.telos\/phases\/01-greeting\.md \(2\/2 done\)$/m);
  assert.match(close, /^Checks \(run each from the repo root; all must exit 0\): test=node -e 0$/m);
  assert.match(close, /^Close: ready$/m);
  const check = spawnSync('sh', ['-c', 'node -e 0'], { cwd: root });
  assert.equal(check.status, 0);
  const ran = runCommands(root, close.split('Closing commands (in order, after the checks pass):\n')[1],
    (c) => c.replace('<evidence for done when>', 'greet tested').replace('<one line>', 'greet shipped'));
  assert.equal(ran.length, 4);

  // The closing commands recorded the phase everywhere; a rerun refuses.
  assert.match(read('.telos/ROADMAP.md'), /^- 01-greeting \[done\]/m);
  assert.match(read('.telos/HISTORY.md'), /^- \d{4}-\d{2}-\d{2} phase 01: closed 01-greeting: greet tested$/m);
  assert.match(read('.telos/STATUS.md'), /^Phase: none$/m);
  assert.match(read('.telos/STATUS.md'), /^- 01 closed: greet shipped$/m);
  assert.match(cli(root, 'ctx', 'close', '01'), /^REFUSED: phase 01-greeting is already done/);

  // The next session starts with the recorded state, within 1200 chars.
  const start = spawnSync(process.execPath, [HOOK], { cwd: root, encoding: 'utf8',
    input: JSON.stringify({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }) });
  assert.equal(start.status, 0);
  assert.ok(start.stdout.trimEnd().length <= 1200);
  assert.match(start.stdout, /^Stack: javascript/m);
  assert.match(start.stdout, /^Phase: none · Task: none$/m);
  assert.match(start.stdout, /^Next: \/telos:plan$/m);
  assert.match(start.stdout, /^Recent: 01 closed: greet shipped$/m);
  assert.doesNotMatch(start.stdout, /Profile/);
});
