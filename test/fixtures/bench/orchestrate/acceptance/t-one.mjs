// Hidden acceptance fixture (bench/lib/orchestrate.mjs tests): passes when the agent wrote out.txt = "done".
// It also records where it ran from, so the test can check the material lived only in a fresh grading dir.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ok = existsSync('out.txt') && readFileSync('out.txt', 'utf8').trim() === 'done';
writeFileSync('graded.json', JSON.stringify({ script: process.argv[1], dir: dirname(process.argv[1]), cwd: process.cwd(), ok }));
console.log(ok ? 'behavioural: pass' : 'behavioural: FAIL out.txt');
process.exit(ok ? 0 : 1);
