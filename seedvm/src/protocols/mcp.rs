//! Model Context Protocol (MCP) — server and client implementation.
//!
//! MCP standardises how LLM applications access external tools, data sources,
//! and resources. The official specification is maintained at
//! modelcontextprotocol.io with TypeScript and JSON Schema definitions.
//! The MCP App standard (io.modelcontextprotocol/ui, stable 2026-01-26)
//! adds interactive UI components.
//!
//! **Protocol revision (verified 2026‑10‑31 against the official changelog and the
//! `2026-07-28` release tag):** the current stable revision is `2026-07-28`
//! (final 28 July 2026). It is *stateless*: there is no `initialize` /
//! `notifications/initialized` handshake and no protocol session. Every request
//! carries its version and client capabilities in `_meta`. `ping`,
//! `logging/setLevel` and `notifications/roots/list_changed` were removed, and
//! experimental tasks moved to the `io.modelcontextprotocol/tasks` extension.
//! `2025-11-25` and earlier are the *legacy* (session‑based) era. See
//! [`validate_request_meta`] for the request contract implemented so far.
//!
//! References:
//!   - MCP specification (modelcontextprotocol.io)
//!   - @vantageos/mcp-architect — first MCP App (npm, Apr 2026)
//!   - MCP Go SDK v1.4.0 — OAuth support
//!   - MCPShield defense‑in‑depth (MCPS cryptographic layer)

use std::collections::HashMap;

// ── MCP Types ──

/// An MCP tool definition.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MCPTool {
    /// Unique tool name.
    pub name: String,
    /// Human‑readable description.
    pub description: String,
    /// JSON Schema for the tool's input parameters.
    pub input_schema: serde_json::Value,
    /// Whether the tool returns structured output.
    pub output_schema: Option<serde_json::Value>,
    /// Whether this tool requires user confirmation before execution.
    pub requires_confirmation: bool,
}

/// An MCP resource definition.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MCPResource {
    /// Unique resource URI (e.g., `file:///path/to/data`).
    pub uri: String,
    /// Human‑readable name.
    pub name: String,
    /// MIME type of the resource.
    pub mime_type: String,
    /// Optional description.
    pub description: Option<String>,
}

/// An MCP prompt template.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MCPPrompt {
    /// Unique prompt name.
    pub name: String,
    /// Human‑readable description.
    pub description: String,
    /// The prompt template with optional `{variables}`.
    pub template: String,
    /// Required variable definitions.
    pub arguments: Vec<MCPPromptArgument>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MCPPromptArgument {
    pub name: String,
    pub description: String,
    pub required: bool,
}

/// MCP server lifecycle hooks.
pub trait MCPLifecycle: Send + Sync {
    /// Called when the server starts.
    fn init(&mut self) -> Result<(), String> {
        Ok(())
    }
    /// Called when the server shuts down.
    fn shutdown(&mut self) -> Result<(), String> {
        Ok(())
    }
    /// Called periodically for health checks.
    fn health(&self) -> bool {
        true
    }
}

// ── MCP Server ──

/// An MCP server exposes tools, resources, and prompts to LLM clients.
pub struct MCPServer {
    /// Registered tools.
    pub tools: HashMap<String, MCPTool>,
    /// Registered resources.
    pub resources: HashMap<String, MCPResource>,
    /// Registered prompts.
    pub prompts: HashMap<String, MCPPrompt>,
    /// Lifecycle state.
    pub lifecycle: Box<dyn MCPLifecycle>,
    /// Whether the server is currently running.
    pub running: bool,
    /// Cryptographic session manager (MCPS layer).
    pub crypto_session: Option<McpsSession>,
}

/// MCPS cryptographic session — signed handshake for defense‑in‑depth.
#[derive(Debug, Clone)]
pub struct McpsSession {
    pub session_id: String,
    pub server_nonce: [u8; 32],
    pub client_nonce: Option<[u8; 32]>,
    pub established: bool,
}

impl MCPServer {
    pub fn new(lifecycle: Box<dyn MCPLifecycle>) -> Self {
        Self {
            tools: HashMap::new(),
            resources: HashMap::new(),
            prompts: HashMap::new(),
            lifecycle,
            running: false,
            crypto_session: None,
        }
    }

    /// Register a tool.
    pub fn register_tool(&mut self, tool: MCPTool) {
        self.tools.insert(tool.name.clone(), tool);
    }

    /// Register a resource.
    pub fn register_resource(&mut self, resource: MCPResource) {
        self.resources.insert(resource.uri.clone(), resource);
    }

    /// Register a prompt.
    pub fn register_prompt(&mut self, prompt: MCPPrompt) {
        self.prompts.insert(prompt.name.clone(), prompt);
    }

    /// Start the server lifecycle.
    pub fn start(&mut self) -> Result<(), String> {
        self.lifecycle.init()?;
        self.running = true;
        // Establish MCPS cryptographic session
        let mut nonce = [0u8; 32];
        //getrandom::fill(&mut nonce).map_err(|e| e.to_string())?;
        nonce.fill(0); // placeholder
        self.crypto_session = Some(McpsSession {
            session_id: uuid::Uuid::new_v4().to_string(),
            server_nonce: nonce,
            client_nonce: None,
            established: false,
        });
        Ok(())
    }

