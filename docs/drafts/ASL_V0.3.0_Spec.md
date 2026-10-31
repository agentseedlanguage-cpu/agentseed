> **SUPERSEDED IN PART (2026-10-30).** This draft was written from search snippets and contains claims later found wrong (event lifecycle, TraceSpecAlgebra, CoMem promotion rule, zkComposer speedups, EU AI Act dates, "ETAS has no memory"). Read `docs/ASL_V0_3_0_ADDENDUM_VERIFIED.md` first; where they conflict, the addendum wins.

# Autonomous Systems Language — Specification v0.3.0
**ASL-SPEC-0.3.0 | Edition 2026 | Status: Draft for Review**  
**Author:** Damian Peter Ramsajan  
**Supersedes:** ASL-SPEC-0.2.0 (all addenda included)  
**Research basis:** ASL v0.3.0 Frontier Research Report (2026-10-23)

---

```
╔══════════════════════════════════════════════════════════════════════╗
║  §META-SEED — Unified Agentic Language & Virtual ISA  v0.3.0       ║
╚══════════════════════════════════════════════════════════════════════╝
```

```yaml
seed-id:               uuid:3d4e5f6a-7b8c-9d0e-1f2a-b3c4d5e6f7a8
seed-type:             unified-agentic-language
edition:               2026
stability:             stable
formalism-level:       progressive
safety-level:          verified
composition-model:     category-theoretic
compliance:            ISO/IEC 5230:2029/Final, ISO/IEC TS 42119-2:2025
runtime:               seed-vm v6.0 (virtual ISA with extensions)

# Lifecycle features (v0.1.0 features unchanged)
heartbeat-enabled:              true
dream-cycle-enabled:            true
federation-enabled:             true
evolution-enabled:              true
corrigibility-enabled:          true
capability-tokens-enabled:      true
session-protocols-enabled:      true
temporal-contracts-enabled:     true
provenance-chain-enabled:       true
grammar-strata-enabled:         true
cryptographic-identity:         true

# NEW v0.3.0 feature flags
trace-event-quadripartition:    true   # §TRACE-SPEC: Requested/Handled/Denied/Committed
uncertainty-kind-enabled:       true   # §UNCERTAIN-AXIOMS: UncertaintyKind enum + U7
comem-federation-enabled:       true   # §FEDERATION: CoMem promotion policy
bi-temporal-memory-enabled:     true   # §BI-TEMPORAL: valid-time + transaction-time
spec-blocks-enabled:            true   # §SPEC-BLOCKS: dependent-type spec at S2+
zkcomposer-enabled:             true   # §P-CALC: parallel zkML proof construction
choreographic-spawn-enabled:    true   # §CHOREOGRAPHIC-SPAWN: linear session handles
intent-spec-enabled:            true   # §INTENT-SPEC: NL-to-formal pipeline
adaptive-retrieval-enabled:     true   # §MEMORY-GOVERNANCE: adaptive gating
datalog-substrate-enabled:      true   # §CAPABILITY-TOKENS: full Datalog fact base
blame-extraction-enabled:       true   # §TEMPORAL-CONTRACTS: VIGIL-style blame
trace-spec-algebra-enabled:     true   # §TRACE-SPEC: compile-time algebra at S1+
```

---

> **Reading guide:** Sections §1–§36 carry forward from v0.2.0 with targeted amendments
> noted inline as `[v0.3.0 AMENDMENT]`. Entirely new sections are §37–§42.
> The v0.1.0 and v0.2.0 base text is not repeated in full; this document records
> every normative change and addition. The complete language is the union of
> v0.2.0 and this document, with this document taking precedence on conflicts.

---

## §DESIGN-PRINCIPLES — Updated

All eight principles from v0.1.0 remain. Two new principles are added.

**P9 — Trace completeness is non-negotiable.**  
Every effect attempt — whether permitted, denied, or handled — produces a
`TraceEvent` in the provenance chain. Silent denial is forbidden. An agent
that cannot observe what it was denied cannot reason about its own limits.

**P10 — Specifications are citizens, not comments.**  
At S2+, formal specifications (`spec<T>` blocks) are compiled into the binary
and machine-checked before any amendment is applied. Natural-language intent
is a starting point, not a safety guarantee.

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §1 — LEXICAL GRAMMAR — v0.3.0 Additions                            ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 1.3 Keywords — v0.3.0 Additions

The following keywords are added to the strata noted.

```
# S1 — Trace event quadripartition (NEW v0.3.0)
trace_event, requested, handled, denied, committed
blame, action_trace

# S1 — Uncertainty kind (NEW v0.3.0)
uncertainty_kind, specification_uncertainty, model_epistemic,
model_aleatory, taint_uncertainty, observe_structured

# S1 — Bi-temporal memory (NEW v0.3.0)
valid_time, transaction_time, bi_temporal, as_of

# S1 — Adaptive retrieval (NEW v0.3.0)
adaptive_retrieval, retrieval_gate, fusion_strategy

# S1 — zkComposer (NEW v0.3.0)
zkcomposer, proof_composer, sub_proof, compose_proofs

# S2 — Spec blocks (NEW v0.3.0)
spec, from_intent, oracle, proof_artifact, invariant_block
lean4, dafny_oracle

# S2 — Choreographic spawn (NEW v0.3.0)
choreographic, spawn_typed, session_handle, linear_handle

# S2 — Intent-to-spec (NEW v0.3.0)
from_intent, intent_oracle, formalize, countersign_formalization

# S2 — Datalog policy substrate (NEW v0.3.0)
policy_substrate, datalog_fact, assert_fact, retract_fact,
query_substrate, policy_query

# S3 — CoMem federation (NEW v0.3.0)
comem, promotion_policy, federated_promotion,
min_agent_verifications, anti_homogenization
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §2 — SYNTAX — v0.3.0 New Constructs                                ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 2.A — TraceEvent Expressions (NEW v0.3.0)

```ebnf
trace_event_expression ::= "action_trace" "(" from_expr "," to_expr ")"
                          -- returns Vec<TraceEvent> from provenance index
                          -- filtered by time range

trace_event_query ::= "action_trace"
    "." "filter" "(" trace_event_filter ")"
    ["." "blame" "(" ")" ]
    -- .blame() extracts the offending TraceEvent from a violation

trace_event_filter ::= "requested" | "handled" | "denied" | "committed"
                     | "effect" "(" effect_identifier ")"
                     | "agent" "(" expression ")"
                     | "session" "(" expression ")"
```

### 2.B — Spec Block (NEW v0.3.0, S2+)

```ebnf
spec_block_def ::= "spec" identifier "<" type ">" "{"
    "invariants"     ":" "[" spec_formula {"," spec_formula} "]" ","
    "preconditions"  ":" "[" spec_formula {"," spec_formula} "]" ","
    "postconditions" ":" "[" spec_formula {"," spec_formula} "]" ","
    "oracle"         ":" spec_oracle ","
    "proof_artifact" ":" boolean_literal
    ["," "timeout"   ":" duration_literal]
"}"

spec_formula ::= string_literal   -- formal expression in oracle's language
               | identifier       -- reference to a declared predicate

spec_oracle ::= "lean4" | "dafny_oracle" | "z3"
```

When `proof_artifact: true`, the compiler calls the oracle at build time,
embeds the proof bytes in the `.aslb` binary under a new `proof_section`,
and emits a `spec_verified` entry to the provenance chain.
Oracle timeout defaults to `60s`; hard maximum is `300s`.

### 2.C — from_intent Expression (NEW v0.3.0, S2+)

```ebnf
from_intent_expression ::= "from_intent" "<" type ">" "("
    "intent"           ":" string_literal ","
    "oracle"           ":" spec_oracle ","
    "countersignature" ":" ("required" | "optional") ","
    ["timeout"         ":" duration_literal]
