// Core command records for the guide. The record contract is documented in commands.mjs;
// later tasks append entries here or in sibling modules and register them in commands.mjs.
export const core = [
  {
    slug: 'skill-status',
    kind: 'skill',
    name: '/telos:status',
    invocation: '/telos:status',
    summary: 'Show where the project stands: phase, task, blockers and the next command to run.',
    profiles: 'All profiles (minimal, standard, deep)',
    prerequisites: [
      'Run inside Claude Code, in the repository.',
      'A .telos/ directory created by /telos:init; without it the skill says Telos is not initialized.',
    ],
    explanation: [
      'Use /telos:status to find your place again after a break, a /clear or a long session. The skill reads one prepared summary of .telos/STATUS.md and ROADMAP.md and answers in ten lines or fewer.',
      'The reply names the phase and task, lists blockers and items waiting for you only when there are any, shows the latest recent result and the stack line, and ends with the next command exactly as Telos stored it.',
    ],
    effects: [
      'Reads one prepared summary and changes nothing.',
      'Does not edit files, task state, STATUS, ROADMAP or git.',
      'Costs a few hundred tokens, because the skill does not open any project file.',
    ],
    examples: [
      {
        title: 'Resume after a break',
        command: '/telos:status',
        outcome:
          'Phase 02-billing [active], task 02-03 [in-progress]; no blockers; the latest recent line; the stack line; last line Next: /telos:do. Illustrative layout, not recorded output.',
      },
      {
        title: 'Before Telos is set up',
        command: '/telos:status',
        outcome: 'The skill says Telos is not initialized and suggests /telos:init.',
      },
    ],
    use: [
      'You return to a repository and need to know which task is next.',
      'A session was cleared or compacted and you want the stored next step.',
      'You want to see blockers or decisions that wait for you before you continue.',
    ],
    avoid: [
      'You want to change state: status is read-only, so use the command that owns the change.',
      'You need the full task list or a diff: open .telos/ROADMAP.md or the task file instead.',
    ],
    alternatives: [
      { label: 'telos status (terminal CLI)', note: 'The same compact view from a shell, without a Claude Code session and without spending tokens.' },
      { label: '/telos:do', note: 'When you already know the next step is the next approved task, run it directly.' },
    ],
    sources: [
      { label: 'Skill instructions', path: 'skills/status/SKILL.md' },
      { label: 'Status bundle', path: 'lib/ctx/status.mjs' },
      { label: 'README, Commands in Claude Code', path: 'README.md' },
    ],
  },
];
