import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PROFILES, load as loadConfig } from '../config.mjs';
import { PROFILE_FILES } from '../profile.mjs';
import { telosDir } from '../repo.mjs';

/** Count phase files named `NN-<KIND>.md` under `.telos/phases/`. */
function phaseFiles(dir, kind) {
  const phases = join(dir, 'phases');
  if (!existsSync(phases)) return 0;
  const name = new RegExp(`^\\d{2}-${kind}\\.md$`);
  return readdirSync(phases, { withFileTypes: true }).filter((d) => d.isDirectory())
    .reduce((n, d) => n + readdirSync(join(phases, d.name)).filter((f) => name.test(f)).length, 0);
}

/** Bundle for /telos:profile: current profile, file state per profile and switch guidance. Read-only. */
export function profileBundle({ root }) {
  const dir = telosDir(root);
  if (!existsSync(dir)) return 'Telos not initialized. Run /telos:init.';
  let cfg;
  try {
    cfg = loadConfig(root);
  } catch (err) {
    return `REFUSED: ${err.message}. Fix .telos/config.json by hand, then rerun /telos:profile.`;
  }
  const state = (f) => `${f}: ${existsSync(join(dir, f)) ? 'present' : 'missing'}`;
  return [
    `Current profile: ${cfg.profile}`,
    'Files by profile (each includes the ones above):',
    ...PROFILES.map((p) => `- ${p}: ${PROFILE_FILES[p].map(state).join(' · ')}`),
    `Phase files: ${phaseFiles(dir, 'CONTEXT')} CONTEXT · ${phaseFiles(dir, 'RESEARCH')} RESEARCH`,
    '',
    'Switch: `telos profile <minimal|standard|deep>` changes only config.profile; it creates the',
    'missing files of the target (HISTORY.md and LESSONS.md for standard, decisions/ for deep),',
    'logs a `profile` History entry when HISTORY.md exists, and keeps every other config value,',
    'CLAUDE.md and all existing files. Same profile → no-op.',
    'Downgrade: retains HISTORY, LESSONS, CONTEXT, RESEARCH and decisions/ with their content;',
    'only the features and commands of the higher profile become unavailable.',
    'Exit 0 switched or no-op · 1 failure (config and HISTORY restored, safe to retry) · 2 usage.',
  ].join('\n');
}