")" "->" spec_block_def
```

Semantics: the compiler calls the oracle with the natural-language `intent`
and the Lean4/Dafny type context for `type`. The oracle returns a candidate
`spec<T>` block. If `countersignature: required`, a human principal must
sign the formalized spec before it is embedded. The signed formalization
is stored in the evolution track alongside the source intent.

### 2.D — Choreographic Spawn (NEW v0.3.0, S2+)

```ebnf
spawn_typed_expression ::= "spawn_typed" "<" global_type_ref "," role_name ">"
    "(" agent_constructor ["," arguments] ")"
    "->" session_handle_type

session_handle_type ::= "SessionHandle" "<" global_type_ref "," role_name ">"
    -- affine: must be used exactly once (compiler enforces)
    -- consumed by: mesh_call, session_send, session_recv, session_close
```

The spawner must hold the dual role in the same global session type.
The compiler verifies this at the `spawn_typed` call site.
Using a `SessionHandle` twice is a compile error at S1+.
Dropping a `SessionHandle` without closing it is a compile error at S2+.

### 2.E — Adaptive Retrieval Gate (NEW v0.3.0)

```ebnf
adaptive_retrieval_gate_config ::= "adaptive_retrieval_gate" "{"
    "inputs"   ":" "[" retrieval_input {"," retrieval_input} "]" ","
    "routing"  ":" "{" retrieval_routing_rule {"," retrieval_routing_rule} "}" ","
    "fusion"   ":" fusion_strategy_config
"}"

retrieval_input ::= "query_urgency" | "context_type" | "confidence_floor"
                  | "session_phase" | "task_complexity"

retrieval_routing_rule ::= identifier ":" predicate_expression

fusion_strategy_config ::= "{"
    "method"                      ":" fusion_method ","
    "normalize_by_layer_confidence" ":" boolean_literal
"}"

fusion_method ::= "attention_weighted" | "confidence_weighted"
               | "recency_weighted"    | "cascade"
```

### 2.F — Datalog Policy Substrate (NEW v0.3.0, S1+)

```ebnf
policy_substrate_def ::= "policy_substrate" "{"
    "facts"    ":" "[" substrate_fact_def {"," substrate_fact_def} "]" ","
    "rules"    ":" "[" datalog_rule {"," datalog_rule} "]" ","
    "queries"  ":" "[" substrate_query_def {"," substrate_query_def} "]"
"}"

substrate_fact_def ::= identifier "(" type {"," type} ")" ";"
                     -- declares a fact relation and its arity/types

datalog_rule ::= head_atom ":-" body_atom {"," body_atom} "."
               -- standard Datalog Horn clause

substrate_query_def ::= identifier "?" ":-" body_atom {"," body_atom} "."
                       -- named query; returns bool or Vec<Tuple>

-- Imperative fact assertion/retraction
assert_fact_expression  ::= "assert_fact" "(" substrate_fact_def_ref "," arguments ")"
retract_fact_expression ::= "retract_fact" "(" substrate_fact_def_ref "," arguments ")"
query_substrate_expression ::= "query_substrate" "(" substrate_query_def_ref ")"
```

The Datalog substrate coexists with the SMT temporal contracts. Safety
properties expressible as reachability queries use the substrate (O(1)
incremental maintenance). Properties requiring temporal ordering use the
SMT solver. The compiler chooses the cheapest applicable method.

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §3 — TYPE SYSTEM — v0.3.0 Amendments                               ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 3.10 — UncertaintyKind (NEW v0.3.0)

`Uncertain<T>` gains a `kind` field distinguishing the *source* of uncertainty.
The kind is propagated through `bind` and `map` alongside the interval.

```
enum UncertaintyKind {
    Specification,                   -- ambiguity in what was asked
    ModelEpistemic,                  -- model lacks knowledge of this domain
    ModelAleatory,                   -- domain is inherently stochastic
    Taint,                           -- uncertainty due to poisoned/unverified input
    Composite(Vec<UncertaintyKind>), -- multiple sources; union semantics
}
```

**Kind propagation rules:**
- `bind(u1 [k1], f → u2 [k2])` → `Composite([k1, k2])` if `k1 ≠ k2`, else `k1`
- `observe_structured(spec_ev, model_ev)` → narrows the matching kind:
  - positive `spec_ev` narrows `Specification` uncertainty
  - positive `model_ev` narrows `ModelEpistemic` uncertainty
  - does not narrow `ModelAleatory` (cannot be reduced by evidence)
- `sanitize(...)` with a `human::review` policy converts `Taint` to `Specification`
  (the human's interpretation of tainted data becomes a spec question)

**Kind-aware discharge thresholds:**  
The discharge gate can now specify per-kind confidence floors:

```
discharge result with {
    confidence: {
        Specification:   0.90,    -- tighter on spec ambiguity
        ModelEpistemic:  0.85,
        ModelAleatory:   0.70,    -- looser: domain is stochastic anyway
        Taint:           0.99,    -- near-certain required for tainted data
    },
    taint: 0.10,
    budget: remaining,
    capability: held,
    proof_verified: true,
} { ... }
```

### 3.11 — MemoryRecord Bi-Temporal Extension (NEW v0.3.0)

```
struct MemoryRecord<T: MemorySchema> {
    value:            T,
    prov:             ProvenanceTag,
    confidence:       Uncertain<Float>,
    stored_at:        Timestamp,           -- transaction time (when recorded)
    valid_from:       Timestamp,           -- valid time start (when true in world)
    valid_until:      Option<Timestamp>,   -- valid time end (None = still true)
    stored_by:        AgentId,
    session:          SessionId,
    merkle_proof:     MerkleProof,
    access_log:       AppendOnly<AccessEntry>,
}
```

`stored_at` is the existing field renamed from `stored_at` for clarity.
`valid_from` / `valid_until` are new. All existing records default to
`valid_from = stored_at`, `valid_until = None` (still valid).

### 3.12 — SessionHandle Type (NEW v0.3.0)

```
SessionHandle<G: GlobalSessionType, R: Role> -- affine type
    -- G: the global session type this handle participates in
    -- R: this agent's role within G
    -- affine: compiler ensures used exactly once (S1+)
    --         or closed with session_close() (S2+)
