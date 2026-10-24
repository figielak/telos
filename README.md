# Telos

A lean, token-economical workflow plugin for Claude Code:
plan → test → implement → verify, with durable project memory in `.telos/`.

Status: **pre-alpha** (phase 01-skeleton). See [SPEC.md](SPEC.md).

## Install (per repository)

```
/plugin marketplace add figielak/telos
/plugin install telos@telos
/telos:init standard
```

Requires Claude Code with plugin support, Git and Node.js ≥ 20.10.
