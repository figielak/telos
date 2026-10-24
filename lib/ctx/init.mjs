import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { PROFILES, load as loadConfig } from '../config.mjs';
import { detect } from '../detect.mjs';
import { telosDir } from '../repo.mjs';
import { render } from '../template.mjs';
import { stackLine } from './stack.mjs';

/** Start marker of the CLAUDE.md block, with or without ` vN` (D-06). */
export const BLOCK_START = /<!-- telos:start(?: v(\d+))? -->/;

/** Version of the block this plugin ships, from templates/claude-block.md. */
export const BLOCK_VERSION = Number(BLOCK_START.exec(render('claude-block.md', {}))[1]);

/** @returns {'absent' | 'outdated' | string} `present vN` when current */
export function blockState(root) {
  const path = join(root, 'CLAUDE.md');
  const m = existsSync(path) ? BLOCK_START.exec(readFileSync(path, 'utf8')) : null;
  if (!m) return 'absent';
  return Number(m[1]) === BLOCK_VERSION ? `present v${BLOCK_VERSION}` : 'outdated';
}

function telosState(root) {
  const dir = telosDir(root);
  if (!existsSync(dir)) return 'not initialized';
  const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).sort();
  let profile;
  try {
    profile = `profile ${loadConfig(root).profile}`;
  } catch (e) {
    profile = `config unreadable: ${e.message}`;
  }
  return `initialized, ${profile} (${files.join(', ') || 'no files'})`;
}

/** Bundle for /telos:init: requested profile, repo state and detection with evidence. */
export function initBundle({ root, args }) {
  const [profile] = args;
  const d = detect(root);
  const profileLine = !profile ? 'not given'
    : PROFILES.includes(profile) ? profile
      : `${profile} (invalid; use ${PROFILES.slice(0, -1).join(', ')} or ${PROFILES.at(-1)})`;
  const checks = Object.entries(d.checks).map(([k, cmd]) => `- ${k}: \`${cmd}\` (${d.evidence[k]})`);
  return [
    '# telos ctx init',
    `Requested profile: ${profileLine}`,
    `Git repo: ${existsSync(join(root, '.git')) ? 'yes' : 'no'}`,
    `Telos: ${telosState(root)}`,
    `CLAUDE.md block: ${blockState(root)}`,
    '',
    '## Detected',
    `Name: ${d.name}`,
    stackLine(root, d, d),
    `Package manager: ${d.packageManager ? `${d.packageManager} (${d.evidence.packageManager})` : 'none'}`,
    ...(d.evidence.error ? [`Error: ${d.evidence.error}`] : []),
    'Checks:',
    ...(checks.length ? checks : ['- none detected']),
  ].join('\n');
}
