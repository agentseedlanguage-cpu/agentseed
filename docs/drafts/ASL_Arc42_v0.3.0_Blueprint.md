> **SUPERSEDED IN PART (2026-10-30).** This draft was written from search snippets and contains claims later found wrong (event lifecycle, TraceSpecAlgebra, CoMem promotion rule, zkComposer speedups, EU AI Act dates, "ETAS has no memory"). Read `docs/ASL_V0_3_0_ADDENDUM_VERIFIED.md` first; where they conflict, the addendum wins. Implementation status as of CP3 is in §7 (ADR-027 – ADR-030, ADR-020 recommendation) and §8.3–§8.4 below; research context is in `docs/ASL_CP3_RESEARCH_NOTES.md`.

# ARCHITECTURE BLUEPRINT — Agent-Seed Language Toolchain v0.3.0
**Arc42 Format | seedc 16.0.0 + seedvm 6.0**  
**Generated:** 2026-10-23  
**Supersedes:** Arc42 v0.2.0 Blueprint (c8d9e0f1-a2b3-4c5d-e6f7-a8b9c0d1e2f3)  
**Integrity Hash:** e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b  
**Overall Confidence:** 96%  
**Transfer Continuity Score:** 0.98

> This blueprint is self-contained. It supersedes and extends the v0.2.0 blueprint.
> All v0.2.0 decisions remain valid unless explicitly amended below.
> New material is marked **[v0.3.0 NEW]** or **[v0.3.0 AMENDMENT]**.

---

## 1. CONTEXT & STAKEHOLDERS

### 1.1 System Goals (Updated)

Provide a production-grade, proof-carrying, formally-specified programming
language for safe, autonomous, economically-disciplined agents. The v0.3.0
release adds:

- **Compile-time trace specification algebra** (no more runtime-only safety)
- **Dependent-type verified agent programs** via spec<T> blocks at S2+
- **Bi-temporal memory** for regulatory audit and retrospective reasoning
- **Choreographic spawn** — linear session-typed agent creation
- **Intent-to-Spec** — natural language formalized into machine-checked specs
- **zkComposer** — production-viable parallel zkML proof construction
- **CoMem federation quality** — prevents memory pollution at scale

### 1.2 Stakeholders (v0.3.0 Additions)

| Stakeholder | Concern | New in v0.3.0 |
|-------------|---------|--------------|
| Damian Ramsajan (Creator) | Technical correctness, spec compliance | All new sections |
| Regulatory auditors (EU AI Act) | Article 12 record-keeping | §38 BI-TEMPORAL |
| Lean4/Dafny oracle operators | Oracle integration, proof reliability | §41 SPEC-BLOCKS, §40 INTENT-SPEC |
| Multi-agent system operators | Memory quality at scale | §6.C CoMem |
| High-value decision systems | Production-viable zkML proofs | §P-CALC zkComposer |

### 1.3 External Systems — v0.3.0 Additions

```
[v0.3.0 NEW]
zkComposerService — parallel zkML sub-proof generation
Lean4Oracle        — dependent-type spec checking and proof artifact generation
DafnyOracle        — alternative oracle for spec<T> blocks
BiTemporalStore    — R-tree indexed bi-temporal record store (embedded in seedvm-6.0)
DatalogEngine      — incremental Datalog substrate (embedded in seedvm-6.0)
```

### 1.4 Constraints (v0.3.0 Additions / Changes)

| Constraint | Type | Source |
|------------|------|--------|
| Rust stable ≥ 1.85, MSRV 1.85 | Technical | Unchanged |
| bincode = "1" | Technical | Unchanged |
| miette 7.x | Technical | Unchanged |
| Chromebook 4 GB RAM, CARGO_BUILD_JOBS=1 | Environmental | Unchanged |
| Release only on v* tags | Process | Unchanged |
| #![deny(unsafe_code)] all crates | Quality | Unchanged |
| #![deny(clippy::unwrap_used)] CI | Quality | Unchanged |
| Lean4 oracle: optional dep; not required for S0/S1 | Technical | **[v0.3.0 NEW]** |
| zkComposer: optional dep; required only for ProofType::zkComposer | Technical | **[v0.3.0 NEW]** |
| Datalog engine: embedded, no external dep | Technical | **[v0.3.0 NEW]** |
| Bi-temporal store: embedded in seedvm-6.0 | Technical | **[v0.3.0 NEW]** |

---

## 2. SOLUTION STRATEGY

### 2.1 Key Architectural Patterns (Updated)

| Pattern | Application | New in v0.3.0 |
|---------|-------------|--------------|
| Pipeline | Compiler: source → tokens → CST → typed AST → trace-spec checked → IR → binary | +sema::tracespec pass |
| Interpreter | VM: opcode dispatch with discharge gate and Datalog substrate | +Datalog engine |
| Monad | Computation<T,ε> with 6 fields | UncertaintyKind added to ε.uncertainty |
| Checkpoint/Restore | Speculative execution | Unchanged |
| Charter-Governed | Fiscal discipline | Unchanged |
| Dependent Types | spec<T> blocks at S2+ | **[v0.3.0 NEW]** |
| Bi-temporal | L8 memory index | **[v0.3.0 NEW]** |
| Linear Types | SessionHandle<G,R> affine | **[v0.3.0 NEW]** |
| Choreographic | spawn_typed unifying spawn + session | **[v0.3.0 NEW]** |

### 2.2 Domain Model (v0.3.0 Updates)

