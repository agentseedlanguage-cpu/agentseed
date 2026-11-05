//! Sanitizer — applies *named* policies to reduce taint on values.
//!
//! Soundness rules live in [`TaintMeta::sanitized`] / [`TaintMeta::validated`]:
//! a sanitizer never raises taint, `ReduceLevel` cannot reach `Clean` while taint
//! categories remain, and `Validate` needs an explicit outcome (it previously
//! lowered taint unconditionally, ignoring its regex entirely).
//!
//! A policy is applied only when selected **by name** ([`Sanitizer::apply_named`]).
//! Previously `apply` ran *every* registered policy on *every* value, so a single
//! `trusted` registration silently wiped taint from everything.
//!
//! Design references (unverified here): SONAR sentence-relation prompt sanitization,
//! CodeQL sanitizer/validator barrier guards, OWASP hardening guidance.

use crate::taint::{SanitizePolicy, TaintMeta};
use crate::value::Value;

/// The sanitizer holds registered, named policies.
#[derive(Default)]
pub struct Sanitizer {
    /// Registered sanitization policies.
    pub policies: Vec<NamedPolicy>,
}

#[derive(Debug, Clone)]
pub struct NamedPolicy {
    pub name: String,
    pub policy: SanitizePolicy,
    /// A trusted policy is an explicit declassification: when *selected by name* it
    /// strips all taint. It has no effect unless selected.
    pub trusted: bool,
}

impl Sanitizer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a policy. Names must be unique.
    pub fn register(&mut self, policy: NamedPolicy) -> Result<(), String> {
        if self.policies.iter().any(|p| p.name == policy.name) {
            return Err(format!("policy `{}` already registered", policy.name));
        }
        self.policies.push(policy);
        Ok(())
    }

    /// Apply the policy called `name` to a value. The value is returned unchanged;
    /// only its taint metadata is reduced. Errors leave the caller's taint intact.
    pub fn apply_named(
        &self,
        name: &str,
        value: &Value,
        taint: &TaintMeta,
    ) -> Result<(Value, TaintMeta), String> {
        let named = self
            .policies
            .iter()
            .find(|p| p.name == name)
            .ok_or_else(|| format!("unknown sanitization policy `{name}`"))?;
        let reduced = if named.trusted {
            TaintMeta::clean()
        } else {
            taint.sanitized(&named.policy)?
        };
        Ok((value.clone(), reduced))
    }

    /// Apply every registered *non-trusted* policy in order, skipping any that
    /// cannot apply (e.g. `Validate`, which needs an outcome). Never raises taint and
    /// never honours `trusted`.
    #[deprecated(note = "applies every policy to every value; use apply_named")]
    pub fn apply(&self, value: &Value, taint: &TaintMeta) -> (Value, TaintMeta) {
        let mut current = taint.clone();
        for named in self.policies.iter().filter(|p| !p.trusted) {
            if let Ok(next) = current.sanitized(&named.policy) {
                current = next;
            }
        }
        (value.clone(), current)
    }

    /// Check whether a value needs sanitization.
    pub fn needs_sanitization(taint: &TaintMeta) -> bool {
        taint.level > crate::taint::TaintLevel::Clean
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::taint::{TaintCategory, TaintLevel};

    fn tainted() -> TaintMeta {
        TaintMeta::tainted(TaintCategory::Network, "net")
    }
    fn policy(name: &str, p: SanitizePolicy, trusted: bool) -> NamedPolicy {
        NamedPolicy {
            name: name.into(),
            policy: p,
            trusted,
        }
    }

    #[test]
    fn needs_sanitization_tracks_level() {
        assert!(Sanitizer::needs_sanitization(&tainted()));
        assert!(!Sanitizer::needs_sanitization(&TaintMeta::clean()));
    }

    #[test]
    fn apply_named_reduces_only_the_selected_policy() {
        let mut s = Sanitizer::new();
        s.register(policy(
            "drop_net",
            SanitizePolicy::RemoveCategory(TaintCategory::Network),
            false,
        ))
        .unwrap();
        s.register(policy(
            "noop",
            SanitizePolicy::ReduceLevel(TaintLevel::Tainted),
            false,
        ))
        .unwrap();
        let (v, t) = s
            .apply_named("drop_net", &Value::I64(1), &tainted())
            .unwrap();
        assert_eq!(t.level, TaintLevel::Clean);
        assert!(matches!(v, Value::I64(1)), "value is returned unchanged");
    }

    #[test]
    fn a_trusted_policy_does_not_wipe_taint_unless_it_is_selected() {
        // Regression: one `trusted` registration used to clean every value.
        let mut s = Sanitizer::new();
        s.register(policy("declassify", SanitizePolicy::StripAll, true))
            .unwrap();
        s.register(policy(
            "careful",
            SanitizePolicy::ReduceLevel(TaintLevel::Agnostic),
            false,
        ))
        .unwrap();
        let (_, t) = s.apply_named("careful", &Value::Null, &tainted()).unwrap();
        assert_eq!(
            t.level,
            TaintLevel::Agnostic,
            "trusted policy must not leak into other applications"
        );
        let (_, t) = s
            .apply_named("declassify", &Value::Null, &tainted())
            .unwrap();
        assert_eq!(
            t.level,
            TaintLevel::Clean,
            "explicitly selected trusted policy does declassify"
        );
    }

    #[test]
    #[allow(deprecated)]
    fn legacy_apply_ignores_trusted_policies() {
        let mut s = Sanitizer::new();
        s.register(policy("declassify", SanitizePolicy::StripAll, true))
            .unwrap();
        let (_, t) = s.apply(&Value::Null, &tainted());
        assert_eq!(
            t.level,
            TaintLevel::Tainted,
            "old code returned Clean here for every value"
        );
    }

    #[test]
    fn validate_policy_cannot_be_applied_without_an_outcome() {
        let mut s = Sanitizer::new();
        s.register(policy(
            "v",
            SanitizePolicy::Validate("^[a-z]+$".into()),
            false,
        ))
        .unwrap();
        assert!(s.apply_named("v", &Value::Null, &tainted()).is_err());
    }

    #[test]
    fn unknown_and_duplicate_policy_names_are_errors() {
        let mut s = Sanitizer::new();
        assert!(s.apply_named("nope", &Value::Null, &tainted()).is_err());
        s.register(policy("a", SanitizePolicy::StripAll, false))
            .unwrap();
        assert!(s
            .register(policy("a", SanitizePolicy::StripAll, false))
            .is_err());
    }

    #[test]
    fn errors_do_not_alter_the_callers_taint() {
        let s = Sanitizer::new();
        let t = tainted();
        let _ = s.apply_named("nope", &Value::Null, &t);
        assert_eq!(t.level, TaintLevel::Tainted);
    }
}
