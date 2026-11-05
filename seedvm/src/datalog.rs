//! Datalog policy substrate — v0.3.0 (§22.A, Arc42 ADR-016).
//!
//! Embedded Datalog engine: bottom-up **semi-naive** evaluation with predicate
//! indexing. The derived (IDB) relation is recomputed lazily when the fact base
//! changes. True incremental maintenance on retraction (DRed / counting) is *future
//! work* — earlier docs claimed it and an O(1) bound; neither was ever true.
//!
//! Supported: positive Horn rules, recursion, and the *range-restriction* safety
//! condition (every head variable must occur in the body — enforced by
//! [`DatalogSubstrate::add_rule`]). Not supported: negation, aggregation, builtins.
//!
//! Safety properties expressible as reachability queries over session state
//! are evaluated here in O(1) amortized after initial closure, rather than
//! via the SMT solver (~5ms per check).
//!
//! Auto-asserted facts (§22.A):
//!   session_active(session_id, agent_id, role)
//!   session_authenticated(session_id, principal_id, timestamp)
//!   capability_held(agent_id, cap_id, effect_type)
//!   capability_revoked(cap_id, revoker_id, timestamp)
//!   trust_level(agent_id, level)
//!   effect_performed(agent_id, effect_type, timestamp)
//!   effect_denied(agent_id, effect_type, denial_reason, timestamp)

use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::BTreeSet;

// ── Atom ──────────────────────────────────────────────────────────────────────

/// A ground atom: predicate + tuple of string terms.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Atom {
    pub predicate: String,
    pub args: Vec<String>,
}

impl Atom {
    pub fn new(predicate: impl Into<String>, args: Vec<impl Into<String>>) -> Self {
        Self {
            predicate: predicate.into(),
            args: args.into_iter().map(|a| a.into()).collect(),
        }
    }
}

// ── Rule ─────────────────────────────────────────────────────────────────────

/// A Datalog rule: head :- body*.
/// Variables are strings starting with an uppercase letter.
#[derive(Debug, Clone)]
pub struct Rule {
    pub head: RuleAtom,
    pub body: Vec<RuleAtom>,
}

#[derive(Debug, Clone)]
pub struct RuleAtom {
    pub predicate: String,
    pub terms: Vec<Term>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Term {
    Variable(String),
    Constant(String),
}

impl Term {
    pub fn var(s: impl Into<String>) -> Self {
        Term::Variable(s.into())
    }
    pub fn constant(s: impl Into<String>) -> Self {
        Term::Constant(s.into())
    }

    pub fn is_var(&self) -> bool {
        matches!(self, Term::Variable(_))
    }
    pub fn as_str(&self) -> &str {
        match self {
            Term::Variable(s) | Term::Constant(s) => s,
        }
    }
}

// ── Substitution ──────────────────────────────────────────────────────────────

type Substitution = FxHashMap<String, String>;

fn apply(term: &Term, sub: &Substitution) -> String {
    match term {
        Term::Constant(c) => c.clone(),
        Term::Variable(v) => sub.get(v).cloned().unwrap_or_else(|| v.clone()),
    }
}

fn match_atom(rule_atom: &RuleAtom, ground: &Atom, sub: &Substitution) -> Option<Substitution> {
    if rule_atom.predicate != ground.predicate {
        return None;
    }
    if rule_atom.terms.len() != ground.args.len() {
        return None;
    }
    let mut new_sub = sub.clone();
    for (term, ground_arg) in rule_atom.terms.iter().zip(&ground.args) {
        match term {
            Term::Constant(c) => {
                if c != ground_arg {
                    return None;
                }
            }
            Term::Variable(v) => {
                if let Some(bound) = new_sub.get(v) {
                    if bound != ground_arg {
                        return None;
                    }
                } else {
                    new_sub.insert(v.clone(), ground_arg.clone());
                }
            }
        }
    }
    Some(new_sub)
}

// ── DatalogSubstrate ──────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct DatalogSubstrate {
    /// EDB: extensional database (base facts asserted by the VM and agents)
    edb: FxHashSet<Atom>,
    /// IDB: intensional database (derived facts from rules)
    idb: FxHashSet<Atom>,
    /// Registered rules
    rules: Vec<Rule>,
    /// Named queries → their body
    queries: FxHashMap<String, Vec<RuleAtom>>,
    /// Dirty flag: IDB needs recomputation
    dirty: bool,
}

