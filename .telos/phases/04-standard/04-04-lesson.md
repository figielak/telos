---
id: 04-04
title: Lesson capture
type: code          # code | doc | audit
status: approved    # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: [04-02]
decisions: []       # phase-local, e.g. [D-03]
scope: ["lib/lessons.mjs", "lib/ctx/lesson.mjs", "lib/ctx/index.mjs", "skills/lesson/SKILL.md", "test/lessons.test.mjs", "test/skills.test.mjs", "README.md"]
---
## Goal
Add /telos:lesson with an area-first duplicate check and a bounded LESSONS list that never silently discards knowledge.

## Read first
- SPEC.md §4.1
- templates/LESSONS.md:1-8 (lesson format and full-list policy)
- lib/ctx/index.mjs:23-33 (bundle registration)
- lib/config.mjs:126-134 (profile gate)
- test/skills.test.mjs:24-38 (skill contracts)

## Files
- lib/lessons.mjs (create)
- lib/ctx/lesson.mjs (create)
- lib/ctx/index.mjs (modify)
- skills/lesson/SKILL.md (create)
- test/lessons.test.mjs (create)
- test/skills.test.mjs (modify)
- README.md (modify)

## Constraints
- Standard/deep only; sonnet, user-invoked, one fixed injection; lesson text stays in Request body.
- No automatic deletion at the 20-entry limit: propose a specific promotion to PROJECT Conventions or stale-entry removal and await user choice.
- Deduplicate within matching areas without merging distinct lessons; refs are task IDs or quick.
- Only LESSONS and an explicitly approved promotion to PROJECT are editable; no task/ROADMAP/STATUS mutation. Add skill and bundle README rows.

## Tests (write first)
- Parser returns canonical area/text/ref entries, skips comments and none, and flags malformed entries.
- Minimal gate and missing/empty LESSONS are handled explicitly; 20 entries are all visible within a capped bundle.
- Skill distinguishes duplicate from a distinct lesson in the same area; adding entry 21 requires a replacement decision.
- Promotion removes the source lesson only after writing the approved convention; no silent loss on failed edit.

## Steps
- Write lesson parsing and skill behavior contract tests first.
- Implement reusable lesson entries and a capped ctx lesson with current task/ref and list occupancy.
- Write lesson skill instructions for bounded targeted edits, area-first dedupe and full-list choices.
- Register the bundle and document the new skill and context rows.

## Acceptance
- [ ] all listed tests pass
- [ ] `npm test` → exit 0
- [ ] Lesson instructions enforce the 20-entry limit and require a user choice before replacing knowledge.

## Result