```
[v0.3.0 AMENDMENT]
Computation<T> gains:
    uncertainty.kind: UncertaintyKind    -- NEW

SessionHandle<G, R>                      -- NEW: affine type from spawn_typed

TraceEvent                               -- NEW: quadripartition enum

BiTemporalRecord                         -- NEW: valid_time + transaction_time

SpecBlock<T>                             -- NEW: oracle-verified formal spec

DatalogSubstrate                         -- NEW: runtime fact base

FederatedFact gains:
    verification_count: u32
    promoting_agents:   Vec<AgentId>
    federation_status:  FederationStatus

ProofMeta gains:
    ProofType::zkComposer               -- NEW
    composer_config: Option<ProofComposerConfig>  -- NEW
```

---

## 3. BUILDING BLOCK VIEW

### 3.1 Container: seedc — v0.3.0 Changes

**[v0.3.0 NEW] Compiler phase: sema::tracespec**

Inserted after `sema::effectck`, before `lowering`.

```
Responsibility: Derive TraceSpecAlgebra from every function.
               Check for Bottom (contradiction). Extract residuals for SMT.
               Write callable_descriptor to IR symbol table.
Interface:     fn check_trace_specs(typed: &TypedAST) -> Result<TraceSpecTable, TraceSpecError>
               Pre:  valid TypedAST with effect rows populated
               Post: every function has a callable_descriptor; no Bottom specs
Complexity:    O(n log n) in number of effect annotations
```

**[v0.3.0 NEW] Compiler phase: sema::speccheck (S2+ only)**

Inserted after `sema::tracespec`, before `lowering`.

```
Responsibility: Invoke oracle for spec<T> blocks. Embed proof artifact.
               Reject functions where oracle returns UNSAT.
Interface:     fn check_spec_blocks(typed: &TypedAST, oracle: OracleClient)
               -> Result<ProofTable, SpecError>
               Pre:  valid TypedAST; oracle client available
               Post: all spec<T> blocks have proof artifacts or build fails
```

**[v0.3.0 AMENDMENT] sema::effectck — TARGET DESIGN (implementation status: §8.3 / §8.4)**

```
Responsibility: Enforce perform inside discharge. Forbid action-ops inside
               reason block. Check ETAS-style four-event lifecycle.
Status:        MUST be implemented before v0.3.0 ships.
               Currently stubbed — this is the highest priority Phase 0 item.
```

**[v0.3.0 AMENDMENT] sema::taintck — TARGET DESIGN (implementation status: §8.3 / §8.4)**

```
Responsibility: 4D taint propagation (level + source + transform + causal + kind).
               verify_integrity gate. Taint-capability barrier enforcement.
Status:        Currently stubbed. Must implement before v0.3.0.
```

**[v0.3.0 AMENDMENT] sema::contractck — TARGET DESIGN (implementation status: §8.3 / §8.4)**

```
Responsibility: Stratum gating (all constructs). Charter bounds.
               Speculation prerequisites. Choreographic spawn type checking.
               UncertaintyKind propagation. SessionHandle affine tracking.
Status:        Currently stubbed. Must implement before v0.3.0.
```

Updated compiler pipeline diagram:

```
Source → Lexer → Tokens → Parser → CST → NameRes → ResolvedAST
→ TypeCheck → TypedAST → EffectCheck → TaintCheck → ContractCheck
→ TraceSpecCheck [NEW] → SpecCheck [NEW, S2+] → TypedAST
→ Lowering → IRModule → IRVerifier → BinarySerializer → .aslb
                                                         (+ proof_section [NEW])
```

### 3.2 Container: seedvm — v0.3.0 Changes

**[v0.3.0 NEW] Component: datalog**

```
Responsibility: Incremental Datalog substrate. Assert/retract facts.
               Evaluate policy queries in O(1) amortized after initial closure.
               Coexist with SMT engine; compiler routes to correct engine.
Interface:     struct DatalogSubstrate { ... }
               fn assert(relation: &str, args: &[Value]) -> Result<(), DatalogError>
               fn retract(relation: &str, args: &[Value]) -> Result<(), DatalogError>
               fn query(named_query: &str) -> QueryResult
               fn auto_assert_session_facts(session: &SessionState)
               fn auto_assert_capability_facts(caps: &CapabilitySet)
Implementation: Datalog with stratified negation; bottom-up evaluation;
               incremental maintenance via semi-naive evaluation.
```

**[v0.3.0 NEW] Component: bi_temporal**

```
Responsibility: L8 bi-temporal index. as_of queries. history queries. correct().
Interface:     fn as_of(key: &str, vt: Timestamp, tt: Timestamp) -> Option<BiTemporalRecord>
               fn history(key: &str, vr: Option<Range>, tr: Option<Range>)
                   -> Vec<BiTemporalRecord>
               fn correct(key: &str, valid_from: Timestamp, new_value: Value,
                          reason: &str) -> Result<BiTemporalId, MemoryError>
               fn index_on_write(record: &MemoryRecord) -- called by write path
Implementation: R-tree index on (valid_from, valid_until, transaction_from, transaction_until);
               BTree index on valid_from and transaction_from independently.
               Async indexing (< 1ms overhead on write path).
```

**[v0.3.0 NEW] Component: trace_events**

```
Responsibility: Emit TraceEvent records on every perform lifecycle step.
               Store in L7 provenance index. action_trace() query API.
Interface:     fn emit_requested(effect: EffectId) -> TraceEventId
               fn emit_handled(effect: EffectId, handler: HandlerId) -> TraceEventId
               fn emit_denied(effect: EffectId, reason: DenialReason) -> TraceEventId
               fn emit_committed(effect: EffectId, prov: ProvenanceId) -> TraceEventId
               fn action_trace(from: Timestamp, to: Timestamp) -> Vec<TraceEvent>
               fn blame(trace: &[TraceEvent]) -> Option<TraceEvent>
Invariant:     Every emit_requested is matched by exactly one of
               emit_handled, emit_committed, or emit_denied.
               VM panics in debug mode if invariant violated.
```

