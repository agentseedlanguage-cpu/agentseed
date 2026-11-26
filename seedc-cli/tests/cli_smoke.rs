//! End-to-end smoke tests for the `seed` binary (std only, no extra deps).
use std::path::PathBuf;
use std::process::{Command, Output};

fn seed(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_seed"))
        .args(args)
        .current_dir(repo_root())
        .output()
        .expect("failed to spawn `seed`")
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .to_path_buf()
}

fn stdout(o: &Output) -> String {
    String::from_utf8_lossy(&o.stdout).into_owned()
}

#[test]
fn version_flag_works() {
    let o = seed(&["--version"]);
    assert!(o.status.success());
    assert!(stdout(&o).contains("seed"));
}

#[test]
fn check_accepts_hello_and_agent_examples() {
    for ex in ["examples/hello.seed", "examples/agent.seed"] {
        let o = seed(&["check", ex]);
        assert!(
            o.status.success(),
            "{ex}: {}",
            String::from_utf8_lossy(&o.stderr)
        );
    }
}

#[test]
fn run_hello_prints_greeting() {
    let o = seed(&["run", "examples/hello.seed"]);
    assert!(o.status.success());
    assert!(stdout(&o).contains("Hello, Agent!"));
}

#[test]
fn check_rejects_missing_file() {
    let o = seed(&["check", "examples/does_not_exist.seed"]);
    assert!(!o.status.success());
}

#[test]
fn check_rejects_perform_outside_discharge() {
    let dir = std::env::temp_dir().join("seed_cli_smoke");
    std::fs::create_dir_all(&dir).expect("tmp dir");
    let f = dir.join("bad.seed");
    std::fs::write(
        &f,
        r#"agent A { fn go(q: i32) -> i32 { let r = perform("search", q); 0 } }"#,
    )
    .expect("write");
    let o = seed(&["check", f.to_str().expect("utf8 path")]);
    assert!(!o.status.success(), "unguarded perform must be rejected");
}

#[test]
fn check_rejects_syntax_errors() {
    let dir = std::env::temp_dir().join("seed_cli_smoke");
    std::fs::create_dir_all(&dir).expect("tmp dir");
    let f = dir.join("syntax.seed");
    std::fs::write(&f, "agent A { fn f( }").expect("write");
    let o = seed(&["check", f.to_str().expect("utf8 path")]);
    assert!(!o.status.success());
}
