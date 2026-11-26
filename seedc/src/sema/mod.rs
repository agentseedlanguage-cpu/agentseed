pub mod contractck;
pub mod effectck;
pub mod nameres;
pub mod taintck;
pub mod typeck;
pub mod types;

use crate::ast::{AgentMember, FnDecl, ImplItem, Program, TopLevelItem};
use miette::{Diagnostic, SourceSpan};
use thiserror::Error;

#[derive(Error, Diagnostic, Debug)]
pub enum TypeError {
    #[error("unresolved name `{name}`")]
    #[diagnostic(help("Did you forget to import or declare this name?"))]
    UnresolvedName {
        name: String,
        #[label("not found in this scope")]
        span: SourceSpan,
    },

    #[error("type mismatch")]
    #[diagnostic(help("Expected `{expected}`, found `{found}`."))]
    Mismatch {
        expected: String,
        found: String,
        #[label("expected {expected}")]
        span: SourceSpan,
        #[label("found {found}")]
        found_span: Option<SourceSpan>,
    },

    #[error("affine type violation")]
    #[diagnostic(help("Capability `{name}` was already consumed or moved."))]
    AffineViolation {
        name: String,
        #[label("used again here")]
        span: SourceSpan,
    },

    #[error("effect not discharged")]
    #[diagnostic(help("Effect `{effect}` is performed outside a discharge block."))]
    UndischargedEffect {
        effect: String,
        #[label("performed here")]
        span: SourceSpan,
    },

    #[error("taint violation")]
    #[diagnostic(help("{message}"))]
    TaintViolation {
        message: String,
        #[label("violation")]
        span: SourceSpan,
    },

    #[error("contract violation")]
    #[diagnostic(help("{message}"))]
    ContractViolation {
        message: String,
        #[label("violates contract")]
        span: SourceSpan,
    },

    #[error("unsupported construct")]
    #[diagnostic(help("{message}"))]
    Unsupported {
        message: String,
        #[label("not supported yet")]
        span: SourceSpan,
    },

    #[error(transparent)]
    Other(#[from] Box<dyn Diagnostic + Send + Sync + 'static>),
}

/// Run all semantic analysis passes and return a typed AST.
pub fn check(program: Program) -> Result<Program, TypeError> {
    let program = nameres::resolve(program)?;
    let program = typeck::infer_types(program)?;
    // effectck, taintck, contractck remain identity for now
    let program = effectck::check_effects(program)?;
    let program = taintck::check_taint(program)?;
    let program = contractck::check_contracts(program)?;
    Ok(program)
}

/// Visit every function body in a program: top-level `fn`s, agent methods,
/// `impl` methods, and the contents of inline `mod`s.
///
/// All semantic passes must use this so that code inside agents is checked
/// exactly like free functions.
pub(crate) fn visit_fns<'a>(items: &'a [TopLevelItem], f: &mut impl FnMut(&'a FnDecl)) {
    for item in items {
        match item {
            TopLevelItem::Fn(d) => f(d),
            TopLevelItem::Agent(a) => {
                for m in &a.members {
                    if let AgentMember::Method(d) = m {
                        f(d);
                    }
                }
            }
            TopLevelItem::Impl(i) => {
                for it in &i.items {
                    if let ImplItem::Fn(d) = it {
                        f(d);
                    }
                }
            }
            TopLevelItem::Mod(m) => {
                if let Some(inner) = &m.items {
                    visit_fns(inner, f);
                }
            }
            _ => {}
        }
    }
}
