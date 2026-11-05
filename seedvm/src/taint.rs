//! Runtime taint engine with category‑aware coloring.
//!
//! Based on pyrograph (Rust crate, Apr 2026): GPU‑accelerated taint analysis
//! with category‑aware coloring for multi‑language supply chain security.
//! Also inspired by Tant (Bertolo, 2026) for type‑level taint qualifiers
//! and zeptoclaw for data‑flow‑aware agent safety.

use crate::value::Value;
use std::collections::{HashMap, HashSet};

// ── Taint categories ──

/// Taint source/sink categories — specific dangerous combinations trigger findings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaintCategory {
    /// User input (untrusted).
    UserInput,
    /// Network‑sourced data.
    Network,
    /// File system data.
    FileSystem,
    /// Environment variables.
    EnvVar,
    /// LLM inference output.
    Inference,
    /// External agent message.
    AgentMessage,
    /// Database query result.
    Database,
    /// Sink: an effect that exercises a capability (tool call, spawn, spend, send).
    Effect,
    /// Clean / trusted.
    Clean,
}

/// Taint level — three‑level lattice: Clean ≤ Agnostic ≤ Tainted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaintLevel {
    Clean = 0,
    Agnostic = 1,
    Tainted = 2,
}

// ── Taint metadata ──

/// Metadata attached to every value as it flows through the system.
#[derive(Debug, Clone)]
pub struct TaintMeta {
    /// Current taint level.
    pub level: TaintLevel,
    /// Categories of taint sources that contributed.
    pub categories: HashSet<TaintCategory>,
    /// Sources (by name) that contributed taint.
    pub sources: Vec<String>,
    /// Propagation depth (how many steps from original source).
    pub depth: u32,
}

impl TaintMeta {
    /// Create clean metadata.
    pub fn clean() -> Self {
        Self {
            level: TaintLevel::Clean,
            categories: HashSet::new(),
            sources: vec![],
            depth: 0,
        }
    }

    /// Create tainted metadata from a single source.
    pub fn tainted(category: TaintCategory, source: impl Into<String>) -> Self {
        let mut categories = HashSet::new();
        categories.insert(category);
        Self {
            level: TaintLevel::Tainted,
            categories,
            sources: vec![source.into()],
            depth: 1,
        }
    }

    /// Join (lub) of two taint metadata values.
    pub fn join(&self, other: &TaintMeta) -> TaintMeta {
        let level = self.level.max(other.level);
        let mut categories = self.categories.clone();
        categories.extend(&other.categories);
        let mut sources = self.sources.clone();
        sources.extend(other.sources.clone());
        let depth = if level == TaintLevel::Clean {
            0
        } else {
            self.depth.max(other.depth) + 1
        };
        TaintMeta {
            level,
            categories,
            sources,
            depth,
        }
    }
}

impl TaintMeta {
    /// Apply a sanitization policy, returning the *reduced* metadata. Rules:
    ///   * a sanitizer never raises taint;
    ///   * `ReduceLevel` can lower the level but cannot reach `Clean` while taint
    ///     categories remain (use `RemoveCategory` for each, or `StripAll`);
    ///   * `RemoveCategory` removes one category and is `Clean` once none remain;
    ///   * `StripAll` is a privileged, explicit declassification;
    ///   * `Validate` needs an *outcome* (see [`validated`](Self::validated)) —
    ///     asking for it without one is an error and changes nothing (fail closed).
    pub fn sanitized(&self, policy: &SanitizePolicy) -> Result<TaintMeta, String> {
        match policy {
            SanitizePolicy::StripAll => Ok(TaintMeta::clean()),
            SanitizePolicy::ReduceLevel(target) => {
                let mut m = self.clone();
                let mut level = (*target).min(self.level);
                if level == TaintLevel::Clean && !self.categories.is_empty() {
                    level = TaintLevel::Agnostic;
                }
                m.level = level;
                Ok(m)
            }
            SanitizePolicy::RemoveCategory(cat) => {
                let mut m = self.clone();
                m.categories.remove(cat);
                if m.categories.is_empty() {
                    m = TaintMeta::clean();
                }
                Ok(m)
            }
            SanitizePolicy::Validate(_) => Err(
                "Validate policy needs an explicit validation outcome; use `validated(passed)`"
                    .into(),
            ),
        }
    }

    /// Record the outcome of a validation. A pass lowers the level to at most
    /// `Agnostic` (never to `Clean`, never upward); a failure is an error and the
    /// taint is unchanged.
    pub fn validated(&self, passed: bool) -> Result<TaintMeta, String> {
        if !passed {
            return Err("validation failed; value remains tainted".into());
        }
        let mut m = self.clone();
        m.level = m.level.min(TaintLevel::Agnostic);
        Ok(m)
    }
}

