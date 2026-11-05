#!/usr/bin/env node
// Grades every recorded cell of the campaign again after removing the sandbox write markers (RUNLOG defect 6). No model session runs.
// Results go to <out>/regrade/<cell>.json; the records are not touched here.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadManifest } from '../lib/manifest.mjs';
import { clearWriteMarkers, grade } from '../lib/orchestrate.mjs';
import { clearUserFiles, handBack, reclaim, revokeSession } from '../lib/sandbox.mjs';

const [outDir, configFile, manifestDir = 'bench/corpus'] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configFile, 'utf8'));
const manifest = loadManifest(resolve(manifestDir));
const target = join(outDir, 'regrade');
mkdirSync(target, { recursive: true });
const graderArgv = [...config.launcher, config.node ?? 'node'];
for (const file of readdirSync(join(outDir, 'records')).filter((f) => f.endsWith('.json')).sort()) {
  const id = file.slice(0, -5);
  if (existsSync(join(target, file))) continue;
  const record = JSON.parse(readFileSync(join(outDir, 'records', file), 'utf8'));
  if (record.status !== 'completed' && record.status !== 'blocked') continue;
  const task = manifest.tasks.find((t) => t.id === record.task);
  const copy = join(config.workDir, 'copies', id);
  clearUserFiles(config.launcher);
  reclaim([copy], config.launcher); // the session's files already carry group access; only the closed top dir reopens
  try {
    const removed = clearWriteMarkers(copy);
    const acceptance = grade(join(manifest.dir, task.acceptance), copy, join(config.workDir, 'grading'), id, graderArgv);
    writeFileSync(join(target, file), `${JSON.stringify({ cell: id, removed, firstExit: record.acceptance?.exit ?? null, acceptance, at: new Date().toISOString() }, null, 2)}\n`);
    console.log(`${id} first=${record.acceptance?.exit} now=${acceptance.exit} removed=${removed.length}`);
  } finally {
    handBack([copy], config.launcher);
    revokeSession([copy]);
  }
}
