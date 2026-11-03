// Illustrative session. The shapes follow real Telos output: the plan summary's last line
// (shared/plan.md), `telos accept` rows (lib/accept.mjs) and the `<type>(NN-MM): …` commit
// subject. Kinds: cmd = typed slash command, out = plain output, pass = a passing check row,
// commit = the resulting git subject.
export const lines = [
  { k: 'cmd', t: '/telos:plan 01' },
  { k: 'out', t: 'Phase 01-greeting: 2 tasks' },
  { k: 'out', t: '  01-01 Add greeting helper' },
  { k: 'out', t: '  01-02 Add farewell helper' },
  { k: 'out', t: 'Next: /telos:approve or /telos:revise <notes>' },
  { k: 'cmd', t: '/telos:approve' },
  { k: 'out', t: 'docs(telos): plan phase 01-greeting' },
  { k: 'out', t: 'Next: /telos:do' },
  { k: 'cmd', t: '/telos:do 01-01' },
  { k: 'out', t: 'MANUAL all listed tests pass' },
  { k: 'pass', t: 'PASS   `npm test` → exit 0' },
  { k: 'out', t: 'SCOPE  ok (2 files)' },
  { k: 'pass', t: 'accept 01-01: PASS' },
  { k: 'commit', t: 'feat(01-01): add greeting helper' },
];
