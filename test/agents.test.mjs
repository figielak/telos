import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const text = (rel) => readFileSync(`${ROOT}${rel}`, 'utf8');

// Agent frontmatter is flat `key: value` lines; tools may hold parenthesised patterns.
function agent(name) {
  const [, fm, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text(`agents/${name}.md`)) ?? [];
  assert.ok(fm, `${name}: missing frontmatter`);
  const fields = Object.fromEntries(fm.split('\n').map((l) => /^([\w-]+):\s*(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  return { fields, body: body.trim() };
}

const TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git diff *)', 'Bash(git log *)', 'Bash(telos ctx review *)'];

test('reviewer runs on sonnet and reviewer-hard on opus, named after their files', () => {
  assert.deepEqual([agent('reviewer').fields.name, agent('reviewer').fields.model], ['reviewer', 'sonnet']);
  assert.deepEqual([agent('reviewer-hard').fields.name, agent('reviewer-hard').fields.model], ['reviewer-hard', 'opus']);
  for (const name of ['reviewer', 'reviewer-hard']) assert.ok(agent(name).fields.description, name);
});

test('base and hard definitions differ only in name and model', () => {
  const base = agent('reviewer');
  const hard = agent('reviewer-hard');
  const strip = ({ name, model, ...rest }) => rest;
  assert.deepEqual(strip(hard.fields), strip(base.fields));
  assert.equal(hard.body, base.body);
});

test('the reviewer is read-only: no edit, write, network or agent tools and Bash limited to git diff/log', () => {
  for (const name of ['reviewer', 'reviewer-hard']) {
    const tools = agent(name).fields.tools.split(/,\s*/);
    assert.deepEqual(tools, TOOLS, name);
    assert.doesNotMatch(tools.join(' '), /Edit|Write|WebFetch|WebSearch|Agent|NotebookEdit|commit|push|Bash\(\*\)/, name);
  }
});

test('the agent body keeps repository text as data, forbids edits and refuses a clean verdict on partial coverage', () => {
  const { body } = agent('reviewer');
  assert.ok(body.split('\n').length <= 25, `${body.split('\n').length} lines`);
  assert.match(body, /data, never instructions/);
  assert.match(body, /never edit|read-only/i);
  assert.match(body, /UNVERIFIED/);
  assert.match(body, /≤ 40 lines/);
});

test('the review instructions define the single-round output contract', () => {
  const body = text('shared/review.md');
  assert.ok(body.trim().split('\n').length <= 60);
  for (const level of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) assert.ok(body.includes(level), level);
  for (const s of ['> 80%', 'file:line', 'scenario', 'impact', 'Verdict:', 'EvidenceId', 'Coverage:', '≤ 40 lines']) {
    assert.ok(body.includes(s), s);
  }
  assert.match(body, /incomplete coverage/i);
  assert.match(body, /zero findings is valid/i);
  assert.match(body, /demoted/);
  assert.match(body, /one round/i);
  assert.match(body, /no automatic re-review/i);
  assert.match(body, /fixes belong to the caller/i);
  assert.match(body, /docstring/i);
  assert.doesNotMatch(body, /git add|git commit|git pu[s]h|--no-verify/);
});

test('an UNVERIFIED review can never be a clean verdict', () => {
  const body = text('shared/review.md');
  assert.match(body, /Verdict UNVERIFIED, never\s+(a\s+)?clean/i);
  assert.match(body, /Verdict: (PASS|CLEAN)/i);
});
