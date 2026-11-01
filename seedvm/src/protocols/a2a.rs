//! Agent‑to‑Agent (A2A) v1.0 Protocol — native inter‑agent communication.
//!
//! A2A v1.0.0 was released 12 March 2026 (Linux Foundation; since August 2026 a
//! Growth‑Stage project of the Agentic AI Foundation). Three bindings carry the
//! same eleven operations: JSON‑RPC 2.0, gRPC and HTTP+JSON/REST.
//!
//! **Verified against the official quick reference / specification at
//! a2a-protocol.org (v1.0.0) on 2026‑10‑31.** The normative source of truth is
//! `specification/a2a.proto`; this module is a hand‑written subset and MUST be
//! regenerated/re‑checked from the proto before any conformance claim.
//!
//! Facts encoded here (and previously wrong in this file):
//!   * Agent Card path is `/.well-known/agent-card.json` (v0.3 used `agent.json`).
//!   * Task states: SUBMITTED, WORKING, INPUT_REQUIRED, AUTH_REQUIRED (interrupted);
//!     COMPLETED, FAILED, CANCELED, REJECTED (terminal) — eight states, plus the
//!     proto zero value UNSPECIFIED. There is no `PENDING`, `PAUSED` or `EXPIRED`.
//!   * Operations: SendMessage, SendStreamingMessage, GetTask, ListTasks,
//!     CancelTask, SubscribeToTask, GetExtendedAgentCard and Create/Get/List/Delete
//!     TaskPushNotificationConfig. (`Authenticate`, `GetExtensions`,
//!     `ExecuteExtension`, `SetTaskArtifact`… are NOT A2A operations.)
//!   * Terminal tasks accept no further messages (`UnsupportedOperationError`).
//!
//! Still to do: typed request/response messages from the proto, signed Agent
//! Cards (JWS over JCS), the `A2A-Version` service parameter / version negotiation,
//! streaming, push notifications, and the official TCK (github.com/a2aproject/a2a-tck).

use std::collections::HashMap;

/// Well‑known discovery path for the Agent Card (A2A v1.0.0; RFC 8615).
pub const AGENT_CARD_PATH: &str = "/.well-known/agent-card.json";

// ── AgentCard ──

/// Self‑describing metadata published by every A2A‑compliant agent.
/// Served at `GET /.well-known/agent-card.json` ([`AGENT_CARD_PATH`]).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentCard {
    /// Unique agent identifier (DID or UUID).
    pub id: String,
    /// Human‑readable name.
    pub name: String,
    /// Description of what this agent does.
    pub description: String,
    /// Supported skills / capabilities.
    pub skills: Vec<Skill>,
    /// Supported input/output modes (text, structured, multimodal).
    pub io_modes: Vec<IoMode>,
    /// Authentication requirements.
    pub auth: Option<AuthInfo>,
    /// Agent's endpoint URL for A2A communication.
    pub endpoint: String,
    /// Protocol version.
    pub version: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub input_schema: Option<serde_json::Value>,
    pub output_schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum IoMode {
    Text,
    Structured,
    Multimodal,
    Streaming,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthInfo {
    pub method: AuthMethod,
    pub description: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum AuthMethod {
    None,
    Hmac,
    OAuth2,
    ApiKey,
}

// ── Task lifecycle (A2A v1.0.0) ──

/// A2A task states. Wire names are the v1.0 `TASK_STATE_*` enum strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum TaskState {
    /// Proto3 zero value; an implementation SHOULD treat it as an error.
    #[serde(rename = "TASK_STATE_UNSPECIFIED")]
    Unspecified,
    /// Task accepted but not yet started.
    #[serde(rename = "TASK_STATE_SUBMITTED")]
    Submitted,
    /// Agent is actively working.
    #[serde(rename = "TASK_STATE_WORKING")]
    Working,
    /// Interrupted: the agent needs more input from the client.
    #[serde(rename = "TASK_STATE_INPUT_REQUIRED")]
    InputRequired,
    /// Interrupted: the agent needs (additional) authentication.
    #[serde(rename = "TASK_STATE_AUTH_REQUIRED")]
    AuthRequired,
    /// Terminal: work complete.
    #[serde(rename = "TASK_STATE_COMPLETED")]
    Completed,
    /// Terminal: work finished with an error.
    #[serde(rename = "TASK_STATE_FAILED")]
    Failed,
    /// Terminal: cancelled.
    #[serde(rename = "TASK_STATE_CANCELED")]
    Canceled,
    /// Terminal: the agent declined the task.
    #[serde(rename = "TASK_STATE_REJECTED")]
    Rejected,
}

impl TaskState {
    /// Terminal states are final: no further messages, no further transitions.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            TaskState::Completed | TaskState::Failed | TaskState::Canceled | TaskState::Rejected
        )
    }

    /// Interrupted states wait on the client rather than the agent.
    pub fn is_interrupted(self) -> bool {
        matches!(self, TaskState::InputRequired | TaskState::AuthRequired)
    }
}

