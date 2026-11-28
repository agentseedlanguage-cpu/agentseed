//! End-to-end: source text → compile → verify → register-frame VM.
use seedvm::executor::VM;
use seedvm::state::VmError;
use seedvm::value::Value;

fn build(src: &str) -> seedc::ir::Module {
    let bytes = seedc::compile(src).unwrap_or_else(|e| panic!("compile failed: {e:?}\n{src}"));
    let module = seedc::binary::deserialize(&bytes).expect("deserialize");
    seedc::ir::verify(&module).expect("verify");
    module
}

fn run(src: &str) -> (Value, Vec<String>) {
    let mut vm = VM::new(build(src), 7);
    vm.echo_stdout = false;
    let v = vm
        .run_main()
        .unwrap_or_else(|e| panic!("runtime error: {e:?}\n{src}"));
    (v, vm.output)
}

fn run_err(src: &str) -> VmError {
    let mut vm = VM::new(build(src), 7);
    vm.echo_stdout = false;
    vm.run_main().expect_err("expected a runtime error")
}

fn int(src: &str) -> i64 {
    match run(src).0 {
        Value::I64(n) => n,
        other => panic!("expected integer, got {other:?}"),
    }
}

#[test]
fn hello_prints_the_real_string() {
    let (_, out) = run(r#"fn main() { print("Hello, Agent!") }"#);
    assert_eq!(out, vec!["Hello, Agent!"]);
}

#[test]
fn variables_and_arithmetic() {
    assert_eq!(
        int("fn main() -> i64 { let a = 3; let b = 4; let c = a + b; c * c }"),
        49
    );
}

#[test]
fn shadowing_and_block_scope() {
    assert_eq!(
        int("fn main() -> i64 { let x = 1; { let x = 10; x }; x }"),
        1
    );
    assert_eq!(int("fn main() -> i64 { let x = 1; let x = x + 1; x }"), 2);
}

#[test]
fn function_calls_return_values() {
    let src = "fn add(a: i64, b: i64) -> i64 { a + b }
               fn main() -> i64 { add(add(1, 2), add(3, 4)) }";
    assert_eq!(int(src), 10);
}

#[test]
fn recursion_works() {
    let fact = "fn fact(n: i64) -> i64 { if n <= 1 { 1 } else { n * fact(n - 1) } }
                fn main() -> i64 { fact(10) }";
    assert_eq!(int(fact), 3_628_800);
    let fib = "fn fib(n: i64) -> i64 { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
               fn main() -> i64 { fib(15) }";
    assert_eq!(int(fib), 610);
}

#[test]
fn if_is_an_expression_and_code_after_it_runs() {
    let src = "fn main() -> i64 { let a = if 1 < 2 { 10 } else { 20 }; a + 1 }";
    assert_eq!(int(src), 11);
}

#[test]
fn while_loops_and_assignment() {
    let src = "fn main() -> i64 { let i = 0; let s = 0; while i < 10 { s += i; i += 1; } s }";
    assert_eq!(int(src), 45);
}

#[test]
fn for_over_ranges() {
    assert_eq!(
        int("fn main() -> i64 { let s = 0; for i in 0..5 { s += i; } s }"),
        10
    );
    assert_eq!(
        int("fn main() -> i64 { let s = 0; for i in 1..=5 { s += i; } s }"),
        15
    );
}

#[test]
fn loop_break_with_value_and_continue() {
    assert_eq!(
        int("fn main() -> i64 { let i = 0; loop { i += 1; if i == 7 { break i * 2; } } }"),
        14
    );
    let src =
        "fn main() -> i64 { let s = 0; for i in 0..10 { if i % 2 == 0 { continue; } s += i; } s }";
    assert_eq!(int(src), 25);
}

#[test]
fn logical_operators_short_circuit() {
    // `boom` would divide by zero if it ran
    let src = "fn boom() -> bool { 1 / 0 == 0 }
               fn main() -> bool { false && boom() }";
    assert_eq!(run(src).0, Value::Bool(false));
    let src = "fn boom() -> bool { 1 / 0 == 0 }
               fn main() -> bool { true || boom() }";
    assert_eq!(run(src).0, Value::Bool(true));
}

#[test]
fn bitwise_and_shift_operators() {
    assert_eq!(int("fn main() -> i64 { (6 & 3) | (1 << 4) }"), 18);
    assert_eq!(int("fn main() -> i64 { 5 ^ 1 }"), 4);
}

#[test]
fn strings_compare_and_concatenate() {
    let (v, _) = run(r#"fn main() -> string { "foo" + "bar" }"#);
    assert_eq!(v, Value::String(std::rc::Rc::new("foobar".into())));
    assert_eq!(
        run(r#"fn main() -> bool { "a" < "b" }"#).0,
        Value::Bool(true)
    );
}

#[test]
fn match_literals_wildcard_binding_and_guard() {
    let m = |n: i64| {
        int(&format!(
            "fn main() -> i64 {{ match {n} {{ 1 => 100, 2 => 200, x if x > 50 => x, _ => 0 }} }}"
        ))
    };
    assert_eq!((m(1), m(2), m(77), m(5)), (100, 200, 77, 0));
}

#[test]
fn non_exhaustive_match_traps() {
    let err = run_err("fn main() -> i64 { match 3 { 1 => 1, 2 => 2 } }");
    assert!(matches!(err, VmError::Trap(m) if m.contains("non-exhaustive")));
}

#[test]
fn print_formats_each_value() {
    let (_, out) = run(r#"fn main() { print("n =", 42); print(1 + 2) }"#);
    assert_eq!(out.len(), 2);
    assert!(out[0].starts_with("n = 4"));
}

#[test]
fn perform_inside_discharge_records_the_real_effect_name() {
    let src = r#"fn main() { discharge 1 with { confidence: 0.5, taint: 0.5 } { perform Effect::Search("q") } }"#;
    let mut vm = VM::new(build(src), 7);
    vm.echo_stdout = false;
    vm.run_main().expect("runs");
    assert_eq!(vm.state.effects, vec!["Effect::Search".to_string()]);
}

#[test]
fn break_out_of_a_discharge_inside_a_loop_closes_the_scope() {
    // verifier + VM both accept it: DischargeEnd is emitted before the jump
    let src = r#"fn main() -> i64 {
        let n = 0;
        loop {
            discharge 1 with { confidence: 0.5, taint: 0.5 } {
                perform Effect::Tick(n);
                n += 1;
                if n == 3 { break n; }
            }
        }
    }"#;
    assert_eq!(int(src), 3);
}

#[test]
fn runtime_errors_are_reported() {
    assert!(matches!(
        run_err("fn main() -> i64 { 1 / 0 }"),
        VmError::DivisionByZero
    ));
    assert!(matches!(
        run_err("fn f(n: i64) -> i64 { f(n + 1) } fn main() -> i64 { f(0) }"),
        VmError::CallDepthExceeded { .. }
    ));
}

#[test]
fn runaway_loop_hits_the_step_limit() {
    let mut vm = VM::new(build("fn main() { loop { } }"), 7);
    vm.echo_stdout = false;
    vm.max_steps = 10_000;
    assert!(matches!(vm.run_main(), Err(VmError::FuelExhausted { .. })));
}

// ── compile-time rejection (fail closed) ──

fn compile_err(src: &str) -> String {
    format!(
        "{:?}",
        seedc::compile(src).expect_err("expected a compile error")
    )
}

#[test]
fn unresolved_names_and_calls_are_compile_errors() {
    assert!(compile_err("fn main() -> i64 { nope }").contains("UnresolvedName"));
    assert!(compile_err("fn main() { nope(1) }").contains("UnresolvedName"));
}

#[test]
fn wrong_argument_count_is_a_compile_error() {
    assert!(
        compile_err("fn f(a: i64) -> i64 { a } fn main() -> i64 { f(1, 2) }").contains("argument")
    );
}

#[test]
fn unsupported_constructs_are_compile_errors_not_silent_nops() {
    // method calls and member access parse but have no back end yet
    assert!(compile_err("fn main() { let a = 1; a.foo() }").contains("not supported"));
    assert!(compile_err("fn main() { let a = 1; let b = a.field; }").contains("not supported"));
}

#[test]
fn break_outside_a_loop_is_a_compile_error() {
    assert!(compile_err("fn main() { break; }").contains("outside of a loop"));
}
