import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detect } from '../lib/detect.mjs';

const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url));

test('astro-ts: stack, pnpm commands from scripts, vitest related', () => {
  const r = detect(fixture('astro-ts'));
  assert.equal(r.name, 'astro-demo');
  assert.deepEqual(r.stack, ['astro', 'typescript']);
  assert.equal(r.packageManager, 'pnpm');
  assert.deepEqual(r.checks, {
    build: 'pnpm run build',
    types: 'pnpm exec astro check && pnpm exec tsc --noEmit',
    lint: 'pnpm run lint',
    test: 'pnpm run test',
    test_related: 'pnpm exec vitest related --run {files}',
  });
  assert.equal(r.evidence.lint, 'package.json scripts.lint');
  assert.equal(r.evidence.packageManager, 'pnpm-lock.yaml');
  for (const key of Object.keys(r.checks)) assert.ok(r.evidence[key], `evidence for ${key}`);
});

test('python-uv: uv run prefix, pytest and ruff from evidence', () => {
  const r = detect(fixture('python-uv'));
  assert.equal(r.name, 'py-demo');
  assert.deepEqual(r.stack, ['python']);
  assert.equal(r.packageManager, 'uv');
  assert.deepEqual(r.checks, { lint: 'uv run ruff check .', test: 'uv run pytest' });
});

test('versions: major for ^, major.minor for ~, runtimes as written', () => {
  assert.deepEqual(detect(fixture('astro-ts')).versions, { astro: '5', typescript: '5.6', node: '>=22' });
  assert.deepEqual(detect(fixture('python-uv')).versions, { python: '>=3.12' });
});

test('node-plain without scripts has no build or lint', () => {
  const r = detect(fixture('node-plain'));
  assert.equal(r.packageManager, 'npm');
  assert.deepEqual(r.checks, {});
  assert.deepEqual(r.stack, ['javascript']);
});

test('empty repo: empty stack and checks, name from the directory', () => {
  const r = detect(fixture('empty'));
  assert.deepEqual(r.stack, []);
  assert.deepEqual(r.checks, {});
  assert.equal(r.packageManager, null);
  assert.equal(r.name, 'empty');
});

test('tool fallbacks need dependency evidence, never a guess', () => {
  const root = mkdtempSync(join(tmpdir(), 'telos-detect-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'x', devDependencies: { vitest: '^2.0.0', '@playwright/test': '^1.48.0', typescript: '^5.6.0' },
  }));
  writeFileSync(join(root, 'yarn.lock'), '');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  const r = detect(root);
  assert.deepEqual(r.checks, {
    types: 'yarn tsc --noEmit',
    test: 'yarn vitest run',
    test_related: 'yarn vitest related --run {files}',
    e2e: 'yarn playwright test',
  });
  assert.equal(r.evidence.test, 'package.json devDependencies.vitest');
});

test('broken package.json is reported, not thrown', () => {
  const root = mkdtempSync(join(tmpdir(), 'telos-detect-'));
  writeFileSync(join(root, 'package.json'), '{ nope');
  const r = detect(root);
  assert.match(r.evidence.error, /package\.json/);
  assert.deepEqual(r.checks, {});
});
