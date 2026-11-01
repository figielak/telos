# Telos benchmark harness

Dependency-free Node ESM (`.mjs`), not part of the plugin runtime. The rules it implements are in [PROTOCOL.md](PROTOCOL.md); its tests are `test/bench-*.test.mjs` and run with `npm test`.

## Manifest (`<dir>/manifest.json`)

```json
{
  "repetitions": 5,
  "repos": [{ "id": "r1", "url": "https://…" }],
  "tasks": [
    { "id": "t-one", "repo": "r1", "start": "<40-hex>", "reference": "<40-hex>", "type": "single",
      "prompt": "task text", "expectedPaths": ["src/"],
      "acceptance": "acceptance/t-one.mjs", "b": "b/r1-s1/CLAUDE.md" }
  ]
}
```

- `type: "single"` has `prompt`; `type: "multi"` has `steps[]` (`steps[0]` is the task text, the rest are the A/B continuation texts of PROTOCOL §6.3). Both together, or the wrong one for the type, is an error.
- `start` and `reference` are 40-character lowercase hex commits; `acceptance` and `b` are paths inside `<dir>` that must exist.
- `variants`, if present, must be exactly `A, B, C, D`. `repetitions` defaults to 5.
- Ids (`repos[].id`, `tasks[].id`) match `[a-z0-9-]` and start with a letter or digit. Every error is a usage error (exit 2) naming `manifest.json` and the field, e.g. `manifest.json: tasks[1].start: …`.

`loadManifest(dir)` → `{ dir, repos, tasks, repetitions }`.

## Run matrix

`expandMatrix(manifest, { seed, reps, only, variant, done })` → `{ cells, setups, queue }`.

- **Cell id** `<task>.<variant>.<rep>` (rep from 1). Ids never change with `reps`, `only` or `variant`.
- **Setup key** `<repo>.<start>.<profile>`: C uses `deep`, D uses `standard`; A and B have none. Tasks of one repo with different starts get separate keys; equal starts share one. The setup's cost is charged to every trajectory in the report, not by the matrix.
- **Order** (blocked randomization): the cells of a `(task, rep)` block run back to back with the four variants in a seed-derived order; block order is seed-derived too. Orders are sorted by `sha256(seed, key)`, so the same seed reproduces them and filtering or `reps: 1` (the pilot) keeps the relative order of the remaining cells.
- **Queue**: `cells` and `setups` interleaved so each setup comes right before its first dependent cell.
- **Resume**: pass the ids of finished cells as `done`; they are skipped, and a setup with no remaining dependent cell is not emitted again.
- `only` is a list of task ids, `variant` a variant or list; unknown values, `reps < 1` or a missing seed are usage errors.