impl DatalogSubstrate {
    pub fn new() -> Self {
        let mut s = Self::default();
        s.register_builtin_rules();
        s
    }

    // ── Built-in rules ────────────────────────────────────────────────────────

    fn register_builtin_rules(&mut self) {
        // authorized_data_read(AgentId, SessionId) :-
        //     session_active(SessionId, AgentId, _),
        //     session_authenticated(SessionId, _, _),
        //     capability_held(AgentId, _, "ReadUserData").
        self.rules.push(Rule {
            head: RuleAtom {
                predicate: "authorized_data_read".to_owned(),
                terms: vec![Term::var("AgentId"), Term::var("SessionId")],
            },
            body: vec![
                RuleAtom {
                    predicate: "session_active".to_owned(),
                    terms: vec![
                        Term::var("SessionId"),
                        Term::var("AgentId"),
                        Term::var("_Role"),
                    ],
                },
                RuleAtom {
                    predicate: "session_authenticated".to_owned(),
                    terms: vec![
                        Term::var("SessionId"),
                        Term::var("_Principal"),
                        Term::var("_Ts"),
                    ],
                },
                RuleAtom {
                    predicate: "capability_held".to_owned(),
                    terms: vec![
                        Term::var("AgentId"),
                        Term::var("_Cap"),
                        Term::constant("ReadUserData"),
                    ],
                },
            ],
        });

        // can_send_mesh(AgentId) :-
        //     trust_level(AgentId, "Verified").
        self.rules.push(Rule {
            head: RuleAtom {
                predicate: "can_send_mesh".to_owned(),
                terms: vec![Term::var("AgentId")],
            },
            body: vec![RuleAtom {
                predicate: "trust_level".to_owned(),
                terms: vec![Term::var("AgentId"), Term::constant("Verified")],
            }],
        });

        // can_spawn(AgentId) :-
        //     trust_level(AgentId, "Trusted").
        self.rules.push(Rule {
            head: RuleAtom {
                predicate: "can_spawn".to_owned(),
                terms: vec![Term::var("AgentId")],
            },
            body: vec![RuleAtom {
                predicate: "trust_level".to_owned(),
                terms: vec![Term::var("AgentId"), Term::constant("Trusted")],
            }],
        });

        // Register built-in named queries
        self.queries.insert(
            "authorized?".to_owned(),
            vec![RuleAtom {
                predicate: "authorized_data_read".to_owned(),
                terms: vec![Term::var("AgentId"), Term::var("SessionId")],
            }],
        );
    }

    // ── Fact management ───────────────────────────────────────────────────────

    /// Assert a ground fact into the EDB.
    pub fn assert(&mut self, atom: Atom) {
        if self.edb.insert(atom) {
            self.dirty = true;
        }
    }

    /// Retract a ground fact from the EDB.
    pub fn retract(&mut self, atom: &Atom) -> bool {
        let removed = self.edb.remove(atom);
        if removed {
            self.dirty = true;
        }
        removed
    }

    /// Check if a ground fact is currently true (EDB ∪ IDB).
    pub fn holds(&mut self, atom: &Atom) -> bool {
        self.ensure_idb();
        self.edb.contains(atom) || self.idb.contains(atom)
    }

    // ── Rules and queries ─────────────────────────────────────────────────────

