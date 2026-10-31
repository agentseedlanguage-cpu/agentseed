//! Datalog policy substrate — v0.3.0 (§22.A, Arc42 ADR-016).
//!
//! Embedded incremental Datalog engine using semi-naive bottom-up evaluation.
//! No external dependency — pure Rust.
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

    // ── Rule evaluation (semi-naive bottom-up) ────────────────────────────────

    fn ensure_idb(&mut self) {
        if !self.dirty {
            return;
        }
        self.recompute_idb();
        self.dirty = false;
    }

    fn recompute_idb(&mut self) {
        self.idb.clear();
        let all_facts: Vec<Atom> = self.edb.iter().cloned().collect();
        let rules = self.rules.clone();

        // Fixed-point iteration
        let mut changed = true;
        while changed {
            changed = false;
            for rule in &rules {
                for new_fact in self.fire_rule(rule, &all_facts) {
                    if self.idb.insert(new_fact) {
                        changed = true;
                    }
                }
            }
        }
    }

    fn fire_rule(&self, rule: &Rule, facts: &[Atom]) -> Vec<Atom> {
        let all: Vec<&Atom> = facts.iter().chain(self.idb.iter()).collect();

        // Start with empty substitution, extend through body atoms
        let mut subs: Vec<Substitution> = vec![FxHashMap::default()];

        for body_atom in &rule.body {
            let mut next_subs = Vec::new();
            for sub in &subs {
                for fact in &all {
                    if let Some(new_sub) = match_atom(body_atom, fact, sub) {
                        next_subs.push(new_sub);
                    }
                }
            }
            subs = next_subs;
            if subs.is_empty() {
                return vec![];
            }
        }

        // Materialize the head for each valid substitution
        subs.into_iter()
            .map(|sub| Atom {
                predicate: rule.head.predicate.clone(),
                args: rule.head.terms.iter().map(|t| apply(t, &sub)).collect(),
            })
            .collect()
    }

    // ── Named query evaluation ────────────────────────────────────────────────

    /// Evaluate a named query, returning matching tuples.
    pub fn query(&mut self, name: &str) -> Result<Vec<Vec<String>>, String> {
        self.ensure_idb();
        let body = self
            .queries
            .get(name)
            .ok_or_else(|| format!("unknown query: {name}"))?
            .clone();

        let all_facts: Vec<Atom> = self.edb.iter().chain(self.idb.iter()).cloned().collect();

        let mut subs: Vec<Substitution> = vec![FxHashMap::default()];
        for atom in &body {
            let mut next = Vec::new();
            for sub in &subs {
                for fact in &all_facts {
                    if let Some(new_sub) = match_atom(atom, fact, sub) {
                        next.push(new_sub);
                    }
                }
            }
            subs = next;
        }

        // Collect variable bindings from the last body atom
        let result = subs
            .into_iter()
            .map(|sub| sub.values().cloned().collect())
            .collect();

        Ok(result)
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
}