```

`SessionHandle` is a new agentic type alongside `Session<...>`. A
`SessionHandle` is the result of `spawn_typed`. It is consumed by the
first mesh communication call from the spawner to the spawned agent.

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §4 — UNCERTAIN AXIOMS — v0.3.0 Amendment                           ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 4.A — Axiom U7 — Kind-Aware Conditioning (NEW v0.3.0)

**Statement.** `observe_structured` refines uncertainty along a specific kind
dimension. Conditioning on specification evidence does not reduce model
epistemic uncertainty, and vice versa. Aleatory uncertainty is irreducible
by any evidence.

```
observe_structured(
    spec_evidence:  Bool,    -- resolves specification ambiguity
    model_evidence: Bool,    -- resolves model epistemic uncertainty
    prior: Uncertain<T>[lo, hi, kind]
) : Uncertain<T>[lo', hi', kind']

where:
    if kind == Specification:
        same as observe(spec_evidence, prior)
        kind' = Specification if still ambiguous, else ModelEpistemic or Aleatory
    if kind == ModelEpistemic:
        same as observe(model_evidence, prior)
        kind' unchanged
    if kind == ModelAleatory:
        interval unchanged (aleatory is irreducible)
        kind' = ModelAleatory
    if kind == Taint:
        spec_evidence only applies after sanitize()
        model_evidence applies freely
    if kind == Composite(ks):
        apply kind-specific rules to each component, then re-compose
```

**Rationale.** A tool selection agent uncertain about what the user wants
(Specification) should ask a clarifying question — not gather more data.
A factual lookup agent uncertain about a historical date (ModelEpistemic)
should retrieve more evidence. A weather prediction agent uncertain about
tomorrow's weather (ModelAleatory) cannot reduce uncertainty with more
data — it should widen the action space or defer to a human.

### 4.B — Standard Library Extension for Uncertain<T> (NEW v0.3.0)

```seed
impl<T> Uncertain<T> {
    -- Kind-aware constructor
    fn new_with_kind(value: T, lo: Float, hi: Float,
                     kind: UncertaintyKind) -> Uncertain<T>

    -- Structured conditioning (U7)
    fn observe_structured(self,
        spec_evidence:  Bool,
        model_evidence: Bool,
    ) -> Uncertain<T>

    -- Kind accessor
    fn kind(self) -> UncertaintyKind

    -- Is this uncertainty reducible by more evidence?
    fn is_reducible(self) -> Bool   -- false for ModelAleatory

    -- Suggests the right remediation action
    fn suggest_remediation(self) -> RemediationHint
}

enum RemediationHint {
    AskClarifyingQuestion,          -- for Specification
    GatherMoreEvidence,             -- for ModelEpistemic
    WidenActionSpace,               -- for ModelAleatory
    SanitizeInput,                  -- for Taint
    Composite(Vec<RemediationHint>),
}
```

### Conformance Tests — U7

```
UNC-07: observe_structured(spec=true, model=false) on Specification uncertainty
        narrows interval upward; ModelEpistemic interval unchanged.
UNC-08: observe_structured on ModelAleatory leaves interval unchanged.
UNC-09: is_reducible() returns false for ModelAleatory,
        true for Specification and ModelEpistemic.
UNC-10: suggest_remediation() returns correct RemediationHint per kind.
UNC-11: Kind is preserved through bind: Composite([Spec, ModelEpistemic])
        if two different-kinded uncertainties are composed.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §6 — MEMORY ARCHITECTURE — v0.3.0 Amendments                       ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 6.A — L7 Provenance Index: TraceEvent Records (AMENDMENT)

`ActionKind` in `ProvenanceRecord` is extended:

```seed
enum ActionKind {
    -- All existing variants unchanged ...
    -- NEW v0.3.0:
    TraceRequested,    -- effect was requested but not yet handled
    TraceHandled,      -- effect was intercepted by a handler
    TraceDenied,       -- effect was denied by discharge gate; reason recorded
    TraceCommitted,    -- effect was committed after successful discharge
}
```

`ProvenanceRecord` gains a `denial_reason` optional field:

```seed
struct ProvenanceRecord {
    -- All existing fields unchanged ...
    denial_reason: Option<DenialReason>,  -- NEW: populated when ActionKind == TraceDenied
}

enum DenialReason {
    CapabilityDenied(CapabilityId),
    ConfidenceBelowThreshold { required: Float, actual_lo: Float, actual_hi: Float },
    TaintExceeded { limit: Float, actual: Float },
    BudgetExhausted { budget: u64, requested: u64 },
    ProofUnverified(ProofType),
    ContractViolation(ContractId),
    TrustInsufficient { required: TrustLevel, actual: TrustLevel },
}
```

### 6.B — L8: Bi-Temporal Index (NEW v0.3.0)

```seed
memory_hierarchy {
    -- ... L0 through L7 unchanged ...

    bi_temporal_index: {
        schema:       BiTemporalRecord,
        capacity:     unbounded,
        graphs:       [temporal, causal],
        mutability:   append_only,
        scope:        persistent,
        coherency:    strong,
        cache_tier:   cold,
        provenance:   true,
        merkle:       true,
        protected:    false,
        indexes: {
            valid_time:       btree,
            transaction_time: btree,
            combined:         r_tree,   -- efficient bounding-box queries
        },
    },
}

struct BiTemporalRecord {
    id:               BiTemporalId,
    wrapped_layer:    MemoryLayer,       -- which L0-L7 layer this mirrors
    wrapped_key:      String,
    valid_from:       Timestamp,
    valid_until:      Option<Timestamp>,
    transaction_from: Timestamp,         -- when this version was recorded
    transaction_until: Option<Timestamp>,-- when this version was superseded
    value_snapshot:   JsonValue,         -- snapshot of value at transaction_from
    prov:             ProvenanceTag,
}
```

**Bi-temporal API:**

```seed
-- Retrieve what the agent believed at transaction_time T
-- about the world state at valid_time V
mem.as_of(
    key:              String,
    valid_time:       Timestamp,
    transaction_time: Timestamp,
) -> Option<BiTemporalRecord>

-- Get the full history of a key (all versions across both time axes)
mem.history(
    key:             String,
    valid_range:     Option<(Timestamp, Timestamp)>,
    transaction_range: Option<(Timestamp, Timestamp)>,
) -> Vec<BiTemporalRecord>

-- Correct a past fact (retroactive update)
-- Creates new transaction record; does NOT modify old records
mem.correct(
    key:         String,
    valid_from:  Timestamp,
    new_value:   T,
    correction_reason: String,
) -> Result<BiTemporalId, MemoryError>
```

**Regulatory note.** `mem.as_of()` is the primary API for EU AI Act Article 12
(Record Keeping) compliance. External auditors can reconstruct any decision's
information basis by querying `(valid_time = decision_time, transaction_time = decision_time)`.

### 6.C — L5 Federated Memory: CoMem Promotion Policy (AMENDMENT)

`FederatedFact` schema extended:

```seed
struct FederatedFact {
    -- All existing fields unchanged ...
    verification_count:  u32,                -- NEW: cross-agent verification count
    promoting_agents:    Vec<AgentId>,        -- NEW: agents that verified this fact
    federation_status:   FederationStatus,    -- NEW: replaces implicit Active assumption
}

enum FederationStatus {
    Pending,    -- verification_count < min_agent_verifications
    Active,     -- verification_count >= threshold; visible to all agents
    Contested,  -- conflicting verification outcomes; surfaces as MVR
    Archived,   -- retracted or superseded
}
```

New configuration block on L5:

```seed
federated_promotion_policy: {
    strategy:                comem,
    min_agent_verifications: 3,        -- fact must be verified by 3 distinct agents
    pruning: {
        method:    usage_aware_rolling,
        window:    30d,
        min_usage: 1,                  -- prune facts unused in 30d
    },
    anti_homogenization: {
        enabled:                   true,
        preserve_specialist_roles: true,
        max_overlap_pct:           0.30, -- no fact's content may overlap >30%
                                          -- with specialist agent's private memory
    },
}
```

**Verification semantics.** An agent verifies a `Pending` fact by calling
`mem.verify_federated_fact(fact_id)`. Verification requires the agent to
independently derive a consistent result for the fact's predicate/object pair
from its own memory layers. The VM records the verifying agent's identity and
timestamp. When `verification_count` reaches `min_agent_verifications`, status
transitions to `Active`.

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §7 — MEMORY GOVERNANCE — v0.3.0 Amendments                         ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 7.A — Consolidation Trigger Extension (AMENDMENT)

```ebnf
consolidation_trigger ::=
    reinforcement_count >= integer_literal
  | time_interval duration_literal
  | session_end
  | importance_score >= float_literal            -- NEW v0.3.0
  | idle_window duration_literal                 -- NEW v0.3.0
  | retroactive_link_detected                    -- NEW v0.3.0 (A-MEM style)
  | composite_trigger "(" consolidation_trigger
                    {"," consolidation_trigger} ")" -- NEW: any-of semantics
```

**`importance_score`** is computed as:
```
importance = access_frequency * recency_weight * confidence.hi * salience_bonus
```
where `salience_bonus` is 1.0 for most episodes and elevated (configurable,
default 2.0) for episodes tagged with `EpisodeKind::UserInteraction` or
`EpisodeKind::EvolutionEvent`.

**`retroactive_link_detected`** fires when a new episodic entry references
(by semantic similarity ≥ 0.85) an existing semantic concept. On trigger:
1. The existing semantic concept's `attributes` map is re-evaluated
2. New attributes derived from the linking episode are merged
3. The concept's `confidence` is re-computed with Bayesian update
4. A new `GraphEdge` is added between the episode and the concept
5. Provenance records both the original concept version and the update

### 7.B — Adaptive Retrieval Gate (NEW v0.3.0)

The adaptive retrieval gate runs *before* the tri-path router. It selects
the starting layer and fusion strategy for a given query.

```seed
memory_governance {
    -- ... existing tri-path router config unchanged ...

    adaptive_retrieval_gate: {
        inputs: [query_urgency, context_type, confidence_floor, session_phase],

        routing: {
            working_direct:   query_urgency > 0.8 && confidence_floor > 0.9,
            episodic_first:   context_type == temporal || context_type == causal,
            semantic_first:   context_type == factual  || context_type == relational,
            procedural_first: context_type == skill    || context_type == workflow,
            full_cascade:     default,
        },

        fusion_strategy: {
            method:                        attention_weighted,
            normalize_by_layer_confidence: true,
            confidence_floor_cutoff:       0.30, -- layers below this threshold excluded
        },
    },
}
```

The adaptive gate complements (does not replace) the System 1 / System 2
dual-process gate (§9). The dual-process gate decides *depth* (fast vs. full
traversal); the adaptive gate decides *starting point* (which layer to probe
first).

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §22 — CAPABILITY TOKENS — v0.3.0 Amendment: Datalog Policy Substrate║
╚══════════════════════════════════════════════════════════════════════╝
```

### 22.A — Datalog Policy Substrate (NEW v0.3.0)

The capability hypergraph closure (§22.6) used Datalog equivalence as a
theoretical justification. v0.3.0 makes the Datalog substrate a first-class
runtime object. Every agent has an active policy substrate — a typed
vocabulary of facts describing the current execution state. Safety properties
that are reachability queries over session state are evaluated against the
substrate rather than the SMT solver.

**Fact kinds automatically asserted by the VM:**

```
-- Session facts
session_active(session_id, agent_id, role_name)
session_authenticated(session_id, principal_id, timestamp)
session_consent_given(session_id, consent_kind, principal_id, timestamp)

-- Capability facts
capability_held(agent_id, cap_id, effect_type)
capability_delegated(from_agent, to_agent, cap_id, timestamp)
capability_revoked(cap_id, revoker_id, timestamp)

-- Trust facts
trust_level(agent_id, level)             -- Untrusted / Verified / Trusted / SystemCore
composition_trust(agent_a, agent_b, meet_level)

-- Effect history facts
effect_performed(agent_id, effect_type, timestamp)
effect_denied(agent_id, effect_type, denial_reason, timestamp)

-- Provenance facts
data_sourced_from(prov_id, source_kind)
data_taint_level(prov_id, taint_influence)
```

**Example policy expressed in Datalog (replaces equivalent LTL formula):**

```
-- "ReadUserData requires prior authentication in this session"
authorized_data_read(AgentId, SessionId) :-
    session_active(SessionId, AgentId, _),
    session_authenticated(SessionId, _, _),
    capability_held(AgentId, _, "ReadUserData").

-- Query: is this agent authorized?
authorized? :- authorized_data_read(self_agent_id, current_session_id).
```

The compiler chooses Datalog for policies whose predicates are ground facts
(no temporal quantification over unbounded futures). Policies with `G`, `F`,
or `U` operators still use the SMT solver.

### 22.B — Conformance Tests (Datalog Substrate)

```
DLS-01: VM asserts session_active fact on session establishment;
        retracted on session_close.
DLS-02: Datalog policy query authorized? returns false when
        session_authenticated fact is absent.
DLS-03: Capability revocation retracts capability_held and asserts
        capability_revoked within one VM tick.
DLS-04: Datalog query on 10-fact substrate completes in < 1ms.
DLS-05: Datalog substrate coexists with SMT temporal contracts;
        compiler routes to correct engine per policy type.
DLS-06: policy_substrate declaration is idempotent: asserting an
        already-present fact is a no-op.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §24 — SESSION PROTOCOLS — v0.3.0 Amendment: Choreographic Spawn    ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 24.A — Choreographic Spawn Semantics (NEW v0.3.0)

`spawn_typed` is the v0.3.0 replacement for the combination of `spawn` +
subsequent session establishment. It unifies agent creation with protocol
participation in a single expression.

```seed
-- Old pattern (v0.2.0):
let worker = spawn Searcher(caps);
let session = session_establish(worker, SearchProtocol);
mesh_call<SearchProtocol>(worker, query)?;

-- New pattern (v0.3.0):
let handle: SessionHandle<SearchProtocol, Coordinator> =
    spawn_typed<SearchProtocol, Worker>(Searcher, caps);
-- handle is affine: the compiler tracks its consumption
let result = handle ~> query;      -- typed send, consumes handle
```

**Typing rule:**

```
G: GlobalSessionType
project(G, Worker) = local_Worker
project(G, Coordinator) = local_Coordinator
dual(local_Worker) = local_Coordinator      -- enforced at definition
Coordinator holds the dual local type
─────────────────────────────────────────────────────────────────────
spawn_typed<G, Worker>(constructor, caps)
    : SessionHandle<G, Coordinator>           -- spawner gets Coordinator handle
```

The spawned agent's type system automatically places it in the `Worker`
role. Both parties are checked against the global type `G` at compile time.
Dropping a `SessionHandle` without closing it is:
- A warning at S1
- A compile error at S2+

### 24.B — Conformance Tests (Choreographic Spawn)

```
CSP-01: spawn_typed returns SessionHandle<G, Role>; type system verifies
        spawner holds the dual role.
CSP-02: Using a SessionHandle twice is a compile error at S1+.
CSP-03: Dropping a SessionHandle without close is compile error at S2+.
CSP-04: Illegal agent topology (role mismatch in global type) is a parse error.
CSP-05: spawn_typed with role not declared in GlobalType is a type error.
CSP-06: SessionHandle close with incomplete local type sequence is a type error.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §25 — TEMPORAL CONTRACTS — v0.3.0 Amendment: Blame Extraction      ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 25.A — VIGIL-Style Blame Extraction (NEW v0.3.0)

When a temporal contract violation is detected, the SMT solver now returns
a **blame term** — the specific `TraceEvent` that caused the violation —
rather than only logging the contract name.

```seed
struct ContractViolation {
    contract_id:    ContractId,
    formula:        LTLFormula,          -- the violated subformula
    blame_event:    TraceEvent,          -- the specific offending action
    trace_prefix:   Vec<TraceEvent>,     -- the trace leading to violation
    timestamp:      Timestamp,
    enforcement:    EnforcementAction,
}

-- ContractViolation is surfaced as an effect:
effect ContractMonitor {
    violation: (ContractViolation) -> EnforcementResponse
}
```

The blame term is the unsatisfiable core of the SMT check: the minimal
set of trace events that, together, constitute a bad prefix of the formula.
For a formula `G(A → O(B))` violated by performing `A` without prior `B`,
the blame term is the specific `Committed(A, ...)` event at the offending
position.

### 25.B — TraceEvent Integration with Temporal Contracts (AMENDMENT)

Temporal contract formulas may now reference `TraceEvent` kinds:

```
-- Extended ltl_expr to include trace event predicates:
ltl_expr ::=
    ... (existing) ...
  | "Requested" "(" effect_identifier ")"      -- NEW v0.3.0
  | "Handled"   "(" effect_identifier ")"      -- NEW v0.3.0
  | "Denied"    "(" effect_identifier ")"      -- NEW v0.3.0
  | "Committed" "(" effect_identifier ")"      -- NEW v0.3.0
```

Example — "no effect is silently lost; every requested effect is
eventually committed or denied":

```seed
temporal_contract no_silent_loss {
    formula: G(Requested(E) -> F(Committed(E) || Denied(E))),
    violation_response: halt_and_quarantine,
}
```

### 25.C — Updated Conformance Tests

```
TMP-09: Violation report includes blame_event naming the specific offending
        TraceEvent; not just the contract name.
TMP-10: no_silent_loss template: Requested event without eventual
        Committed or Denied fires violation within one tick.
TMP-11: Blame extraction completes within 2ms overhead over base SMT check.
TMP-12: trace_prefix in violation report is verifiable against
        the provenance chain (Merkle-proofable).
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §P-CALC — PROOF-CARRYING COMPUTATION — v0.3.0 Amendment            ║
╚══════════════════════════════════════════════════════════════════════╝
```

### P-CALC.A — ProofType::zkComposer (NEW v0.3.0)

```ebnf
proof_type ::= "ProofType::None"
             | "ProofType::NanoZK"
             | "ProofType::ZkAgent"
             | "ProofType::JoltAtlas"
             | "ProofType::ReceiptHMAC"
             | "ProofType::DeterministicReplay"
             | "ProofType::TEEAttestation"
             | "ProofType::zkComposer"      -- NEW v0.3.0
```

`zkComposer` decomposes the zkML proof into independent sub-proofs, one per
subset of contiguous model layers, enabling parallel proof generation.
Same cryptographic soundness guarantees as monolithic proofs; no extra
linking proofs; no changes to underlying cryptographic primitives.

**Configuration:**

```seed
proof_composer_config ::= "{"
    "parallelism"          ":" integer_literal ","  -- worker threads for sub-proofs
    "composition_strategy" ":" composition_strategy ","
    "layer_partition"      ":" ("auto" | "[" integer_literal {"," integer_literal} "]")
"}"

composition_strategy ::= "sequential" | "parallel" | "adaptive"
    -- adaptive: parallel when num_layers > threshold, sequential otherwise
```

**Tier recommendation update:**

| Tier | Proof Type | Latency | Use Case |
|------|-----------|---------|----------|
| T1 | ReceiptHMAC | < 15ms | Interactive, high-frequency |
| T2 | DeterministicReplay | ~100ms | Consensus-speed verification |
| T3 | NanoZK | ~24ms | Single-call high-value decisions |
| T4 | zkComposer | seconds (parallel) | Multi-step pipelines (RECOMMENDED for `think::deep`+) |
| T5 | ZkAgent | minutes | Full pipeline audit, dispute resolution |

`zkComposer` is the recommended proof type for `think::deep` and
`think::exhaustive`. The compiler emits a warning when `think::deep`
is used with `ProofType::NanoZK` at S2+.

### P-CALC.B — Conformance Tests (zkComposer)

```
ZKC-01: zkComposer proof for 3-stage pipeline generates 3 independent
        sub-proofs; composition verifies correctly.
ZKC-02: zkComposer with parallelism=4 completes in < 25% of sequential
        NanoZK time for equivalent 4-stage model.
ZKC-03: Sub-proof failure in one layer causes overall proof to fail;
        composition does not hide partial failures.
ZKC-04: zkComposer proof embeds correctly in .aslb binary proof_section.
ZKC-05: External verifier validates zkComposer proof without access to
        sub-proof internals.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §31 — PROVENANCE CHAIN — v0.3.0 Amendment: TraceEvent Quadripartition║
╚══════════════════════════════════════════════════════════════════════╝
```

### 31.A — TraceEvent Type (NEW v0.3.0)

```seed
enum TraceEvent {
    Requested  { effect: EffectId, agent: AgentId, ts: Timestamp },
    Handled    { effect: EffectId, handler: HandlerId, agent: AgentId, ts: Timestamp },
    Denied     { effect: EffectId, agent: AgentId,
                 reason: DenialReason, ts: Timestamp },
    Committed  { effect: EffectId, agent: AgentId,
                 prov_id: ProvenanceId, ts: Timestamp },
}
```

**Lifecycle guarantee (normative):**  
Every `perform` expression produces **exactly one** `Requested` event.  
Every `Requested` is followed by **exactly one** of:
- `Handled` (a handler intercepted the effect), then one of:
  - `Committed` (discharge succeeded after handler)
  - `Denied` (discharge failed even after handler)
- `Committed` (discharge succeeded directly)
- `Denied` (discharge failed; no handler)

This invariant is enforced by the VM and verified by the conformance test
`PRV-09`.

### 31.B — Action Trace API (NEW v0.3.0)

```seed
-- Query the action trace for a time range
mem.action_trace(
    from: Timestamp,
    to:   Timestamp,
) -> Vec<TraceEvent>

-- Filter and blame extraction
mem.action_trace(from, to)
    .filter(TraceEventKind::Denied)
    .filter(effect: Effect::NetworkCall)
    .blame()     -- returns the first Denied event that explains a violation
```

### 31.C — Updated Conformance Tests

```
PRV-09: Every Requested TraceEvent is followed by exactly one of
        Handled, Committed, or Denied — never by another Requested
        for the same effect ID.
PRV-10: Denied TraceEvent carries a DenialReason with enough detail
        to reproduce the discharge gate decision.
PRV-11: action_trace().blame() returns the earliest Denied event
        causally responsible for a given violation report.
PRV-12: TraceEvent records are Merkle-verifiable alongside regular
        ProvenanceRecord entries.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §37 — TRACE-SPEC — Compile-Time Trace Specification Algebra (NEW)  ║
╚══════════════════════════════════════════════════════════════════════╝
```

**§TRACE-SPEC**

The Trace-Spec Algebra provides compile-time verification of action traces,
complementing §25 (runtime SMT temporal contracts). Where temporal contracts
verify properties at runtime over observed traces, the `TraceSpecAlgebra`
compiles agent code into a `callable descriptor` — a summary of which
effects the agent *may* request, *must* request, *must not* request, and
*when* — checkable statically. Properties verifiable at compile time are
removed from the runtime SMT check, reducing enforcement overhead.

Grounded in: ETAS (arXiv:2607.17780, Tan et al. 2026). Spec algebra
adapted to ASL's effect system and capability token model.

### 37.1 — TraceSpecAlgebra

```
TraceSpecAlgebra ::=
    Allow(EffectSet)                        -- these effects may be requested
  | Deny(EffectSet)                         -- these effects must never be requested
  | Temporal(LTLFormula)                    -- temporal constraint (residual for SMT)
  | Sequence(TraceSpecAlgebra, TraceSpecAlgebra)  -- ordered composition
  | Choice(TraceSpecAlgebra, TraceSpecAlgebra)    -- either branch
  | Star(TraceSpecAlgebra)                  -- zero or more repetitions
  | Top                                     -- any trace (no constraint)
  | Bottom                                  -- no trace (contradiction; compile error)
```

`Bottom` in a derived spec is a **compile-time error** — it means the
function's declared effects are structurally inconsistent with its declared
policy.

### 37.2 — Callable Descriptor

Every function and agent method at S1+ has a **callable descriptor**
compiled from its type signature, effect row, capability annotations,
and any inline `trace_spec` blocks:

```
callable_descriptor ::= {
    name:           String,
    effect_row:     EffectSet,
    trace_spec:     TraceSpecAlgebra,
    residuals:      Vec<LTLFormula>,   -- handed to runtime SMT
    capabilities:   CapabilitySet,
}
```

The `residuals` are temporal formulas that could not be discharged at
compile time (because they depend on runtime values). They are registered
with the SMT enforcement engine at function entry.

### 37.3 — trace_spec Annotation Syntax

```ebnf
trace_spec_annotation ::= "#[trace_spec(" trace_spec_body ")]"

trace_spec_body ::=
    "allow"    "(" effect_list ")"
  | "deny"     "(" effect_list ")"
  | "sequence" "(" trace_spec_body "," trace_spec_body ")"
  | "temporal" "(" ltl_formula ")"
  | "any"
```

Example:

```seed
#[trace_spec(sequence(
    allow(Effect::Authenticate),
    allow(Effect::ReadUserData),
    deny(Effect::WriteUserData),
))]
fn read_only_user_session(user_id: UserId) -> Uncertain<UserProfile>
    ! {Effect::Authenticate, Effect::ReadUserData}
{
    // Compiler verifies this function cannot request WriteUserData
    // because it is not in the effect row AND is in the deny spec.
    ...
}
```

### 37.4 — Compilation Pass: sema::tracespec

The new compilation pass `sema::tracespec` runs after `sema::effectck`
and before `lowering`. It:

1. Derives `TraceSpecAlgebra` from every function's annotations and effect row
2. Checks for `Bottom` — compile error if found
3. Extracts `residuals` — LTL formulas passed to runtime enforcement
4. Writes `callable_descriptor` to the IR symbol table

### 37.5 — Conformance Tests

```
TSA-01: Function with deny(E) in trace_spec that also lists E in its
        effect row is a compile error.
