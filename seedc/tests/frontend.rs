//! Regression tests for lexer/parser/sema fixes (checkpoint 2).
use seedc::ast::{ExprKind, SeedValue, Stmt, TopLevelItem};
use seedc::{lexer::tokenize, parser::parse, sema};

fn parse_src(src: &str) -> Result<seedc::ast::Program, seedc::parser::ParseError> {
    parse(&tokenize(src).expect("lex"))
}

#[test]
fn fat_arrow_is_one_token() {
    let kinds: Vec<_> = tokenize("a => b == c >= d")
        .unwrap()
        .iter()
        .map(|t| t.text.clone())
        .collect();
    assert_eq!(kinds[1], "=>");
    assert_eq!(kinds[3], "==");
    assert_eq!(kinds[5], ">=");
}

#[test]
fn parse_errors_are_not_swallowed() {
    assert!(parse_src("agent A { fn f( }").is_err());
}

#[test]
fn stray_close_brace_terminates() {
    assert!(parse_src("}").is_err());
}

#[test]
fn seed_blocks_parse_with_values() {
    let src = r#"seed s {
        §IDENTITY-ANCHOR {
            name: "Ada"
            personality-traits: O:0.9 C:0.8
            non-negotiables: ["a", "b"]
        }
        §MEMORY-HIERARCHY {
            L1-WORKING: { weight: 1.0, consent: private }
        }
        §HEARTBEAT {
            enabled: true
            interval: 30s
        }
    }"#;
    let p = parse_src(src).unwrap();
    let TopLevelItem::Seed(s) = &p.items[0] else {
        panic!("not a seed")
    };
    assert_eq!(s.blocks.len(), 3);
    assert_eq!(s.blocks[0].name, "IDENTITY-ANCHOR");
    assert!(matches!(&s.blocks[0].entries[0].value, SeedValue::Str(x) if x == "Ada"));
    assert!(matches!(&s.blocks[0].entries[1].value, SeedValue::Bare(x) if x == "O:0.9 C:0.8"));
    assert!(matches!(&s.blocks[0].entries[2].value, SeedValue::List(v) if v.len() == 2));
    assert!(matches!(&s.blocks[1].entries[0].value, SeedValue::Map(m) if m.len() == 2));
    assert_eq!(s.blocks[1].entries[0].key, "L1-WORKING");
    assert!(matches!(
        &s.blocks[2].entries[0].value,
        SeedValue::Bool(true)
    ));
    assert!(matches!(&s.blocks[2].entries[1].value, SeedValue::Bare(x) if x == "30s"));
}

#[test]
fn domain_keywords_are_contextual_identifiers() {
    assert!(parse_src("fn f(query: i32) -> i32 { query }").is_ok());
}

fn first_discharge(src: &str) -> Vec<seedc::ast::Threshold> {
    let p = parse_src(src).unwrap();
    for item in &p.items {
        if let TopLevelItem::Fn(f) = item {
            let b = f.body.as_ref().unwrap();
            let e = b.last.as_ref().or_else(|| match b.stmts.last() {
                Some(Stmt::Expr(e)) => Some(e),
                _ => None,
            });
            if let Some(ExprKind::Discharge(_, arms)) = e.map(|e| &e.kind) {
                return arms.iter().map(|(t, _)| t.clone()).collect();
            }
        }
    }
    panic!("no discharge found");
}

#[test]
fn discharge_with_form_keeps_thresholds() {
    let t = first_discharge("fn f(x: i32) { discharge x with { confidence: 0.85, taint: 0.2, budget: remaining } { x } }");
    assert_eq!(t.len(), 1);
    assert_eq!(t[0].confidence, Some(0.85));
    assert_eq!(t[0].max_taint, Some(0.2));
    assert_eq!(t[0].budget.as_deref(), Some("remaining"));
}

#[test]
fn discharge_arm_form_keeps_thresholds() {
    let t = first_discharge(
        "fn f(x: i32) { discharge x { confidence >= 0.9 => { x } else => { x } } }",
    );
    assert_eq!(t.len(), 2);
    assert_eq!(t[0].confidence, Some(0.9));
    assert!(t[1].is_else);
}

#[test]
fn perform_path_form_records_capability() {
    let p = parse_src(
        "fn f(u: i32) { discharge u with { confidence: 0.5 } { perform Effect::NetworkCall(u) requires cap::network_read } }",
    )
    .unwrap();
    let TopLevelItem::Fn(f) = &p.items[0] else {
        panic!()
    };
    let dump = format!("{:?}", f.body);
    assert!(dump.contains("Effect::NetworkCall"));
    assert!(dump.contains("cap::network_read"));
}

#[test]
fn perform_outside_discharge_in_agent_method_is_rejected() {
    let src = r#"agent A { fn go(q: i32) -> i32 { let r = perform("search", q); 0 } }"#;
    let p = parse_src(src).unwrap();
    assert!(
        sema::check(p).is_err(),
        "perform outside discharge inside an agent method must be rejected"
    );
}

#[test]
fn perform_inside_discharge_in_agent_method_is_accepted() {
    let src = r#"agent A { fn go(q: i32) -> i32 { discharge q with { confidence: 0.5 } { perform("search", q) } 0 } }"#;
    let p = parse_src(src).unwrap();
    sema::check(p).expect("well-formed");
}