// ── Dangerous source‑sink combinations ──

/// A dangerous source→sink pair (from pyrograph's 35+ combinations).
#[derive(Debug, Clone)]
pub struct DangerRule {
    pub source_category: TaintCategory,
    pub sink_category: TaintCategory,
    pub severity: DangerSeverity,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DangerSeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl DangerRule {
    /// The well‑known dangerous combinations.
    pub fn builtin_rules() -> Vec<DangerRule> {
        let mut rules = vec![
            DangerRule {
                source_category: TaintCategory::UserInput,
                sink_category: TaintCategory::Network,
                severity: DangerSeverity::High,
                name: "input→network".into(),
                description: "User input being sent over network".into(),
            },
            DangerRule {
                source_category: TaintCategory::Inference,
                sink_category: TaintCategory::Network,
                severity: DangerSeverity::High,
                name: "inference→network".into(),
                description: "LLM output exfiltration".into(),
            },
            DangerRule {
                source_category: TaintCategory::Network,
                sink_category: TaintCategory::FileSystem,
                severity: DangerSeverity::Medium,
                name: "network→filesystem".into(),
                description: "Network data written to disk".into(),
            },
            DangerRule {
                source_category: TaintCategory::EnvVar,
                sink_category: TaintCategory::Network,
                severity: DangerSeverity::Critical,
                name: "envvar→network".into(),
                description: "Environment variable (credentials) sent over network".into(),
            },
            DangerRule {
                source_category: TaintCategory::AgentMessage,
                sink_category: TaintCategory::Database,
                severity: DangerSeverity::Medium,
                name: "agent-msg→db".into(),
                description: "Agent message written to database".into(),
            },
        ];
        // The prompt-injection rule (spec §TAINT-TYPES R1): data from any untrusted
        // source must not reach a capability-exercising effect without sanitization.
        for source in [
            TaintCategory::UserInput,
            TaintCategory::Network,
            TaintCategory::FileSystem,
            TaintCategory::Inference,
            TaintCategory::AgentMessage,
            TaintCategory::Database,
            TaintCategory::EnvVar,
        ] {
            rules.push(DangerRule {
                source_category: source,
                sink_category: TaintCategory::Effect,
                severity: DangerSeverity::High,
                name: format!("{source:?}→effect"),
                description: format!(
                    "{source:?} data reaches a capability-exercising effect unsanitized"
                ),
            });
        }
        rules
    }
}

// ── Taint engine ──

/// Runtime taint engine — tracks taint propagation and enforces rules.
pub struct TaintEngine {
    /// Current taint on each variable (by name).
    pub var_taint: HashMap<String, TaintMeta>,
    /// Program counter taint (branched on tainted conditions).
    pub pc_taint: TaintMeta,
    /// Saved pc taints for nested tainted branches (see `push_pc_from`).
    pub pc_stack: Vec<TaintMeta>,
    /// Dangerous source‑sink rules.
    pub rules: Vec<DangerRule>,
    /// Violations detected.
    pub violations: Vec<TaintViolation>,
}

#[derive(Debug, Clone)]
pub struct TaintViolation {
    pub rule_name: String,
    pub source: String,
    pub sink: String,
    pub description: String,
    pub severity: DangerSeverity,
}

impl TaintEngine {
    pub fn new() -> Self {
        Self {
            var_taint: HashMap::new(),
            pc_taint: TaintMeta::clean(),
            pc_stack: Vec::new(),
            rules: DangerRule::builtin_rules(),
            violations: Vec::new(),
        }
    }

    /// Assign taint to a variable.
    pub fn taint_var(&mut self, name: &str, meta: TaintMeta) {
        self.var_taint.insert(name.to_string(), meta);
    }

    /// Propagate taint through an operation.
    pub fn propagate(&mut self, dest: &str, sources: &[&str]) -> TaintMeta {
        let mut combined = TaintMeta::clean();
        for src in sources {
            if let Some(meta) = self.var_taint.get(*src) {
                combined = combined.join(meta);
            }
        }
        // Also join with PC taint
        combined = combined.join(&self.pc_taint);
        self.var_taint.insert(dest.to_string(), combined.clone());
        combined
    }