TSA-02: sequence(allow(A), allow(B)) derived spec: compiler rejects code
        that requests B before A in any control-flow path.
TSA-03: Residual LTL formulas extracted from trace_spec are registered
        with the SMT engine at function entry; verified by TMP-01 tests.
TSA-04: Top spec (no annotation) compiles without error; no residuals.
TSA-05: Bottom spec (contradiction between effect row and deny list) is
        a compile error with diagnostic naming the contradicting effects.
TSA-06: sema::tracespec pass completes in O(n log n) in the number of
        effect annotations.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §38 — BI-TEMPORAL — Bi-Temporal Memory Full Specification (NEW)    ║
╚══════════════════════════════════════════════════════════════════════╝
```

**§BI-TEMPORAL**

Bi-temporal memory tracks two independent time axes for every fact:
**valid time** (when was this true in the world?) and **transaction time**
(when was this recorded in the system?). This enables agents to answer:
"What did I know, and when did I know it?" — the fundamental question
for regulatory audit, retrospective analysis, and correction of past errors.

Grounded in: Snodgrass & Ahn (1985) bi-temporal model; ArqonDB (2026);
Semantica / Hawksight-AI (2026); EU AI Act Article 12.

### 38.1 — Design Principles

1. **Immutability of the transaction record.** Once a fact is recorded at a
   transaction time, it is never modified. Corrections create new records.
2. **Valid time is agent-asserted.** The agent declares when a fact was
   true in the world; the VM records when the agent declared this.
3. **Retroactive corrections are first-class.** `mem.correct()` creates a new
   transaction record; the old record's `transaction_until` is set to now.
4. **Queries are point-in-time or range queries.** `mem.as_of(v, t)` returns
   the record valid at world-time `v` as the agent believed at system-time `t`.

### 38.2 — Bi-Temporal Query Semantics

```
as_of(key, valid_time V, transaction_time T):
    find records where:
        valid_from   <= V <= (valid_until or ∞)
        transaction_from <= T <= (transaction_until or ∞)
    return the record, or None if no such record exists

