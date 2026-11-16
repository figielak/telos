import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { areasRepo, commitAll, git, write } from './areas-repo.mjs';

// 13-06: one write point, end to end. The harness plays the model: scripted area edits stand in
// for its judgment; this proves the CLI and file contracts, not the quality of the notes.
const BIN = fileURLToPath(new URL('../bin/telos', import.meta.url));

function telos(root, ...args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a spawned CLI is a plain program, not a child test reporter
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8' });
  assert.equal(r.error, undefined);
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function ok(root, ...args) {
  const r = telos(root, ...args);
  assert.equal(r.code, 0, `telos ${args.join(' ')}:\n${r.stdout}${r.stderr}`);
  return r.stdout;
}

/** Split a backticked bundle command into argv: whitespace-separated, "…" JSON strings kept whole. */
function argv(command) {
  return [...command.matchAll(/"(?:[^"\\]|\\.)*"|\S+/g)].map(([t]) => (t.startsWith('"') ? JSON.parse(t) : t));
}

/** Append `line` under `## <section>` of an area note. */
function note(root, name, section, line) {
  const path = join(root, '.telos', 'areas', `${name}.md`);
  writeFileSync(path, readFileSync(path, 'utf8').replace(`## ${section}\n`, `## ${section}\n${line}\n`));
}

test('commits made without Telos: catch-up bundle, area edits, closing commands, nothing stale', (t) => {
  const { root } = areasRepo(t);

  // Three commits without Telos: an edit in area api, a new file in area web, a new top-level dir.
  write(root, 'src/api/routes.mjs', 'export const routes = { "/": "home", "/health": "ok" };\n');
  commitAll(root, 'feat: health route');
  write(root, 'src/web/nav.mjs', 'export const nav = ["home"];\n');
  commitAll(root, 'feat: navigation');
  mkdirSync(join(root, 'tools'));
  write(root, 'tools/gen.mjs', 'export const gen = () => {};\n');
  commitAll(root, 'chore: generator');

  const bundle = ok(root, 'ctx', 'catchup');
  assert.ok(bundle.length - 1 <= 6000, `${bundle.length - 1} chars`);
  assert.match(bundle, /^Delta: 2 areas to review · fresh: util · unmapped: 1 file$/m);
  assert.match(bundle, /^Area api: stale since \w{7} · 1 file .* · 1 commit$/m);
  assert.match(bundle, /^ {2}- src\/api\/routes\.mjs · modified /m);
  assert.match(bundle, /^Area web: stale since \w{7} · 1 file .* · 1 commit$/m);
  assert.match(bundle, /^ {2}- src\/web\/nav\.mjs · added /m);
  assert.match(bundle, /^Unmapped .*: 1 file\n {2}- tools\/gen\.mjs$/m);

  // The model's part, scripted: edit the listed notes, place the unmapped dir in a new area.
  note(root, 'api', 'Entry points', '- `src/api/routes.mjs:1` — route table, now with `/health`');
  note(root, 'api', 'Decisions', '- `/health` answers without auth so probes need no token');
  note(root, 'web', 'Entry points', '- `src/web/nav.mjs:1` — `nav`, the menu entries');
  ok(root, 'area', 'new', 'tools', '--paths', 'tools/');
  note(root, 'tools', 'Purpose', 'Build-time generators; never imported at run time.');
  ok(root, 'area', 'lint');

  // The closing commands exactly as the bundle lists them, placeholders filled.
  const commands = [...bundle.matchAll(/^- (?:only when you recorded a decision: )?`(telos [^`]+)`$/gm)].map(([, c]) => c);
  assert.deepEqual(commands, ['telos area anchor api web', 'telos history add quick quick "<decision: reason>"']);
  for (const command of commands) {
    const args = argv(command.replace('<decision: reason>', '/health skips auth: probes need no token')).slice(1);
    ok(root, ...args);
  }
  assert.match(readFileSync(join(root, '.telos', 'HISTORY.md'), 'utf8'), /^- \d{4}-\d{2}-\d{2} quick quick: \/health skips auth: probes need no token$/m);

  // D6: one commit of the .telos/ files.
  git(root, 'add', '.telos/');
  git(root, 'commit', '-qm', 'docs(telos): catch up');
  assert.equal(git(root, 'status', '--porcelain'), '');

  const stale = telos(root, 'stale', '--check');
  assert.equal(stale.code, 0, stale.stdout);
  assert.equal(stale.stdout, 'fresh: 4 areas\n');
  assert.equal(ok(root, 'ctx', 'catchup'), 'Nothing to catch up\n');
});