    /// Check a sink operation against dangerous rules.
    pub fn check_sink(
        &mut self,
        source_var: &str,
        sink_category: TaintCategory,
        sink_description: &str,
    ) {
        if let Some(source_taint) = self.var_taint.get(source_var) {
            for rule in &self.rules {
                if source_taint.categories.contains(&rule.source_category)
                    && rule.sink_category == sink_category
                {
                    self.violations.push(TaintViolation {
                        rule_name: rule.name.clone(),
                        source: format!("{:?}", source_taint.sources),
                        sink: sink_description.to_string(),
                        description: rule.description.clone(),
                        severity: rule.severity,
                    });
                }
            }
        }
    }

    /// Enter a branch whose condition is `cond_var`: everything assigned inside is
    /// tainted by the condition (implicit flow). Pair with [`pop_pc`](Self::pop_pc).
    pub fn push_pc_from(&mut self, cond_var: &str) {
        self.pc_stack.push(self.pc_taint.clone());
        if let Some(c) = self.var_taint.get(cond_var) {
            self.pc_taint = self.pc_taint.join(c);
        }
    }

    /// Leave the innermost tainted branch.
    pub fn pop_pc(&mut self) {
        if let Some(saved) = self.pc_stack.pop() {
            self.pc_taint = saved;
        }
    }

    /// Like [`check_sink`](Self::check_sink) but **enforcing**: returns the most
    /// severe violation as an error (all matches are still recorded). A variable
    /// with no recorded taint is treated as clean — callers that cannot guarantee
    /// every value is tracked should use [`check_sink_strict`](Self::check_sink_strict).
    pub fn check_sink_enforced(
        &mut self,
        source_var: &str,
        sink_category: TaintCategory,
        sink_description: &str,
    ) -> Result<(), TaintViolation> {
        let before = self.violations.len();
        self.check_sink(source_var, sink_category, sink_description);
        match self.violations[before..]
            .iter()
            .max_by_key(|v| v.severity as u8)
        {
            Some(v) => Err(v.clone()),
            None => Ok(()),
        }
    }

    /// Fail-closed variant: an *untracked* variable is itself an error.
    pub fn check_sink_strict(
        &mut self,
        source_var: &str,
        sink_category: TaintCategory,
        sink_description: &str,
    ) -> Result<(), String> {
        if !self.var_taint.contains_key(source_var) {
            return Err(format!(
                "variable `{source_var}` has no taint record (untracked)"
            ));
        }
        self.check_sink_enforced(source_var, sink_category, sink_description)
            .map_err(|v| format!("{}: {}", v.rule_name, v.description))
    }

    /// Apply a sanitizer to a variable (never raises taint; see
    /// [`TaintMeta::sanitized`]). Unknown variables are an error.
    pub fn sanitize(&mut self, var_name: &str, policy: &SanitizePolicy) -> Result<(), String> {
        let meta = self
            .var_taint
            .get(var_name)
            .ok_or_else(|| format!("variable `{var_name}` has no taint record"))?;
        let reduced = meta.sanitized(policy)?;
        self.var_taint.insert(var_name.to_string(), reduced);
        Ok(())
    }

