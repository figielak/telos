# History
<!-- Why things were decided, removed or reverted. Changes themselves live in git. -->

## Delete-zone
<!-- Never rotated. One line each; do not recreate unless the user asks.
     "- `path/` — reason (ref, YYYY-MM-DD)"   ← checked by the edit hook
     "- approach: … — reason (ref, YYYY-MM-DD)" ← injected into plan/quick bundles
     `history add remove … --path <relative-path>` or `--approach <text>` records one target.
     `history add revert …` clears only its exact selector; no selector means Log only. -->
- none

## Log
<!-- Newest first; written by `telos history add`. Over limits.history_entries,
     oldest entries move to HISTORY-archive.md.
     "- YYYY-MM-DD <kind> <ref>: text"
     kinds: decision | phase | revert | remove | quick | profile | init
     ref: NN, NN-MM, ADR NNN, quick, telos
     Archive is installed first; after an interrupted write it may duplicate live Log rows. -->
- {{date}} init telos: initialized ({{profile}} profile)