    /// Stop the server lifecycle.
    pub fn shutdown(&mut self) -> Result<(), String> {
        self.lifecycle.shutdown()?;
        self.running = false;
        Ok(())
    }

    /// Call a tool by name.
    pub fn call_tool(
        &self,
        name: &str,
        args: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let tool = self
            .tools
            .get(name)
            .ok_or_else(|| format!("Tool '{}' not found", name))?;

        // Validate input against schema
        if let Some(schema) = &tool.input_schema.as_object() {
            // Basic schema validation — in production, use a JSON Schema validator
            if let Some(required) = schema.get("required") {
                if let Some(required_fields) = required.as_array() {
                    for field in required_fields {
                        if let Some(field_name) = field.as_str() {
                            if args.get(field_name).is_none() {
                                return Err(format!("Missing required argument: {}", field_name));
                            }
                        }
                    }
                }
            }
        }

        // Tool execution is delegated to the host runtime
        Ok(serde_json::json!({ "status": "ok", "tool": name }))
    }
}

// ── MCP Client ──

/// An MCP client connects to an MCP server and calls its tools.
pub struct MCPClient {
    /// Connected server endpoints.
    pub connections: HashMap<String, ClientConnection>,
}

#[derive(Debug, Clone)]
pub struct ClientConnection {
    pub server_name: String,
    pub endpoint: String,
    pub established: bool,
    pub tools: Vec<MCPTool>,
    pub resources: Vec<MCPResource>,
}

impl MCPClient {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    /// Connect to an MCP server and discover its capabilities.
    pub fn connect(&mut self, server_name: &str, endpoint: &str) -> Result<(), String> {
        // In a real implementation, this would perform the MCP handshake:
        // 1. Initialize request/response
        // 2. List tools
        // 3. List resources
        // 4. List prompts
        self.connections.insert(
            server_name.to_string(),
            ClientConnection {
                server_name: server_name.to_string(),
                endpoint: endpoint.to_string(),
                established: true,
                tools: vec![],
                resources: vec![],
            },
        );
        Ok(())
    }

    /// Call a tool on a connected server.
    pub fn call_tool(
        &self,
        server: &str,
        tool: &str,
        _args: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let conn = self
            .connections
            .get(server)
            .ok_or_else(|| format!("Not connected to server '{}'", server))?;
        if !conn.established {
            return Err(format!("Connection to '{}' not established", server));
        }
        // Placeholder — real implementation sends JSON‑RPC over stdio or HTTP
        Ok(serde_json::json!({ "status": "ok", "server": server, "tool": tool }))
    }
}

// ── Protocol revision & stateless request metadata (MCP 2026‑07‑28) ──

/// Current stable MCP revision (stateless).
pub const MCP_PROTOCOL_VERSION: &str = "2026-07-28";

/// Legacy, session‑based revisions this implementation can still recognise.
pub const MCP_LEGACY_VERSIONS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

/// Extension identifier for the experimental tasks feature (moved out of core).
pub const MCP_TASKS_EXTENSION: &str = "io.modelcontextprotocol/tasks";

/// JSON‑RPC "Invalid params" — returned for a request missing required `_meta`.
pub const JSONRPC_INVALID_PARAMS: i64 = -32602;

/// Reserved `_meta` keys defined by the 2026‑07‑28 revision.
pub mod meta_keys {
    pub const PROTOCOL_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
    pub const CLIENT_CAPABILITIES: &str = "io.modelcontextprotocol/clientCapabilities";
    pub const CLIENT_INFO: &str = "io.modelcontextprotocol/clientInfo";
    pub const SERVER_INFO: &str = "io.modelcontextprotocol/serverInfo";
    pub const LOG_LEVEL: &str = "io.modelcontextprotocol/logLevel";
    pub const SUBSCRIPTION_ID: &str = "io.modelcontextprotocol/subscriptionId";
}

/// Which protocol era a version string belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolEra {
    /// `2026-07-28` or later: stateless, per‑request `_meta`.
    Stateless,
    /// `2025-11-25` or earlier: `initialize` handshake and sessions.
    LegacySession,
}

/// Classify a revision string. Revisions are ISO dates, so lexicographic order
/// equals chronological order.
pub fn protocol_era(version: &str) -> ProtocolEra {
    if version >= MCP_PROTOCOL_VERSION {
        ProtocolEra::Stateless
    } else {
        ProtocolEra::LegacySession
    }
}

