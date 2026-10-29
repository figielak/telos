// Deterministic deep-loop checks: `test` checks each present message module, `e2e` chains them.
// A `.telos/.cache/fail-<mode>` file forces a failure so tests can exercise blocked paths.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const [mode] = process.argv.slice(2);
const expected = { greet: 'Hello', farewell: 'Bye' };

assert.ok(['test', 'e2e'].includes(mode), `Unknown check: ${mode}`);
assert.ok(!existsSync(new URL(`../.telos/.cache/fail-${mode}`, import.meta.url)), `Deliberate fixture ${mode} failure`);

const lines = [];
for (const [name, word] of Object.entries(expected)) {
  const path = new URL(`${name}.mjs`, import.meta.url);
  if (!existsSync(path)) continue;
  const { message } = await import(path);
  assert.equal(message('Ada'), `${word}, Ada!`);
  lines.push(message('Ada'));
}
if (mode === 'e2e') assert.equal(lines.join(' '), Object.entries(expected)
  .filter(([name]) => existsSync(new URL(`${name}.mjs`, import.meta.url))).map(([, word]) => `${word}, Ada!`).join(' '));
