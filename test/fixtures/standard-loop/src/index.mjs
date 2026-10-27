import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [mode, ...files] = process.argv.slice(2);
const expected = { greet: 'Hello', farewell: 'Bye', wave: 'Hey', independent: 'Welcome' };
const cache = fileURLToPath(new URL('../.telos/.cache/', import.meta.url));

assert.ok(['test', 'format', 'types'].includes(mode), `Unknown check: ${mode}`);
mkdirSync(cache, { recursive: true });
if (mode !== 'test') appendFileSync(`${cache}/checks.jsonl`, JSON.stringify({ mode, files }) + '\n');
assert.ok(!existsSync(`${cache}/fail-${mode}`), `Deliberate fixture ${mode} failure`);

if (mode === 'test') {
  for (const name of files) {
    assert.ok(Object.hasOwn(expected, name), `Unknown message: ${name}`);
    assert.ok(existsSync(new URL(`${name}.mjs`, import.meta.url)), `Missing message: ${name}`);
  }
  for (const [name, greeting] of Object.entries(expected)) {
    const path = new URL(`${name}.mjs`, import.meta.url);
    if (existsSync(path)) assert.equal((await import(path)).message('Ada'), `${greeting}, Ada!`);
  }
}
