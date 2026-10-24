---
id: 01-03
title: Config defaults, loading and validation
type: code
status: done
critical: false
effort: normal
depends: [01-02]
decisions: [D-04]
scope: [lib/config.mjs, test/config.test.mjs]
---
## Goal
One module that defines the `config.json` schema (defaults + validation), loads
and merges it, writes it stably, and answers profile-gating questions.

## Read first
- SPEC.md §4.5 (config.json)
- SPEC.md §3 (profiles, the "Requires … profile" line)

## Files
- lib/config.mjs (create)
- test/config.test.mjs (create)

## Constraints
- exports: `PROFILES`, `DEFAULTS`, `validate(obj) → string[]`, `load(root)`, `write(root, cfg)`, `atLeast(cfg, profile)`, `requireMessage(profile)`
- `DEFAULTS` has empty `stack` and `checks` (filled by detection), limits and git settings from §4.5
- `load` deep-merges file over defaults and throws with all validation errors joined
- `write` emits 2-space JSON with a trailing newline, key order as in §4.5

## Tests (write first)
- defaults validate with no errors
- unknown profile, `version` ≠ 1, non-string check command, non-positive limit → one error each, naming the key
- partial file merges over defaults (e.g. only `profile` set)
- `atLeast` ordering minimal < standard < deep
- `requireMessage('deep')` equals `Requires deep profile. Switch with /telos:profile deep.`
- write → load round-trips

## Steps
1. Write tests, implement, run.

## Acceptance
- [x] all listed tests pass
- [x] `node --test test/config.test.mjs` → exit 0

## Result
- lib/config.mjs: deep-frozen `DEFAULTS` (profile `standard`, empty stack/checks), `validate` (unknown top-level and check keys are errors), `load` (deep merge, arrays replace), `write` (SPEC key order, checks in build→e2e order).
- `atLeast`, `requireMessage` for profile gating; 8 tests, suite 17/17.
- Process note: tests and code were written before the first run, so no RED run was observed.
