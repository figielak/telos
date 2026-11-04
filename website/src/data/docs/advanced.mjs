// Records for the profile-gated skills (standard and deep) of the guide. The record contract is
// documented in commands.mjs. Every statement is backed by the skill file, the shared
// instructions or the README row named in the record's sources. Examples are illustrative,
// never recorded output. Agent names are implementation details, not extra user commands.
const README = { label: 'README, Commands in Claude Code', path: 'README.md' };
const skill = (name) => ({ label: `Skill instructions: /telos:${name}`, path: `skills/${name}/SKILL.md` });
const bundle = (name) => ({ label: `${name[0].toUpperCase()}${name.slice(1)} bundle`, path: `lib/ctx/${name}.mjs` });

export const advanced = [
  {
    slug: 'skill-discuss',
    kind: 'skill',
    name: '/telos:discuss',
    invocation: '/telos:discuss [NN]',
    summary: 'Clarify the scope and decisions of a phase before planning, and write its NN-CONTEXT.md.',
    profiles: 'Standard and deep',
    prerequisites: [
      'The standard or deep profile. Under minimal the skill replies Requires standard profile. … and stops.',
      'Telos is initialized and the target phase exists: the phase in STATUS, or the two-digit NN you pass.',
    ],
    explanation: [
      'The skill reads one prepared bundle and looks at code only where a question needs it. It asks one round of at most four multiple-choice questions, and only where the answer changes scope, approach, data model, acceptance or the task split. Open questions that already exist come first. There is no second round.',
      'It then writes only the phase NN-CONTEXT.md, with six sections kept in at most 60 lines. Each answer becomes a confirmed D-NN decision. A choice the skill assumed, or one you left open, becomes D-NN [proposed] and is never confirmed by the skill itself; unresolved questions stay as Q-NN. Existing IDs are never renumbered or reused.',
      'On a phase that is already active the skill rewrites no decision. It adds only new proposed decisions and new questions, and sends plan changes to /telos:revise.',
    ],
    effects: [
      'Creates or edits one file: the target phase NN-CONTEXT.md. It edits no task file, ROADMAP or STATUS by hand and it does not commit.',
      'Sets the Awaiting user list in STATUS through the telos CLI to every still proposed decision and open question.',
      'Ends with the confirmed and proposed IDs, the CONTEXT line count and Next: /telos:plan <NN>, or Next: /telos:revise <notes> for a drafted or active phase.',
    ],
    examples: [
      {
        title: 'Settle the open choices before planning phase 03',
        command: '/telos:discuss 03',
        outcome:
          'One question round, for example storage format and error handling. Your answers become D-01 and D-02 in 03-CONTEXT.md, an assumed default becomes D-03 [proposed], and the reply ends with Next: /telos:plan 03. Illustrative layout.',
      },
      {
        title: 'Narrow the discussion to one topic',
        command: '/telos:discuss pagination',
        outcome:
          'Text that is not a phase number is treated as a topic to focus on for the phase named in STATUS, so the questions concentrate on pagination. Nothing outside the CONTEXT file changes.',
      },
    ],
    use: [
      'Use when a phase has choices that would change the plan and you want them recorded as decisions before tasks are drafted.',
      'Use when a plan carries proposed decisions that block approval of the tasks that list them, and you want to confirm them.',
    ],
    avoid: [
      'Avoid when the work is small and obvious: /telos:plan alone is enough, or /telos:quick for a one-hour change.',
      'Avoid when an active phase needs a different task split: /telos:revise changes the plan, /telos:discuss only records decisions.',
    ],
    alternatives: [
      { slug: 'skill-plan', label: '/telos:plan', note: 'Draft the tasks once the decisions are recorded.' },
      { slug: 'skill-revise', label: '/telos:revise', note: 'Change the plan of a drafted or active phase.' },
      { slug: 'skill-research', label: '/telos:research', note: 'Deep only: gather options and sources for an open question first.' },
    ],
    sources: [skill('discuss'), bundle('discuss'), README],
  },
  {
    slug: 'skill-lesson',
    kind: 'skill',
    name: '/telos:lesson',
    invocation: '/telos:lesson [area] <lesson> [(ref)]',
    summary: 'Record one lesson learned as a single line in .telos/LESSONS.md, capped at twenty and deduplicated by area.',
    profiles: 'Standard and deep',
    prerequisites: [
      'The standard or deep profile. Under minimal the skill replies Requires standard profile. … and stops.',
      'A lesson in the request. An empty request makes the skill ask for the lesson in one sentence.',
    ],
    explanation: [
      'The skill shapes your text into one line, - [area] lesson (ref). The area is a path prefix such as src/game/ or a topic such as tests. The lesson is one short imperative sentence. The ref is the one you gave, otherwise the task from STATUS, otherwise quick.',
      'It compares the new line only with entries whose area is equal or nested as a path prefix. A lesson with the same meaning is not added and the existing entry is named. A distinct lesson in the same area is kept as a separate line.',
      'LESSONS.md holds at most twenty entries. At twenty the skill never adds a twenty-first: it asks once whether to promote a named lesson to PROJECT.md Conventions, drop a stale one, or discard the new lesson. Nothing is deleted without that answer.',
    ],
    effects: [
      'Edits .telos/LESSONS.md, and PROJECT.md only for a promotion you chose. It never touches task files, ROADMAP or STATUS, creates no files and does not commit.',
      'Malformed lines are listed and left untouched.',
      'Replies with the line added or the duplicate L<n>, the count N/20, and a suggestion to commit the changed paths.',
    ],
    examples: [
      {
        title: 'Record a rule you learned during a task',
        command: '/telos:lesson [tests] Run the e2e suite before closing a phase (09-02)',
        outcome:
          'One line is appended to LESSONS.md, the reply shows the new count such as 4/20, and it suggests committing .telos/LESSONS.md. A near-identical lesson in the same area would be reported as a duplicate instead. Illustrative.',
      },
    ],
    use: [
      'Use when a mistake or discovery should shape future plans, since standard and deep turn relevant lessons into task constraints.',
      'Use when a lesson became a standing rule and you want to promote it to PROJECT.md Conventions once the list is full.',
    ],
    avoid: [
      'Avoid for a one-off fact about a single task: its Result section is the place for that.',
      'Avoid for a decision that is hard to reverse: confirmed decisions are promoted when the phase closes with /telos:done.',
    ],
    alternatives: [
      { slug: 'skill-done', label: '/telos:done', note: 'Promotes hard-to-reverse decisions and, on deep, proposes lesson lines in its retro.' },
      { slug: 'skill-discuss', label: '/telos:discuss', note: 'Records decisions for one phase rather than a lesson for the project.' },
    ],
    sources: [skill('lesson'), bundle('lesson'), README],
  },
  {
    slug: 'skill-check',
    kind: 'skill',
    name: '/telos:check',
    invocation: '/telos:check [NN]',
    summary: 'Verify a phase without changing anything: full checks, task acceptance and a hand check of manual items.',
    profiles: 'Standard and deep',
    prerequisites: [
      'The standard or deep profile. Under minimal the skill replies Requires standard profile. … and stops.',
      'A phase to verify: the one in STATUS, or the two-digit NN you pass. The bundle names the exact full-check command.',
    ],
    explanation: [
      'The skill is a read-only report. It runs the exact full-check command from the bundle, then telos accept for each task listed, then reads each done task Acceptance and Result to check the manual items itself. A passing accept exit code never proves a manual item.',
      'A failing command is FAIL. Nothing configured is UNVERIFIED. On deep, a required e2e check (end-to-end) that is not configured is also UNVERIFIED, and passing unit checks never cover it.',
      'The reply lists the full-check verdict, the accept verdict per task, manual items marked verified or unverified, unresolved items and tasks that are not done. It ends with Next: /telos:done when everything passed and every task is done, otherwise with what to fix first.',
    ],
    effects: [
      'Runs checks and reads task files and code. It changes nothing: no edits, no task, STATUS or ROADMAP changes and no commit.',
      'Because it writes nothing, it is safe to run at any time, including before a decision to close.',
    ],
    examples: [
      {
        title: 'Verify the current phase before closing it',
        command: '/telos:check',
        outcome:
          'The full-check verdict, one accept verdict per done task, and a list of manual items with the evidence found or what is missing. When all passes the last line is Next: /telos:done. Illustrative layout.',
      },
      {
        title: 'Check an earlier phase by number',
        command: '/telos:check 04',
        outcome:
          'The skill reruns its bundle for phase 04 and reports the same sections. A value that is not a phase number is rejected with a message that the argument must be a phase number.',
      },
    ],
    use: [
      'Use when you want to know whether a phase would pass, with no risk of changing state.',
      'Use when /telos:done stopped and you want the failing items listed after you fixed something.',
    ],
    avoid: [
      'Avoid when you intend to close the phase right now: /telos:done performs the same verification and then records the result.',
      'Avoid expecting it to fix failures or tick acceptance boxes. It only reports.',
    ],
    alternatives: [
      { slug: 'skill-done', label: '/telos:done', note: 'Verify and then close the phase, recording HISTORY and the roadmap state.' },
      { slug: 'skill-review', label: '/telos:review', note: 'Deep only: a read-only code review of a task or phase.' },
      { slug: 'skill-status', label: '/telos:status', note: 'A short view of phase, task and blockers without running any check.' },
    ],
    sources: [skill('check'), bundle('check'), README],
  },
  {
    slug: 'skill-done',
    kind: 'skill',
    name: '/telos:done',
    invocation: '/telos:done [NN]',
    summary: 'Close an active phase after full checks and acceptance, then record HISTORY, the roadmap state and one commit.',
    profiles: 'Standard and deep; deep adds review, doc-sync and ADR promotion',
    prerequisites: [
      'The standard or deep profile. Under minimal the skill replies Requires standard profile. … and stops.',
      'An active phase that is not already done. The bundle reports Close: blocked while tasks are unfinished, decisions are still proposed, questions are open, Awaiting user has entries, full checks are not configured or HISTORY is unreadable.',
    ],
    explanation: [
      'Verification comes first and nothing changes before it passes. The full checks must exit 0, every telos accept must end PASS, and every manual acceptance item must be checked by reading the task Acceptance and Result. One item that cannot be verified stops the close. A failure leaves the phase active and writes no history.',
      'Deep adds more evidence before any promotion. A deep critical code task needs recorded RED and GREEN lines in its Result, from a real failing assertion and a green full check that includes the configured e2e; a missing line makes the bundle report Close: blocked. A phase review runs once unless every critical task has a current, complete, passing task review. UNVERIFIED, REFUSED or a HIGH or CRITICAL finding stops, and fixes go to the owning task or to a new one through /telos:revise.',
      'Deep then syncs documentation from matched ranges and changed public API only, adds at most ten changelog lines without inventing a version, and reruns the checks. Standard skips these steps.',
      'Only then does the skill promote confirmed decisions that are hard to reverse: through HISTORY on standard, through an ADR on deep. It records the phase entry, marks the roadmap done, sets STATUS and commits with explicit paths.',
    ],
    effects: [
      'Writes HISTORY, ROADMAP and STATUS only through the telos CLI, and edits only the phase CONTEXT. With auto-commit on it commits docs(telos): close phase <NN-name> with explicit paths.',
      'It never pushes, amends, tags or skips hooks. With auto-commit off it lists the changed paths instead of committing.',
      'Ends with Next: /telos:plan, a retro on deep with proposed /telos:lesson lines, and a hint to run /compact before the next phase.',
    ],
    examples: [
      {
        title: 'Close the current phase',
        command: '/telos:done',
        outcome:
          'Checks and acceptance verdicts, the decision IDs promoted to HISTORY, the commit subject docs(telos): close phase 03-export, and Next: /telos:plan. If a check fails the reply says what failed and ends with Next: /telos:check. Illustrative layout.',
      },
      {
        title: 'Close a specific phase',
        command: '/telos:done 03',
        outcome:
          'The skill uses the bundle for phase 03 instead of the one in STATUS. An already done phase is refused rather than closed again.',
      },
    ],
    use: [
      'Use when every task of the phase is done and you want the roadmap, STATUS and HISTORY to say so, with one reviewable commit.',
      'Use when a deep phase should pass review, doc-sync and decision promotion together before the next phase.',
    ],
    avoid: [
      'Avoid when you only want a verdict: /telos:check reports the same verification and changes nothing.',
      'Avoid trying to make a stop go away by editing checks or ticking boxes. Fix the owning task, then run it again.',
    ],
    alternatives: [
      { slug: 'skill-check', label: '/telos:check', note: 'The same verification as a read-only report.' },
      { slug: 'skill-review', label: '/telos:review', note: 'Deep only: review a task or phase on its own, before closing.' },
      { slug: 'skill-undo', label: '/telos:undo', note: 'Revert one task of a closed phase and reopen it if needed.' },
    ],
    sources: [skill('done'), bundle('done'), { label: 'Shared review instructions', path: 'shared/review.md' }, README],
  },
  {
    slug: 'skill-undo',
    kind: 'skill',
    name: '/telos:undo',
    invocation: '/telos:undo <NN-MM>',
    summary: 'Revert the commits of one task after you confirm the exact hashes, keeping all other Telos state.',
    profiles: 'Standard and deep; deep also handles linked ADRs',
    prerequisites: [
      'The standard or deep profile. Under minimal the skill replies Requires standard profile. … and stops.',
      'A task id in the form NN-MM as the first word. Without one the skill shows the candidates and Usage: /telos:undo <NN-MM>.',
      'The bundle must accept the task, otherwise it replies REFUSED with the reason and the remedy and changes nothing.',
    ],
    explanation: [
      'Before anything is reverted the skill shows every commit with its full hash, subject and stat, the Telos files they carry, the dependents and the state that follows. You answer one question and there is no second one: revert the listed hashes, revert them with the extra explicit-only ADR IDs when there are any, or Cancel. Anything other than a revert option stops with no git revert and no state change.',
      'It then runs git revert --no-commit one commit at a time, newest first. A conflict in .telos/ files only is resolved by keeping the current file. A conflict in any other path stops at once, writes no HISTORY and tells you how to resolve it or discard the attempt. The skill restores the current Telos metadata from HEAD so other tasks, STATUS and ROADMAP keep their content.',
      'The full checks must exit 0 before any state change. Only then does it mark the task reverted, mark dependents blocked and record the reason in STATUS blockers, reopen a closed phase, and add one revert entry to HISTORY. Dependent tasks are never reverted: they stay as they are, blocked, until you redo the task with /telos:revise.',
    ],
    effects: [
      'Creates one commit, revert(<NN-MM>): undo <title>, with explicit .telos/ paths when auto-commit is on. With auto-commit off the revert stays staged and the paths are listed.',
      'Sets the task to reverted, its dependents to blocked, and a closed phase back to active. On deep it marks only the ADR IDs you confirmed as reverted and never reactivates a superseded predecessor.',
      'It never resets, stashes, pushes, amends or rebases.',
    ],
    examples: [
      {
        title: 'Undo a task that turned out wrong',
        command: '/telos:undo 03-02',
        outcome:
          'A list of the task commits with hashes and stats, any dependents that will be blocked, and one question to revert or cancel. After confirming: the revert commit, dependents blocked, and Next: /telos:revise <notes> to redo 03-02. Illustrative layout.',
      },
      {
        title: 'Decline the revert',
        command: '/telos:undo 03-02',
        outcome:
          'Choosing Cancel at the confirmation stops the skill. No revert runs and no task, STATUS or HISTORY entry changes.',
      },
    ],
    use: [
      'Use when a finished task must be taken out with its commits but the rest of the phase should stay.',
      'Use when you want dependents blocked automatically and the reason recorded, instead of tracking them by hand.',
    ],
    avoid: [
      'Avoid when the task is not finished or has no commits of its own: fix it with /telos:do or change the plan with /telos:revise.',
      'Avoid as a way to discard uncommitted work or to rewrite history. The skill adds revert commits and never resets.',
    ],
    alternatives: [
      { slug: 'skill-revise', label: '/telos:revise', note: 'Redo the reverted task by editing the plan afterwards.' },
      { slug: 'skill-do', label: '/telos:do', note: 'Run an approved task again once it is back in the plan.' },
      { slug: 'skill-status', label: '/telos:status', note: 'See the blockers an undo recorded.' },
    ],
    sources: [skill('undo'), bundle('undo'), README],
  },
  {
    slug: 'skill-review',
    kind: 'skill',
    name: '/telos:review',
    invocation: '/telos:review [NN-MM|NN]',
    summary: 'Run one read-only review of a task or phase from prepared evidence and return a verdict.',
    profiles: 'Deep only',
    prerequisites: [
      'The deep profile. Under minimal or standard the skill replies Requires deep profile. … and stops.',
      'A task or phase with changes to review: the STATUS task, otherwise the phase. A selector must be exactly NN-MM or NN; anything else prints Usage: /telos:review [NN-MM|NN].',
    ],
    explanation: [
      'The skill forks a read-only reviewer on Sonnet. It sees a fixed evidence bundle and may inspect omitted parts only through the exact git diff, git log and file ranges that the bundle lists. It edits nothing, commits nothing and uses no network.',
      'Findings are reported only above 80 percent confidence. HIGH and CRITICAL need a file and line, a failure scenario and the impact, otherwise they are demoted or dropped. It also checks that new or changed public functions have a short docstring. Zero findings is a valid result.',
      'The output is at most 40 lines and ends with Verdict: PASS, PASS WITH NOTES, CHANGES REQUESTED or UNVERIFIED. Evidence that was not inspected, or that changed between the first read and the verdict, makes it UNVERIFIED and never a clean PASS.',
      'It is one round. The review does not fix anything and does not start another review: the caller fixes what stands, within its own task scope, and you may ask again.',
    ],
    effects: [
      'Reads only. No file, task, STATUS, ROADMAP or git state changes.',
      'Returns a review with an EvidenceId, a Coverage line, one line per finding and a verdict. Deep done and deep critical /telos:do runs use the same review internally; this command is the one you run yourself.',
    ],
    examples: [
      {
        title: 'Review the task you just finished',
        command: '/telos:review 03-02',
        outcome:
          'A review headed with the target and EvidenceId, a Coverage line, any findings with severity and location, and a verdict such as PASS WITH NOTES. Nothing in the repository changes. Illustrative layout.',
      },
      {
        title: 'Review a whole phase',
        command: '/telos:review 03',
        outcome:
          'The same read-only round over the phase evidence. If the bundle was cut short, Coverage names what was not inspected and the verdict is UNVERIFIED.',
      },
    ],
    use: [
      'Use when you want an independent read of finished work before closing a phase.',
      'Use when a verdict of UNVERIFIED from another step needs the missing coverage identified.',
    ],
    avoid: [
      'Avoid expecting fixes. Apply them in the owning task, or add a task through /telos:revise.',
      'Avoid on minimal and standard: the skill only explains that it needs the deep profile.',
    ],
    alternatives: [
      { slug: 'skill-check', label: '/telos:check', note: 'Runs checks and acceptance, not a code review.' },
      { slug: 'skill-done', label: '/telos:done', note: 'Deep close runs its own phase review unless a current task review exists.' },
      { slug: 'skill-do', label: '/telos:do', note: 'Deep critical tasks get their review as part of the run.' },
    ],
    variants: [
      {
        id: 'review-hard',
        name: '/telos:review-hard',
        invocation: '/telos:review-hard 03-02',
        summary: 'Runs the same read-only review as /telos:review, with the same bundle, rules and verdicts, on a different model.',
        notes: [
          'Model: /telos:review-hard runs on Opus in the reviewer-hard agent; /telos:review runs on Sonnet. The instructions, tools and argument are identical.',
          'Use when the work is critical: security, payments, concurrency or data integrity.',
          'Avoid when the change is routine; /telos:review is the default and the output format is the same.',
        ],
      },
    ],
    sources: [skill('review'), skill('review-hard'), { label: 'Shared review instructions', path: 'shared/review.md' }, bundle('review'), README],
  },
  {
    slug: 'skill-research',
    kind: 'skill',
    name: '/telos:research',
    invocation: '/telos:research [NN] [--replace] [focus]',
    summary: 'Research a phase in a read-only agent and return a short sourced report with a handoff for NN-RESEARCH.md.',
    profiles: 'Deep only',
    prerequisites: [
      'The deep profile. Under minimal or standard the skill replies Requires deep profile. … and stops.',
      'A target phase: the one in STATUS, or a first word of exactly two digits. A first word made of other digits or dashes prints Usage: /telos:research [NN] [--replace] [focus].',
    ],
    explanation: [
      'The skill forks a read-only researcher on Sonnet. It prefers existing libraries and patterns of your stack and the MAP pointers, then checks current primary documentation and versions before recommending any new dependency. It cites only pages it actually opened and states when search or a page was unavailable, instead of inventing a source.',
      'For each open question it gives options and a recommendation but never decides: the question stays open for you, and /telos:discuss records the decision. With no open questions it researches the phase goal. Focus text only narrows the search and never reaches a command.',
      'The report is at most 60 lines: Recommendation, Options, Unresolved and dated Sources. The agent has no write tools, so the reply ends with one Handoff line for the NN-RESEARCH.md path in the bundle. The main thread writes that one file: it creates it when missing, replaces it only with --replace, and otherwise keeps it and offers the report as a proposed update.',
    ],
    effects: [
      'Reads the repository pointers and the web. The only file that can be written, by the main thread and not by the agent, is the phase NN-RESEARCH.md.',
      'It changes no CONTEXT, STATUS or ROADMAP and makes no commit.',
      'Planning treats the report as evidence only. Research is never required by /telos:plan.',
    ],
    examples: [
      {
        title: 'Research a library choice for phase 02',
        command: '/telos:research 02 caching options',
        outcome:
          'A report of at most 60 lines with a recommendation, one option per line tied to its Q-NN, unresolved items and dated sources, then Handoff: create 02-RESEARCH.md with the report above. Illustrative layout.',
      },
      {
        title: 'Refresh an existing report',
        command: '/telos:research 02 --replace',
        outcome:
          'Because --replace was given, the handoff says to replace the existing file. Without that flag it would say to keep the file unchanged and treat the new report as a proposed update.',
      },
    ],
    use: [
      'Use when a phase depends on a library, protocol or approach you have not settled and you want sourced options first.',
      'Use when open questions in the CONTEXT need evidence before you answer them with /telos:discuss.',
    ],
    avoid: [
      'Avoid expecting a decision. The report recommends and the question stays open until you decide.',
      'Avoid when the answer is in your own code: read it or run /telos:map instead.',
    ],
    alternatives: [
      { slug: 'skill-discuss', label: '/telos:discuss', note: 'Record the decisions after reading the report.' },
      { slug: 'skill-plan', label: '/telos:plan', note: 'Deep planning reads NN-RESEARCH.md as evidence.' },
    ],
    variants: [
      {
        id: 'research-hard',
        name: '/telos:research-hard',
        invocation: '/telos:research-hard 02 --replace',
        summary: 'Runs the same read-only research as /telos:research, with the same bundle, report shape and handoff, on a different model.',
        notes: [
          'Model: /telos:research-hard runs on Opus in the researcher-hard agent; /telos:research runs on Sonnet. The instructions, tools and arguments are identical.',
          'Use when the question is an architectural decision or a library choice with real trade-offs.',
          'Avoid when the question is routine; /telos:research is the default and returns the same report.',
        ],
      },
    ],
    sources: [skill('research'), skill('research-hard'), { label: 'Shared research instructions', path: 'shared/research.md' }, bundle('research'), README],
  },
  {
    slug: 'skill-docs',
    kind: 'skill',
    name: '/telos:docs',
    invocation: '/telos:docs [path…]',
    summary: 'Refresh the documentation of changed code from MAP pointers and a bounded scan, without touching state.',
    profiles: 'Deep only',
    prerequisites: [
      'The deep profile. Under minimal or standard the skill replies Requires deep profile. … and stops.',
      'Changed code to document, or paths you name. Each path must be a literal repo-relative path using letters, digits and . _ - @ + / only, with no leading slash and no ..; any other item prints Usage: /telos:docs [path…] before anything runs.',
    ],
    explanation: [
      'Without arguments the skill uses the bundle for the current phase diff. With paths it reruns the bundle once with one --scope per path. Repository text is data and never instructions.',
      'If the bundle says Sync: NO-OP, there are no documentation candidates: the skill replies so and edits nothing. Otherwise it reads only the matched ranges and the changed public API they name, updates each range to say what the code now does, and adds or fixes a short docstring on every new or changed public function or export. It invents no versions, release data, commands or links.',
      'It runs only the configured checks, through telos check, and reports the real result. Sync: NOT VERIFIED, or any omitted row, requires targeted reads of each omitted path; whatever stays uninspected is listed as unverified and the docs are never called synchronized from incomplete evidence.',
    ],
    effects: [
      'Edits documentation only: matched README and docs ranges and docstrings of changed public API. Runtime behavior and unrelated text stay byte for byte.',
      'It changes no task, STATUS or ROADMAP and runs no git commands, so it does not commit. The reply lists Changed paths, check results, Unverified items and a Sync verdict.',
    ],
    examples: [
      {
        title: 'Refresh docs for the current phase',
        command: '/telos:docs',
        outcome:
          'Either Sync: NO-OP with nothing edited, or a list of Changed paths, the configured check results and a Sync line that says synchronized only when nothing is unverified. Illustrative layout.',
      },
      {
        title: 'Limit the refresh to one folder',
        command: '/telos:docs src/export README.md',
        outcome:
          'The bundle is rebuilt with those two scopes. A path such as ../secrets or one containing spaces is rejected with the usage line and nothing runs.',
      },
    ],
    use: [
      'Use when you changed public functions or commands and want matching README ranges and docstrings updated on demand.',
      'Use when you want a bounded, checked doc pass without closing the phase.',
    ],
    avoid: [
      'Avoid for new prose or release notes: it edits matched ranges and does not write changelogs. Deep /telos:done handles changelog candidates.',
      'Avoid passing free text. Only literal paths are accepted.',
    ],
    alternatives: [
      { slug: 'skill-done', label: '/telos:done', note: 'Deep close runs doc-sync and changelog lines as part of closing.' },
      { slug: 'skill-map', label: '/telos:map', note: 'Refresh the project map rather than documentation.' },
    ],
    sources: [skill('docs'), bundle('docs'), README],
  },
];