history(key, valid_range [V1,V2], transaction_range [T1,T2]):
    find all records with any overlap with both ranges
    order by (valid_from ASC, transaction_from ASC)
```

### 38.3 — EU AI Act Compliance Mapping

| Article | Requirement | ASL Mechanism |
|---------|-------------|---------------|
| Art. 12 | Record-keeping of AI system data | L8 bi-temporal index + signed export |
| Art. 13 | Transparency about AI decision basis | `mem.as_of(decision_time, decision_time)` |
| Art. 14 | Human oversight — understanding decisions | `action_trace()` + `mem.history()` |
| Art. 17 | Quality management — corrections | `mem.correct()` + retroactive records |

### 38.4 — Conformance Tests

```
BIT-01: mem.as_of(key, V, T) returns the record with greatest valid_from <= V
        and greatest transaction_from <= T; None if no such record.
BIT-02: mem.correct() creates new record without modifying old record's
        value; old record's transaction_until is set to correction timestamp.
BIT-03: mem.history() returns all non-overlapping valid-time versions of a key
        in valid_from ascending order.
BIT-04: Export of bi-temporal records as signed JSON-LD complies with
        EU AI Act Art. 12 retention requirements.
BIT-05: Bi-temporal index does not affect normal mem.get() / mem.store() latency
        (async indexing; < 1ms overhead per write).
