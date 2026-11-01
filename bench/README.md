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

## Workspace and sandbox (PROTOCOL §5, §6.1)

All of it lives under one `workDir` that neither lies inside nor contains this checkout or any local source repository (otherwise a usage error, exit 2): `copies/<cell id>`, `snapshots/<setup key>` (+ `.json` metadata), `config/<cell id>`, `plugin/`. Refusals throw `REFUSED: <reason>`.

- `prepareCopy(cell, manifest, { workDir, snapshot })` → `{ dir, start, refsChecked: true }`. `git clone --no-local` of the repo's `url`, then: refuse a start that ships `CLAUDE.md`, `CLAUDE.local.md` or `.claude/` anywhere; check out branch `bench` at the start; drop remotes, every other ref and all tags; expire the reflog and `gc --prune=now`. The leak check refuses the copy if any other ref remains, HEAD is not the start, the task's `reference` commit is still present, or any commit is not an ancestor of the start. Variant instructions: A none; B `<manifest dir>/<repo>/<start>/CLAUDE.md` (the task's `b` must name exactly that file; missing → refused); C/D the overlay of `snapshot`, whose metadata key and `.telos/config.json` profile must match the cell and which may only add files (a `.git` entry or a tracked path in it is refused). Finally any symlink resolving outside the copy is refused.
- `ensureSnapshot(key, { workDir, telosDir, build })` → `{ dir, hash, rebuilt }`. The hash covers start, profile, the Telos commit and the content of every tracked map file (`skills/map*`, `shared/map.md`, `lib/**/map*`). A current snapshot is reused; otherwise the old one is removed and `build({ key, repo, start, profile, dir, telosDir })` fills a temporary dir with what `telos init --profile <p>` + `/telos:map` leave behind at that start, which is then renamed into place. A failing build leaves nothing; a promise-returning build makes `ensureSnapshot` return a promise. The build's return value (e.g. its usage) is kept as `record`.
- `exportPlugin(telosDir, outDir)` → exported paths. Only **tracked** files under `.claude-plugin`, `agents`, `bin`, `hooks`, `lib`, `shared`, `skills`, `templates`; never `bench/`, `test/` or `.telos/`. File modes are kept; a symlink that leaves the runtime is refused.
- `sessionEnv(cell, { configTemplate, workDir })` → `{ env, settingsPath, readable }`. A fresh `config/<cell id>` holding only `settings.json` and, if `configTemplate.credentials` is given, `.credentials.json`. Settings keep the template's shared permission mode and allow list and add: `autoMemoryEnabled: false`, `WebFetch`/`WebSearch` denied, `sandbox.enabled` with `allowUnsandboxedCommands: false` and `network.allowedDomains` = the model API (`api.anthropic.com` unless `allowedDomains` is set). The env is built from scratch (no host variables except `PATH`, `LANG` and `passEnv` names): `HOME` = `CLAUDE_CONFIG_DIR` = the config dir, auto-memory, autoupdater and nonessential traffic disabled, a fixed bench git identity. `readable` = copy, plugin export (C/D only), config dir; the launcher running as the dedicated OS user enforces it (PROTOCOL §5.1 item 1), and the pilot's canaries verify it, including whether this host version honours the sandbox keys above.
- B and C/D instructions are untracked files in the copy; the start commit itself stays byte-identical.
