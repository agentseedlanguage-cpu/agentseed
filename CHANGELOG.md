# Changelog

## Checkpoint 3

### Fixed
- Block scoping in lowering restored (a CP2 overlay had replaced the lexical scope stack with a flat map): inner `let`
  shadows and no longer leaks.
- Multi-arm `discharge` is rejected as `Unsupported` instead of silently running every arm (fail closed).
- Core keywords (`let`, `fn`, `if`, ...) are reserved as names; domain keywords stay contextual.

### Changed
- Repo cleanup: removed tracked junk (`compile.log`, `run.log`, `fullRepoMixSnapshot.xml`, empty
  `ASl_1_0_0_tasklisttolaunch`) and the never-compiled root `tests/` (replaced by `seedc-cli/tests/cli_smoke.rs`).
- Removed every dependency cargo reports as unused (3 workspace-level, plus per-crate in seedc, seeddbg, seedls,
  seedpkg, seedvm); `lsp-types` is no longer built twice. MSRV is declared once and inherited by all crates.
- Renamed `docs/book/...Multi_Agent_Systems (2).pdf` to `docs/book/ASL_Unified_Effect_Type_System_Paper.pdf`
  (landing-page link updated).
- CI: runs on every branch push; added the dead-module guard (ADR-017).

### Added
- `seedc-cli/tests/cli_smoke.rs` (6 end-to-end tests) and 4 front-end regression tests: **206 tests total**.
- `docs/ASL_CP3_RESEARCH_NOTES.md` (evidence register, OWASP crosswalk, proposals).
- Spec draft Annex S (implemented syntax and gate semantics); Arc42 draft ADR-020 recommendation, ADR-027..030,
  Phase 0 status table, Reality Register (§8.4) and CP3 plan (§8.5); addendum items 18-27.

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