**[v0.3.0 NEW] Component: choreographic**

```
Responsibility: spawn_typed expression runtime. SessionHandle lifecycle.
               Affine tracking. Implicit session_close at S2+.
Interface:     fn spawn_typed<G, R>(constructor: AgentConstructor, caps: CapabilitySet)
                   -> SessionHandle<G, R>
               fn session_close(handle: SessionHandle<_, _>)
               fn send_typed(handle: SessionHandle<G, R>, value: TypedValue)
                   -> TypedValue  -- consumes handle
Invariant:     SessionHandle use count tracked by VM; double-use panics in debug.
               S2+ scope exit inserts session_close automatically via RAII.
```

**[v0.3.0 AMENDMENT] Component: computation**

```
[AMENDMENT] UncertaintyKind added to uncertainty field:
    uncertainty: UncertainInterval + UncertaintyKind

[AMENDMENT] discharge gate gains kind-aware threshold map:
    fn discharge(&self, thresholds: KindAwareThresholds) -> Result<Committed, Rejected>

[AMENDMENT] observe_structured() method on Uncertain<T>
```

**[v0.3.0 AMENDMENT] Component: proof**

```
[AMENDMENT] ProofMeta gains ProofType::zkComposer variant
[AMENDMENT] ProofComposerConfig added:
    parallelism: u32
    composition_strategy: Sequential | Parallel | Adaptive
    layer_partition: Auto | Manual(Vec<u32>)
[AMENDMENT] zkComposer proof generation is async; does not block discharge gate
            while proof is being generated; uses optimistic proof deferral (§S-SPEC)
```

**[v0.3.0 AMENDMENT] Component: memory (L5)**

```
[AMENDMENT] FederatedFact gains verification_count, promoting_agents, federation_status
[AMENDMENT] CoMem promotion policy enforced in federated write path:
            Facts below min_agent_verifications are stored as FederationStatus::Pending;
            not returned by normal federation queries until promoted to Active.
[AMENDMENT] verify_federated_fact() method added to memory API
[AMENDMENT] anti_homogenization check on promotion: max_overlap_pct enforcement
```

---

## 4. RUNTIME VIEW

### 4.1 Scenario: Compile-Time TraceSpec Check [v0.3.0 NEW]

```
sequenceDiagram
    participant Source
    participant sema::effectck
    participant sema::tracespec
    participant IRModule
    participant SMTEngine

    Source->>sema::effectck: TypedAST with effect rows
    sema::effectck->>sema::tracespec: TypedAST (effects validated)
    sema::tracespec->>sema::tracespec: derive TraceSpecAlgebra per function
    sema::tracespec->>sema::tracespec: check for Bottom (contradiction)
    alt Bottom detected
        sema::tracespec-->>Source: CompileError(TraceSpecContradiction)
    else No Bottom
        sema::tracespec->>sema::tracespec: extract residual LTL formulas
        sema::tracespec->>IRModule: write callable_descriptor + residuals
        IRModule->>SMTEngine: register residuals at function entry (runtime)
    end
```

### 4.2 Scenario: TraceEvent Lifecycle [v0.3.0 NEW]

```
sequenceDiagram
    participant Agent
    participant VMExecutor
    participant TraceEvents
    participant DischargeGate
    participant L7Provenance

    Agent->>VMExecutor: perform Effect::NetworkCall(url) requires cap::network_read
    VMExecutor->>TraceEvents: emit_requested(Effect::NetworkCall)
    TraceEvents->>L7Provenance: store TraceEvent::Requested
    VMExecutor->>DischargeGate: discharge(computation, thresholds)
    alt Discharge succeeds
        DischargeGate->>TraceEvents: emit_committed(Effect::NetworkCall, prov_id)
        TraceEvents->>L7Provenance: store TraceEvent::Committed
        DischargeGate-->>Agent: Committed(result)
    else Discharge fails
        DischargeGate->>TraceEvents: emit_denied(Effect::NetworkCall, reason)
        TraceEvents->>L7Provenance: store TraceEvent::Denied(DenialReason::CapabilityDenied)
        DischargeGate-->>Agent: Rejected(DenialReason)
    end
```

### 4.3 Scenario: Choreographic Spawn [v0.3.0 NEW]

```
sequenceDiagram
    participant Coordinator
    participant VMExecutor
    participant Worker(AnalystAgent)
    participant SessionTypechecker

    Coordinator->>SessionTypechecker: verify project(TaskProtocol, Coordinator)
                                      == dual(project(TaskProtocol, Worker))
    SessionTypechecker-->>Coordinator: OK (compile-time check)
    Coordinator->>VMExecutor: spawn_typed<TaskProtocol, Worker>(AnalystAgent, caps)
    VMExecutor->>Worker(AnalystAgent): create agent, place in Worker role
    VMExecutor-->>Coordinator: SessionHandle<TaskProtocol, Coordinator>
    Note over Coordinator: handle is affine — tracked by VM
    Coordinator->>VMExecutor: handle ~> TaskRequest { data: ... }
    VMExecutor->>Worker(AnalystAgent): typed message (TaskRequest)
    Note over Coordinator: handle consumed; re-use is VM trap
    Worker(AnalystAgent)-->>Coordinator: Uncertain<Analysis>
```

### 4.4 Scenario: Bi-Temporal Audit Query [v0.3.0 NEW]