BIT-06: mem.as_of() for a key that was never valid at (V, T) returns None
        and logs a miss to the provenance index.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §39 — CHOREOGRAPHIC-SPAWN — Linear Session-Typed Spawn (NEW)       ║
╚══════════════════════════════════════════════════════════════════════╝
```

**§CHOREOGRAPHIC-SPAWN**

Choreographic spawn unifies agent creation with protocol participation.
When an agent spawns a sub-agent, it simultaneously establishes the
communication protocol that will govern their interaction. The result is
a `SessionHandle` — an affine type that must be consumed exactly once —
that carries the session type and role as compile-time proof that both
parties are protocol-compatible.

Grounded in: 007 meta-language (hyperpolymath, 2026); Mordido & Pérez 2025
(session types); Tracking Capabilities for Safer Agents (arXiv:2603.00991).

### 39.1 — Motivation

Without choreographic spawn, multi-agent bugs arise from:
1. Spawning an agent then forgetting to establish a session (leak)
2. Establishing a session with the wrong role (type mismatch at runtime)
3. Using the wrong protocol with the right agent (silent semantic mismatch)

Choreographic spawn makes all three impossible to express. Illegal
topologies are parse errors.

### 39.2 — Full Specification

```seed
-- Spawner calls:
let handle: SessionHandle<TaskProtocol, Coordinator> =
    spawn_typed<TaskProtocol, Worker>(
        constructor: AnalystAgent,
        caps:        [cap::read_memory, cap::network_read],
        config:      analyst_config,
    );

-- The spawned AnalystAgent automatically starts in the Worker role.
-- The compiler verifies:
--   project(TaskProtocol, Coordinator) is the local type of the spawner
--   project(TaskProtocol, Worker)      is the local type of AnalystAgent
--   dual(project(TaskProtocol, Worker)) == project(TaskProtocol, Coordinator)

-- The handle is used exactly once:
let result: Uncertain<Analysis> = handle ~> TaskRequest { ... };
-- handle is now consumed; re-use is a compile error

