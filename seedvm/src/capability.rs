//! Capability‑based security — signed, attenuable, revocable authorization tokens.
//!
//! Security invariants enforced here (spec §22, principle P3):
//!   1. **Tokens are signed.** A token is accepted only if it carries an Ed25519
//!      signature that verifies under the key registered for its `issuer`.
//!   2. **Delegation only narrows.** A delegated token must (a) name an existing,
//!      currently valid parent, (b) be issued by the parent's subject, (c) have the
//!      parent's `Delegate` permission available, (d) grant a *subset* of the parent's
//!      permissions, (e) cover a resource pattern *subsumed* by the parent's, and
//!      (f) not outlive the parent. These are re‑checked at `issue`, so a hand‑built
//!      "child" token cannot escalate.
//!   3. **Revocation cascades.** A token is invalid if it, or any ancestor in its
//!      delegation chain, is revoked.
//!   4. **Checks are per subject.** One agent's grant never authorizes another.
//!
//! Previously `attenuate` accepted any resource/permissions (escalation), revocation
//! did not cascade, `check` ignored the holder, and signatures were never produced or
//! verified.
//!
//! Known limits (open): resource patterns are matched as raw strings — callers MUST
//! normalise paths (`..`, symlinks, case) *before* matching, because `*` matches `/`;
//! the `Audit` permission has no enforcement semantics yet; there is no revocation
//! distribution protocol across agents.

use crate::value::Value;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use std::collections::{HashMap, HashSet};

// ── Capability Token ──

/// A cryptographically signed capability token.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CapabilityToken {
    /// Unique token identifier.
    pub id: String,
    /// Resource pattern (glob‑based) this token grants access to.
    pub resource: String,
    /// Permissions granted.
    pub permissions: Vec<Permission>,
    /// Token scope: session (in‑memory) or persistent.
    pub scope: TokenScope,
    /// Issuer agent ID.
    pub issuer: String,
    /// Subject agent ID.
    pub subject: String,
    /// Optional expiration (Unix timestamp).
    pub expiry: Option<i64>,
    /// Ed25519 signature over the token fields.
    pub signature: Option<Vec<u8>>,
    /// Delegation chain (for attenuated tokens).
    pub delegation_chain: Vec<String>,
}

impl CapabilityToken {
    /// Canonical bytes covered by the signature: every field except `signature`,
    /// with permissions sorted so ordering cannot change the digest.
    pub fn signing_bytes(&self) -> Vec<u8> {
        let mut perms: Vec<String> = self.permissions.iter().map(|p| format!("{p:?}")).collect();
        perms.sort();
        perms.dedup();
        let canonical = serde_json::json!({
            "v": 1,
            "id": self.id,
            "resource": self.resource,
            "permissions": perms,
            "scope": format!("{:?}", self.scope),
            "issuer": self.issuer,
            "subject": self.subject,
            "expiry": self.expiry,
            "delegation_chain": self.delegation_chain,
        });
        canonical.to_string().into_bytes()
    }

    /// Sign the token in place.
    pub fn sign(&mut self, key: &SigningKey) {
        self.signature = Some(key.sign(&self.signing_bytes()).to_bytes().to_vec());
    }

