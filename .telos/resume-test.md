# Resume test
<!-- Questions for `telos resume-test` (phase 15); facts ";"-separated, alternatives "|". -->

- Q: What is the current phase of this project and its next task?
  expect: 15-05; resume-test|resume test

- Q: Which phase follows the current one, and what result would close the whole project?
  expect: dogfood; 15%

- Q: Where are the default size limits for the MAP index and the area notes set, and what are they?
  expect: lib/config.mjs; 600; 800

- Q: Why does the Telos rules block live in AGENTS.md rather than in CLAUDE.md?
  expect: Codex; import

- Q: Why was the bench/ benchmark harness removed?
  expect: owner; 07

- Q: Why were the separate discuss, approve, check and accept gates removed?
  expect: 07|benchmark; turns|sessions

- Q: Why does /telos:map --refresh never fall back to a full rebuild when many files changed?
  expect: overwrit; authored|hand-written|by hand

- Q: Why do the Telos hooks stay Claude Code only, and how do other agents learn the git rules?
  expect: trust; AGENTS.md