-- session_close is called implicitly when handle goes out of scope at S2+
-- At S1, session_close must be called explicitly:
session_close(handle);  -- S1 only; S2+ auto-close on scope exit
```

### 39.3 — Sub-Agent Capability Containment

When `spawn_typed` passes `caps` to the sub-agent, the compiler verifies:

```
caps_sub ⊆ caps_parent
```

The parent cannot grant more capability than it holds. This is the
same rule as §22.2 (delegation / attenuation) applied to spawn.

### 39.4 — Conformance Tests

See §24.B (CSP-01 through CSP-06). Additional tests:

```
CSP-07: Sub-agent caps strictly contained in parent caps; compiler
        rejects any cap in spawn_typed not held by parent.
CSP-08: session_close at S1 on unconsumed handle sends end message
        to sub-agent; sub-agent transitions to end local type.
CSP-09: S2+ compiler inserts session_close at scope exit for all
        SessionHandle values; no explicit call needed.
CSP-10: spawn_typed with a global type that has no projection for
        the named role is a compile error, not a runtime error.
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §40 — INTENT-SPEC — Natural Language to Formal Specification (NEW) ║
╚══════════════════════════════════════════════════════════════════════╝
```

**§INTENT-SPEC**

Intent-Spec closes the "intent gap" — the chasm between what a developer or
principal *means* and what the system formally enforces. A natural-language
intent string is formalized into a machine-checkable `spec<T>` block by an
oracle, with mandatory human countersignature on the formalization before it
is embedded in the binary.

Grounded in: Intent Formalization (arXiv:2603.17150, 2026); Lean4Agent
(arXiv:2606.06523); NFV (arXiv:2608.21516); FormalJudge (arXiv:2602.11136).

### 40.1 — The Intent Gap

The intent gap has two failure modes:

1. **Under-specification**: the formal spec is weaker than the intent.
   The system enforces something, but not everything the developer meant.
   Example: intent = "never expose PII"; spec = "deny(WriteExternalFile)" —
   network exfiltration is unguarded.

2. **Over-specification**: the formal spec is stronger than the intent.
   The system blocks legitimate actions. Example: intent = "require authentication
   before reading user data"; spec = `G(Committed(Read) → O(Committed(Auth)))`
   but the authentication happened in a prior session.

`from_intent` addresses both by making the formalization explicit,
human-reviewed, and version-controlled.

### 40.2 — from_intent Semantics

```
from_intent<MarketAnalysis>(
    intent:           "ensure no single position exceeds 5% of total portfolio value",
    oracle:           lean4,
    countersignature: required,
    timeout:          120s,
) -> spec<MarketAnalysis>
```

**Step 1 — Oracle formalization.**  
The oracle receives the intent string, the Lean 4 / Dafny type context for
`MarketAnalysis`, and the agent's declared capability set. It returns a
candidate `spec<MarketAnalysis>` block with invariants, preconditions, and
postconditions expressed in the oracle's formal language.

**Step 2 — Human review.**  
When `countersignature: required`, the candidate spec is surfaced to the
principal via `Effect::AskPrincipal`. The principal reviews the formalization
in a human-readable rendering (the oracle generates both formal and plain-English
explanations). The principal signs the formalization with their Ed25519 key.

**Step 3 — Compilation.**  
The countersigned spec is compiled into the `spec<T>` block, the oracle checks
it, and the proof artifact is embedded in the binary. The evolution track
records: original intent string, formalized spec, oracle version, principal
signature, and timestamp.

**Step 4 — Ongoing.** If the agent self-evolves and the affected section
changes, the `from_intent` spec must be re-checked. If the new code no longer
satisfies the spec, the amendment is blocked (§29 amendment gate already
requires spec checks at S2+; this tightens it).

### 40.3 — oracle::render (Plain-English Explanation)

```seed
spec_block.render() -> String
    -- returns a plain-English explanation of the spec
    -- generated by the oracle alongside the formal spec
    -- stored in the .aslb binary alongside the proof artifact
    -- surfaced in audit reports and human review prompts
```

Example render for the position spec:
> "This specification guarantees that, immediately after any market position
> is taken (postcondition), the total value of that position divided by the
> total portfolio value is at most 0.05 (5%). This is checked by the Lean 4
> oracle and embedded as a proof in the compiled binary."

### 40.4 — Conformance Tests

```
INT-01: from_intent produces a spec<T> block verifiable by the oracle;
        proof artifact embedded in .aslb binary proof_section.
INT-02: from_intent with countersignature: required blocks compilation
        until principal signature is received.
INT-03: Rendered plain-English explanation is stored alongside the
        formal spec in the binary.
INT-04: Amendment that violates the from_intent spec is blocked at S2+
        amendment gate.
INT-05: from_intent oracle call timeout surfaces InferenceError::Timeout;
        compilation fails with informative diagnostic.
INT-06: Two agents with identical intent strings produce semantically
        equivalent spec<T> blocks (oracle determinism test).
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §41 — SPEC-BLOCKS — Dependent-Type Specification Layer (NEW)       ║
╚══════════════════════════════════════════════════════════════════════╝
```

**§SPEC-BLOCKS**

`spec<T>` blocks are machine-checked formal specifications attached to
agent functions, sections, and amendments. They are the dependent-type
layer of ASL — the difference between "this agent is designed to be safe"
and "this agent is *proven* safe with respect to these properties."

Grounded in: Lean4Agent (arXiv:2606.06523); NFV (arXiv:2608.21516);
VeriGuard (arXiv:2510.05156); FormalJudge (arXiv:2602.11136).

### 41.1 — Spec Block at Stratum S2+

```seed
spec safe_position_sizing<PositionDecision> {
    invariants: [
        "position.size / portfolio.total_value <= 0.05",
        "position.size > 0",
    ],
    preconditions: [
        "portfolio.total_value > 0",
        "market.is_open == true",
    ],
    postconditions: [
        "∀ p in portfolio.positions: p.size / portfolio.total_value <= 0.05",
    ],
    oracle:        lean4,
    proof_artifact: true,
    timeout:       90s,
}
```

### 41.2 — Attaching Specs to Functions

```seed
#[spec(safe_position_sizing)]
fn decide_position(
    signal: Uncertain<PriceSignal>,
    portfolio: Portfolio,
) -> Uncertain<PositionDecision>
    ! {Effect::ReadMarketData}
{
    ...
}
```

The compiler verifies at build time that the function body satisfies the
pre/post/invariant conditions in `safe_position_sizing` by calling the
oracle with the function's body lowered to the oracle's IR.

### 41.3 — Spec Blocks in Amendment Pipeline

At S2+, every `evolve` amendment that modifies a `#[spec(...)]`-annotated
function must include a new or updated spec block. The amendment gate (§29.4)
is extended:

```
amendment_gate {
    nominal_simulation:      required,
    adversarial_simulation:  required,
    spec_check: {             -- NEW v0.3.0
        required_at:    S2_and_above,
        oracle:         lean4,
        proof_artifact: true,
        on_fail:        reject_amendment,
    },
    sign_off: [human_principal, independent_auditor],
}
```

An amendment that passes simulation but fails the oracle check is rejected.
An amendment that has no spec block on a previously-spec'd function is rejected.

### 41.4 — Proof Artifact Binary Section

The `.aslb` binary format gains a new section:

```
aslb_proof_section ::= {
    magic:         [4]u8,          -- 0x50 'R' 'F' 'S'
    version:       u32,
    entry_count:   u32,
    entries:       [entry_count]ProofEntry,
}

ProofEntry ::= {
    spec_id:       Uuid,
    oracle:        u8,             -- 0=lean4, 1=dafny, 2=z3
    proof_bytes:   [proof_len]u8,
    render_utf8:   [render_len]u8, -- plain-English explanation
    signed_by:     Ed25519PublicKey,
    signature:     Ed25519Signature,
}
```

External auditors can verify any `ProofEntry` without running the oracle:
`seed audit --verify-spec <agent_id> <spec_id>`.