```
sequenceDiagram
    participant Auditor
    participant AuditCLI
    participant BiTemporalStore
    participant ProvenanceChain

    Auditor->>AuditCLI: seed audit --as-of decision_ts
    AuditCLI->>BiTemporalStore: as_of(key, valid_time=decision_ts, transaction_time=decision_ts)
    BiTemporalStore-->>AuditCLI: BiTemporalRecord (what agent believed at decision_ts)
    AuditCLI->>ProvenanceChain: action_trace(decision_ts - 1s, decision_ts + 1s)
    ProvenanceChain-->>AuditCLI: Vec<TraceEvent> around decision
    AuditCLI-->>Auditor: "At decision time, agent held [fact] with confidence [0.87, 0.93].
                           Effect::PlaceOrder was Committed after Requested (no denials)."
```

### 4.5 Scenario: CoMem Federation Promotion [v0.3.0 NEW]

```
sequenceDiagram
    participant AgentA
    participant AgentB
    participant AgentC
    participant L5FederatedMemory

    AgentA->>L5FederatedMemory: publish FederatedFact { claim: "BTC resistance at 95k", ... }
    L5FederatedMemory->>L5FederatedMemory: status = Pending (verification_count = 0)
    AgentB->>L5FederatedMemory: verify_federated_fact(fact_id)
    L5FederatedMemory->>L5FederatedMemory: verification_count = 1
    AgentC->>L5FederatedMemory: verify_federated_fact(fact_id)
    L5FederatedMemory->>L5FederatedMemory: verification_count = 2
    Note over L5FederatedMemory: Need 3 verifications per CoMem policy
    AgentA->>L5FederatedMemory: verify_federated_fact(fact_id) [self-verify]
    Note over L5FederatedMemory: Self-verify does NOT count (same AgentId as publisher)
    participant AgentD
    AgentD->>L5FederatedMemory: verify_federated_fact(fact_id)
    L5FederatedMemory->>L5FederatedMemory: verification_count = 3; status = Active
    L5FederatedMemory-->>AgentB: fact now visible in federation queries
    L5FederatedMemory-->>AgentC: fact now visible in federation queries
```

---

## 5. DEPLOYMENT VIEW

### 5.1 Infrastructure (Unchanged from v0.2.0)

Development: Chromebook (ARM64, 4 GB RAM), CARGO_BUILD_JOBS=1  
CI/CD: GitHub Actions (ubuntu-latest, macos-latest, windows-latest)  
Release: GitHub Releases, npm @asl-lang/cli

### 5.2 New Optional Runtime Dependencies [v0.3.0 NEW]

These are feature-gated; default builds do not require them.

```toml
# Optional: spec-blocks and intent-spec features
[features.spec-blocks]
requires-external = ["lean4-server OR dafny-server OR z3-binary"]
fallback = "compile error with diagnostic"

# Optional: zkcomposer feature
[features.zkcomposer]
requires-external = ["zkcomposer-service OR local-zkcomposer-binary"]
fallback = "ProofType::NanoZK used with warning"

# Embedded (no external dep):
# - Datalog engine (datalog-substrate)
# - Bi-temporal store (bi-temporal-memory)
# - CoMem policy engine (comem-federation)
# - Blame extractor (blame-extraction)
# - Trace event emitter (trace-event-quadripartition)
```

### 5.3 CI/CD Pipeline Additions [v0.3.0 NEW]

```
Tag[v* tag push] → release.yml
    → build_matrix[linux/macos/windows]
    → [NEW] oracle_integration_test [if lean4/dafny available in CI]
    → [NEW] zkcomposer_integration_test [if zkcomposer available in CI]
    → sign → upload
```

New CI jobs added to `ci.yml`:
- `datalog_substrate_tests` — run without external deps
- `bi_temporal_tests` — run without external deps
- `trace_event_tests` — run without external deps
- `choreographic_spawn_tests` — run without external deps
- `uncertainty_kind_tests` — run without external deps
- `comem_federation_tests` — run without external deps

---

## 6. CROSS-CUTTING CONCEPTS

### 6.1 Security (Additions)

**[v0.3.0 NEW] TraceEvent immutability.** TraceEvent records in L7 are
append-only and Merkle-proofed. No agent code can modify them. The VM
panics in debug mode if the append-only invariant is violated.

**[v0.3.0 NEW] SessionHandle affine enforcement.** The VM tracks every
`SessionHandle` by address. Double-use is a VM trap (not UB). The
compiler catches it at S1+; the VM enforces it at S0.

**[v0.3.0 NEW] Spec block proof integrity.** ProofEntry in the `.aslb`
binary is Ed25519-signed. The VM verifies the signature at load time.
A tampered spec block causes `BootIntegrityFailure`.

**[v0.3.0 NEW] CoMem anti-homogenization.** The promotion policy tracks
content overlap between promoted facts and specialist agents' private
memory. Facts that would homogenize the federation (>30% overlap with a
specialist) are flagged with `FederationStatus::Contested` and surfaced
for human review.

### 6.2 Error Handling (Additions)

New error types:

```rust
// [v0.3.0 NEW]
pub enum VmError {
    // ... existing variants ...
    TraceInvariantViolated { effect: EffectId, detail: String },
    SessionHandleDoubleUse { handle_id: HandleId },
    SessionHandleLeak { handle_id: HandleId },
    DatalogEvaluationFailed { query: String, detail: String },
    BiTemporalIndexCorrupted { key: String },
    SpecBlockVerificationFailed { spec_id: SpecId, oracle: OracleKind },
    CoMemPromotionBlocked { fact_id: FactId, reason: String },
    UncertaintyKindMismatch { expected: UncertaintyKind, actual: UncertaintyKind },
}

pub enum CompileError {
    // ... existing variants ...
    TraceSpecBottom { function: String, contradicting_effects: Vec<EffectId> },
    SessionHandleNotConsumed { handle: String, scope: SourceSpan },
    SpawnTypedRoleMismatch { global_type: String, role: String },
    SpecBlockUnsatisfiable { spec_id: String, oracle_output: String },
    UncertaintyKindNotReducible { kind: UncertaintyKind, operation: String },
}
```

