// Core command records for the guide. The record contract is documented in commands.mjs.
// Every statement here is backed by the skill file, the shared instructions or the CLI bundle
// named in the record's sources. Examples are illustrative, never recorded output.
const README = { label: 'README, Commands in Claude Code', path: 'README.md' };
const skill = (name) => ({ label: `Skill instructions: /telos:${name}`, path: `skills/${name}/SKILL.md` });

export const core = [
  {
    slug: 'skill-init',
    kind: 'skill',
    name: '/telos:init',
    invocation: '/telos:init [minimal|standard|deep]',
    summary: 'Set Telos up in the current repository: .telos/ files, config, a CLAUDE.md block and a suggested commit.',
    profiles: 'Chooses the profile (minimal, standard or deep); runs once per repository',
    prerequisites: [
      'Run inside Claude Code, in a Git repository. Without one the skill tells you to run git init and stops.',
      'Node.js 20.10 or newer, because the skill calls the telos CLI.',
    ],
    explanation: [
      'The skill reads one prepared summary: whether Git is present, which stack and check commands were detected, and whether Telos already exists. It asks at most one round of questions: the profile, only when you did not pass one and Telos is not initialized yet, and whether to keep the detected check commands.',
      'It then runs a single telos init command. Passing the profile on the command line, for example /telos:init standard, skips the profile question. Standard is the recommended choice; minimal keeps only the core loop; deep adds research, review and documentation sync.',
    ],
    effects: [
      'Creates the .telos/ project memory files and config, adds or updates a block in CLAUDE.md and touches .gitignore.',
      'Prints which files were created, updated or kept, and the checks now in the config.',
      'Does not commit. It suggests the commit docs(telos): initialize telos and the paths to stage.',
      'On an initialized repository it reuses the current profile. Asking for a different one stops and points to /telos:profile.',
    ],
    examples: [
      {
        title: 'Start a new repository with the standard profile',
        command: '/telos:init standard',
        outcome:
          'The skill confirms detected check commands once, creates .telos/ and the CLAUDE.md block, lists Created, Updated and Kept files, suggests committing docs(telos): initialize telos, and ends with the Next line printed by the CLI. Illustrative layout.',
      },
      {
        title: 'Let the skill ask for the profile',
        command: '/telos:init',
        outcome:
          'One question offers standard (recommended), minimal and deep. If no check commands were detected it asks nothing about them and says they can be added later in .telos/config.json.',
      },
    ],
    use: [
      'The first time you use Telos in a repository.',
      'You want the CLAUDE.md block and the project memory created in one reviewed step.',
    ],
    avoid: [
      'Telos is already initialized and you only want another profile: use /telos:profile.',
      'The folder is not a Git repository yet: run git init first.',
    ],
    alternatives: [
      { slug: 'skill-profile', label: '/telos:profile', note: 'Switch the profile of a repository that already has Telos.' },
      { slug: 'skill-map', label: '/telos:map', note: 'Run it next in an existing codebase to fill the project map.' },
    ],
    sources: [skill('init'), { label: 'Init bundle', path: 'lib/ctx/init.mjs' }, README],
  },
  {
    slug: 'skill-profile',
    kind: 'skill',
    name: '/telos:profile',
    invocation: '/telos:profile <minimal|standard|deep>',
    summary: 'Switch an initialized repository between the minimal, standard and deep profiles without losing files.',
    profiles: 'All profiles (minimal, standard, deep); it switches between them',
    prerequisites: [
      'Telos is initialized (/telos:init was run).',
      'One of minimal, standard or deep as the argument. Anything else prints the current profile and the usage line, and runs nothing.',
    ],
    explanation: [
      'The profile decides which commands and artifacts exist: standard adds phase context, history and full checks; deep adds research, review and documentation sync. The skill reads the current state, runs telos profile once and summarizes the files it created.',
      'Asking for the profile that is already active changes nothing. If the CLI fails, the old profile stays active and the command is safe to retry; the skill never repairs the config or HISTORY by hand.',
    ],
    effects: [
      'Runs telos profile <profile> and creates the files the new profile needs.',
      'On a downgrade HISTORY, LESSONS, CONTEXT, RESEARCH and decisions/ are retained; only the features of the higher profile become unavailable.',
      'Checks, stack, limits, git settings and CLAUDE.md stay unchanged.',
      'Does not commit. It suggests docs(telos): switch profile to <profile> and the explicit paths to stage.',
    ],
    examples: [
      {
        title: 'Move a repository from minimal to standard',
        command: '/telos:profile standard',
        outcome:
          'The reply shows the profile line and the Created files, says the checks and CLAUDE.md are unchanged, and suggests committing docs(telos): switch profile to standard. Illustrative layout.',
      },
      {
        title: 'Ask for the profile that is already active',
        command: '/telos:profile deep',
        outcome: 'On a repository that is already deep the skill says so and runs nothing; no file changes.',
      },
    ],
    use: [
      'A small project outgrew the minimal loop and needs phase context and full checks.',
      'A critical phase needs the deep review and research commands for a while.',
    ],
    avoid: [
      'Telos is not initialized yet: use /telos:init.',
      'You want to reset the config: that is a separate, explicit step, not a profile switch.',
    ],
    alternatives: [
      { slug: 'skill-init', label: '/telos:init', note: 'Choose the profile at setup time instead of switching later.' },
      { slug: 'skill-status', label: '/telos:status', note: 'Check the current phase and next step before changing anything.' },
    ],
    sources: [skill('profile'), { label: 'Profile bundle', path: 'lib/ctx/profile.mjs' }, README],
  },
  {
    slug: 'skill-map',
    kind: 'skill',
    name: '/telos:map',
    invocation: '/telos:map [--refresh]',
    summary: 'Map an existing repository into .telos/MAP.md and draft PROJECT.md for your review; --refresh updates a saved map.',
    profiles: 'All profiles',
    prerequisites: [
      'Telos is initialized and the repository has a first commit.',
      'No uncommitted source changes; otherwise the bundle is refused and names the files.',
      'limits.map_tokens in .telos/config.json is large enough for the map skeleton.',
    ],
    explanation: [
      'MAP.md answers one question: where is X. The skill reads a prepared scan, then 3 to 8 suggested files as excerpts, writes the complete map and reruns the same command to validate it. It requires Map validation: PASS; after at most two repairs it restores the previous map instead of reporting success.',
      'A plain /telos:map is a full build. It also drafts the empty sections of PROJECT.md, and that draft is unconfirmed: the skill asks no questions, lists every guess as Assumed and waits for your review.',
      '/telos:map --refresh is for a map that already exists. The mode is reported honestly: noop only advances the header, incremental edits just the affected blocks and checks that every other byte is unchanged, and a full build is the fallback when the baseline is unusable or too much changed. A refresh never touches PROJECT.md.',
    ],
    effects: [
      'Writes only .telos/MAP.md and, in a full build, .telos/PROJECT.md. It never edits ROADMAP, STATUS or the config.',
      'Reports the Mode it ran, the Map validation line, the files read and the Assumed list.',
      'With git.auto_commit enabled it asks once whether to commit docs(telos): map; declined, headless or auto-commit off means no git writes.',
    ],
    examples: [
      {
        title: 'First map of an existing repository',
        command: '/telos:map',
        outcome:
          'Mode: full, Map validation: PASS with the token count against the limit, the list of files read, PROJECT sections drafted, an Assumed list, and the note that the PROJECT draft is unconfirmed. Illustrative layout.',
      },
      {
        title: 'Update the map after a few commits',
        command: '/telos:map --refresh',
        outcome:
          'Mode: incremental (or noop when nothing relevant changed), only the affected blocks edited, PROJECT.md untouched. A refresh that cannot be incremental reports its Reason and does a full build.',
      },
    ],
    use: [
      'You adopt Telos in a codebase that already exists and want a map before planning.',
      'The code moved on since the last map and you want a cheap, checked update with --refresh.',
    ],
    avoid: [
      'The repository has uncommitted source changes: commit or stash first, or the run is refused.',
      'You need rules, stack or check commands in the map: MAP.md holds locations only.',
    ],
    alternatives: [
      { slug: 'skill-plan', label: '/telos:plan', note: 'Once the map exists, plan the first phase of work.' },
      { slug: 'skill-init', label: '/telos:init', note: 'Required first when .telos/ does not exist.' },
    ],
    variants: [
      {
        id: 'map-hard',
        name: '/telos:map-hard',
        invocation: '/telos:map-hard --refresh',
        summary: 'Runs the same procedure as /telos:map, including validation and the optional docs(telos): map commit, on a different model.',
        notes: [
          'Model: /telos:map-hard runs on Opus (model: opus); /telos:map runs on Sonnet (model: sonnet). Instructions, tools and arguments are identical.',
          'Use when the repository is large or tangled and a previous /telos:map run needed repairs or produced a thin map.',
          'Avoid when the repository is small or the map validated cleanly; /telos:map is the default and a fresh run is not needed.',
        ],
      },
    ],
    sources: [skill('map'), skill('map-hard'), { label: 'Shared map instructions', path: 'shared/map.md' }, { label: 'Map bundle', path: 'lib/ctx/map.mjs' }, README],
  },
  {
    slug: 'skill-plan',
    kind: 'skill',
    name: '/telos:plan',
    invocation: '/telos:plan [NN|description]',
    summary: 'Plan a phase: draft scoped task files with tests and acceptance criteria, without running or committing anything.',
    profiles: 'All profiles; standard and deep also keep the phase CONTEXT, deep adds one self-critique pass',
    prerequisites: [
      'Telos is initialized.',
      'A request: a description creates a new phase, a two-digit phase number plans that phase, no argument plans the phase named in STATUS.',
      'The target phase is not active, done or dropped.',
    ],
    explanation: [
      'Use /telos:plan to turn an intent into a new phase. The skill asks at most one round of multiple-choice questions, only where the answer changes the plan; every other choice is the conventional one, listed as Assumed. It adds the phase to the roadmap, splits the work into tasks of about an hour with dependencies pointing backwards, and fixes them until telos lint-plan passes.',
      'A plan is a draft. It never commits and never runs a task. The phase is marked drafted and the reply ends with Next: /telos:approve or /telos:revise.',
      'Planning is for a new phase or a phase that has no approved work yet. A phase that is already active is changed with /telos:revise, not planned again.',
      'In standard and deep the skill also keeps the phase CONTEXT: your answers become decisions, and its own assumptions become proposed decisions that block approval of the tasks that list them until you confirm them. Deep adds one self-critique pass over the drafted tasks.',
    ],
    effects: [
      'Creates draft task files under .telos/phases/ with telos task new, and a roadmap entry for a new phase.',
      'Marks the phase drafted and sets the STATUS next step. Task states stay draft.',
      'Standard and deep: creates the phase CONTEXT only when it is missing and records proposed decisions in Awaiting user.',
      'Changes no source code and makes no commit. Standard and deep also never plan an approach listed as removed in HISTORY.',
    ],
    examples: [
      {
        title: 'Plan a new phase from a request',
        command: '/telos:plan Add CSV export to the reports page, with tests',
        outcome:
          'A new phase with a goal and an observable done-when, a short task list such as 03-01 to 03-03, the risks and Assumed lines, and Next: /telos:approve or /telos:revise. Replace the request with your own. Illustrative layout.',
      },
      {
        title: 'Plan an existing phase by number',
        command: '/telos:plan 04',
        outcome:
          'Draft tasks for the already-listed phase 04. If phase 04 is active the skill stops and suggests /telos:revise instead.',
      },
    ],
    use: [
      'The change needs more than about five files, a decision from you, or a new dependency.',
      'You want boundaries, tests and acceptance written down before any code changes.',
    ],
    avoid: [
      'A small obvious fix: /telos:quick avoids the overhead of a phase.',
      'The phase is already active and needs adjusting: use /telos:revise.',
    ],
    alternatives: [
      { slug: 'skill-quick', label: '/telos:quick', note: 'For a change of about five files and an hour at most.' },
      { slug: 'skill-revise', label: '/telos:revise', note: 'Adjust the draft or active plan of the current phase.' },
      { slug: 'skill-approve', label: '/telos:approve', note: 'The next step once the draft looks right.' },
    ],
    variants: [
      {
        id: 'plan-lite',
        name: '/telos:plan-lite',
        invocation: '/telos:plan-lite Rename the config key and update its docs',
        summary: 'Runs the same procedure as /telos:plan, including the deep critique pass, on a different model.',
        notes: [
          'Model: /telos:plan-lite runs on Sonnet (model: sonnet); /telos:plan runs on Opus (model: opus). Both inject the same shared instructions and context.',
          'Use when the phase is small and obvious: a few tasks, no open design choices.',
          'Avoid when the work has real trade-offs, many dependencies or critical code; plan that with /telos:plan.',
        ],
      },
    ],
    sources: [skill('plan'), skill('plan-lite'), { label: 'Shared plan instructions', path: 'shared/plan.md' }, README],
  },
  {
    slug: 'skill-approve',
    kind: 'skill',
    name: '/telos:approve',
    invocation: '/telos:approve',
    summary: 'Approve the drafted plan, mark the phase active, commit the plan and tag the phase start.',
    profiles: 'All profiles',
    prerequisites: [
      'The current phase has draft task files, normally from /telos:plan.',
      'telos lint-plan reports no problems. Otherwise the skill shows them and suggests /telos:revise.',
    ],
    explanation: [
      'Approval is the line between planning and doing. The skill sets every draft task to approved, the phase to active and updates STATUS, then makes one commit of the phase files, ROADMAP and STATUS only.',
      'It runs no task. Execution is a separate step with /telos:do. Tasks that list a decision you have not confirmed stay draft, and the reply names each one with its reason.',
      'It never pushes, amends or skips hooks. The first approval of a phase also creates the local tag telos/NN-start; a revised plan of a running phase is committed as docs(telos): approve revised plan of <phase> and keeps the existing tag.',
    ],
    effects: [
      'Sets tasks to approved, the phase to active and STATUS to the first task whose dependencies are done.',
      'Commits only .telos/phases/<phase>/, .telos/ROADMAP.md and .telos/STATUS.md as docs(telos): plan phase <phase>.',
      'Creates the local tag telos/NN-start when it is missing. Other Telos changes stay unstaged and are mentioned.',
    ],
    examples: [
      {
        title: 'Approve a drafted phase',
        command: '/telos:approve',
        outcome:
          'The reply lists the approved task ids, any task left in draft with the reason, the commit subject docs(telos): plan phase 03-reports, the tag, and ends with Next: /telos:do. Illustrative layout.',
      },
      {
        title: 'Approve while a decision is unconfirmed',
        command: '/telos:approve',
        outcome:
          'Tasks that depend on a proposed decision stay draft and are named; the others are approved. Confirm the decision with /telos:revise, then approve again.',
      },
    ],
    use: [
      'You read the drafted tasks and accept their scope and acceptance criteria.',
      'You changed a running phase with /telos:revise and need the new plan committed.',
    ],
    avoid: [
      'The plan still needs edits: use /telos:revise first.',
      'You expect it to start the work: approval runs no task, so call /telos:do afterwards.',
    ],
    alternatives: [
      { slug: 'skill-revise', label: '/telos:revise', note: 'Change the plan before approving it.' },
      { slug: 'skill-do', label: '/telos:do', note: 'Execute the next approved task.' },
    ],
    sources: [skill('approve'), { label: 'Approve bundle', path: 'lib/ctx/approve.mjs' }, README],
  },
  {
    slug: 'skill-revise',
    kind: 'skill',
    name: '/telos:revise',
    invocation: '/telos:revise <notes>',
    summary: 'Apply your notes to the plan of the current phase with the smallest edits; changed approved tasks go back to draft.',
    profiles: 'All profiles; deep adds one self-critique pass over the changed tasks',
    prerequisites: [
      'The current phase already has tasks. With no tasks the skill suggests /telos:plan.',
      'Notes: what to change. Without notes the skill asks what to change, in one sentence.',
    ],
    explanation: [
      'Use /telos:revise when the plan exists and needs to change: split a task, merge or drop one, reorder dependencies, tighten acceptance, or confirm a proposed decision. The skill edits only the sections the notes affect and keeps the task format valid.',
      'Draft tasks change freely. An approved task changes only when your notes name it, and then it goes back to draft so /telos:approve checks it again. Tasks that are in-progress, done or blocked are never touched; the skill explains and suggests a new task.',
      'Task ids are never renumbered. Proposed decisions in the phase CONTEXT are confirmed only when your notes confirm them, and Awaiting user is kept in sync. The skill never commits.',
    ],
    effects: [
      'Edits task files and CONTEXT lines; uses telos commands to change task status, ROADMAP and STATUS.',
      'Reruns telos lint-plan until it passes (at most three rounds) and ends with Next: /telos:approve or /telos:revise.',
      'Makes no commit and changes no source code.',
    ],
    examples: [
      {
        title: 'Confirm decisions and tighten one task',
        command: '/telos:revise confirm D-02 and D-03; in 03-02 also cover empty input',
        outcome:
          'The proposed decisions lose their proposed marker, 03-02 gains a constraint and a test line, Awaiting user is updated, lint passes, and the summary lists what changed per task id. Illustrative layout.',
      },
      {
        title: 'Try to rework a task that is already running',
        command: '/telos:revise rewrite task 03-01 completely',
        outcome:
          'If 03-01 is in-progress or done the skill leaves it alone, explains why, and suggests adding a new task instead.',
      },
    ],
    use: [
      'The drafted plan is almost right and a few notes would fix it.',
      'You need to split a task that grew too large or to reorder dependencies.',
    ],
    avoid: [
      'You want a new phase: use /telos:plan with a description.',
      'The task is already in-progress or done: revising it is refused; plan a follow-up task.',
    ],
    alternatives: [
      { slug: 'skill-plan', label: '/telos:plan', note: 'Create tasks for a new phase or an unplanned one.' },
      { slug: 'skill-approve', label: '/telos:approve', note: 'Accept the plan once the edits are done.' },
    ],
    variants: [
      {
        id: 'revise-lite',
        name: '/telos:revise-lite',
        invocation: '/telos:revise-lite reword the goal of 03-02',
        summary: 'Runs the same procedure as /telos:revise, including the deep critique pass, on a different model.',
        notes: [
          'Model: /telos:revise-lite runs on Sonnet (model: sonnet); /telos:revise runs on Opus (model: opus). Rules for which tasks may change are identical.',
          'Use when the notes are minor: a rewording, a missing constraint, a dependency fix.',
          'Avoid when the notes split, merge or reorder several tasks or change a decision; use /telos:revise.',
        ],
      },
    ],
    sources: [skill('revise'), skill('revise-lite'), { label: 'Shared revise instructions', path: 'shared/revise.md' }, README],
  },
  {
    slug: 'skill-do',
    kind: 'skill',
    name: '/telos:do',
    invocation: '/telos:do [task-id]',
    summary: 'Execute the next approved task: tests first, implement, run acceptance, record the result and commit.',
    profiles: 'All profiles; deep critical code tasks add required RED, GREEN and review evidence',
    prerequisites: [
      'The task is approved (or already in-progress). A draft task is refused with a hint to run /telos:approve.',
      'Every dependency of the task is done and no decision it lists is waiting for you.',
      'No argument runs the next runnable task; a task id such as 03-02 runs that one.',
    ],
    explanation: [
      'For a code task the skill writes the tests listed in the task first and confirms they fail for the right reason, then implements until they pass. It then runs telos accept for the task: failing commands get at most two fix attempts, and then the task is set to blocked and nothing is committed.',
      'The skill fills the task Result with what was built and any Deviations from scope, marks the task done, updates STATUS to the next approved task and makes one commit of the listed files, only when git.auto_commit is true. With auto-commit off it lists the paths and the commit subject instead.',
      'A task marked effort: hard stops first and suggests /telos:do-hard. Deep critical code tasks additionally need a recorded RED line, an e2e run and one review before they can finish.',
    ],
    effects: [
      'Edits only the files in the task scope and Files list; changes the task and STATUS, and ROADMAP when the last task of a minimal-profile phase finishes.',
      'One commit per task with a type and the task id, for example feat(03-02): add the export button.',
      'A blocked task leaves the work tree as it is, commits nothing and sets the next step to /telos:do-hard or a manual fix.',
      'Never pushes, amends, resets or skips hooks.',
    ],
    examples: [
      {
        title: 'Run the next approved task',
        command: '/telos:do',
        outcome:
          'Tests written and red, implementation, telos accept verdicts, the task marked done and one commit such as feat(03-01): add the export helper (when auto-commit is on). The reply ends with Next: /telos:do for the following approved task. Illustrative layout.',
      },
      {
        title: 'Run a specific approved task',
        command: '/telos:do 03-02',
        outcome:
          'Runs 03-02 once it is approved and its dependencies are done; otherwise the context says why it is refused, for example a dependency that is not done.',
      },
      {
        title: 'Try a task that is still a draft',
        command: '/telos:do 03-04',
        outcome:
          'Refused: 03-04 is draft, run /telos:approve first. Nothing is changed and no code is written.',
      },
    ],
    use: [
      'The plan is approved and you want the next task implemented with tests and a commit.',
      'You resume an in-progress task after a /clear: the skill continues from the task file.',
    ],
    avoid: [
      'The task is still a draft: approve the plan first, because only approved tasks run.',
      'A one-off small change with no phase: /telos:quick fits better.',
    ],
    alternatives: [
      { slug: 'skill-approve', label: '/telos:approve', note: 'Required before any task of a drafted plan can run.' },
      { slug: 'skill-quick', label: '/telos:quick', note: 'For a small change without a phase.' },
    ],
    variants: [
      {
        id: 'do-hard',
        name: '/telos:do-hard',
        invocation: '/telos:do-hard 03-02',
        summary: 'Runs the same procedure as /telos:do, including the deep critical gates, on a different model.',
        notes: [
          'Model: /telos:do-hard runs on Opus (model: opus); /telos:do runs on Sonnet (model: sonnet). The shared instructions and acceptance rules are identical.',
          'Use when /telos:do stops with HINT: effort hard, or when a task is blocked and you want another attempt.',
          'Avoid when the task is a draft or has unfinished dependencies; the same refusals apply, so approve and order the tasks first.',
        ],
      },
    ],
    sources: [skill('do'), skill('do-hard'), { label: 'Shared do instructions', path: 'shared/do.md' }, { label: 'Do bundle', path: 'lib/ctx/do.mjs' }, README],
  },
  {
    slug: 'skill-quick',
    kind: 'skill',
    name: '/telos:quick',
    invocation: '/telos:quick <description>',
    summary: 'Make a small change without a phase: a short mini-plan, implementation, checks and one quick commit.',
    profiles: 'All profiles; standard and deep also read matching lessons first',
    prerequisites: [
      'A description of the change; without one the skill asks for it.',
      'A change of about five files and about an hour at most, with no new dependency and no decision for you to make.',
      'If a task is in-progress, the change must stay out of that task files.',
    ],
    explanation: [
      'Quick is the path for small, clear changes. There is no plan file, no task and no change to STATUS, ROADMAP or HISTORY. The skill writes a mini-plan of up to five lines in chat (files, the test that proves it, the commit type) and implements, adding a failing test first when behavior changes.',
      'It runs test_related or test from the configured checks, plus lint and types when configured. After two failed fix attempts it commits nothing and ends with Next: /telos:quick-hard <description> or /telos:plan. With no checks configured it says the change is unverified.',
      'It commits only the paths it touched, never files that were already dirty before it started, as <type>(quick): <summary>. If the work grows past the size limit it stops, leaves the edits uncommitted and suggests /telos:plan.',
    ],
    effects: [
      'Edits the files the change needs and makes one commit with scope quick; no Telos state file changes.',
      'Standard and deep: reruns telos ctx quick with safe path and topic selectors from your description to read relevant lessons.',
      'Never pushes, amends or skips hooks.',
    ],
    examples: [
      {
        title: 'Fix a small bug',
        command: '/telos:quick Fix the off-by-one in pagination in src/list.mjs',
        outcome:
          'A mini-plan of a few lines, a failing test then a fix, passing checks and a commit such as fix(quick): correct the last page in pagination. STATUS is unchanged. Replace the path and wording with your own. Illustrative layout.',
      },
      {
        title: 'A change that is too big',
        command: '/telos:quick Replace the storage layer with a database',
        outcome:
          'The skill stops, explains that the change needs more than five files and a decision, and suggests /telos:plan with the same description.',
      },
    ],
    use: [
      'A typo, a small bug, a rename or a config tweak that you could describe in one sentence.',
      'You want a checked commit without writing a plan.',
    ],
    avoid: [
      'More than about five files, a new dependency or an unclear scope: plan it instead.',
      'The change touches files of the task that is in-progress: finish that task first.',
    ],
    alternatives: [
      { slug: 'skill-plan', label: '/telos:plan', note: 'For work with tasks, acceptance criteria and a decision to make.' },
      { slug: 'skill-do', label: '/telos:do', note: 'For a task that was already planned and approved.' },
    ],
    variants: [
      {
        id: 'quick-hard',
        name: '/telos:quick-hard',
        invocation: '/telos:quick-hard Stop the retry loop from swallowing timeouts in src/net.mjs',
        summary: 'Runs the same procedure as /telos:quick, with the same size limit and commit rules, on a different model.',
        notes: [
          'Model: /telos:quick-hard runs on Opus (model: opus); /telos:quick runs on Sonnet (model: sonnet). The shared instructions are identical.',
          'Use when a small fix is subtle, for example a race or an off-by-one that a first attempt did not settle.',
          'Avoid when the change is large; neither quick command removes the size limit, so plan it with /telos:plan.',
        ],
      },
    ],
    sources: [skill('quick'), skill('quick-hard'), { label: 'Shared quick instructions', path: 'shared/quick.md' }, README],
  },
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
      'Opens no project file, because the skill works only from the prepared summary.',
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
      { label: 'telos status (terminal CLI)', note: 'The same compact view from a shell, without a Claude Code session.' },
      { slug: 'skill-do', label: '/telos:do', note: 'When you already know the next step is the next approved task, run it directly.' },
    ],
    sources: [skill('status'), { label: 'Status bundle', path: 'lib/ctx/status.mjs' }, README],
  },
];
