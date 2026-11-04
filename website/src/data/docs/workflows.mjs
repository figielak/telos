/**
 * Workflow recipes for the guide (five, by decision D-04).
 *
 * {
 *   slug, title, summary
 *   illustration:  string, the sample scenario; always labelled illustrative
 *   choose, avoid: string[]  (when to pick or skip the recipe)
 *   start:         { profile, repository, phase, task }  (state the recipe assumes)
 *   artifacts:     string[]  (what exists at the end)
 *   steps:         { title, where: 'Claude Code'|'Bash'|'You decide', command?, link?, outcome, checkpoint,
 *                    optional?, condition? }[]   (condition starts with "If "; link is a guide slug)
 *   stops:         string[]  (when to stop and what to do)
 *   alternatives:  { label, note, slug? }[]
 * }
 * Every statement is backed by the README and the skill instructions linked from the steps.
 * Task ids and phase numbers are examples; yours come from your own plan. No recipe pushes.
 */
export const workflows = [
  {
    slug: 'quick-fix',
    title: 'Quick fix without a phase',
    summary: 'Make one small, well-bounded change with a test, a check and one commit, with no plan files.',
    illustration: 'Illustrative scenario: a list endpoint skips the last item when the page size divides the total.',
    choose: ['The change touches about five files or fewer and fits in under an hour.', 'You can state the expected behavior in one sentence.'],
    avoid: ['The work needs several dependent steps or decisions: plan a phase instead.', 'Another task is in progress and you want to keep the focus on it.'],
    start: { profile: 'Any profile (minimal is enough)', repository: 'Telos initialized, clean working tree preferred', phase: 'None needed', task: 'None; a quick change creates no task' },
    artifacts: ['A test-first code change in your working tree.', 'One commit with the subject type(quick): summary, only when git.auto_commit is true; otherwise the paths and subject are listed for you.'],
    steps: [
      { title: 'Look at where you stand', where: 'Claude Code', command: '/telos:status', link: 'skill-status', outcome: 'A short view of phase, task, blockers and the next step. It reads and changes nothing.', checkpoint: 'No unrelated task is in progress, or you accept that the quick change runs next to it.' },
      { title: 'Describe the fix', where: 'Claude Code', command: '/telos:quick Fix the last page of /items dropping its final item, with a test', link: 'skill-quick', outcome: 'A mini-plan of at most five lines in the chat, a test first for behavior changes, the change, then the configured quick checks and a commit of only the touched paths.', checkpoint: 'The mini-plan names the files you expected. If it names many more, stop and plan instead.' },
      { title: 'Read the result', where: 'You decide', outcome: 'You review the diff and the commit subject, or the listed paths when auto-commit is off. You decide whether it is what you asked for.', checkpoint: 'Checks passed and the diff matches the one-sentence behavior you described.' },
      { title: 'Hand a larger change to a plan', where: 'Claude Code', command: '/telos:plan Paginate every list endpoint consistently', link: 'skill-plan', optional: true, condition: 'If the skill reports that the change is larger than a quick change, or unclear', outcome: 'The quick run stops without a half change and suggests a phase. /telos:plan drafts tasks that you review and approve before anything runs.', checkpoint: 'You have draft tasks and no uncommitted partial work from the quick attempt.' },
    ],
    stops: ['Stop when a check fails after the fix attempts: read the failure, fix by hand or retry with /telos:quick-hard for a tricky case. Do not commit around a failing check.', 'Stop when the working tree holds unrelated changes you do not want in the commit: the skill commits only touched paths, so commit or stash your own work first.'],
    alternatives: [{ label: '/telos:plan', slug: 'skill-plan', note: 'For work that needs a phase, tasks and approval.' }, { label: '/telos:do', slug: 'skill-do', note: 'For a task that is already approved.' }],
  },
  {
    slug: 'onboard-existing-repo',
    title: 'Onboard an existing repository',
    summary: 'Add Telos to a codebase that already exists, build its map and prepare the first plan, on the minimal profile.',
    illustration: 'Illustrative scenario: a small Node service with history and tests, but no Telos files yet.',
    choose: ['You adopt Telos in a repository that has code and a Git history.', 'You want the smallest setup first and can switch profile later.'],
    avoid: ['The folder is not a Git repository: run git init first.', 'You already have a .telos/ directory: use the map refresh or switch profile instead.'],
    start: { profile: 'None yet; this recipe chooses minimal', repository: 'Existing Git repository with committed source', phase: 'None', task: 'None' },
    artifacts: ['.telos/ project memory with config, a CLAUDE.md block and a built MAP.md.', 'A PROJECT.md draft that is unconfirmed until you review it.', 'Optionally a docs(telos): map commit, only when git.auto_commit is true and you agree.'],
    steps: [
      { title: 'Initialize on minimal', where: 'Claude Code', command: '/telos:init minimal', link: 'skill-init', outcome: 'Detected check commands are confirmed once, .telos/ and the CLAUDE.md block are created, and a docs(telos): initialize telos commit is suggested. Nothing is committed for you.', checkpoint: 'The reply lists Created, Updated and Kept files and the checks now in config.' },
      { title: 'Commit the setup yourself', where: 'You decide', outcome: 'You stage the listed Telos files and commit them with the suggested subject, or choose not to. The map step needs no uncommitted source changes.', checkpoint: 'git status shows no uncommitted source files. Telos files from init are allowed.' },
      { title: 'Build the map', where: 'Claude Code', command: '/telos:map', link: 'skill-map', outcome: 'The skill reads a repository scan and a few suggested files, writes .telos/MAP.md and requires Map validation: PASS. It then drafts empty PROJECT sections without asking questions.', checkpoint: 'The reply shows Map validation: PASS. If it shows a failure after two repairs, the old map is restored.' },
      { title: 'Review the PROJECT draft', where: 'You decide', outcome: 'You read the Assumed items, correct the purpose, rules and conventions in .telos/PROJECT.md and confirm what is right. The draft is unconfirmed until you do.', checkpoint: 'Each rule in PROJECT.md is one you would enforce.' },
      { title: 'Refresh after the code moves on', where: 'Claude Code', command: '/telos:map --refresh', link: 'skill-map', optional: true, condition: 'If the code changed noticeably since the map was built', outcome: 'A noop run only moves the header; an incremental run edits only the affected blocks. The skill refuses with uncommitted source changes.', checkpoint: 'Map validation: PASS again, and PROJECT.md is untouched by the refresh.' },
      { title: 'Confirm the state', where: 'Claude Code', command: '/telos:status', link: 'skill-status', outcome: 'The Next line points to planning the first phase once the map is built.', checkpoint: 'Next mentions /telos:plan.' },
      { title: 'Plan the first piece of work', where: 'Claude Code', command: '/telos:plan Add input validation to the signup form', link: 'skill-plan', outcome: 'Draft tasks for a new phase, with Assumed lines and Next: /telos:approve or /telos:revise. Planning does not commit or run a task.', checkpoint: 'You have draft tasks to review. On minimal the recipe ends here; the profile-gated commands become available after you switch profile.' },
    ],
    stops: ['Stop when /telos:map answers REFUSED because of uncommitted source changes: commit or stash them, then run it again.', 'Stop when init says it is not a Git repository: run git init in a terminal and start again.'],
    alternatives: [{ label: 'Standard feature phase', slug: undefined, note: 'Once onboarded, switch to standard with /telos:profile standard and follow that recipe.' }, { label: '/telos:quick', slug: 'skill-quick', note: 'For a small change right after onboarding.' }],
  },
  {
    slug: 'standard-feature',
    title: 'Standard feature phase',
    summary: 'Take one feature from decisions through plan, approval, task runs, verification and phase close on the standard profile.',
    illustration: 'Illustrative scenario: a greeting helper with two dependent tasks in a fresh repository. Your phase number and task ids will differ.',
    choose: ['The feature needs several steps, or choices you want recorded before coding.', 'You want approval, verification and a phase history.'],
    avoid: ['The change is small and obvious: use the quick fix recipe.', 'You need real RED, an e2e check and an independent review for critical code: use the deep recipe.'],
    start: { profile: 'Standard', repository: 'Git repository, clean working tree', phase: 'No phase yet; step 2 creates the first planned phase', task: 'None' },
    artifacts: ['A phase in ROADMAP and a CONTEXT with decisions.', 'Approved task files, each ending done with its own commit when git.auto_commit is true.', 'A closed phase with a HISTORY entry and a docs(telos): close phase commit.'],
    steps: [
      { title: 'Initialize on standard', where: 'Claude Code', command: '/telos:init standard', link: 'skill-init', optional: true, condition: 'If the repository does not have Telos yet', outcome: 'Telos files and the CLAUDE.md block are created. Use /telos:profile standard instead when the repository already runs on minimal.', checkpoint: 'The reply shows the standard profile and the detected checks.' },
      { title: 'Create the phase entry', where: 'Bash', command: 'telos roadmap add greeting "Greeting helpers" "Messages verified"', link: 'cli-roadmap', outcome: 'A planned phase line is appended to ROADMAP.md with the next free number, for example 01-greeting. Discuss needs a phase that exists.', checkpoint: 'The new line shows [planned].' },
      { title: 'Point STATUS at the phase', where: 'Bash', command: 'telos status set phase=01-greeting task=none next=/telos:discuss', link: 'cli-status', outcome: 'STATUS names the phase so the skills target it. This records state only; it does not discuss, plan or commit.', checkpoint: 'telos status shows the phase and Next: /telos:discuss.' },
      { title: 'Clarify scope and decisions', where: 'Claude Code', command: '/telos:discuss 01', link: 'skill-discuss', outcome: 'One question round. Your answers become D-NN decisions in 01-CONTEXT.md; choices the skill assumed become D-NN [proposed].', checkpoint: 'The reply lists confirmed and proposed decisions and ends with Next: /telos:plan 01.' },
      { title: 'Decide what is still proposed', where: 'You decide', outcome: 'You confirm or change each proposed decision and answer open questions. The skill never confirms them for you, and tasks that list a proposed decision stay in draft.', checkpoint: 'Awaiting user in STATUS is empty, or you accept that those tasks wait.' },
      { title: 'Plan the phase', where: 'Claude Code', command: '/telos:plan 01', link: 'skill-plan', outcome: 'Draft task files with scope, tests and acceptance, linted until they pass. The phase is marked drafted. Nothing runs or is committed.', checkpoint: 'The reply ends with Next: /telos:approve or /telos:revise, and the task ids are the ones your plan produced.' },
      { title: 'Approve the plan', where: 'Claude Code', command: '/telos:approve', link: 'skill-approve', outcome: 'Lint must pass, tasks with unconfirmed decisions stay draft, the others become approved. The phase becomes active, docs(telos): plan phase 01-greeting is committed and the tag telos/01-start is created.', checkpoint: 'At least one task is approved. If none are, return to the decisions step.' },
      { title: 'Run the first task', where: 'Claude Code', command: '/telos:do 01-01', link: 'skill-do', outcome: 'Tests first, then the change, then telos accept. Passing work is committed as feat(01-01): … when auto-commit is on, and STATUS moves to the next task.', checkpoint: 'The reply shows accept PASS and a commit subject. Task ids come from your plan, so use the ones /telos:status shows.' },
      { title: 'Run each remaining task', where: 'Claude Code', command: '/telos:do 01-02', link: 'skill-do', optional: true, condition: 'If your plan has more approved tasks', outcome: 'The same loop for the next task whose dependencies are done. Repeat once per planned id.', checkpoint: 'Each task ends done. A blocked task means stop; see the stop conditions.' },
      { title: 'Verify the phase', where: 'Claude Code', command: '/telos:check 01', link: 'skill-check', outcome: 'A read-only report: full checks, accept per task and a hand check of manual items. It changes nothing.', checkpoint: 'The last line is Next: /telos:done. Anything else lists what to fix first.' },
      { title: 'Close the phase', where: 'Claude Code', command: '/telos:done 01', link: 'skill-done', outcome: 'It repeats the verification, promotes hard-to-reverse decisions to HISTORY, marks the roadmap done and commits docs(telos): close phase when auto-commit is on. It never pushes.', checkpoint: 'The reply ends with Next: /telos:plan. A Close: blocked line lists reasons and changes nothing.' },
    ],
    stops: ['Stop when /telos:do answers REFUSED or a task stays draft because of a proposed decision: confirm it with /telos:discuss first.', 'Stop when a task becomes blocked after two failed fix attempts: read the blocker in /telos:status, then fix by hand or use /telos:do-hard. Later tasks that depend on it do not run.', 'Stop when /telos:done says Close: blocked or a check is UNVERIFIED: fix the reason it names and run /telos:check again.'],
    alternatives: [{ label: 'Quick fix', note: 'For changes that do not need a phase.' }, { label: '/telos:plan', slug: 'skill-plan', note: 'On its own, when you only want a reviewed draft.' }],
  },
  {
    slug: 'deep-critical-feature',
    title: 'Deep critical feature',
    summary: 'Build security, payment or data-integrity work with research, recorded decisions, real RED, a configured e2e check and a review.',
    illustration: 'Illustrative scenario: a token refresh endpoint. Phase numbers, task ids and the e2e command are examples; use your own.',
    choose: ['A mistake would be costly: security, payments, concurrency or data integrity.', 'You want evidence recorded: a failing test first, an e2e pass and an independent review.'],
    avoid: ['The work is routine: the standard recipe has fewer steps and no e2e requirement.', 'You cannot configure an e2e command yet: critical code tasks block without one.'],
    start: { profile: 'Deep', repository: 'Git repository with a working test command', phase: 'No phase yet; the recipe creates one before discuss and research', task: 'None' },
    artifacts: ['01-CONTEXT.md with decisions and 01-RESEARCH.md written by the main thread.', 'Critical task Results holding RED:, GREEN: and Review: lines.', 'ADRs for hard-to-reverse decisions and a closed phase with doc-sync and a retro.'],
    steps: [
      { title: 'Switch to the deep profile', where: 'Claude Code', command: '/telos:profile deep', link: 'skill-profile', optional: true, condition: 'If the repository is not already on deep', outcome: 'Deep-only files are created and the switch is logged. Use /telos:init deep for a fresh repository.', checkpoint: 'The summary names the deep profile.' },
      { title: 'Configure an e2e check', where: 'You decide', outcome: 'You add an e2e command to the checks in .telos/config.json, for example your end-to-end test runner. Critical code tasks run the configured e2e after the full checks; without it the task blocks and a check reports UNVERIFIED.', checkpoint: 'The e2e command runs by itself and exits 0 on the current tree.' },
      { title: 'Create the phase entry', where: 'Bash', command: 'telos roadmap add tokens "Token refresh" "Refresh verified end to end"', link: 'cli-roadmap', outcome: 'A planned phase line with the next free number. Discuss and research need a phase that exists.', checkpoint: 'The new line shows [planned].' },
      { title: 'Point STATUS at the phase', where: 'Bash', command: 'telos status set phase=01-tokens task=none next=/telos:discuss', link: 'cli-status', outcome: 'STATUS names the phase. It records state only and runs nothing.', checkpoint: 'telos status shows the phase.' },
      { title: 'Write the CONTEXT', where: 'Claude Code', command: '/telos:discuss 01', link: 'skill-discuss', outcome: 'One question round, then 01-CONTEXT.md with decisions and open questions. Research needs this file; without it /telos:research answers REFUSED.', checkpoint: 'The CONTEXT exists and the reply lists open questions.' },
      { title: 'Research the open questions', where: 'Claude Code', command: '/telos:research 01 token storage options', link: 'skill-research', outcome: 'A read-only agent returns a report of at most 60 lines and a Handoff line; the main thread writes 01-RESEARCH.md. The report recommends but leaves each question open.', checkpoint: 'The Handoff line says create, replace or keep, and the file matches it. Use /telos:research-hard for a hard trade-off.' },
      { title: 'Decide', where: 'You decide', outcome: 'You answer the open questions and confirm proposed decisions, for example by running /telos:discuss 01 again. Planning then treats the research as evidence only.', checkpoint: 'No proposed decision or open question blocks the tasks you want to run.' },
      { title: 'Plan with the self-critique pass', where: 'Claude Code', command: '/telos:plan 01', link: 'skill-plan', outcome: 'Draft tasks, one self-critique pass over risks and missing tests, and critical tasks marked in their files. The phase is drafted.', checkpoint: 'You can name which tasks are critical code tasks. Task ids come from your plan.' },
      { title: 'Approve', where: 'Claude Code', command: '/telos:approve', link: 'skill-approve', outcome: 'Approved tasks, an active phase, a plan commit and the tag telos/01-start, which later review and close steps rely on.', checkpoint: 'The critical tasks are approved, not draft.' },
      { title: 'Run a critical task', where: 'Claude Code', command: '/telos:do-hard 01-01', link: 'skill-do', outcome: 'A real RED is recorded first: a test that fails on an assertion about the missing behavior. After green, telos check --level full --task 01-01 must pass including e2e, then one reviewer round runs before any state change or commit.', checkpoint: 'Result holds RED:, GREEN: and Review: lines. Repeat for each planned critical id; /telos:do works for non-critical ones.' },
      { title: 'Review the phase yourself', where: 'Claude Code', command: '/telos:review-hard 01', link: 'skill-review', optional: true, condition: 'If you want another read of critical work before closing', outcome: 'A read-only verdict in at most 40 lines. It fixes nothing; findings go to the owning task or to /telos:revise.', checkpoint: 'The verdict is PASS or PASS WITH NOTES, or you know what to fix.' },
      { title: 'Verify the phase', where: 'Claude Code', command: '/telos:check 01', link: 'skill-check', outcome: 'Full checks, accept per task and manual items. A required e2e that is not configured is UNVERIFIED and passing unit checks never cover it.', checkpoint: 'The last line is Next: /telos:done.' },
      { title: 'Close the phase', where: 'Claude Code', command: '/telos:done 01', link: 'skill-done', outcome: 'Verification, a phase review unless task reviews are current, doc-sync, at most ten changelog lines, ADR promotion and a retro, then the close commit when auto-commit is on. It never pushes.', checkpoint: 'Close: blocked or any HIGH finding stops the close with the phase still active.' },
    ],
    stops: ['Stop when a task is blocked because RED was never real (the test passed already or failed for an environment reason) or the e2e is missing: fix the test or the configuration, then rerun. Never fabricate RED.', 'Stop when a review is UNVERIFIED, REFUSED or CHANGES REQUESTED with a HIGH finding: fix it in the owning task or add one with /telos:revise.', 'Stop when /telos:research answers REFUSED because the CONTEXT is missing: run /telos:discuss first.'],
    alternatives: [{ label: 'Standard feature phase', note: 'Without e2e, recorded RED or ADRs.' }, { label: '/telos:review', slug: 'skill-review', note: 'The default-model review for routine work.' }],
  },
  {
    slug: 'change-resume-undo',
    title: 'Change the plan, resume, or undo',
    summary: 'Handle a plan that changes, an interrupted session, a blocked task and, if needed, a confirmed revert, each as its own branch.',
    illustration: 'Illustrative scenario: phase 02 is active, task 02-01 is done and later tasks depend on it. Ids are examples.',
    choose: ['A phase is already active and something changed: new notes, a stopped session, or a finished task that was wrong.', 'You want to keep the other work and its history.'],
    avoid: ['No phase exists yet: plan one first.', 'You only want to discard uncommitted edits: use Git, since undo reverts commits of a finished task.'],
    start: { profile: 'Standard or deep (undo and check are gated)', repository: 'Git repository with the phase start tag', phase: 'An active phase with approved tasks', task: 'Some done, one possibly in progress or blocked' },
    artifacts: ['An updated plan whose changed tasks were approved again.', 'A resumed or unblocked task.', 'Only after your confirmation: a revert commit, a task marked reverted and its dependents blocked.'],
    steps: [
      { title: 'See where you are', where: 'Claude Code', command: '/telos:status', link: 'skill-status', outcome: 'Phase, current task, blockers and the next step. Every later branch starts from what this shows.', checkpoint: 'You know which branch applies: changed plan, interrupted task, blocked task or wrong finished task.' },
      { title: 'Change the plan', where: 'Claude Code', command: '/telos:revise Split 02-03 into a parser task and a writer task', link: 'skill-revise', optional: true, condition: 'If your notes change the plan of the active phase', outcome: 'Minimal edits to the plan. An approved task that your notes change goes back to draft; tasks in progress, done or blocked are not touched, and the skill suggests a new task instead.', checkpoint: 'The reply lists which tasks are now draft.' },
      { title: 'Approve the changed tasks again', where: 'Claude Code', command: '/telos:approve', link: 'skill-approve', optional: true, condition: 'If /telos:revise sent approved tasks back to draft', outcome: 'Lint runs again and the draft tasks become approved. Unconfirmed decisions keep tasks in draft.', checkpoint: 'The tasks you want to run are approved.' },
      { title: 'Resume an interrupted task', where: 'Claude Code', command: '/telos:do', link: 'skill-do', optional: true, condition: 'If a task is still in progress after a stopped session or /clear', outcome: 'The skill continues the in-progress task instead of starting another. For deep critical work without a recorded RED line, the task blocks rather than inventing one.', checkpoint: 'The task ends done, or blocked with a reason.' },
      { title: 'Resolve a blocked task', where: 'You decide', optional: true, condition: 'If a task is blocked', outcome: 'You read the blocker in /telos:status and decide: fix it by hand, or rerun with /telos:do-hard. Tasks that depend on it cannot advance until it is done.', checkpoint: 'The task status is no longer blocked before you continue.' },
      { title: 'Take a finished task out', where: 'Claude Code', command: '/telos:undo 02-01', link: 'skill-undo', optional: true, condition: 'If a finished task must be reverted and you want its commits removed', outcome: 'It lists every commit with its full hash, the Telos files, the dependents it will block and the state after undo, then asks once. Only a revert answer proceeds; Cancel changes nothing. Dependents are blocked, never reverted.', checkpoint: 'You confirmed the exact hashes. The check must pass before the task is marked reverted; a code conflict stops with recovery steps.' },
      { title: 'Plan the redo', where: 'Claude Code', command: '/telos:revise Redo 02-01 with the parser handling empty input', link: 'skill-revise', optional: true, condition: 'If you undid a task and want the work done again', outcome: 'The notes become a changed or new task, and the blocked dependents are addressed through the plan.', checkpoint: 'Changed tasks are draft and ready for approval.' },
      { title: 'Approve the redo', where: 'Claude Code', command: '/telos:approve', link: 'skill-approve', optional: true, condition: 'If the redo tasks are draft', outcome: 'The redo tasks become approved and /telos:do can run them in dependency order.', checkpoint: '/telos:status shows an approved next task.' },
    ],
    stops: ['Stop when a task is blocked: nothing that depends on it advances. Resolve the blocker first.', 'Stop when /telos:undo reports a conflict outside .telos/: it runs no further git command; resolve by hand or abort the revert as the message explains. No HISTORY entry is written.', 'Stop when the confirmation is anything other than a revert option: no revert and no state change happen.'],
    alternatives: [{ label: '/telos:revise', slug: 'skill-revise', note: 'Alone, for plan edits with no undo.' }, { label: '/telos:status', slug: 'skill-status', note: 'Start here when unsure what state you are in.' }],
  },
];