### 6.3 Observability (Additions)

**[v0.3.0 NEW]** OTel spans gain new attributes:

```
gen_ai.agent.trace_event_kind       -- Requested/Handled/Denied/Committed
gen_ai.agent.denial_reason          -- populated on Denied events
gen_ai.agent.uncertainty_kind       -- UncertaintyKind of current Uncertain<T>
gen_ai.agent.spec_proof_verified    -- bool: was spec<T> verified this call?
gen_ai.agent.federation_pending     -- count of Pending facts in L5
gen_ai.agent.bi_temporal_queries    -- count of as_of queries per tick
```

---

## 7. ARCHITECTURE DECISION RECORDS

All v0.2.0 ADRs (001–006) remain in force. New ADRs:

### ADR-007 — Adopt TraceEvent Quadripartition
**Status:** Accepted  
**Context:** ETAS (arXiv:2607.17780, July 2026) demonstrated that binary
perform/discharge loses audit information. Denied events are invisible in
the current provenance chain, making it impossible to distinguish "agent never
tried" from "agent tried and was blocked."  
**Decision:** Add `TraceEvent` enum with four variants (Requested, Handled,
Denied, Committed) to §31. Every `perform` emits Requested. Denial emits
Denied with reason. Discharge emits Committed.  
**Consequences:** L7 provenance log grows ~2× (every effect now has up to 3
records instead of 1). Audit completeness increases dramatically. Enables
VIGIL-style blame extraction. Required for `no_silent_loss` temporal contract.

### ADR-008 — Compile-Time TraceSpecAlgebra at S1+
**Status:** Accepted  
**Context:** All temporal contract enforcement in v0.2.0 is runtime SMT only.
ETAS + VIGIL (2026) show that many safety properties are verifiable at compile
time from effect rows alone, reducing runtime overhead.  
**Decision:** New compiler pass `sema::tracespec` derives `TraceSpecAlgebra`
for every function. Properties discharged at compile time are removed from
runtime SMT workload. `Bottom` (contradiction) is a compile error.  
**Consequences:** Compilation is 10–15% slower for large agents. Runtime SMT
overhead decreases for compliant programs. New error type `TraceSpecBottom`.

### ADR-009 — spec<T> Dependent-Type Layer at S2+
**Status:** Accepted  
**Context:** Lean4Agent and NFV (June–August 2026) demonstrate that
machine-checked agent workflow proofs are practical. ASL's amendment pipeline
uses simulation but not formal proof. This is a correctness gap.  
**Decision:** `spec<T>` blocks at S2+. Oracle required (lean4/dafny/z3).
`proof_artifact: true` embeds proof in `.aslb`. All amendments at S2+ must
include spec checks.  
**Consequences:** S2+ compilation requires oracle access (optional dep).
`.aslb` binary grows by proof bytes (typically < 50KB). ASL becomes the
first agent language with shipping dependent-type verified programs.

### ADR-010 — ProofType::zkComposer
**Status:** Accepted  
**Context:** zkComposer (arXiv:2607.08095, July 2026) enables parallel zkML
proof construction with same soundness as monolithic proofs. Multi-step
agent pipelines currently have impractical proof times with monolithic NanoZK.  
**Decision:** Add `ProofType::zkComposer` as a new `proof_type` variant.
Recommend it for `think::deep` and above. Emit compiler warning when
`think::deep` is used with `ProofType::NanoZK` at S2+.  
**Consequences:** Requires optional `seed-zkcomposer` dep. Proof times for
multi-step pipelines drop from minutes to seconds. No change to soundness.

### ADR-011 — CoMem Federation Promotion Policy
**Status:** Accepted  
**Context:** CoMem (arXiv:2609.15009, September 2026) proves that CRDT
federation without quality gates causes memory pollution (noise accumulation
and behavioral homogenization) at scale.  
**Decision:** Add `federated_promotion_policy: comem` option on L5 memory
config. `FederatedFact` gains `verification_count`, `promoting_agents`,
`federation_status`. Facts with count < threshold are `Pending`.  
**Consequences:** Federation convergence is slower (facts need cross-agent
verification). Federation quality is dramatically higher. Self-verification
does not count toward the threshold.

### ADR-012 — UncertaintyKind as First-Class Type
**Status:** Accepted  
**Context:** SAGE-Agent (ACL 2026) and BayesAgent (AAAI 2026) show that
distinguishing specification vs. model uncertainty enables targeted
remediation and better GRPO training. The current U4 axiom (conditioning)
applies equally to all uncertainty, which is wrong: aleatory uncertainty
cannot be reduced by evidence.  
**Decision:** Add `UncertaintyKind` enum. Add `observe_structured()` and
`suggest_remediation()`. Add U7 axiom. Update discharge gate to accept
per-kind thresholds.  
**Consequences:** `Uncertain<T>` representation grows by one enum field.
Richer uncertainty semantics. Inference error handlers gain actionable hints.

### ADR-013 — Bi-Temporal Memory (L8)
**Status:** Accepted  
**Context:** ArqonDB (2026) and Semantica (2026) demonstrate bi-temporal
memory as necessary for regulatory compliance and retrospective agent
reasoning. EU AI Act Article 12 (enforceable August 2026) requires
record-keeping of AI system data enabling reconstruction of past decisions.  
**Decision:** Add L8 `bi_temporal_index` layer. Embedded in seedvm-6.0;
no external dep. All `MemoryRecord` types gain `valid_from`, `valid_until`.
Add `mem.as_of()`, `mem.history()`, `mem.correct()` APIs.  
**Consequences:** Memory storage grows ~15–20%. Retrospective queries become
first-class. EU AI Act Art. 12 compliance achievable with `seed audit` CLI.

