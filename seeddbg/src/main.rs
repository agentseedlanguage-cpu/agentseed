//! AGENT-SEED debug adapter — `seeddbg`.
//!
//! A minimal, dependency-light Debug Adapter Protocol (DAP) server speaking
//! `Content-Length`-framed JSON over stdio. Current status (honest scope):
//!
//! * implemented: framing, `initialize`, `launch`, `setBreakpoints` (recorded,
//!   reported *unverified* until the VM exposes a stepping hook),
//!   `threads`, `stackTrace`/`scopes`/`variables` (empty), `configurationDone`,
//!   `disconnect`
//! * not yet: real stepping, variable inspection, memory-layer browsing
//!   (tracked in the roadmap, Phase F10)

use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

/// Read one DAP message (`Content-Length: N\r\n\r\n<json>`).
pub fn read_message<R: BufRead>(r: &mut R) -> io::Result<Option<Value>> {
    let mut len: Option<usize> = None;
    loop {
        let mut line = String::new();
        if r.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some(v) = line.strip_prefix("Content-Length:") {
            len = v.trim().parse().ok();
        }
    }
    let len = len.ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing length"))?;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    serde_json::from_slice(&buf)
        .map(Some)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

/// Write one DAP message with framing.
pub fn write_message<W: Write>(w: &mut W, msg: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(msg)?;
    write!(w, "Content-Length: {}\r\n\r\n", body.len())?;
    w.write_all(&body)?;
    w.flush()
}

#[derive(Default)]
pub struct Adapter {
    seq: i64,
    program: Option<String>,
    breakpoints: Vec<(String, i64)>,
}

impl Adapter {
    fn next_seq(&mut self) -> i64 {
        self.seq += 1;
        self.seq
    }

    fn ok(&mut self, req: &Value, body: Value) -> Value {
        json!({
            "seq": self.next_seq(), "type": "response",
            "request_seq": req["seq"], "success": true,
            "command": req["command"], "body": body
        })
    }

    fn err(&mut self, req: &Value, msg: &str) -> Value {
        json!({
            "seq": self.next_seq(), "type": "response",
            "request_seq": req["seq"], "success": false,
            "command": req["command"], "message": msg
        })
    }

    /// Handle a request; returns responses/events to send and whether to stop.
    pub fn handle(&mut self, req: &Value) -> (Vec<Value>, bool) {
        let cmd = req["command"].as_str().unwrap_or("");
        match cmd {
            "initialize" => {
                let caps = json!({
                    "supportsConfigurationDoneRequest": true,
                    "supportsConditionalBreakpoints": false,
                    "supportsFunctionBreakpoints": false,
                    "supportsStepInTargetsRequest": false
                });
                let resp = self.ok(req, caps);
                let ev = json!({"seq": self.next_seq(), "type": "event", "event": "initialized"});
                (vec![resp, ev], false)
            }
            "launch" => {
                self.program = req["arguments"]["program"].as_str().map(str::to_owned);
                (vec![self.ok(req, json!({}))], false)
            }
            "setBreakpoints" => {
                let path = req["arguments"]["source"]["path"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_owned();
                self.breakpoints.retain(|(p, _)| *p != path);
                let mut out = vec![];
                for bp in req["arguments"]["breakpoints"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    let line = bp["line"].as_i64().unwrap_or(0);
                    self.breakpoints.push((path.clone(), line));
                    out.push(json!({
                        "verified": false, "line": line,
                        "message": "recorded; VM stepping hook not yet available"
                    }));
                }
                (vec![self.ok(req, json!({ "breakpoints": out }))], false)
            }
            "threads" => (
                vec![self.ok(req, json!({"threads": [{"id": 1, "name": "agent-main"}]}))],
                false,
            ),
            "stackTrace" => (
                vec![self.ok(req, json!({"stackFrames": [], "totalFrames": 0}))],
                false,
            ),
            "scopes" => (vec![self.ok(req, json!({"scopes": []}))], false),
            "variables" => (vec![self.ok(req, json!({"variables": []}))], false),
            "configurationDone" => (vec![self.ok(req, json!({}))], false),
            "disconnect" => (vec![self.ok(req, json!({}))], true),
            other => {
                let msg = format!("unsupported command `{other}`");
                (vec![self.err(req, &msg)], false)
            }
        }
    }
}

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut out = stdout.lock();
    let mut adapter = Adapter::default();
    while let Some(req) = read_message(&mut input)? {
        let (msgs, stop) = adapter.handle(&req);
        for m in msgs {
            write_message(&mut out, &m)?;
        }
        if stop {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(v: &Value) -> Vec<u8> {
        let mut b = vec![];
        write_message(&mut b, v).unwrap();
        b
    }

    #[test]
    fn framing_roundtrip() {
        let msg = json!({"seq": 1, "type": "request", "command": "threads"});
        let bytes = frame(&msg);
        let mut cur = io::Cursor::new(bytes);
        assert_eq!(read_message(&mut cur).unwrap().unwrap(), msg);
        assert!(read_message(&mut cur).unwrap().is_none());
    }

    #[test]
    fn initialize_emits_initialized_event() {
        let mut a = Adapter::default();
        let (msgs, stop) = a.handle(&json!({"seq": 1, "command": "initialize"}));
        assert!(!stop);
        assert_eq!(msgs[0]["success"], true);
        assert_eq!(msgs[1]["event"], "initialized");
    }

    #[test]
    fn breakpoints_reported_unverified() {
        let mut a = Adapter::default();
        let req = json!({"seq": 2, "command": "setBreakpoints", "arguments":
            {"source": {"path": "a.seed"}, "breakpoints": [{"line": 3}]}});
        let (msgs, _) = a.handle(&req);
        assert_eq!(msgs[0]["body"]["breakpoints"][0]["verified"], false);
    }

    #[test]
    fn unknown_command_errors_and_disconnect_stops() {
        let mut a = Adapter::default();
        let (m, _) = a.handle(&json!({"seq": 1, "command": "nope"}));
        assert_eq!(m[0]["success"], false);
        let (_, stop) = a.handle(&json!({"seq": 2, "command": "disconnect"}));
        assert!(stop);
    }
}