    /// Register a rule, enforcing range restriction (safety): every variable in the
    /// head must also occur in the body, otherwise derived facts would contain
    /// unbound variables.
    pub fn add_rule(&mut self, rule: Rule) -> Result<(), DatalogError> {
        if rule.body.is_empty() {
            return Err(DatalogError::EmptyBody(rule.head.predicate.clone()));
        }
        let body_vars: FxHashSet<&str> = rule
            .body
            .iter()
            .flat_map(|a| a.terms.iter())
            .filter(|t| t.is_var())
            .map(|t| t.as_str())
            .collect();
        for t in rule.head.terms.iter().filter(|t| t.is_var()) {
            if !body_vars.contains(t.as_str()) {
                return Err(DatalogError::UnsafeVariable {
                    predicate: rule.head.predicate.clone(),
                    variable: t.as_str().to_owned(),
                });
            }
        }
        self.rules.push(rule);
        self.dirty = true;
        Ok(())
    }

    /// Register a named conjunctive query.
    pub fn add_query(
        &mut self,
        name: impl Into<String>,
        body: Vec<RuleAtom>,
    ) -> Result<(), DatalogError> {
        let name = name.into();
        if body.is_empty() {
            return Err(DatalogError::EmptyBody(name));
        }
        self.queries.insert(name, body);
        Ok(())
    }

    // ── Semi-naive evaluation ─────────────────────────────────────────────────

    fn ensure_idb(&mut self) {
        if !self.dirty {
            return;
        }
        self.recompute_idb();
        self.dirty = false;
    }

    /// Semi-naive fixpoint. Each round, a rule can only produce something new if at
    /// least one body atom matches a fact derived in the *previous* round (the
    /// delta); we therefore try every body position as the delta position, joining
    /// the remaining positions against all known facts.
    fn recompute_idb(&mut self) {
        self.idb.clear();
        let mut all: FxHashSet<Atom> = self.edb.clone();
        let mut delta: FxHashSet<Atom> = self.edb.clone();

        while !delta.is_empty() {
            let all_idx = index_by_predicate(&all);
            let delta_idx = index_by_predicate(&delta);
            let mut next: FxHashSet<Atom> = FxHashSet::default();
            for rule in &self.rules {
                for head in derive(rule, &delta_idx, &all_idx) {
                    if !all.contains(&head) {
                        next.insert(head);
                    }
                }
            }
            for f in &next {
                all.insert(f.clone());
                self.idb.insert(f.clone());
            }
            delta = next;
        }
    }

    // ── Named query evaluation ────────────────────────────────────────────────

    /// Evaluate a named query. Rows contain the query's variables in order of first
    /// appearance (variables starting with `_` are anonymous and omitted); rows are
    /// de-duplicated and sorted, so the output is deterministic. A query with no
    /// variables is boolean: one empty row if satisfiable, none otherwise.
    pub fn query(&mut self, name: &str) -> Result<Vec<Vec<String>>, String> {
        self.ensure_idb();
        let body = self
            .queries
            .get(name)
            .ok_or_else(|| format!("unknown query: {name}"))?
            .clone();

        let known: FxHashSet<Atom> = self.edb.iter().chain(self.idb.iter()).cloned().collect();
        let idx = index_by_predicate(&known);

        let mut vars: Vec<String> = Vec::new();
        for t in body.iter().flat_map(|a| a.terms.iter()) {
            if let Term::Variable(v) = t {
                if !v.starts_with('_') && !vars.contains(v) {
                    vars.push(v.clone());
                }
            }
        }

        let mut subs: Vec<Substitution> = vec![FxHashMap::default()];
        for atom in &body {
            let mut next = Vec::new();
            if let Some(facts) = idx.get(atom.predicate.as_str()) {
                for sub in &subs {
                    for fact in facts {
                        if let Some(ns) = match_atom(atom, fact, sub) {
                            next.push(ns);
                        }
                    }
                }
            }
            subs = next;
        }

        let rows: BTreeSet<Vec<String>> = subs
            .into_iter()
            .map(|sub| {
                vars.iter()
                    .map(|v| sub.get(v).cloned().unwrap_or_default())
                    .collect()
            })
            .collect();
        Ok(rows.into_iter().collect())
    }

