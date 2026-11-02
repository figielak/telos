#!/usr/bin/env node
// Stand-in for the `telos` CLI inside a copy (bench/lib/transitions.mjs tests). Prints what the real commands print,
// from <cwd>/state.json: { phase, next, blockers, awaiting, lint, tasks: [{ id, status, effort, depends }] }.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
appendFileSync(join(process.cwd(), 'telos.jsonl'), `${JSON.stringify(args)}\n`);
const file = join(process.cwd(), 'state.json');
const s = { phase: '01-feature', next: '/telos:plan', blockers: 'none', awaiting: null, lint: 0, tasks: [],
  ...(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}) };
const out = (text) => process.stdout.write(`${text}\n`);

if (args[0] === 'status') {
  if (s.awaiting) out(`Awaiting user: ${s.awaiting}`);
  out(`Phase: ${s.phase} [active] · Task: ${s.tasks.find((t) => t.status !== 'done')?.id ?? 'none'}`);
  out(`Next: ${s.next}`);
  out(`Blockers: ${s.blockers}`);
} else if (args[0] === 'lint-plan') {
  out(s.lint === 0 ? `ok: ${s.tasks.length} tasks` : '01-02: Files not in scope');
  process.exitCode = s.lint;
} else if (args[0] === 'ctx' && args[1] === 'approve') {
  out(`Phase: ${s.phase} [active]`);
  out('Tasks:');
  for (const t of s.tasks) out(`- ${t.id} [${t.status}] Title of ${t.id} · ${t.effort ?? 'normal'} · depends: ${t.depends?.length ? t.depends.join(', ') : 'none'}`);
  out(`Lint: ${s.lint === 0 ? `ok: ${s.tasks.length} tasks` : 'failed'}`);
} else {
  process.stderr.write(`fake telos: unknown ${args.join(' ')}\n`);
  process.exitCode = 2;
}