/// A tracked A2A task.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Task {
    pub id: String,
    pub context_id: Option<String>,
    pub state: TaskState,
    pub agent_id: String,
    pub input: serde_json::Value,
    pub output: Option<serde_json::Value>,
    pub artifacts: Vec<Artifact>,
    pub history: Vec<TaskEvent>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Artifact {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskEvent {
    pub timestamp: String,
    pub from_state: TaskState,
    pub to_state: TaskState,
    pub reason: Option<String>,
}

// ── Operations (the eleven defined by A2A v1.0.0) ──

/// The eleven A2A v1.0.0 operations. Names are identical across the JSON‑RPC and
/// gRPC bindings (v0.3 names such as `message/send` were retired in v1.0).
/// Typed request/response payloads are generated from `a2a.proto` in a later milestone.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum A2aOperation {
    SendMessage,
    SendStreamingMessage,
    GetTask,
    ListTasks,
    CancelTask,
    SubscribeToTask,
    GetExtendedAgentCard,
    CreateTaskPushNotificationConfig,
    GetTaskPushNotificationConfig,
    ListTaskPushNotificationConfigs,
    DeleteTaskPushNotificationConfig,
}

impl A2aOperation {
    pub const ALL: [A2aOperation; 11] = [
        A2aOperation::SendMessage,
        A2aOperation::SendStreamingMessage,
        A2aOperation::GetTask,
        A2aOperation::ListTasks,
        A2aOperation::CancelTask,
        A2aOperation::SubscribeToTask,
        A2aOperation::GetExtendedAgentCard,
        A2aOperation::CreateTaskPushNotificationConfig,
        A2aOperation::GetTaskPushNotificationConfig,
        A2aOperation::ListTaskPushNotificationConfigs,
        A2aOperation::DeleteTaskPushNotificationConfig,
    ];

    /// Binding‑level method name (JSON‑RPC `method`, gRPC rpc name).
    pub fn wire_name(self) -> &'static str {
        match self {
            A2aOperation::SendMessage => "SendMessage",
            A2aOperation::SendStreamingMessage => "SendStreamingMessage",
            A2aOperation::GetTask => "GetTask",
            A2aOperation::ListTasks => "ListTasks",
            A2aOperation::CancelTask => "CancelTask",
            A2aOperation::SubscribeToTask => "SubscribeToTask",
            A2aOperation::GetExtendedAgentCard => "GetExtendedAgentCard",
            A2aOperation::CreateTaskPushNotificationConfig => "CreateTaskPushNotificationConfig",
            A2aOperation::GetTaskPushNotificationConfig => "GetTaskPushNotificationConfig",
            A2aOperation::ListTaskPushNotificationConfigs => "ListTaskPushNotificationConfigs",
            A2aOperation::DeleteTaskPushNotificationConfig => "DeleteTaskPushNotificationConfig",
        }
    }

    pub fn from_wire_name(name: &str) -> Option<A2aOperation> {
        A2aOperation::ALL
            .into_iter()
            .find(|op| op.wire_name() == name)
    }

    /// Operations that are only valid when the Agent Card declares the capability.
    pub fn requires_streaming(self) -> bool {
        matches!(
            self,
            A2aOperation::SendStreamingMessage | A2aOperation::SubscribeToTask
        )
    }

    pub fn requires_push_notifications(self) -> bool {
        matches!(
            self,
            A2aOperation::CreateTaskPushNotificationConfig
                | A2aOperation::GetTaskPushNotificationConfig
                | A2aOperation::ListTaskPushNotificationConfigs
                | A2aOperation::DeleteTaskPushNotificationConfig
        )
    }
}