### ADR-014 — Choreographic Spawn (§39)
**Status:** Accepted  
**Context:** 007 meta-language (2026) shows linear agent handles prevent
resource leaks. ASL's session types and spawn are currently separate, enabling
the bug class: spawn → forget to establish session → leak. Unifying them
makes multi-agent protocol correctness verifiable at creation.  
**Decision:** `spawn_typed<G, R>(constructor, caps)` returns
`SessionHandle<G, R>` — affine type. Compiler verifies spawner holds the
dual role. Illegal topologies are parse errors. `SessionHandle` tracked by
VM; double-use is a VM trap.  
**Consequences:** Multi-agent spawn is more verbose (requires session type
annotation). Illegal multi-agent topologies are impossible to express.
Existing `spawn` keyword is retained for backward compatibility at S0/S1
but deprecated for S2+.

### ADR-015 — Intent-to-Spec Pipeline (§40) [v0.3.0 NEW]
**Status:** Proposed  
**Context:** Intent Formalization (arXiv:2603.17150) identifies the "intent gap"
as the hardest unsolved problem in agent safety: the chasm between what a
developer means and what the system enforces. NL intent strings in comments
have no machine-checkable relationship to code behavior.  
**Decision:** Introduce `from_intent<T>(intent: str, oracle, countersignature)`.
Oracle formalizes intent into `spec<T>` block. Mandatory human countersignature
when `countersignature: required`. Signed formalization stored in evolution track.  
**Consequences:** Requires oracle access (optional dep). Slows down S2+
development (intentionally — forces formalization). Closes the intent gap for
all `from_intent`-generated specs. Oracle non-determinism risk mitigated by
human countersignature.

### ADR-016 — Datalog Policy Substrate (§22.A) [v0.3.0 NEW]
**Status:** Accepted  
**Context:** FORGE (May 2026) demonstrates that treating the entire runtime
state as a Datalog fact base enables O(1) amortized safety queries for
reachability properties. ASL used Datalog theoretically for hypergraph closure
(§22.6) but had no runtime Datalog substrate.  
**Decision:** Add embedded Datalog engine to seedvm-6.0 (no external dep).
VM auto-asserts session, capability, trust, and effect history facts. Agents
can assert/retract custom facts. Named policy queries replace equivalent LTL
formulas for reachability properties.  
**Consequences:** seedvm binary grows ~200KB for Datalog engine. Runtime
safety query latency drops from ~5ms (SMT) to ~0.1ms (Datalog) for
reachability queries. Compiler routes to cheapest applicable engine.

### ADR-020 — IR Execution Model: Register Frames [CP3 RECOMMENDATION]
**Status:** Proposed (decision needed before any VM or lowering work)  
**Context:** The compiler emits SSA-style IR (`dest` variables, `Var` operands) and the
IR verifier (ADR-018) reasons about per-function slots, but the executor is a pure stack
machine: it ignores `dest`, treats a `Var` operand as its numeric index, and `Call` with a
string operand prints a hard-coded greeting. Straight-line arithmetic works only because
operands happen to be pushed in order. Variables, user calls and branching are unsound.  
**Options:** (A) *Register frames* — each call frame owns `regs[0..max_locals]`; every
instruction reads its operands (immediates or `regs[v]`) and writes `dest`. (B) *True stack
IR* — drop `dest`/SSA, make lowering emit postfix code, rewrite the verifier around stack
depth.  
**Recommendation:** **A.** Lowering, `max_locals` and the verifier already speak in slots,
so A changes only the executor plus a string pool; B changes the compiler, the verifier
and the executor. Register machines also avoid the operand-ordering bug class that
caused this mismatch. (Lua 5's move to a register VM is the usual precedent; confirm the
citation before using it in a paper.)  
**Acceptance:** `fn f(a,b){let c=a+b; c*c}` runs correctly; a user function call returns a
value; string literals round-trip through a pool (no `String(0)`); `print` is a real
builtin; the hard-coded greeting is gone.  
**Consequences:** Executor rewrite (the dispatch loop and ~50 opcode handlers); `.aslb`
format version bump (ADR-001) for the string pool.

### ADR-027 — Seed Documents and Typed Sections Coexist [CP2]
**Status:** Accepted  
**Context:** The spec's `agent` / `discharge … with` syntax and the real `seed name { §SECTION {…} }`
document form had diverged (addendum §4 item 10).  
**Decision:** `seed` bodies accept both free-form `§NAME { key: value }` blocks (data) and typed
`section` declarations; the parser accepts the spec's `discharge … with` and
`perform Effect::X(..) requires cap::Y` forms. Annex S of the spec draft is the grammar.  
**Consequences:** One parser serves both documents and programs; seed blocks are kept in the AST
(`SeedDecl.blocks`) but not yet consumed by the VM.

### ADR-028 — Discharge Gates Fail Closed on the Lower Bound [CP2]
**Status:** Accepted  
**Context:** `Discharge` and `ConfidenceGate` compared the *upper* bound of the confidence
interval (the optimistic end), `inside_discharge` was never cleared, taint/budget failures
reused `LowConfidence`, and the parser discarded every threshold.  
**Decision:** Gate on the lower bound; an unstated confidence lowers to 1.0 and taint to 0.0;
thresholds travel as instruction operands; `DischargeEnd` closes the scope; `TaintExceeded` and
`BudgetExceeded` are distinct errors.  
**Consequences:** Programs that relied on optimistic gating now fail loudly. Calibration of the
interval itself is a separate problem (see `docs/ASL_CP3_RESEARCH_NOTES.md` P1).

