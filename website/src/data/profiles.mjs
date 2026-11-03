// Source: SPEC.md §3 (profiles table), hook rows checked against README.md §Hooks.
// Each profile is a superset of the previous one, so cells after "minimal" start with "+".
// The SPEC row about relative cost is deliberately left out: it lists targets, not measurements.
export const columns = ['minimal', 'standard', 'deep'];

export const rows = [
  {
    label: 'Workflow',
    cells: [
      'plan → tests → implement → run tests → commit',
      '+ discuss, phase CONTEXT, phase close',
      '+ research, plan self-critique, code review, retro',
    ],
  },
  {
    label: 'Files',
    cells: [
      'PROJECT, MAP, ROADMAP, STATUS, task files',
      '+ NN-CONTEXT.md, HISTORY, LESSONS',
      '+ NN-RESEARCH.md, decisions/ (ADR-lite)',
    ],
  },
  {
    label: 'Tests',
    cells: [
      'tests written before implementation, run after',
      '+ full verification (build, lint, types, tests) and the acceptance check',
      '+ strict TDD (RED evidence) and e2e for critical tasks',
    ],
  },
  {
    label: 'Docs',
    cells: [
      'none',
      'README touched only when setup or usage changes',
      '+ doc-sync at phase close, CHANGELOG, docstrings for changed public API, /telos:docs',
    ],
  },
  {
    label: 'Subagents',
    cells: [
      'none',
      'none',
      'reviewer and researcher agents, on demand or for critical tasks',
    ],
  },
  {
    label: 'Hooks',
    cells: [
      'session status, git guard',
      '+ config protection, scope guard, post-compaction status, checks on Stop',
      '+ map-staleness reminder',
    ],
  },
];