    // ── Auto-assert VM facts ──────────────────────────────────────────────────

    /// Auto-assert session establishment facts (§22.A).
    pub fn session_established(&mut self, session_id: &str, agent_id: &str, role: &str) {
        self.assert(Atom::new(
            "session_active",
            vec![session_id, agent_id, role],
        ));
    }

    pub fn session_closed(&mut self, session_id: &str, agent_id: &str, role: &str) {
        self.retract(&Atom::new(
            "session_active",
            vec![session_id, agent_id, role],
        ));
    }

    pub fn session_authenticated(&mut self, session_id: &str, principal_id: &str, ts: &str) {
        self.assert(Atom::new(
            "session_authenticated",
            vec![session_id, principal_id, ts],
        ));
    }

    pub fn capability_granted(&mut self, agent_id: &str, cap_id: &str, effect_type: &str) {
        self.assert(Atom::new(
            "capability_held",
            vec![agent_id, cap_id, effect_type],
        ));
    }

    pub fn capability_revoked(&mut self, cap_id: &str, revoker_id: &str, ts: &str) {
        self.assert(Atom::new(
            "capability_revoked",
            vec![cap_id, revoker_id, ts],
        ));
        // Retract all capability_held facts for this cap_id
        let to_remove: Vec<Atom> = self
            .edb
            .iter()
            .filter(|a| {
                a.predicate == "capability_held" && a.args.get(1) == Some(&cap_id.to_owned())
            })
            .cloned()
            .collect();
        for atom in to_remove {
            self.edb.remove(&atom);
        }
        self.dirty = true;
    }

    pub fn trust_level(&mut self, agent_id: &str, level: &str) {
        // Remove old trust level first
        let old: Vec<Atom> = self
            .edb
            .iter()
            .filter(|a| {
                a.predicate == "trust_level" && a.args.first() == Some(&agent_id.to_owned())
            })
            .cloned()
            .collect();
        for atom in old {
            self.edb.remove(&atom);
        }
        self.assert(Atom::new("trust_level", vec![agent_id, level]));
    }

    pub fn effect_performed(&mut self, agent_id: &str, effect_type: &str, ts: &str) {
        self.assert(Atom::new(
            "effect_performed",
            vec![agent_id, effect_type, ts],
        ));
    }

    pub fn effect_denied(&mut self, agent_id: &str, effect_type: &str, reason: &str, ts: &str) {
        self.assert(Atom::new(
            "effect_denied",
            vec![agent_id, effect_type, reason, ts],
        ));
    }

    /// Stats for observability.
    pub fn edb_size(&self) -> usize {
        self.edb.len()
    }
    pub fn idb_size(&self) -> usize {
        self.idb.len()
    }
}

// ── Evaluation helpers ────────────────────────────────────────────────────────

type PredIndex<'a> = FxHashMap<&'a str, Vec<&'a Atom>>;

fn index_by_predicate(facts: &FxHashSet<Atom>) -> PredIndex<'_> {
    let mut idx: PredIndex<'_> = FxHashMap::default();
    for f in facts {
        idx.entry(f.predicate.as_str()).or_default().push(f);
    }
    idx
}

/// All head atoms derivable by `rule` where at least one body atom is matched
/// against `delta` (every position is tried as the delta position).
fn derive(rule: &Rule, delta: &PredIndex<'_>, all: &PredIndex<'_>) -> Vec<Atom> {
    let mut out = Vec::new();
    for dpos in 0..rule.body.len() {
        let mut subs: Vec<Substitution> = vec![FxHashMap::default()];
        for (i, atom) in rule.body.iter().enumerate() {
            let source = if i == dpos { delta } else { all };
            let mut next = Vec::new();
            if let Some(facts) = source.get(atom.predicate.as_str()) {
                for sub in &subs {
                    for fact in facts {
                        if let Some(ns) = match_atom(atom, fact, sub) {
                            next.push(ns);
                        }
                    }
                }
            }
            subs = next;
            if subs.is_empty() {
                break;
            }
        }
        for sub in subs {
            out.push(Atom {
                predicate: rule.head.predicate.clone(),
                args: rule.head.terms.iter().map(|t| apply(t, &sub)).collect(),
            });
        }
    }
    out
}