// ── A2A Service ──

/// The A2A service — manages agent registration, task lifecycle, and
/// inter‑agent message routing.
pub struct A2AService {
    /// This agent's card.
    pub card: AgentCard,
    /// Known peer agents, keyed by agent ID.
    pub peers: HashMap<String, AgentCard>,
    /// Active and archived tasks.
    pub tasks: HashMap<String, Task>,
    /// Webhook callbacks for push notifications.
    pub subscriptions: HashMap<String, Vec<String>>,
    /// Monotonic task ID counter.
    next_task_id: u64,
}

impl A2AService {
    pub fn new(card: AgentCard) -> Self {
        Self {
            card,
            peers: HashMap::new(),
            tasks: HashMap::new(),
            subscriptions: HashMap::new(),
            next_task_id: 0,
        }
    }

    /// Generate a new unique task ID.
    pub fn next_task_id(&mut self) -> String {
        let id = format!("task-{:08x}", self.next_task_id);
        self.next_task_id += 1;
        id
    }

    /// Register a peer agent.
    pub fn register_peer(&mut self, card: AgentCard) {
        self.peers.insert(card.id.clone(), card);
    }

    /// Create a new task and transition to Submitted.
    pub fn create_task(&mut self, agent_id: &str, input: serde_json::Value) -> String {
        let id = self.next_task_id();
        let task = Task {
            id: id.clone(),
            context_id: None,
            state: TaskState::Submitted,
            agent_id: agent_id.to_string(),
            input,
            output: None,
            artifacts: vec![],
            history: vec![TaskEvent {
                timestamp: chrono::Utc::now().to_rfc3339(),
                from_state: TaskState::Submitted,
                to_state: TaskState::Submitted,
                reason: Some("task created".into()),
            }],
        };
        self.tasks.insert(id.clone(), task);
        id
    }

    /// Transition a task to a new state.
    ///
    /// Terminal states are final (A2A v1.0.0): leaving one is an error. Previously
    /// this silently allowed e.g. `Completed -> Working`.
    pub fn transition_task(
        &mut self,
        task_id: &str,
        new_state: TaskState,
        reason: Option<String>,
    ) -> Result<(), String> {
        let task = self
            .tasks
            .get_mut(task_id)
            .ok_or_else(|| format!("Task {task_id} not found"))?;
        let old_state = task.state;
        if old_state.is_terminal() {
            return Err(format!(
                "Task {task_id} is in terminal state {old_state:?}; cannot transition to {new_state:?}"
            ));
        }
        task.state = new_state;
        task.history.push(TaskEvent {
            timestamp: chrono::Utc::now().to_rfc3339(),
            from_state: old_state,
            to_state: new_state,
            reason,
        });
        Ok(())
    }