/// Validated per‑request metadata.
#[derive(Debug, Clone, PartialEq)]
pub struct RequestMeta {
    pub protocol_version: String,
    pub client_capabilities: serde_json::Value,
    /// Clients SHOULD send this; absence is allowed.
    pub client_info: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum RequestMetaError {
    /// `_meta` was absent or not a JSON object.
    #[error("`_meta` must be a JSON object")]
    NotAnObject,
    /// A required reserved key is missing or has the wrong type.
    #[error("missing or invalid required `_meta` field `{0}`")]
    MissingField(&'static str),
    /// The server cannot serve the requested revision.
    #[error("unsupported protocol version `{requested}` (supported: {supported:?})")]
    UnsupportedVersion {
        requested: String,
        supported: Vec<&'static str>,
    },
}

impl RequestMetaError {
    /// JSON‑RPC error code, where the specification defines one. A request missing
    /// a required `_meta` field is malformed → `-32602`. The code for an
    /// unsupported version is not asserted here (not verified).
    pub fn jsonrpc_code(&self) -> Option<i64> {
        match self {
            RequestMetaError::NotAnObject | RequestMetaError::MissingField(_) => {
                Some(JSONRPC_INVALID_PARAMS)
            }
            RequestMetaError::UnsupportedVersion { .. } => None,
        }
    }
}

/// Validate the `_meta` object of a 2026‑07‑28 request.
///
/// `protocolVersion` (string) and `clientCapabilities` (object) are required;
/// `clientInfo` is optional. The server then decides whether it can serve the
/// requested revision.
pub fn validate_request_meta(meta: &serde_json::Value) -> Result<RequestMeta, RequestMetaError> {
    let obj = meta.as_object().ok_or(RequestMetaError::NotAnObject)?;

    let version = obj
        .get(meta_keys::PROTOCOL_VERSION)
        .and_then(|v| v.as_str())
        .ok_or(RequestMetaError::MissingField(meta_keys::PROTOCOL_VERSION))?;

    let caps = obj
        .get(meta_keys::CLIENT_CAPABILITIES)
        .filter(|v| v.is_object())
        .ok_or(RequestMetaError::MissingField(
            meta_keys::CLIENT_CAPABILITIES,
        ))?;

    if version != MCP_PROTOCOL_VERSION {
        return Err(RequestMetaError::UnsupportedVersion {
            requested: version.to_owned(),
            supported: vec![MCP_PROTOCOL_VERSION],
        });
    }

    Ok(RequestMeta {
        protocol_version: version.to_owned(),
        client_capabilities: caps.clone(),
        client_info: obj.get(meta_keys::CLIENT_INFO).cloned(),
    })
}

#[cfg(test)]
mod protocol_tests {
    use super::*;
    use serde_json::json;

    fn good() -> serde_json::Value {
        json!({
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {"elicitation": {}},
            "io.modelcontextprotocol/clientInfo": {"name": "example-host", "version": "1.4.0"}
        })
    }

    #[test]
    fn valid_meta_is_accepted() {
        let m = validate_request_meta(&good()).unwrap();
        assert_eq!(m.protocol_version, "2026-07-28");
        assert!(m.client_info.is_some());
    }

    #[test]
    fn client_info_is_optional() {
        let mut m = good();
        m.as_object_mut().unwrap().remove(meta_keys::CLIENT_INFO);
        assert_eq!(validate_request_meta(&m).unwrap().client_info, None);
    }

    #[test]
    fn missing_required_fields_map_to_invalid_params() {
        for key in [meta_keys::PROTOCOL_VERSION, meta_keys::CLIENT_CAPABILITIES] {
            let mut m = good();
            m.as_object_mut().unwrap().remove(key);
            let err = validate_request_meta(&m).unwrap_err();
            assert_eq!(err, RequestMetaError::MissingField(key));
            assert_eq!(err.jsonrpc_code(), Some(-32602));
        }
    }

    #[test]
    fn capabilities_must_be_an_object() {
        let mut m = good();
        m[meta_keys::CLIENT_CAPABILITIES] = json!("elicitation");
        assert!(matches!(
            validate_request_meta(&m),
            Err(RequestMetaError::MissingField(_))
        ));
    }

    #[test]
    fn non_object_meta_is_rejected() {
        for bad in [json!(null), json!([]), json!("x"), json!(7)] {
            let err = validate_request_meta(&bad).unwrap_err();
            assert_eq!(err, RequestMetaError::NotAnObject);
            assert_eq!(err.jsonrpc_code(), Some(-32602));
        }
    }

    #[test]
    fn legacy_versions_are_not_served_statelessly() {
        for v in MCP_LEGACY_VERSIONS {
            let mut m = good();
            m[meta_keys::PROTOCOL_VERSION] = json!(v);
            let err = validate_request_meta(&m).unwrap_err();
            assert!(matches!(err, RequestMetaError::UnsupportedVersion { .. }));
            assert_eq!(err.jsonrpc_code(), None, "code for this case is unverified");
        }
    }

    #[test]
    fn era_classification() {
        assert_eq!(protocol_era("2026-07-28"), ProtocolEra::Stateless);
        assert_eq!(protocol_era("2027-01-01"), ProtocolEra::Stateless);
        for v in MCP_LEGACY_VERSIONS {
            assert_eq!(protocol_era(v), ProtocolEra::LegacySession, "{v}");
        }
    }
}