    /// Record the outcome of validating a variable (see [`TaintMeta::validated`]).
    pub fn apply_validation(&mut self, var_name: &str, passed: bool) -> Result<(), String> {
        let meta = self
            .var_taint
            .get(var_name)
            .ok_or_else(|| format!("variable `{var_name}` has no taint record"))?;
        let reduced = meta.validated(passed)?;
        self.var_taint.insert(var_name.to_string(), reduced);
        Ok(())
    }
}

/// Sanitization policies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SanitizePolicy {
    StripAll,
    ReduceLevel(TaintLevel),
    RemoveCategory(TaintCategory),
    Validate(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use TaintCategory::*;

    fn t(c: TaintCategory) -> TaintMeta {
        TaintMeta::tainted(c, format!("{c:?}-src"))
    }

    // ── lattice ──────────────────────────────────────────────────────────────

    #[test]
    fn join_level_is_commutative_associative_idempotent() {
        let metas = [TaintMeta::clean(), t(Network), t(UserInput), {
            let mut m = t(Inference);
            m.level = TaintLevel::Agnostic;
            m
        }];
        for a in &metas {
            assert_eq!(a.join(a).level, a.level, "idempotent");
            for b in &metas {
                assert_eq!(a.join(b).level, b.join(a).level, "commutative");
                assert_eq!(a.join(b).categories, b.join(a).categories);
                for c in &metas {
                    assert_eq!(
                        a.join(b).join(c).level,
                        a.join(&b.join(c)).level,
                        "associative"
                    );
                    assert_eq!(a.join(b).join(c).categories, a.join(&b.join(c)).categories);
                }
            }
        }
    }

    #[test]
    fn join_never_lowers_taint_and_unions_categories() {
        let j = t(Network).join(&t(UserInput));
        assert_eq!(j.level, TaintLevel::Tainted);
        assert!(j.categories.contains(&Network) && j.categories.contains(&UserInput));
        assert_eq!(
            TaintMeta::clean().join(&t(Network)).level,
            TaintLevel::Tainted
        );
    }

    #[test]
    fn joining_clean_values_stays_clean_with_depth_zero() {
        let j = TaintMeta::clean().join(&TaintMeta::clean());
        assert_eq!((j.level, j.depth), (TaintLevel::Clean, 0));
    }

    #[test]
    fn propagation_through_an_operation() {
        let mut e = TaintEngine::new();
        e.taint_var("a", t(Network));
        e.taint_var("b", TaintMeta::clean());
        let r = e.propagate("c", &["a", "b"]);
        assert_eq!(r.level, TaintLevel::Tainted);
        assert_eq!(e.var_taint["c"].level, TaintLevel::Tainted);
        assert_eq!(e.propagate("d", &["b"]).level, TaintLevel::Clean);
    }

    // ── sanitization soundness (each used to launder taint) ───────────────────

    #[test]
    fn validate_without_an_outcome_does_not_reduce_taint() {
        let mut e = TaintEngine::new();
        e.taint_var("x", t(UserInput));
        assert!(e
            .sanitize("x", &SanitizePolicy::Validate(".*".into()))
            .is_err());
        assert_eq!(
            e.var_taint["x"].level,
            TaintLevel::Tainted,
            "old code lowered it to Agnostic"
        );
    }

    #[test]
    fn a_failed_validation_leaves_the_value_tainted() {
        let mut e = TaintEngine::new();
        e.taint_var("x", t(UserInput));
        assert!(e.apply_validation("x", false).is_err());
        assert_eq!(e.var_taint["x"].level, TaintLevel::Tainted);
    }

    #[test]
    fn a_passed_validation_reaches_agnostic_but_never_clean() {
        let mut e = TaintEngine::new();
        e.taint_var("x", t(UserInput));
        e.apply_validation("x", true).unwrap();
        assert_eq!(e.var_taint["x"].level, TaintLevel::Agnostic);
        assert!(
            !e.var_taint["x"].categories.is_empty(),
            "categories are kept"
        );
    }

    #[test]
    fn validation_never_raises_an_already_clean_value() {
        let mut e = TaintEngine::new();
        e.taint_var("x", TaintMeta::clean());
        e.apply_validation("x", true).unwrap();
        assert_eq!(e.var_taint["x"].level, TaintLevel::Clean);
    }

    #[test]
    fn reduce_level_cannot_raise_taint() {
        let mut m = t(Network);
        m.level = TaintLevel::Agnostic;
        let r = m
            .sanitized(&SanitizePolicy::ReduceLevel(TaintLevel::Tainted))
            .unwrap();
        assert_eq!(
            r.level,
            TaintLevel::Agnostic,
            "old code raised it back to Tainted"
        );
    }

    #[test]
    fn reduce_level_cannot_reach_clean_while_categories_remain() {
        let r = t(Network)
            .sanitized(&SanitizePolicy::ReduceLevel(TaintLevel::Clean))
            .unwrap();
        assert_eq!(r.level, TaintLevel::Agnostic);
        assert!(r.categories.contains(&Network));
    }

    #[test]
    fn remove_category_cleans_only_when_none_remain() {
        let both = t(Network).join(&t(UserInput));
        let one = both
            .sanitized(&SanitizePolicy::RemoveCategory(Network))
            .unwrap();
        assert_eq!(one.level, TaintLevel::Tainted);
        assert!(!one.categories.contains(&Network) && one.categories.contains(&UserInput));
        let none = one
            .sanitized(&SanitizePolicy::RemoveCategory(UserInput))
            .unwrap();
        assert_eq!(none.level, TaintLevel::Clean);
    }

    #[test]
    fn strip_all_is_an_explicit_full_declassification() {
        assert_eq!(
            t(EnvVar)
                .sanitized(&SanitizePolicy::StripAll)
                .unwrap()
                .level,
            TaintLevel::Clean
        );
    }

    #[test]
    fn sanitizing_an_unknown_variable_is_an_error() {
        let mut e = TaintEngine::new();
        assert!(e.sanitize("ghost", &SanitizePolicy::StripAll).is_err());
        assert!(e.apply_validation("ghost", true).is_err());
    }

    // ── sinks: recording vs enforcing ─────────────────────────────────────────

    #[test]
    fn the_prompt_injection_rule_blocks_untrusted_data_reaching_an_effect() {
        for src in [
            UserInput,
            Network,
            FileSystem,
            Inference,
            AgentMessage,
            Database,
            EnvVar,
        ] {
            let mut e = TaintEngine::new();
            e.taint_var("v", t(src));
            let r = e.check_sink_enforced("v", Effect, "spawn_agent");
            assert!(r.is_err(), "{src:?} must not reach an effect unsanitized");
            assert_eq!(r.unwrap_err().severity, DangerSeverity::High);
        }
    }

    #[test]
    fn clean_data_may_reach_an_effect() {
        let mut e = TaintEngine::new();
        e.taint_var("v", TaintMeta::clean());
        assert!(e.check_sink_enforced("v", Effect, "spawn_agent").is_ok());
    }

    #[test]
    fn sanitizing_unblocks_the_effect_sink() {
        let mut e = TaintEngine::new();
        e.taint_var("v", t(Network));
        assert!(e.check_sink_enforced("v", Effect, "tool").is_err());
        e.sanitize("v", &SanitizePolicy::RemoveCategory(Network))
            .unwrap();
        assert!(e.check_sink_enforced("v", Effect, "tool").is_ok());
    }

    #[test]
    fn enforced_check_reports_the_most_severe_violation() {
        let mut e = TaintEngine::new();
        e.taint_var("v", t(EnvVar)); // envvar→network is Critical
        let err = e
            .check_sink_enforced("v", Network, "http_post")
            .unwrap_err();
        assert_eq!(err.severity, DangerSeverity::Critical);
    }

    #[test]
    fn plain_check_sink_records_but_does_not_block() {
        // Documents the old fail-open behaviour so nobody mistakes it for enforcement.
        let mut e = TaintEngine::new();
        e.taint_var("v", t(Inference));
        e.check_sink("v", Network, "post");
        assert_eq!(e.violations.len(), 1);
    }

    #[test]
    fn strict_check_rejects_untracked_variables() {
        let mut e = TaintEngine::new();
        assert!(e
            .check_sink_strict("never_seen", Effect, "x")
            .unwrap_err()
            .contains("untracked"));
        assert!(
            e.check_sink_enforced("never_seen", Effect, "x").is_ok(),
            "lenient variant treats it as clean"
        );
    }

    #[test]
    fn unrelated_source_sink_pairs_do_not_fire() {
        let mut e = TaintEngine::new();
        e.taint_var("v", t(FileSystem));
        assert!(e.check_sink_enforced("v", Database, "insert").is_ok());
    }

    // ── implicit flows ────────────────────────────────────────────────────────

    #[test]
    fn assignments_inside_a_tainted_branch_become_tainted() {
        let mut e = TaintEngine::new();
        e.taint_var("secret_flag", t(UserInput));
        e.taint_var("lit", TaintMeta::clean());
        e.push_pc_from("secret_flag"); //  if secret_flag { x = lit }
        assert_eq!(
            e.propagate("x", &["lit"]).level,
            TaintLevel::Tainted,
            "implicit flow"
        );
        e.pop_pc();
        assert_eq!(
            e.propagate("y", &["lit"]).level,
            TaintLevel::Clean,
            "pc restored after the branch"
        );
    }

    #[test]
    fn nested_tainted_branches_restore_correctly() {
        let mut e = TaintEngine::new();
        e.taint_var("a", t(Network));
        e.taint_var("b", t(UserInput));
        e.taint_var("lit", TaintMeta::clean());
        e.push_pc_from("a");
        e.push_pc_from("b");
        let inner = e.propagate("x", &["lit"]);
        assert!(inner.categories.contains(&Network) && inner.categories.contains(&UserInput));
        e.pop_pc();
        let mid = e.propagate("y", &["lit"]);
        assert!(mid.categories.contains(&Network) && !mid.categories.contains(&UserInput));
        e.pop_pc();
        assert_eq!(e.propagate("z", &["lit"]).level, TaintLevel::Clean);
        e.pop_pc(); // extra pop is harmless
        assert_eq!(e.pc_taint.level, TaintLevel::Clean);
    }

    #[test]
    fn a_clean_condition_does_not_taint_the_branch() {
        let mut e = TaintEngine::new();
        e.taint_var("c", TaintMeta::clean());
        e.taint_var("lit", TaintMeta::clean());
        e.push_pc_from("c");
        assert_eq!(e.propagate("x", &["lit"]).level, TaintLevel::Clean);
    }
}
