# Standard loop fixture

This standard fixture exercises Telos through its public CLI and hook subprocesses.
The harness plays discuss, plan, approve, do, check, done and confirmed undo in a
temporary Git repository. It uses no network, dependencies or live Claude session.

`npm test` checks every implemented message. `node src/index.mjs test greet` also
requires that message to exist, providing a deterministic RED before implementation.
The planned task dependency chain is workflow ordering; message modules are independent
so checks can still pass after reverting a prerequisite while retaining dependent code.

The `format` and `types` modes record their arguments in `.telos/.cache/checks.jsonl`
to prove Stop ordering, quoting and batching. These are deterministic fixture checks,
not a formatter or type checker. A `.telos/.cache/fail-<mode>` marker makes that mode
fail, exercising close and undo safety gates and Stop recovery without changing config.

Confirmation and manual-review decisions are supplied by the harness. This proves
machine workflow behavior, not live skill invocation, model judgment or host dispatch.
