# lazygit

Terminal UI for git, written in Go (module `github.com/jesseduffield/lazygit`, Go 1.22). Entry point is `main.go`; the UI is built on a vendored fork of gocui.

## Layout
- `pkg/app`: startup and wiring.
- `pkg/gui`: the TUI. `controllers/` holds keybinding handlers, `context/` the view contexts, `presentation/` rendering, `types/` shared interfaces.
- `pkg/commands`: git operations (`git_commands/`, `oscommands/`, `models/`).
- `pkg/config`: user config; `pkg/jsonschema` generates `schema/config.json`.
- `pkg/i18n`: translations. `pkg/cheatsheet` generates `docs/keybindings/`.
- `pkg/integration`: end-to-end tests (`tests/`, `components/`, `clients/`).
- `cmd/integration_test`, `cmd/i18n`: dev tools.
- `docs/dev/Codebase_Guide.md` explains the architecture and event loop; read it before larger changes.

## Build and run
- `make build` (or `go build`), `make run`, `make run-debug` (`go run main.go -debug`). View the log in another tab with `make print-log`.

## Tests
- Unit: `make unit-test` (`go test ./... -short`).
- Integration, all: `make integration-test-all` (`go test pkg/integration/clients/*.go`).
- Integration, single or interactive: `go run cmd/integration_test/main.go cli [--slow|--sandbox] <testname>`, or `... tui` for a picker. See `pkg/integration/README.md` and `docs/dev/Integration_Tests.md`.
- Add a new integration test under `pkg/integration/tests/<area>/`, then run `go generate ./...`. This regenerates `pkg/integration/tests/test_list.go`, which is auto-generated and must not be edited by hand.
- `make test` runs both unit and integration tests.

## Generated files
`make generate` (`go generate ./...`) rebuilds the integration test list, the cheatsheets in `docs/keybindings/*`, and `schema/config.json`. After changing keybindings, their descriptions, or config structs/defaults, run it and commit the results.

## Conventions
- Format with `make format` (gofumpt). Lint with `make lint` (golangci-lint; config in `.golangci.yml`, including goimports, exhaustive, unparam, nakedret with no naked returns, copyloopvar).
- All Go files outside `vendor/` must use snake_case names (checked by `scripts/check_filenames.sh`).
- User-facing strings go in the `TranslationSet` struct and `EnglishTranslationSet()` in `pkg/i18n/english.go`; use them via `self.c.Tr.YourText`. Translating into other languages (`pkg/i18n/translations/*.json`) is optional.
- Config options are documented in `docs/Config.md`, so update it when adding one.
- `vendor/` is committed. Do not edit it by hand; `make bump-gocui` and the `scripts/bump_*.sh` scripts update vendored jesseduffield modules.
- `scripts/check_for_fixups.sh` guards against leftover fixup commits in a PR.
- Keep changes in line with the design principles in `VISION.md`.

## Contributing
Branch from `master` (never PR from your fork's master), add tests for new behaviour, update docs, and write a good commit message. Discuss big changes in an issue first (`CONTRIBUTING.md`).