    /// Verify the signature under `key`. Unsigned or malformed signatures fail.
    pub fn verify(&self, key: &VerifyingKey) -> bool {
        let Some(bytes) = &self.signature else {
            return false;
        };
        let Ok(arr) = <[u8; 64]>::try_from(bytes.as_slice()) else {
            return false;
        };
        key.verify(&self.signing_bytes(), &Signature::from_bytes(&arr))
            .is_ok()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum Permission {
    /// Invoke / execute.
    Invoke,
    /// Read data.
    Read,
    /// Write data.
    Write,
    /// Administer / manage.
    Admin,
    /// Delegate to others.
    Delegate,
    /// Audit / inspect.
    Audit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum TokenScope {
    /// Exists only for the current session.
    Session,
    /// Persisted to storage.
    Persistent,
}

// ── Resource Pattern ──

/// A glob‑based resource pattern for flexible resource scoping.
#[derive(Debug, Clone)]
pub struct ResourcePattern {
    pub pattern: String,
}

impl ResourcePattern {
    pub fn new(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
        }
    }

    /// Check whether a resource URI matches this pattern.
    pub fn matches(&self, resource: &str) -> bool {
        // Simple glob matching: * matches any sequence, ? matches any single char
        let pattern = &self.pattern;
        let mut pi = 0;
        let mut ri = 0;
        let pchars: Vec<char> = pattern.chars().collect();
        let rchars: Vec<char> = resource.chars().collect();

        let mut star_idx = None;
        let mut match_idx = 0;

        while ri < rchars.len() {
            if pi < pchars.len() && pchars[pi] == '*' {
                star_idx = Some(pi);
                match_idx = ri;
                pi += 1;
            } else if pi < pchars.len() && (pchars[pi] == '?' || pchars[pi] == rchars[ri]) {
                pi += 1;
                ri += 1;
            } else if let Some(si) = star_idx {
                pi = si + 1;
                match_idx += 1;
                ri = match_idx;
            } else {
                return false;
            }
        }
        // Consume trailing stars
        while pi < pchars.len() && pchars[pi] == '*' {
            pi += 1;
        }
        pi == pchars.len()
    }
}

impl ResourcePattern {
    /// Does `self` grant at least everything `child` grants? **Sound but
    /// incomplete**: `true` guarantees `matches(child) ⊆ matches(self)`; `false`
    /// may be returned for some genuine subsets.
    ///
    /// Rules: identical patterns; `*` subsumes anything; a pattern of the form
    /// `LITERAL*` (single trailing `*`, no other wildcard) subsumes any child whose
    /// literal prefix (text before its first wildcard) starts with `LITERAL`. Anything
    /// else (e.g. `?`, inner or leading `*`) is subsumed only by an identical pattern.
    pub fn subsumes(&self, child: &ResourcePattern) -> bool {
        if self.pattern == child.pattern {
            return true;
        }
        let p = self.pattern.as_str();
        if p == "*" {
            return true;
        }
        let Some(prefix) = p.strip_suffix('*') else {
            return false;
        };
        if prefix.contains('*') || prefix.contains('?') {
            return false;
        }
        let child_literal: &str = child.pattern.split(['*', '?']).next().unwrap_or("");
        // If the child has no wildcard it is a single literal string: it must itself match.
        if !child.pattern.contains(['*', '?']) {
            return child.pattern.starts_with(prefix);
        }
        child_literal.starts_with(prefix)
    }
}

// ── Capability Manager ──

/// Manages capability tokens — issuance, validation, delegation, revocation.
pub struct CapabilityManager {
    /// Active tokens indexed by ID.
    pub tokens: HashMap<String, CapabilityToken>,
    /// Revoked token IDs.
    pub revoked: HashSet<String>,
    /// Audit log entries for token creation.
    pub audit_log: Vec<AuditEntry>,
    /// Verifying keys of agents allowed to issue tokens, by agent ID.
    pub trusted_issuers: HashMap<String, VerifyingKey>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub token_id: String,
    pub action: AuditAction,
    pub timestamp: i64,
    pub description: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum AuditAction {
    Issued,
    Revoked,
    Delegated,
    Expired,
    Verified,
}

impl Default for CapabilityManager {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

impl CapabilityManager {
    pub fn new() -> Self {
        Self {
            tokens: HashMap::new(),
            revoked: HashSet::new(),
            audit_log: Vec::new(),
            trusted_issuers: HashMap::new(),
        }
    }

    /// Register the verifying key for an agent permitted to issue tokens.
    pub fn register_issuer(&mut self, agent_id: impl Into<String>, key: VerifyingKey) {
        self.trusted_issuers.insert(agent_id.into(), key);
    }

    /// A token expires *at* `expiry`: it is valid while `now < expiry`.
    fn expired_at(token: &CapabilityToken, now: i64) -> bool {
        token.expiry.is_some_and(|exp| now >= exp)
    }

    /// Valid = not expired, not revoked, and no ancestor in its delegation chain revoked.
    pub fn is_valid_at(&self, token: &CapabilityToken, now: i64) -> bool {
        !Self::expired_at(token, now)
            && !self.revoked.contains(&token.id)
            && !token
                .delegation_chain
                .iter()
                .any(|anc| self.revoked.contains(anc))
    }

    /// Issue a token (see module docs for the invariants checked).
    pub fn issue(&mut self, token: CapabilityToken) -> Result<(), String> {
        self.issue_at(token, now_ts())
    }

    /// [`issue`](Self::issue) with an explicit clock, for deterministic tests.
    pub fn issue_at(&mut self, token: CapabilityToken, now: i64) -> Result<(), String> {
        if !self.is_valid_at(&token, now) {
            return Err(format!(
                "Token {} is revoked, expired, or has a revoked ancestor",
                token.id
            ));
        }
        if self.tokens.contains_key(&token.id) {
            return Err(format!("Token {} already exists", token.id));
        }

        // 1. signature under the issuer's registered key
        let key = self
            .trusted_issuers
            .get(&token.issuer)
            .ok_or_else(|| format!("Unknown issuer {}", token.issuer))?;
        if !token.verify(key) {
            return Err(format!(
                "Invalid or missing signature on token {}",
                token.id
            ));
        }

        // 2. delegation: re-check that the child only narrows its parent
        if let Some(parent_id) = token.delegation_chain.last() {
            let parent = self
                .tokens
                .get(parent_id)
                .ok_or_else(|| format!("Parent token {parent_id} not found"))?;
            self.check_delegation(parent, &token, now)?;
        }

        self.audit_log.push(AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            token_id: token.id.clone(),
            action: if token.delegation_chain.is_empty() {
                AuditAction::Issued
            } else {
                AuditAction::Delegated
            },
            timestamp: now,
            description: format!("Issued to {}", token.subject),
        });
        self.tokens.insert(token.id.clone(), token);
        Ok(())
    }

    /// Verify that `child` is a legitimate narrowing of `parent`.
    fn check_delegation(
        &self,
        parent: &CapabilityToken,
        child: &CapabilityToken,
        now: i64,
    ) -> Result<(), String> {
        if !self.is_valid_at(parent, now) {
            return Err(format!(
                "Parent token {} is revoked, expired, or has a revoked ancestor",
                parent.id
            ));
        }
        if child.issuer != parent.subject {
            return Err("Delegated token must be issued by the parent's subject".into());
        }
        if !parent.permissions.contains(&Permission::Delegate) {
            return Err(format!(
                "Parent token {} does not grant Delegate",
                parent.id
            ));
        }
        if let Some(extra) = child
            .permissions
            .iter()
            .find(|p| !parent.permissions.contains(p))
        {
            return Err(format!(
                "Delegation would escalate: {extra:?} not granted by parent"
            ));
        }
        if !ResourcePattern::new(&parent.resource).subsumes(&ResourcePattern::new(&child.resource))
        {
            return Err(format!(
                "Delegation would widen resource: `{}` is not within `{}`",
                child.resource, parent.resource
            ));
        }
        match (parent.expiry, child.expiry) {
            (Some(_), None) => {
                return Err("Child token must carry an expiry because its parent does".into())
            }
            (Some(pe), Some(ce)) if ce > pe => {
                return Err("Child token must not outlive its parent".into())
            }
            _ => {}
        }
        let mut expected = parent.delegation_chain.clone();
        expected.push(parent.id.clone());
        if child.delegation_chain != expected {
            return Err("Delegation chain does not match the parent's chain".into());
        }
        Ok(())
    }

    /// Does `subject` hold `permission` on `resource` at time `now`?
    pub fn check_for_at(
        &self,
        subject: &str,
        resource: &str,
        permission: &Permission,
        now: i64,
    ) -> bool {
        self.tokens.values().any(|t| {
            t.subject == subject
                && self.is_valid_at(t, now)
                && t.permissions.contains(permission)
                && ResourcePattern::new(&t.resource).matches(resource)
        })
    }

    /// Does `subject` hold `permission` on `resource` now?
    pub fn check_for(&self, subject: &str, resource: &str, permission: &Permission) -> bool {
        self.check_for_at(subject, resource, permission, now_ts())
    }

    /// Does *any* holder have this capability? Ignores who holds the token, so it
    /// must not be used to authorize an action by a particular agent.
    #[deprecated(note = "ignores the token holder; use check_for(subject, ..)")]
    pub fn check(&self, resource: &str, permission: &Permission) -> bool {
        let now = now_ts();
        self.tokens.values().any(|t| {
            self.is_valid_at(t, now)
                && t.permissions.contains(permission)
                && ResourcePattern::new(&t.resource).matches(resource)
        })
    }

    /// Revoke a token. Descendants become invalid automatically (see `is_valid_at`).
    pub fn revoke(&mut self, token_id: &str) {
        self.revoked.insert(token_id.to_string());
        self.audit_log.push(AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            token_id: token_id.to_string(),
            action: AuditAction::Revoked,
            timestamp: now_ts(),
            description: "Revoked".into(),
        });
    }

    /// Build an (unsigned) narrowed copy of a token held by the same subject.
    pub fn attenuate(
        &self,
        token_id: &str,
        new_resource: &str,
        new_permissions: &[Permission],
    ) -> Result<CapabilityToken, String> {
        let subject = self
            .tokens
            .get(token_id)
            .ok_or_else(|| format!("Token {token_id} not found"))?
            .subject
            .clone();
        self.delegate(token_id, &subject, new_resource, new_permissions)
    }

    /// Build an (unsigned) delegated token for `to_subject`. The parent's subject
    /// must sign it, and [`issue`](Self::issue) re-verifies every narrowing rule, so
    /// this only returns candidates that would be accepted.
    pub fn delegate(
        &self,
        token_id: &str,
        to_subject: &str,
        new_resource: &str,
        new_permissions: &[Permission],
    ) -> Result<CapabilityToken, String> {
        let parent = self
            .tokens
            .get(token_id)
            .ok_or_else(|| format!("Token {token_id} not found"))?;

        let mut chain = parent.delegation_chain.clone();
        chain.push(token_id.to_string());

        let candidate = CapabilityToken {
            id: uuid::Uuid::new_v4().to_string(),
            resource: new_resource.to_string(),
            permissions: new_permissions.to_vec(),
            scope: parent.scope,
            issuer: parent.subject.clone(),
            subject: to_subject.to_string(),
            expiry: parent.expiry,
            signature: None,
            delegation_chain: chain,
        };
        self.check_delegation(parent, &candidate, now_ts())?;
        Ok(candidate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000;

    fn key(n: u8) -> SigningKey {
        SigningKey::from_bytes(&[n; 32])
    }

    fn root_token(
        id: &str,
        issuer: &str,
        subject: &str,
        resource: &str,
        perms: &[Permission],
    ) -> CapabilityToken {
        CapabilityToken {
            id: id.into(),
            resource: resource.into(),
            permissions: perms.to_vec(),
            scope: TokenScope::Session,
            issuer: issuer.into(),
            subject: subject.into(),
            expiry: None,
            signature: None,
            delegation_chain: vec![],
        }
    }

    /// A manager where "root" is a trusted issuer and holds a signed grant to "alice".
    fn setup(resource: &str, perms: &[Permission]) -> (CapabilityManager, SigningKey) {
        let mut m = CapabilityManager::new();
        m.register_issuer("root", key(1).verifying_key());
        m.register_issuer("alice", key(2).verifying_key());
        m.register_issuer("bob", key(3).verifying_key());
        let mut t = root_token("t1", "root", "alice", resource, perms);
        t.sign(&key(1));
        m.issue_at(t, NOW).expect("root grant");
        (m, key(2))
    }

    use Permission::*;

    // ── glob matching ────────────────────────────────────────────────────────

    #[test]
    fn glob_matching_basics() {
        let p = |s: &str| ResourcePattern::new(s);
        assert!(p("files/*").matches("files/a/b.txt"));
        assert!(p("*").matches("anything"));
        assert!(p("a?c").matches("abc") && !p("a?c").matches("ac"));
        assert!(p("exact").matches("exact") && !p("exact").matches("exact2"));
        assert!(!p("files/*").matches("other/x"));
    }

    #[test]
    fn star_crosses_path_separators_so_callers_must_normalise() {
        // Documents a known limit: `*` matches `/` and `..` is not interpreted.
        assert!(ResourcePattern::new("files/*").matches("files/../secrets/key"));
    }

    // ── subsumption ──────────────────────────────────────────────────────────

    #[test]
    fn subsumption_matrix() {
        let s = |p: &str, c: &str| ResourcePattern::new(p).subsumes(&ResourcePattern::new(c));
        // allowed narrowing
        assert!(s("*", "anything/at/all"));
        assert!(s("files/a/*", "files/a/b/*"));
        assert!(s("files/a/*", "files/a/x.txt"));
        assert!(s("files/*", "files/*"));
        assert!(s("exact", "exact"));
        // escalation attempts must be rejected
        assert!(!s("files/a/*", "files/*"), "wider prefix");
        assert!(!s("files/a/*", "*"), "star child");
        assert!(
            !s("files/a/*", "files/a*"),
            "files/ab/.. is outside files/a/"
        );
        assert!(
            !s("files/a/*", "files/?/x"),
            "wildcard before the parent prefix ends"
        );
        assert!(!s("exact", "exact*"));
        assert!(!s("exact", "other"));
        assert!(!s("files/a/*", "other/a/x"));
        assert!(
            !s("*.txt", "a.txt"),
            "non-prefix globs: identical only (conservative)"
        );
    }

    #[test]
    fn subsumption_is_sound_on_sample_strings() {
        // Whenever subsumes() says yes, every sampled match of the child matches the parent.
        let pats = [
            "*", "a*", "a/*", "a/b/*", "a/b/c", "a?", "?/b", "ab*", "a/?/c", "x",
        ];
        let samples = [
            "", "a", "ab", "abc", "a/b", "a/b/c", "a/b/d", "a/x/c", "x", "xa", "b/b", "a/",
        ];
        for p in pats {
            for c in pats {
                if ResourcePattern::new(p).subsumes(&ResourcePattern::new(c)) {
                    for r in samples {
                        if ResourcePattern::new(c).matches(r) {
                            assert!(
                                ResourcePattern::new(p).matches(r),
                                "{p} should cover {r} (child {c})"
                            );
                        }
                    }
                }
            }
        }
    }

    // ── signatures ───────────────────────────────────────────────────────────

    #[test]
    fn unsigned_tokens_are_rejected() {
        let mut m = CapabilityManager::new();
        m.register_issuer("root", key(1).verifying_key());
        assert!(m
            .issue_at(root_token("t", "root", "alice", "*", &[Read]), NOW)
            .is_err());
    }

    #[test]
    fn unknown_issuers_are_rejected() {
        let mut m = CapabilityManager::new();
        let mut t = root_token("t", "mallory", "mallory", "*", &[Admin]);
        t.sign(&key(9));
        assert!(m.issue_at(t, NOW).unwrap_err().contains("Unknown issuer"));
    }

    #[test]
    fn a_signature_from_the_wrong_key_is_rejected() {
        let mut m = CapabilityManager::new();
        m.register_issuer("root", key(1).verifying_key());
        let mut t = root_token("t", "root", "alice", "*", &[Read]);
        t.sign(&key(2)); // signed by someone else
        assert!(m.issue_at(t, NOW).is_err());
    }

    #[test]
    fn tampering_after_signing_invalidates_the_signature() {
        let mut t = root_token("t", "root", "alice", "files/a/*", &[Read]);
        t.sign(&key(1));
        let vk = key(1).verifying_key();
        assert!(t.verify(&vk));
        for tamper in [
            |t: &mut CapabilityToken| t.permissions.push(Admin),
            |t: &mut CapabilityToken| t.resource = "*".into(),
            |t: &mut CapabilityToken| t.subject = "mallory".into(),
            |t: &mut CapabilityToken| t.expiry = Some(i64::MAX),
            |t: &mut CapabilityToken| t.delegation_chain.push("x".into()),
        ] {
            let mut bad = t.clone();
            tamper(&mut bad);
            assert!(!bad.verify(&vk));
        }
    }

    #[test]
    fn permission_order_does_not_change_the_signature_digest() {
        let mut a = root_token("t", "root", "alice", "*", &[Read, Write]);
        a.sign(&key(1));
        let mut b = a.clone();
        b.permissions = vec![Write, Read];
        assert!(b.verify(&key(1).verifying_key()));
    }

    // ── the escalation attacks the spec forbids ──────────────────────────────

    #[test]
    fn attenuate_cannot_widen_the_resource() {
        let (m, _) = setup("files/a/*", &[Read, Delegate]);
        assert!(m.attenuate("t1", "files/*", &[Read]).is_err());
        assert!(m.attenuate("t1", "*", &[Read]).is_err());
        assert!(m.attenuate("t1", "files/a/b/*", &[Read]).is_ok());
    }

    #[test]
    fn attenuate_cannot_add_permissions() {
        let (m, _) = setup("files/*", &[Read, Delegate]);
        let err = m.attenuate("t1", "files/*", &[Read, Admin]).unwrap_err();
        assert!(err.contains("escalate"), "{err}");
        assert!(m.attenuate("t1", "files/*", &[Write]).is_err());
    }

    #[test]
    fn delegation_requires_the_delegate_permission() {
        let (m, _) = setup("files/*", &[Read]); // no Delegate
        assert!(m
            .attenuate("t1", "files/a/*", &[Read])
            .unwrap_err()
            .contains("Delegate"));
    }

    #[test]
    fn a_hand_forged_escalating_child_is_rejected_at_issue() {
        // Bypass attenuate(): craft the child directly and sign it with alice's real key.
        let (mut m, alice) = setup("files/a/*", &[Read, Delegate]);
        let mut forged = root_token("evil", "alice", "alice", "*", &[Read, Admin]);
        forged.delegation_chain = vec!["t1".into()];
        forged.sign(&alice);
        assert!(m.issue_at(forged, NOW).is_err());
        assert!(!m.check_for_at("alice", "secrets/x", &Admin, NOW));
    }

    #[test]
    fn a_child_cannot_claim_a_parent_it_does_not_descend_from() {
        let (mut m, alice) = setup("files/*", &[Read, Delegate]);
        let mut c = root_token("c", "alice", "alice", "files/*", &[Read]);
        c.delegation_chain = vec!["does-not-exist".into()];
        c.sign(&alice);
        assert!(m.issue_at(c, NOW).unwrap_err().contains("not found"));
    }

    #[test]
    fn a_child_must_be_issued_by_the_parents_subject() {
        let (mut m, _) = setup("files/*", &[Read, Delegate]);
        let mut c = root_token("c", "bob", "bob", "files/*", &[Read]);
        c.delegation_chain = vec!["t1".into()];
        c.sign(&key(3)); // bob is a trusted issuer, but t1's subject is alice
        assert!(m.issue_at(c, NOW).unwrap_err().contains("parent's subject"));
    }

    #[test]
    fn a_child_cannot_outlive_its_parent_or_drop_the_expiry() {
        let mut m = CapabilityManager::new();
        m.register_issuer("root", key(1).verifying_key());
        m.register_issuer("alice", key(2).verifying_key());
        let mut p = root_token("p", "root", "alice", "files/*", &[Read, Delegate]);
        p.expiry = Some(2_000);
        p.sign(&key(1));
        m.issue_at(p, NOW).unwrap();

        for (expiry, ok) in [
            (Some(1_500), true),
            (Some(2_000), true),
            (Some(2_001), false),
            (None, false),
        ] {
            let mut c = root_token(
                &format!("c{expiry:?}"),
                "alice",
                "alice",
                "files/*",
                &[Read],
            );
            c.delegation_chain = vec!["p".into()];
            c.expiry = expiry;
            c.sign(&key(2));
            assert_eq!(m.issue_at(c, NOW).is_ok(), ok, "expiry {expiry:?}");
        }
    }

    // ── legitimate delegation works end to end ───────────────────────────────

    #[test]
    fn delegation_to_another_subject_round_trip() {
        let (mut m, alice) = setup("files/*", &[Read, Write, Delegate]);
        let mut child = m.delegate("t1", "bob", "files/a/*", &[Read]).unwrap();
        child.sign(&alice);
        m.issue_at(child, NOW).unwrap();

        assert!(m.check_for_at("bob", "files/a/x", &Read, NOW));
        assert!(
            !m.check_for_at("bob", "files/a/x", &Write, NOW),
            "write was not delegated"
        );
        assert!(
            !m.check_for_at("bob", "files/b/x", &Read, NOW),
            "outside the narrowed resource"
        );
    }

    // ── subject binding ──────────────────────────────────────────────────────

    #[test]
    fn grants_are_per_subject() {
        let (m, _) = setup("files/*", &[Read]);
        assert!(m.check_for_at("alice", "files/x", &Read, NOW));
        assert!(
            !m.check_for_at("bob", "files/x", &Read, NOW),
            "alice's grant must not authorize bob"
        );
        assert!(!m.check_for_at("", "files/x", &Read, NOW));
    }

    // ── revocation cascades ──────────────────────────────────────────────────

    #[test]
    fn revoking_a_parent_invalidates_children_and_grandchildren() {
        let (mut m, alice) = setup("files/*", &[Read, Delegate]);
        let mut c1 = m
            .delegate("t1", "bob", "files/a/*", &[Read, Delegate])
            .unwrap();
        c1.sign(&alice);
        let c1_id = c1.id.clone();
        m.issue_at(c1, NOW).unwrap();
        let mut c2 = m.delegate(&c1_id, "carol", "files/a/b/*", &[Read]).unwrap();
        c2.sign(&key(3)); // bob signs: c1's subject
        m.issue_at(c2, NOW).unwrap();

        assert!(m.check_for_at("carol", "files/a/b/x", &Read, NOW));
        m.revoke("t1");
        assert!(!m.check_for_at("alice", "files/x", &Read, NOW));
        assert!(!m.check_for_at("bob", "files/a/x", &Read, NOW), "child");
        assert!(
            !m.check_for_at("carol", "files/a/b/x", &Read, NOW),
            "grandchild"
        );
    }

    #[test]
    fn revoking_a_child_does_not_affect_the_parent() {
        let (mut m, alice) = setup("files/*", &[Read, Delegate]);
        let mut c = m.delegate("t1", "bob", "files/a/*", &[Read]).unwrap();
        c.sign(&alice);
        let cid = c.id.clone();
        m.issue_at(c, NOW).unwrap();
        m.revoke(&cid);
        assert!(m.check_for_at("alice", "files/x", &Read, NOW));
        assert!(!m.check_for_at("bob", "files/a/x", &Read, NOW));
    }

    #[test]
    fn a_revoked_token_cannot_be_reissued_or_delegated_from() {
        let (mut m, _) = setup("files/*", &[Read, Delegate]);
        m.revoke("t1");
        assert!(m.attenuate("t1", "files/a/*", &[Read]).is_err());
        let mut again = root_token("t1b", "root", "alice", "files/*", &[Read]);
        again.delegation_chain = vec!["t1".into()];
        again.sign(&key(1));
        assert!(m.issue_at(again, NOW).is_err());
    }

    // ── expiry boundary ──────────────────────────────────────────────────────

    #[test]
    fn a_token_is_valid_strictly_before_its_expiry() {
        let mut m = CapabilityManager::new();
        m.register_issuer("root", key(1).verifying_key());
        let mut t = root_token("t", "root", "alice", "*", &[Read]);
        t.expiry = Some(2_000);
        t.sign(&key(1));
        m.issue_at(t, NOW).unwrap();
        assert!(m.check_for_at("alice", "x", &Read, 1_999));
        assert!(!m.check_for_at("alice", "x", &Read, 2_000));
        assert!(!m.check_for_at("alice", "x", &Read, 9_999));
    }

    #[test]
    fn expired_tokens_cannot_be_issued() {
        let mut m = CapabilityManager::new();
        m.register_issuer("root", key(1).verifying_key());
        let mut t = root_token("t", "root", "alice", "*", &[Read]);
        t.expiry = Some(500);
        t.sign(&key(1));
        assert!(m.issue_at(t, NOW).is_err());
    }

    #[test]
    fn duplicate_ids_are_rejected() {
        let (mut m, _) = setup("*", &[Read]);
        let mut dup = root_token("t1", "root", "mallory", "*", &[Admin]);
        dup.sign(&key(1));
        assert!(m.issue_at(dup, NOW).unwrap_err().contains("already exists"));
    }

    #[test]
    fn audit_log_records_issue_delegate_and_revoke() {
        let (mut m, alice) = setup("files/*", &[Read, Delegate]);
        let mut c = m.delegate("t1", "bob", "files/a/*", &[Read]).unwrap();
        c.sign(&alice);
        m.issue_at(c, NOW).unwrap();
        m.revoke("t1");
        let kinds: Vec<String> = m
            .audit_log
            .iter()
            .map(|e| format!("{:?}", e.action))
            .collect();
        assert_eq!(kinds, vec!["Issued", "Delegated", "Revoked"]);
    }
}