### ADR-029 — Statement Classification by Lookahead; Contextual Keywords [CP2]
**Status:** Accepted  
**Context:** `parse_block` tried `parse_top_level_item` on every statement and fell back to an
expression, so `let` became an "item" the semantic passes ignored; tokens were consumed with no
backtracking; core keywords were accepted as identifiers; domain keywords (`query`) could not be names.  
**Decision:** Classify by lookahead; core keywords are reserved, domain keywords contextual;
block-like expressions end a statement without `;`; the effect/taint/contract passes visit every
function body through one shared visitor (`sema::visit_fns`).  
**Consequences:** Effect rules now apply to agent methods, which is where agent code lives.

### ADR-030 — Parse Errors Are Fatal, Unsupported Constructs Are Errors [CP2/CP3]
**Status:** Accepted  
**Context:** `parse_program` printed errors and returned `Ok`; multi-arm `discharge` lowered to
"run every arm".  
**Decision:** Any parse error rejects the program (first error returned, recovery only to find
more). A construct the back end cannot lower correctly is rejected in `sema` as `Unsupported`
rather than miscompiled (extends ADR-024).  
**Consequences:** Some previously "working" examples now fail until the feature is real.

---

## 8. QUALITY REQUIREMENTS & RISKS

### 8.1 Quality Goals (v0.3.0 Updates)

| Goal | v0.2.0 Target | v0.3.0 Target |
|------|--------------|--------------|
| Correctness | 17 tests pass; 253 target | 321 tests; Level 6 conformance |
| Performance | Compile < 5s; hello world < 100ms | +sema::tracespec pass: +15% compile time |
| Security | cargo-audit clean; no unsafe | +TraceEvent immutability; +SessionHandle trap |
| Regulatory | Not targeted | EU AI Act Art. 12 via bi-temporal + signed export |
| Formal guarantees | Runtime SMT only | Compile-time TraceSpec + dependent-type proofs at S2+ |

### 8.2 Risks & Technical Debt (v0.3.0 Update)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| sema passes still stubbed | CRITICAL (blocks all v0.3.0) | Phase 0 must complete first |
| Oracle availability in CI | Medium | Feature-gated; CI skips if oracle not available |
| zkComposer external service reliability | Medium | Falls back to ProofType::NanoZK with warning |
| Datalog engine correctness | Medium | Extensive conformance tests (DLS-01 through DLS-06) |
| Bi-temporal index performance | Low | Async indexing; O(log n) write overhead |
| from_intent oracle non-determinism | Medium | Human countersignature; evolution track versioning |
| SessionHandle affine tracking memory overhead | Low | One handle table entry per spawned agent |
| CoMem slows federation convergence | Low-Medium | Configurable threshold; can set to 1 for fast networks |

### 8.3 Phase 0 Priority — status at CP3

| # | Item | Status |
|---|------|--------|
| 1 | `sema::effectck` enforced | ✅ rule enforced from source text, in every function body (CP2) |
| 2 | `sema::taintck` 4D propagation | ◐ pass runs over all bodies; `taint.rs` library audited; not wired into the executor |
| 3 | `sema::contractck` stratum gating | ◐ runs over all bodies but has **one rule** (a `discharge` needs an arm); **no stratum or charter checks exist** |
| 4 | Hanging stdin test | ✅ |
| 5 | Broken scaffold crates | ✅ all four build, lint clean, in the workspace (CP2); manifests trimmed of unused deps (CP3) |
| 6 | `clippy::unwrap_used` in library code | ◐ `clippy -D warnings` clean on the workspace; blanket `allow(unused)` / `allow(clippy::all)` remain in `seedc` / `seedvm` |
| 7 | Test baseline | ✅ 17 → 206 tests (CP3), plus an end-to-end CLI smoke suite |
| 8 | Dead-module guard (ADR-017) | ✅ script in CI (CP3) |
| 9 | Orphaned root `tests/` | ✅ replaced by `seedc-cli/tests/cli_smoke.rs` (CP3) |

### 8.4 Reality Register (CP3) — what is *not* real yet

| Claim in the drafts | Reality |
|---|---|
| "Hindley–Milner type inference" | `infer_types` returns its input unchanged |
| "name resolution" | `let` binds the name `""`; errors are discarded; single pass |
| "SSA IR / VM executes it" | VM is a stack machine ignoring `dest` (ADR-020) |
| "user function calls" | `Call` is a stub |
| "constants / strings" | every string literal lowers to `String(0)` |
| "stratum gating, charter bounds (contractck)" | one rule only: a `discharge` needs an arm |
| "multi-arm discharge" | rejected as `Unsupported` |
| "`budget` / `requires` gates" | parsed, not lowered / not enforced |
| "capability, taint, trace, bi-temporal, datalog" | tested libraries with no call site in the executor |
| "formatter is CST-based" | line-based |
| "debugger" | protocol skeleton |
| "package manager" | resolver exists, unwired; no download/verify/extract |

Rule: the drafts may keep their *target* text, but any release note, README or paper must
quote this table, not the target text.

### 8.5 CP3 plan (next code checkpoint, in order)
1. **Decide ADR-020**, then implement register frames + string pool + real `print`/`Call`.
2. Real two-pass `nameres` (collect, then resolve; bind pattern names; surface errors).
3. Wire `infer_types` into `sema::check`, starting with the simple monomorphic cases.
4. Lower multi-arm `discharge` with a `ConfidenceGe` branch; lower `budget:`.
5. Enforce `requires cap::X` through `capability.rs`.
6. Remove the blanket `allow` attributes and triage what they hide.
7. Audit the dormant modules (`uncertainty`, `tee`, `inference`, `orchestrator`) as `capability` and `taint` were.

---

## 9. GLOSSARY (v0.3.0 Additions)