### 41.5 — Conformance Tests

```
SPC-01: Function with #[spec(S)] where S is unsatisfiable
        (oracle returns UNSAT) is a compile error.
SPC-02: Amendment modifying #[spec]-annotated function without
        updated spec is a compile error at S2+.
SPC-03: ProofEntry in .aslb binary verifies with agent's Ed25519 key.
SPC-04: seed audit --verify-spec completes without oracle access (offline).
SPC-05: Plain-English render is present and non-empty for every ProofEntry.
SPC-06: Spec block with postcondition that contradicts an invariant
        produces Bottom in TraceSpecAlgebra; compile error.
SPC-07: from_intent-generated spec produces identical ProofEntry as
        manually authored equivalent spec (oracle determinism).
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §42 — STANDARD LIBRARY — v0.3.0 Module Additions                   ║
╚══════════════════════════════════════════════════════════════════════╝
```

The following modules are added to `seed::` in v0.3.0.  
All v0.2.0 modules remain unchanged.

```
seed::trace_spec         # TraceSpecAlgebra, callable_descriptor, trace_spec annotations
seed::uncertainty_kind   # UncertaintyKind, observe_structured, suggest_remediation
seed::bi_temporal        # BiTemporalRecord, mem.as_of, mem.history, mem.correct
seed::choreographic      # spawn_typed, SessionHandle, session_close
seed::intent_spec        # from_intent, oracle render, countersignature workflow
seed::spec_blocks        # spec<T>, ProofEntry, proof_artifact, spec_check
seed::zkcomposer         # ProofType::zkComposer, proof_composer_config, sub_proof
seed::datalog_substrate  # policy_substrate, assert_fact, retract_fact, query_substrate
seed::comem              # federated_promotion_policy, FederationStatus, verify_federated_fact
seed::blame              # DenialReason, ContractViolation blame_event, action_trace blame
seed::adaptive_retrieval # adaptive_retrieval_gate config, retrieval_input, fusion_strategy
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §35 — CONFORMANCE SUITE — v0.3.0 Addition                          ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 35.A — New Test Categories (v0.3.0)

The ASL-CONF-15 suite gains six new categories:

```
conformance_suite "ASL-CONF-16" {
    version: "16.0.0"
    command: "seed test --conformance"
    new_categories_v030: [
        "TRACE-SPEC",       # TraceSpecAlgebra, callable descriptors
        "BI-TEMPORAL",      # bi-temporal memory, as_of queries, corrections
        "SPEC-BLOCKS",      # spec<T>, oracle check, proof artifact
        "INTENT-SPEC",      # from_intent, countersignature, render
        "ZKCOMPOSER",       # parallel proof construction
        "CHOREOGRAPHIC",    # spawn_typed, SessionHandle, linear affine
    ]
}
```

### 35.B — v0.3.0 Conformance Levels

```
"Level 5 — v0.3.0 Production":
    [All Level 4, TRACE-SPEC, BI-TEMPORAL, ZKCOMPOSER, CHOREOGRAPHIC]

"Level 6 — v0.3.0 Certified":
    [Level 5, SPEC-BLOCKS, INTENT-SPEC,
     from_intent oracle integration passing,
     EU AI Act Art. 12 bi-temporal export verified,
     dependent-type proofs embedded and offline-verifiable,
     red-team audit with zero critical findings]
```

---

```
╔══════════════════════════════════════════════════════════════════════╗
║ §36 — PACKAGE MANIFEST — v0.3.0 Update                             ║
╚══════════════════════════════════════════════════════════════════════╝
```

```toml
[package]
name    = "agentseed-language"
version = "16.0.0"
edition = "2026"
stratum = "S1"

[build]
language-version = "16.0.0"
compiler         = "seedc 16.0.0"
target           = "seedvm-6.0"
jit-tier         = "copy-and-patch + extension lowering"
optimization     = "speed"

[isa-extensions]
# All v0.2.0 extensions retained, plus:
"+trace-spec-algebra",
"+bi-temporal-memory",
"+spec-blocks",
"+zkcomposer",
"+choreographic-spawn",
"+intent-spec",
"+datalog-substrate",
"+uncertainty-kind",
"+adaptive-retrieval",
"+comem-federation",
"+blame-extraction"

[features]
# All v0.2.0 features retained, plus:
trace-spec-algebra     = { required: true,  default: true  }
bi-temporal-memory     = { required: false, default: true  }
spec-blocks            = { required: false, default: false } # S2+ only
zkcomposer             = { required: false, default: true  }
choreographic-spawn    = { required: false, default: true  }
intent-spec            = { required: false, default: false } # requires oracle
datalog-substrate      = { required: true,  default: true  }
uncertainty-kind       = { required: true,  default: true  }
adaptive-retrieval     = { required: false, default: true  }
comem-federation       = { required: false, default: true  }
blame-extraction       = { required: true,  default: true  }

[dependencies]
# All v0.2.0 dependencies retained, plus:
seed-trace-spec    = "1.0"
seed-bi-temporal   = "1.0"
seed-spec-blocks   = "1.0"    # optional; requires oracle feature
seed-zkcomposer    = "1.0"
seed-choreo        = "1.0"
seed-intent        = "1.0"    # optional; requires oracle feature
seed-datalog       = "1.0"
seed-comem         = "1.0"

[conformance]
suite   = "ASL-CONF-16"
command = "seed test --conformance --level 6"
```

---

## Appendix A — v0.3.0 Change Summary

| § | Change | Type |
|---|--------|------|
| META-SEED | 12 new feature flags | Amendment |
| DESIGN-PRINCIPLES | P9 (trace completeness), P10 (specs as citizens) | New |
| §1.3 | 40+ new keywords across S1–S3 | Amendment |
| §2.A–2.F | 6 new syntax constructs | New |
| §3.10–3.12 | UncertaintyKind, bi-temporal MemoryRecord, SessionHandle type | New |
| §4.A–4.B | U7 axiom, observe_structured, RemediationHint | New |
| §6.A–6.C | TraceEvent in L7, L8 bi-temporal layer, CoMem L5 promotion | Amendment + New |
| §7.A–7.B | Importance/retroactive triggers, adaptive retrieval gate | Amendment + New |
| §22.A–22.B | Datalog policy substrate, 6 conformance tests | New |
| §24.A–24.B | Choreographic spawn, 6 conformance tests | Amendment + New |
| §25.A–25.C | Blame extraction, TraceEvent in LTL, 4 new tests | Amendment |
| §P-CALC.A–P-CALC.B | zkComposer proof type, 5 conformance tests | Amendment |
| §31.A–31.C | TraceEvent quadripartition, action_trace API, 4 new tests | Amendment |
| §37 TRACE-SPEC | Compile-time spec algebra, callable descriptors | New Section |
| §38 BI-TEMPORAL | Complete bi-temporal memory spec, 6 tests | New Section |
| §39 CHOREOGRAPHIC-SPAWN | Linear session-typed spawn, 10 tests | New Section |
| §40 INTENT-SPEC | NL-to-formal pipeline, 6 tests | New Section |
| §41 SPEC-BLOCKS | Dependent-type spec layer, proof artifacts, 7 tests | New Section |
| §42 | 11 new stdlib modules | New Section |
| §35.A–35.B | 6 new conformance categories, Level 5–6 definitions | Amendment |
| §36 | v16.0.0 manifest, 11 new features | Amendment |

**Total new conformance tests added in v0.3.0: 68**  
**Total conformance tests (cumulative): 321**

---

*ASL-SPEC-0.3.0 — End of Document*  
*Next step: Arc42 Blueprint v0.3.0 → then seedc / seedvm implementation*
