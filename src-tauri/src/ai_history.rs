use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "ai_chat_history.sqlite3";
const MAX_TITLE_CHARS: usize = 48;
const MAX_PREVIEW_CHARS: usize = 120;
const DEFAULT_HISTORY_MODE: &str = "guide";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatSessionSummary {
    pub id: String,
    pub mode: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: i64,
    pub last_message_preview: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatHistoryMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub reasoning: Option<String>,
    pub preview: Option<serde_json::Value>,
    pub preview_state: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatSession {
    pub id: String,
    pub mode: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Vec<AiChatHistoryMessage>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRecord {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntryRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub role: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
    pub position: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProposalRecord {
    pub id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub state: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardWorkspaceRecord {
    pub id: String,
    pub current_path: Option<String>,
    pub card_revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn save_card_workspace(app: AppHandle, workspace: CardWorkspaceRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    if workspace.id.trim().is_empty() {
        return Err("Workspace id is required.".to_string());
    }
    conn.execute(
        r#"
        INSERT INTO card_workspaces (id, current_path, card_revision, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
          current_path = excluded.current_path,
          card_revision = excluded.card_revision,
          updated_at = excluded.updated_at
        "#,
        params![workspace.id, workspace.current_path, workspace.card_revision.max(0), workspace.created_at, workspace.updated_at],
    )
    .map_err(|error| error.to_string())?;
    if let Some(path) = workspace.current_path.as_deref().filter(|path| !path.trim().is_empty()) {
        conn.execute(
            "INSERT OR IGNORE INTO workspace_paths (workspace_id, normalized_path, created_at) VALUES (?1, ?2, ?3)",
            params![workspace.id, path, positive_or(workspace.updated_at, now_millis())],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn workspace_for_path(app: AppHandle, normalized_path: String) -> Result<Option<CardWorkspaceRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn
        .prepare(
            "SELECT w.id, w.current_path, w.card_revision, w.created_at, w.updated_at FROM card_workspaces w INNER JOIN workspace_paths p ON p.workspace_id = w.id WHERE p.normalized_path = ?1 ORDER BY w.updated_at DESC LIMIT 1",
        )
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query(params![normalized_path]).map_err(|error| error.to_string())?;
    if let Some(row) = rows.next().map_err(|error| error.to_string())? {
        return Ok(Some(CardWorkspaceRecord {
            id: row.get(0).map_err(|error| error.to_string())?,
            current_path: row.get(1).map_err(|error| error.to_string())?,
            card_revision: row.get(2).map_err(|error| error.to_string())?,
            created_at: row.get(3).map_err(|error| error.to_string())?,
            updated_at: row.get(4).map_err(|error| error.to_string())?,
        }));
    }
    Ok(None)
}

#[tauri::command]
pub fn list_agent_sessions(app: AppHandle, workspace_id: String) -> Result<Vec<AgentSessionRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn
        .prepare(
            "SELECT id, workspace_id, title, created_at, updated_at, summary FROM agent_sessions WHERE workspace_id = ?1 ORDER BY updated_at DESC LIMIT 80",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![workspace_id], |row| {
            Ok(AgentSessionRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                summary: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_agent_entries(app: AppHandle, session_id: String) -> Result<Vec<AgentEntryRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn
        .prepare(
            "SELECT e.id, s.workspace_id, e.session_id, e.role, e.payload_json, e.created_at, e.position FROM agent_entries e INNER JOIN agent_sessions s ON s.id = e.session_id WHERE e.session_id = ?1 ORDER BY e.position ASC LIMIT 400",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![session_id], |row| {
            let payload: String = row.get(4)?;
            Ok(AgentEntryRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                session_id: row.get(2)?,
                role: row.get(3)?,
                payload: serde_json::from_str(&payload).unwrap_or(serde_json::Value::Null),
                created_at: row.get(5)?,
                position: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_agent_session(app: AppHandle, session: AgentSessionRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    ensure_workspace_row(&conn, &session.workspace_id, session.updated_at);
    conn.execute(
        r#"
        INSERT INTO agent_sessions (id, workspace_id, title, created_at, updated_at, summary)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          title = excluded.title,
          updated_at = excluded.updated_at,
          summary = excluded.summary
        "#,
        params![session.id, session.workspace_id, session.title, session.created_at, session.updated_at, session.summary],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn append_agent_entry(app: AppHandle, entry: AgentEntryRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    ensure_workspace_row(&conn, &entry.workspace_id, entry.created_at);
    ensure_agent_session_row(&conn, &entry.session_id, &entry.workspace_id, entry.created_at);
    let payload = serde_json::to_string(&entry.payload).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO agent_entries (id, session_id, role, payload_json, created_at, position) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![entry.id, entry.session_id, entry.role, payload, entry.created_at, entry.position],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_agent_proposal(app: AppHandle, proposal: AgentProposalRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    ensure_workspace_row(&conn, &proposal.workspace_id, proposal.updated_at);
    ensure_agent_session_row(&conn, &proposal.session_id, &proposal.workspace_id, proposal.updated_at);
    let payload = serde_json::to_string(&proposal.payload).map_err(|error| error.to_string())?;
    conn.execute(
        r#"
        INSERT INTO agent_proposals (id, workspace_id, session_id, state, payload_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(id) DO UPDATE SET
          state = excluded.state,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        "#,
        params![proposal.id, proposal.workspace_id, proposal.session_id, proposal.state, payload, proposal.created_at, proposal.updated_at],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_agent_proposals(app: AppHandle, workspace_id: String) -> Result<Vec<AgentProposalRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn
        .prepare("SELECT id, workspace_id, session_id, state, payload_json, created_at, updated_at FROM agent_proposals WHERE workspace_id = ?1 ORDER BY updated_at DESC LIMIT 100")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![workspace_id], |row| {
            let payload: String = row.get(4)?;
            Ok(AgentProposalRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                session_id: row.get(2)?,
                state: row.get(3)?,
                payload: serde_json::from_str(&payload).unwrap_or(serde_json::Value::Null),
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_ai_chat_sessions(
    app: AppHandle,
    mode: Option<String>,
) -> Result<Vec<AiChatSessionSummary>, String> {
    let conn = open_connection(&app)?;
    let mode = normalize_mode(mode.as_deref());
    let mut statement = conn
        .prepare(
            r#"
            WITH recent_sessions AS (
              SELECT id, mode, title, created_at, updated_at
              FROM sessions
              WHERE mode = ?1
              ORDER BY updated_at DESC
              LIMIT 80
            )
            SELECT
              recent_sessions.id,
              recent_sessions.mode,
              recent_sessions.title,
              recent_sessions.created_at,
              recent_sessions.updated_at,
              (SELECT COUNT(*) FROM messages WHERE messages.session_id = recent_sessions.id) AS message_count,
              COALESCE((
                SELECT content
                FROM messages
                WHERE messages.session_id = recent_sessions.id
                ORDER BY position DESC
                LIMIT 1
              ), '') AS last_message_preview
            FROM recent_sessions
            ORDER BY recent_sessions.updated_at DESC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![mode.as_str()], |row| {
            let preview: String = row.get(6)?;
            Ok(AiChatSessionSummary {
                id: row.get(0)?,
                mode: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                message_count: row.get(5)?,
                last_message_preview: truncate(&preview, MAX_PREVIEW_CHARS),
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_ai_chat_session(app: AppHandle, session_id: String) -> Result<AiChatSession, String> {
    let conn = open_connection(&app)?;
    load_session(&conn, &session_id)
}

#[tauri::command]
pub fn save_ai_chat_session(
    app: AppHandle,
    session: AiChatSession,
) -> Result<AiChatSession, String> {
    let mut conn = open_connection(&app)?;
    let now = now_millis();
    let created_at = positive_or(session.created_at, now);
    let updated_at = positive_or(session.updated_at, now);
    let title = normalize_title(&session.title, &session.messages);
    let mode = normalize_mode(Some(session.mode.as_str()));

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        r#"
        INSERT INTO sessions (id, mode, title, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
          mode = excluded.mode,
          title = excluded.title,
          updated_at = excluded.updated_at
        "#,
        params![session.id.as_str(), mode, title, created_at, updated_at],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM messages WHERE session_id = ?1",
        params![session.id.as_str()],
    )
    .map_err(|error| error.to_string())?;

    {
        let mut insert_message = tx
            .prepare(
                r#"
                INSERT INTO messages (
                  id,
                  session_id,
                  role,
                  content,
                  reasoning,
                  preview_json,
                  preview_state,
                  created_at,
                  position
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                "#,
            )
            .map_err(|error| error.to_string())?;

        for (position, message) in session.messages.iter().enumerate() {
            if message.role != "user" && message.role != "assistant" {
                return Err(format!("Unsupported AI history role: {}", message.role));
            }
            let preview_json = message
                .preview
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|error| error.to_string())?;
            insert_message
                .execute(params![
                    message.id.as_str(),
                    session.id.as_str(),
                    message.role.as_str(),
                    message.content.as_str(),
                    message.reasoning.as_deref(),
                    preview_json,
                    message.preview_state.as_deref(),
                    positive_or(message.created_at, now),
                    position as i64,
                ])
                .map_err(|error| error.to_string())?;
        }
    }

    tx.commit().map_err(|error| error.to_string())?;
    load_session(&conn, &session.id)
}

#[tauri::command]
pub fn delete_ai_chat_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let conn = open_connection(&app)?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_ai_chat_sessions(app: AppHandle) -> Result<(), String> {
    let conn = open_connection(&app)?;
    conn.execute("DELETE FROM sessions", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn load_session(conn: &Connection, session_id: &str) -> Result<AiChatSession, String> {
    let (id, mode, title, created_at, updated_at): (String, String, String, i64, i64) = conn
        .query_row(
            "SELECT id, mode, title, created_at, updated_at FROM sessions WHERE id = ?1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "AI chat session was not found.".to_string())?;

    let mut statement = conn
        .prepare(
            r#"
            SELECT id, role, content, reasoning, preview_json, preview_state, created_at
            FROM messages
            WHERE session_id = ?1
            ORDER BY position ASC
            "#,
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![session_id], |row| {
            let preview_json: Option<String> = row.get(4)?;
            let preview = preview_json.and_then(|raw| serde_json::from_str(&raw).ok());
            Ok(AiChatHistoryMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                reasoning: row.get(3)?,
                preview,
                preview_state: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let messages = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(AiChatSession {
        id,
        mode,
        title,
        created_at,
        updated_at,
        messages,
    })
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let database_path = database_path(app)?;
    let conn = Connection::open(database_path).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    init_db(&conn)?;
    Ok(conn)
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(DATABASE_FILE))
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL DEFAULT 'guide',
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          workspace_id TEXT,
          legacy_read_only INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          reasoning TEXT,
          preview_json TEXT,
          preview_state TEXT,
          created_at INTEGER NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ai_history_sessions_updated_at
          ON sessions(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_history_messages_session_position
          ON messages(session_id, position ASC);

        CREATE TABLE IF NOT EXISTS card_workspaces (
          id TEXT PRIMARY KEY,
          current_path TEXT,
          card_revision INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_paths (
          workspace_id TEXT NOT NULL,
          normalized_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY(workspace_id, normalized_path),
          FOREIGN KEY(workspace_id) REFERENCES card_workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          summary TEXT,
          FOREIGN KEY(workspace_id) REFERENCES card_workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_entries (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_proposals (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          state TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(workspace_id) REFERENCES card_workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace_updated
          ON agent_sessions(workspace_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_entries_session_position
          ON agent_entries(session_id, position ASC);
        CREATE INDEX IF NOT EXISTS idx_agent_proposals_workspace_updated
          ON agent_proposals(workspace_id, updated_at DESC);
        "#,
    )
    .map_err(|error| error.to_string())?;
    ensure_session_mode_column(conn)?;
    ensure_legacy_columns(conn)
}

fn ensure_legacy_columns(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare("PRAGMA table_info(sessions)")
        .map_err(|error| error.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    if !columns.iter().any(|column| column == "workspace_id") {
        conn.execute("ALTER TABLE sessions ADD COLUMN workspace_id TEXT", [])
            .map_err(|error| error.to_string())?;
    }
    if !columns.iter().any(|column| column == "legacy_read_only") {
        conn.execute("ALTER TABLE sessions ADD COLUMN legacy_read_only INTEGER NOT NULL DEFAULT 1", [])
            .map_err(|error| error.to_string())?;
    }
    conn.execute("UPDATE sessions SET legacy_read_only = 1 WHERE workspace_id IS NULL", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_workspace_row(conn: &Connection, workspace_id: &str, timestamp: i64) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO card_workspaces (id, card_revision, created_at, updated_at) VALUES (?1, 0, ?2, ?2)",
        params![workspace_id, positive_or(timestamp, now_millis())],
    );
}

fn ensure_agent_session_row(conn: &Connection, session_id: &str, workspace_id: &str, timestamp: i64) {
    if session_id.trim().is_empty() || workspace_id.trim().is_empty() {
        return;
    }
    let _ = conn.execute(
        "INSERT OR IGNORE INTO agent_sessions (id, workspace_id, title, created_at, updated_at) VALUES (?1, ?2, 'Card Agent session', ?3, ?3)",
        params![session_id, workspace_id, positive_or(timestamp, now_millis())],
    );
}

fn ensure_session_mode_column(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare("PRAGMA table_info(sessions)")
        .map_err(|error| error.to_string())?;
    let column_names = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if !column_names.iter().any(|name| name == "mode") {
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'guide'",
            [],
        )
        .map_err(|error| error.to_string())?;
        conn.execute(
            r#"
            UPDATE sessions
            SET mode = 'edit'
            WHERE id IN (
              SELECT DISTINCT session_id
              FROM messages
              WHERE preview_json IS NOT NULL OR preview_state IS NOT NULL
            )
            "#,
            [],
        )
        .map_err(|error| error.to_string())?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_history_sessions_mode_updated_at ON sessions(mode, updated_at DESC)",
        [],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn normalize_title(title: &str, messages: &[AiChatHistoryMessage]) -> String {
    let candidate = title.trim();
    if !candidate.is_empty() {
        return truncate(candidate, MAX_TITLE_CHARS);
    }
    let first_user_message = messages
        .iter()
        .find(|message| message.role == "user")
        .map(|message| message.content.trim())
        .unwrap_or("");
    if first_user_message.is_empty() {
        "AI Chat".to_string()
    } else {
        truncate(first_user_message, MAX_TITLE_CHARS)
    }
}

fn normalize_mode(value: Option<&str>) -> String {
    match value {
        Some("edit") => "edit".to_string(),
        _ => DEFAULT_HISTORY_MODE.to_string(),
    }
}

fn truncate(input: &str, max_chars: usize) -> String {
    let mut output = input.chars().take(max_chars).collect::<String>();
    if input.chars().count() > max_chars {
        output.push_str("...");
    }
    output
}

fn positive_or(value: i64, fallback: i64) -> i64 {
    if value > 0 {
        value
    } else {
        fallback
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
