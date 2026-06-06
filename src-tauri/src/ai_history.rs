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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatSessionSummary {
    pub id: String,
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
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Vec<AiChatHistoryMessage>,
}

#[tauri::command]
pub fn list_ai_chat_sessions(app: AppHandle) -> Result<Vec<AiChatSessionSummary>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn
        .prepare(
            r#"
            SELECT
              sessions.id,
              sessions.title,
              sessions.created_at,
              sessions.updated_at,
              (SELECT COUNT(*) FROM messages WHERE messages.session_id = sessions.id) AS message_count,
              COALESCE((
                SELECT content
                FROM messages
                WHERE messages.session_id = sessions.id
                ORDER BY position DESC
                LIMIT 1
              ), '') AS last_message_preview
            FROM sessions
            ORDER BY sessions.updated_at DESC
            LIMIT 80
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let preview: String = row.get(5)?;
            Ok(AiChatSessionSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                message_count: row.get(4)?,
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

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        r#"
        INSERT INTO sessions (id, title, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          updated_at = excluded.updated_at
        "#,
        params![session.id.as_str(), title, created_at, updated_at],
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
    let (id, title, created_at, updated_at): (String, String, i64, i64) = conn
        .query_row(
            "SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
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
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
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
        "#,
    )
    .map_err(|error| error.to_string())
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
