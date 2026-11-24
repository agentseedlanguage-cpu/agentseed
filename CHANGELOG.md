# Changelog

## Checkpoint 2

### Fixed
- Repo builds again (`lower_ident` / local name binding in lowering).
- `=>` is now lexed as one token (match and discharge arms could never parse).
- Parse errors are returned instead of printed and ignored; recovery can no
  longer loop forever on a stray token.
- Statements in blocks are chosen by lookahead; `let` is a real `Stmt::Let`, so
  effect/taint/contract checks now see it. Block-like expressions end a
  statement without `;`.
- Effect, taint and contract passes now cover agent and impl methods.
- Domain keywords (`query`, `memory`, ...) work as identifiers.
- `discharge` keeps its thresholds; VM gates use the lower confidence bound
  (fail-closed), report distinct taint/budget errors, and the discharge scope
  now closes (`DischargeEnd`).
- `seedls`, `seedfmt`, `seeddbg`, `seedpkg` compile and are in the workspace;
  `seeddbg` is now a small dependency-free DAP server.
- clippy `-D warnings` clean; `ast_dump.txt` only with `--features debug-ast-dump`.

### Added
- `§NAME { key: value }` seed blocks, `discharge e with { .. } { .. }`,
  `perform Effect::X(args) requires cap::Y`.
- Regression tests (`seedc/tests/frontend.rs`) and a CI smoke test of the examples.

### Known gaps (next)
- VM is a stack machine while the compiler emits SSA: variables and user
  function calls do not execute correctly yet.
- `typeck::infer_types` is a no-op; `nameres` is not a real resolver.
- IR has no string pool (effect names and `print` text are not preserved).