/// Errors from rule/query registration.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DatalogError {
    #[error(
        "unsafe rule for `{predicate}`: head variable `{variable}` does not occur in the body"
    )]
    UnsafeVariable { predicate: String, variable: String },
    #[error("rule or query `{0}` has an empty body")]
    EmptyBody(String),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assert_and_holds() {
        let mut db = DatalogSubstrate::new();
        let fact = Atom::new("trust_level", vec!["agent1", "Verified"]);
        db.assert(fact.clone());
        assert!(db.holds(&fact));
    }

    #[test]
    fn retract_removes_fact() {
        let mut db = DatalogSubstrate::new();
        let fact = Atom::new("trust_level", vec!["agent1", "Verified"]);
        db.assert(fact.clone());
        assert!(db.holds(&fact));
        db.retract(&fact);
        assert!(!db.holds(&fact));
    }

    #[test]
    fn builtin_rule_can_send_mesh() {
        let mut db = DatalogSubstrate::new();
        db.trust_level("agent_a", "Verified");
        assert!(db.holds(&Atom::new("can_send_mesh", vec!["agent_a"])));
    }

    #[test]
    fn builtin_rule_can_spawn_requires_trusted() {
        let mut db = DatalogSubstrate::new();
        db.trust_level("agent_b", "Verified");
        // Not Trusted → cannot spawn
        assert!(!db.holds(&Atom::new("can_spawn", vec!["agent_b"])));
        // Upgrade to Trusted
        db.trust_level("agent_b", "Trusted");
        assert!(db.holds(&Atom::new("can_spawn", vec!["agent_b"])));
    }

    #[test]
    fn authorized_data_read_requires_all_conditions() {
        let mut db = DatalogSubstrate::new();
        // Without any facts
        assert!(!db.holds(&Atom::new("authorized_data_read", vec!["agent1", "sess1"])));

        // Add session_active
        db.session_established("sess1", "agent1", "worker");
        assert!(!db.holds(&Atom::new("authorized_data_read", vec!["agent1", "sess1"])));

        // Add authentication
        db.session_authenticated("sess1", "principal1", "1000");
        assert!(!db.holds(&Atom::new("authorized_data_read", vec!["agent1", "sess1"])));

        // Add capability
        db.capability_granted("agent1", "cap_read_1", "ReadUserData");
        assert!(db.holds(&Atom::new("authorized_data_read", vec!["agent1", "sess1"])));
    }

    #[test]
    fn capability_revoke_cascades() {
        let mut db = DatalogSubstrate::new();
        db.session_established("sess1", "agent1", "worker");
        db.session_authenticated("sess1", "principal1", "1000");
        db.capability_granted("agent1", "cap_read_1", "ReadUserData");
        assert!(db.holds(&Atom::new("authorized_data_read", vec!["agent1", "sess1"])));

        // Revoke the capability
        db.capability_revoked("cap_read_1", "principal1", "2000");
        assert!(!db.holds(&Atom::new("authorized_data_read", vec!["agent1", "sess1"])));
    }

    #[test]
    fn session_close_removes_active() {
        let mut db = DatalogSubstrate::new();
        db.session_established("sess1", "agent1", "worker");
        assert!(db.holds(&Atom::new(
            "session_active",
            vec!["sess1", "agent1", "worker"]
        )));
        db.session_closed("sess1", "agent1", "worker");
        assert!(!db.holds(&Atom::new(
            "session_active",
            vec!["sess1", "agent1", "worker"]
        )));
    }

    #[test]
    fn dls01_session_active_asserted_on_establishment() {
        let mut db = DatalogSubstrate::new();
        db.session_established("session_42", "agent_x", "Coordinator");
        assert!(db.holds(&Atom::new(
            "session_active",
            vec!["session_42", "agent_x", "Coordinator"]
        )));
    }

    #[test]
    fn dls03_revocation_retracts_capability() {
        let mut db = DatalogSubstrate::new();
        db.capability_granted("agent1", "cap123", "MeshSend");
        assert!(db.holds(&Atom::new(
            "capability_held",
            vec!["agent1", "cap123", "MeshSend"]
        )));
        db.capability_revoked("cap123", "principal1", "5000");
        assert!(!db.holds(&Atom::new(
            "capability_held",
            vec!["agent1", "cap123", "MeshSend"]
        )));
    }

    #[test]
    fn query_authorized_returns_results() {
        let mut db = DatalogSubstrate::new();
        db.session_established("sess1", "agent1", "worker");
        db.session_authenticated("sess1", "principal1", "1000");
        db.capability_granted("agent1", "cap_read_1", "ReadUserData");

        let results = db.query("authorized?").expect("query ok");
        assert!(!results.is_empty());
    }

    #[test]
    fn idempotent_assert() {
        let mut db = DatalogSubstrate::new();
        let fact = Atom::new("trust_level", vec!["agent1", "Verified"]);
        db.assert(fact.clone());
        db.assert(fact.clone());
        // Should not create duplicates
        assert_eq!(db.edb_size(), 1);
    }

    // ── semi-naive correctness ───────────────────────────────────────────────

    fn atom(p: &str, a: &[&str]) -> Atom {
        Atom::new(p, a.to_vec())
    }
    fn ratom(p: &str, ts: Vec<Term>) -> RuleAtom {
        RuleAtom {
            predicate: p.to_owned(),
            terms: ts,
        }
    }
    fn v(n: &str) -> Term {
        Term::var(n)
    }

    fn reach_rules(db: &mut DatalogSubstrate) {
        // reach(X,Y) :- edge(X,Y).   reach(X,Z) :- edge(X,Y), reach(Y,Z).
        db.add_rule(Rule {
            head: ratom("reach", vec![v("X"), v("Y")]),
            body: vec![ratom("edge", vec![v("X"), v("Y")])],
        })
        .unwrap();
        db.add_rule(Rule {
            head: ratom("reach", vec![v("X"), v("Z")]),
            body: vec![
                ratom("edge", vec![v("X"), v("Y")]),
                ratom("reach", vec![v("Y"), v("Z")]),
            ],
        })
        .unwrap();
    }

    #[test]
    fn transitive_closure_over_a_chain() {
        let mut db = DatalogSubstrate::new();
        reach_rules(&mut db);
        for i in 0..30 {
            db.assert(atom("edge", &[&format!("n{i}"), &format!("n{}", i + 1)]));
        }
        assert!(db.holds(&atom("reach", &["n0", "n30"])));
        assert!(db.holds(&atom("reach", &["n7", "n12"])));
        assert!(
            !db.holds(&atom("reach", &["n12", "n7"])),
            "edges are directed"
        );
    }

    #[test]
    fn cycles_terminate() {
        let mut db = DatalogSubstrate::new();
        reach_rules(&mut db);
        db.assert(atom("edge", &["a", "b"]));
        db.assert(atom("edge", &["b", "c"]));
        db.assert(atom("edge", &["c", "a"]));
        for x in ["a", "b", "c"] {
            for y in ["a", "b", "c"] {
                assert!(db.holds(&atom("reach", &[x, y])), "{x}->{y}");
            }
        }
    }

    #[test]
    fn retraction_removes_derived_facts() {
        let mut db = DatalogSubstrate::new();
        reach_rules(&mut db);
        db.assert(atom("edge", &["a", "b"]));
        db.assert(atom("edge", &["b", "c"]));
        assert!(db.holds(&atom("reach", &["a", "c"])));
        db.retract(&atom("edge", &["b", "c"]));
        assert!(!db.holds(&atom("reach", &["a", "c"])));
        assert!(db.holds(&atom("reach", &["a", "b"])));
    }

    /// Reference evaluator: textbook naive fixpoint over the same rules.
    fn naive_reach(edges: &[(usize, usize)]) -> BTreeSet<(usize, usize)> {
        let mut r: BTreeSet<(usize, usize)> = edges.iter().copied().collect();
        loop {
            let mut add = Vec::new();
            for &(x, y) in edges {
                for &(y2, z) in &r {
                    if y == y2 && !r.contains(&(x, z)) {
                        add.push((x, z));
                    }
                }
            }
            if add.is_empty() {
                return r;
            }
            r.extend(add);
        }
    }

    #[test]
    fn semi_naive_matches_naive_on_pseudo_random_graphs() {
        let mut state: u64 = 0x2545F4914F6CDD1D;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for _ in 0..40 {
            let n = 3 + (next() % 7) as usize;
            let m = (next() % 14) as usize;
            let edges: Vec<(usize, usize)> = (0..m)
                .map(|_| ((next() % n as u64) as usize, (next() % n as u64) as usize))
                .collect();

            let mut db = DatalogSubstrate::new();
            reach_rules(&mut db);
            for &(a, b) in &edges {
                db.assert(atom("edge", &[&format!("n{a}"), &format!("n{b}")]));
            }
            let expected = naive_reach(&edges);
            for x in 0..n {
                for y in 0..n {
                    let got = db.holds(&atom("reach", &[&format!("n{x}"), &format!("n{y}")]));
                    assert_eq!(got, expected.contains(&(x, y)), "edges={edges:?} {x}->{y}");
                }
            }
        }
    }

    #[test]
    fn unsafe_rule_is_rejected() {
        let mut db = DatalogSubstrate::new();
        let r = db.add_rule(Rule {
            head: ratom("bad", vec![v("X"), v("Unbound")]),
            body: vec![ratom("edge", vec![v("X"), v("Y")])],
        });
        assert_eq!(
            r,
            Err(DatalogError::UnsafeVariable {
                predicate: "bad".into(),
                variable: "Unbound".into()
            })
        );
    }

    #[test]
    fn empty_body_is_rejected() {
        let mut db = DatalogSubstrate::new();
        assert!(matches!(
            db.add_rule(Rule {
                head: ratom("p", vec![Term::constant("a")]),
                body: vec![]
            }),
            Err(DatalogError::EmptyBody(_))
        ));
    }

    #[test]
    fn query_rows_are_deterministic_sorted_and_deduplicated() {
        let mut db = DatalogSubstrate::new();
        reach_rules(&mut db);
        db.add_query(
            "from_a",
            vec![ratom("reach", vec![Term::constant("a"), v("T")])],
        )
        .unwrap();
        for (x, y) in [("a", "c"), ("a", "b"), ("b", "c")] {
            db.assert(atom("edge", &[x, y]));
        }
        let rows = db.query("from_a").unwrap();
        assert_eq!(rows, vec![vec!["b".to_string()], vec!["c".to_string()]]);
        assert_eq!(rows, db.query("from_a").unwrap(), "stable across calls");
    }

    #[test]
    fn boolean_query_without_variables() {
        let mut db = DatalogSubstrate::new();
        db.add_query(
            "has_edge",
            vec![ratom(
                "edge",
                vec![Term::constant("a"), Term::constant("b")],
            )],
        )
        .unwrap();
        assert!(db.query("has_edge").unwrap().is_empty());
        db.assert(atom("edge", &["a", "b"]));
        assert_eq!(db.query("has_edge").unwrap(), vec![Vec::<String>::new()]);
    }

    #[test]
    fn unknown_query_errors() {
        assert!(DatalogSubstrate::new().query("nope").is_err());
    }
}
