---
id: {{id}}
title: {{title}}
type: code          # code | doc | audit
status: draft       # draft | approved | in-progress | done | blocked | reverted
critical: false
effort: normal      # normal | hard
depends: []         # task IDs, e.g. [01-01]
decisions: []       # phase-local, e.g. [D-03]
scope: []           # required: path prefixes/globs; ["*"] = unrestricted; audit: [".telos/"]
---
## Goal
<!-- 1–2 sentences -->

## Read first
<!-- "- path:start-end (symbol or concept)" or "- FILE.md §Section" -->

## Files
<!-- "- path (create|modify|delete)"; must lie inside scope; audit: none -->

## Constraints
- none

## Tests (write first)
<!-- type: code only; every Edge case maps to a test -->

<!-- Detailed level only (effort: hard or critical: true):
## Interface
   contracts introduced or changed, ≤ 15 lines
## Edge cases
   "- input → expected outcome"
-->

## Steps
<!-- normal: 3–6 bullets; detailed: "N. path: function — what", each verifiable -->

## Acceptance
<!-- "- [ ] criterion" or "- [ ] `command` → expected" (run by telos accept).
     type: code adds "- [ ] all listed tests pass". Scope is checked automatically. -->

## Result
<!-- filled by do: 3–5 lines (audit: ≤ 10, findings + proposed follow-ups)
     last line always: "Deviations: none" or "Deviations: path — why" -->