    /// Execute a SendMessage RPC.
    pub fn send_message(
        &mut self,
        task_id: &str,
        _message: &serde_json::Value,
    ) -> Result<(), String> {
        match self.tasks.get(task_id) {
            None => Err(format!("Task {task_id} not found")),
            Some(task) if task.state.is_terminal() => Err(format!(
                "Cannot send message to task in terminal state {:?}",
                task.state
            )),
            Some(_) => {
                self.transition_task(task_id, TaskState::Working, Some("message received".into()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn svc() -> A2AService {
        let card: AgentCard = serde_json::from_value(serde_json::json!({
            "id": "agent-1", "name": "t", "description": "d",
            "skills": [], "io_modes": [], "auth": null, "endpoint": "http://x", "version": "1.0.0"
        }))
        .unwrap_or_else(|e| panic!("card fixture must deserialize: {e}"));
        A2AService::new(card)
    }

    #[test]
    fn agent_card_path_is_v1_not_v0_3() {
        assert_eq!(AGENT_CARD_PATH, "/.well-known/agent-card.json");
        assert!(!AGENT_CARD_PATH.contains("agent.json"));
    }

    #[test]
    fn terminal_and_interrupted_partition_matches_the_standard() {
        use TaskState::*;
        for s in [Completed, Failed, Canceled, Rejected] {
            assert!(s.is_terminal() && !s.is_interrupted(), "{s:?}");
        }
        for s in [InputRequired, AuthRequired] {
            assert!(s.is_interrupted() && !s.is_terminal(), "{s:?}");
        }
        for s in [Submitted, Working, Unspecified] {
            assert!(!s.is_terminal() && !s.is_interrupted(), "{s:?}");
        }
    }

    #[test]
    fn states_serialize_to_v1_wire_names() {
        let j = |s: TaskState| serde_json::to_string(&s).unwrap();
        assert_eq!(j(TaskState::Working), "\"TASK_STATE_WORKING\"");
        assert_eq!(j(TaskState::AuthRequired), "\"TASK_STATE_AUTH_REQUIRED\"");
        assert_eq!(j(TaskState::Rejected), "\"TASK_STATE_REJECTED\"");
        let back: TaskState = serde_json::from_str("\"TASK_STATE_CANCELED\"").unwrap();
        assert_eq!(back, TaskState::Canceled);
    }

    #[test]
    fn retired_states_are_rejected_on_the_wire() {
        for bad in [
            "TASK_STATE_PENDING",
            "TASK_STATE_PAUSED",
            "TASK_STATE_EXPIRED",
        ] {
            assert!(
                serde_json::from_str::<TaskState>(&format!("\"{bad}\"")).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn there_are_exactly_eleven_operations_with_unique_wire_names() {
        let names: std::collections::HashSet<_> =
            A2aOperation::ALL.iter().map(|o| o.wire_name()).collect();
        assert_eq!(A2aOperation::ALL.len(), 11);
        assert_eq!(names.len(), 11);
        for op in A2aOperation::ALL {
            assert_eq!(A2aOperation::from_wire_name(op.wire_name()), Some(op));
        }
    }

    #[test]
    fn non_standard_and_v0_3_method_names_are_unknown() {
        for bad in [
            "message/send",
            "tasks/get",
            "Authenticate",
            "GetExtensions",
            "ExecuteExtension",
            "SetTaskArtifact",
            "SubscribeTask",
            "GetAgentCard",
        ] {
            assert_eq!(A2aOperation::from_wire_name(bad), None, "{bad}");
        }
    }

    #[test]
    fn capability_gated_operations() {
        assert!(A2aOperation::SendStreamingMessage.requires_streaming());
        assert!(A2aOperation::SubscribeToTask.requires_streaming());
        assert!(!A2aOperation::SendMessage.requires_streaming());
        assert!(A2aOperation::DeleteTaskPushNotificationConfig.requires_push_notifications());
        assert!(!A2aOperation::GetTask.requires_push_notifications());
    }

    #[test]
    fn terminal_tasks_are_final() {
        let mut s = svc();
        let id = s.create_task("agent-1", serde_json::json!({}));
        s.transition_task(&id, TaskState::Completed, None).unwrap();
        assert!(s.transition_task(&id, TaskState::Working, None).is_err());
        assert_eq!(s.tasks[&id].state, TaskState::Completed);
    }

    #[test]
    fn send_message_rejected_for_every_terminal_state() {
        for t in [
            TaskState::Completed,
            TaskState::Failed,
            TaskState::Canceled,
            TaskState::Rejected,
        ] {
            let mut s = svc();
            let id = s.create_task("agent-1", serde_json::json!({}));
            s.transition_task(&id, t, None).unwrap();
            assert!(
                s.send_message(&id, &serde_json::json!({})).is_err(),
                "{t:?}"
            );
        }
    }

    #[test]
    fn send_message_resumes_interrupted_tasks() {
        let mut s = svc();
        let id = s.create_task("agent-1", serde_json::json!({}));
        s.transition_task(&id, TaskState::InputRequired, None)
            .unwrap();
        s.send_message(&id, &serde_json::json!({})).unwrap();
        assert_eq!(s.tasks[&id].state, TaskState::Working);
    }

    #[test]
    fn unknown_task_is_an_error_not_a_silent_noop() {
        let mut s = svc();
        assert!(s.transition_task("nope", TaskState::Working, None).is_err());
        assert!(s.send_message("nope", &serde_json::json!({})).is_err());
    }
}