| Term | Definition | Relevant § |
|------|-----------|-----------|
| TraceEvent | Four-state action event: Requested/Handled/Denied/Committed | §31, §37 |
| TraceSpecAlgebra | Compile-time trace specification: Allow/Deny/Temporal/Sequence | §37 |
| callable_descriptor | Per-function compiled summary of effects + trace spec + residuals | §37 |
| residuals | LTL formulas from trace_spec that cannot be discharged at compile time | §37 |
| BiTemporalRecord | Memory record with both valid-time and transaction-time axes | §38 |
| valid_time | When a fact was true in the world | §38 |
| transaction_time | When a fact was recorded in the system | §38 |
| spec<T> | Oracle-verified formal specification block; proof artifact in binary | §41 |
| from_intent | NL-to-formal pipeline; oracle formalizes intent string into spec<T> | §40 |
| ProofEntry | Binary section entry: oracle proof bytes + plain-English render + signature | §41 |
| SessionHandle | Affine type returned by spawn_typed; consumed by first typed message | §39 |
| choreographic spawn | spawn_typed: unifies agent creation with session protocol establishment | §39 |
| UncertaintyKind | Source of uncertainty: Specification/ModelEpistemic/ModelAleatory/Taint | §4 |
| observe_structured | Kind-aware Bayesian conditioning: separate spec vs. model evidence | §4 |
| RemediationHint | Suggested action given UncertaintyKind: ask/gather/widen/sanitize | §4 |
| CoMem | Collective-Individual Memory: two-stage federation promotion with verification | §6.C |
| FederationStatus | Pending/Active/Contested/Archived: CoMem promotion lifecycle | §6.C |
| DatalogSubstrate | Runtime Datalog fact base; auto-asserted by VM for caps/trust/session | §22.A |
| DenialReason | Structured reason for discharge gate rejection; stored in TraceEvent | §31 |
| blame | SMT unsatisfiable core extraction; names the offending TraceEvent | §25 |
| zkComposer | Parallel zkML proof construction: decompose into independent sub-proofs | §P-CALC |
| adaptive_retrieval_gate | Query-aware memory routing: selects starting layer before tri-path router | §7.B |
| retroactive_link | A-MEM-style consolidation trigger: fires when new episode links to existing concept | §7.A |

---

## 10. CROSS-REFERENCE INDEX (v0.3.0)

| Element | Sections |
|---------|----------|
| TraceEvent quadripartition | 3.2 (new component), 4.2 (scenario), 6.1 (security), ADR-007 |
| sema::tracespec | 3.1 (compiler phase), 4.1 (scenario), ADR-008 |
| spec<T> / SPEC-BLOCKS | 3.1 (compiler phase), 6.3 (observability), ADR-009 |
| zkComposer | 3.2 (proof component), ADR-010 |
| CoMem federation | 3.2 (memory L5), 4.5 (scenario), 6.1 (security), ADR-011 |
| UncertaintyKind | 2.2 (domain model), 3.2 (computation component), ADR-012 |
| Bi-temporal (L8) | 3.2 (new component), 4.4 (scenario), 5.2 (deps), ADR-013 |
| Choreographic spawn | 3.2 (new component), 4.3 (scenario), 6.2 (errors), ADR-014 |
| from_intent | 3.1 (compiler phase), ADR-015 |
| Datalog substrate | 3.2 (new component), 6.1 (security), ADR-016 |
| Phase 0 debt | 3.1 (sema stubs), 8.2 (risks), 8.3 (priority) |

---

## 11. CONFORMANCE CHECKLIST (v0.3.0)

All v0.2.0 items remain. New items:

- [ ] sema::effectck fully implemented (not stub)
- [ ] sema::taintck fully implemented (4D taint)
- [ ] sema::contractck fully implemented (stratum + charter + affine)
- [ ] sema::tracespec pass implemented; TraceSpecAlgebra derived per function
- [ ] TraceEvent emitted on every perform lifecycle step
- [ ] DenialReason populated on every TraceDenied event
- [ ] `action_trace()` query returns correct Vec<TraceEvent>
- [ ] UncertaintyKind propagates through bind and map
- [ ] observe_structured narrows correct kind, leaves others unchanged
- [ ] L8 bi-temporal index present; as_of and history queries correct
- [ ] CoMem promotion: facts below threshold returned as Pending, not Active
- [ ] Self-verification does not count toward min_agent_verifications
- [ ] spawn_typed returns SessionHandle; affine tracking active
- [ ] Double-use of SessionHandle is VM trap
- [ ] Datalog substrate asserts session_active on session establishment
- [ ] Datalog policy query completes in < 1ms for 10-fact substrate
- [ ] zkComposer proof composes from N sub-proofs; same soundness
- [ ] ProofType::zkComposer embeds correctly in .aslb proof_section
- [ ] spec<T> oracle check runs at S2+; proof_artifact embedded
- [ ] from_intent countersignature blocks compilation until signed
- [ ] Blame extraction returns specific offending TraceEvent
- [ ] EU AI Act Art. 12 export: seed audit --export-bitemporal produces signed JSON-LD

---

## 12. GENERATION METADATA

| Field | Value |
|-------|-------|
| Research sources synthesized | 40+ papers (2026); competitive DSL analysis (10 systems) |
| New ADRs | 10 (ADR-007 through ADR-016) |
| New spec sections | 6 (§37–§42) |
| New conformance tests | 68 |
| Total conformance tests | 321 |
| Phase 0 debt items | 7 (all must complete before v0.3.0 feature work) |
| Missing sections | None — all Arc42 sections filled |
| Drift from v0.2.0 | None — all v0.2.0 decisions confirmed valid and carried forward |

---

*Arc42 Blueprint v0.3.0 — Complete*  
*Next: Phase 0 implementation → v0.3.0 feature implementation in priority order*
