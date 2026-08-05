use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "agent_history.sqlite3";
const LEGACY_DATABASE_FILE: &str = "ai_chat_history.sqlite3";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRecord {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub card_name: Option<String>,
    #[serde(default)]
    pub current_path: Option<String>,
    #[serde(default)]
    pub entry_count: i64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default = "default_is_read")]
    pub is_read: bool,
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
    #[serde(default)]
    pub card_name: Option<String>,
    pub current_path: Option<String>,
    pub card_revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn save_card_workspace(app: AppHandle, workspace: CardWorkspaceRecord) -> Result<(), String> {
    if workspace.id.trim().is_empty() {
        return Err("Workspace id is required.".to_string());
    }
    let conn = open_connection(&app)?;
    conn.execute(
        r#"
        INSERT INTO card_workspaces (id, card_name, current_path, card_revision, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET
          card_name = excluded.card_name,
          current_path = excluded.current_path,
          card_revision = excluded.card_revision,
          updated_at = excluded.updated_at
        "#,
        params![workspace.id, workspace.card_name, workspace.current_path, workspace.card_revision.max(0), workspace.created_at, workspace.updated_at],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_agent_session_history(app: AppHandle) -> Result<Vec<AgentSessionRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn.prepare(
        "SELECT s.id, s.workspace_id, s.title, s.created_at, s.updated_at, w.card_name, w.current_path, (SELECT COUNT(*) FROM agent_entries e WHERE e.session_id = s.id), COALESCE(m.pinned, 0), COALESCE(m.is_read, 1) FROM agent_sessions s LEFT JOIN card_workspaces w ON w.id = s.workspace_id LEFT JOIN agent_session_metadata m ON m.session_id = s.id ORDER BY s.updated_at DESC"
    ).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], map_agent_session_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_agent_entries(
    app: AppHandle,
    session_id: String,
) -> Result<Vec<AgentEntryRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn.prepare(
        "SELECT e.id, s.workspace_id, e.session_id, e.role, e.payload_json, e.created_at, e.position FROM agent_entries e INNER JOIN agent_sessions s ON s.id = e.session_id WHERE e.session_id = ?1 ORDER BY e.position ASC, e.created_at ASC, e.rowid ASC"
    ).map_err(|error| error.to_string())?;
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
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_agent_session(app: AppHandle, session: AgentSessionRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    ensure_workspace_row(&conn, &session.workspace_id, session.updated_at)?;
    conn.execute(
        r#"
        INSERT INTO agent_sessions (id, workspace_id, title, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          updated_at = excluded.updated_at
        "#,
        params![
            session.id,
            session.workspace_id,
            session.title,
            session.created_at,
            session.updated_at
        ],
    )
    .map_err(|error| error.to_string())?;
    ensure_agent_session_metadata_row(&conn, &session.id)?;
    Ok(())
}

#[tauri::command]
pub fn rename_agent_session(
    app: AppHandle,
    session_id: String,
    title: String,
) -> Result<(), String> {
    let title = title.trim();
    if session_id.trim().is_empty() || title.is_empty() {
        return Err("Session id and title are required.".to_string());
    }
    if title.chars().count() > 24 {
        return Err("Session title must not exceed 24 characters.".to_string());
    }
    let conn = open_connection(&app)?;
    rename_agent_session_row(&conn, &session_id, title)
}

#[tauri::command]
pub fn delete_agent_session(app: AppHandle, session_id: String) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("Session id is required.".to_string());
    }
    let conn = open_connection(&app)?;
    let changed = conn
        .execute("DELETE FROM agent_sessions WHERE id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("Agent session was not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn set_agent_session_pinned(
    app: AppHandle,
    session_id: String,
    pinned: bool,
) -> Result<(), String> {
    update_agent_session_metadata(&app, &session_id, Some(pinned), None)
}

#[tauri::command]
pub fn set_agent_session_read(
    app: AppHandle,
    session_id: String,
    is_read: bool,
) -> Result<(), String> {
    update_agent_session_metadata(&app, &session_id, None, Some(is_read))
}

#[tauri::command]
pub fn append_agent_entry(app: AppHandle, entry: AgentEntryRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    ensure_workspace_row(&conn, &entry.workspace_id, entry.created_at)?;
    ensure_agent_session_row(
        &conn,
        &entry.session_id,
        &entry.workspace_id,
        entry.created_at,
    )?;
    let payload = serde_json::to_string(&entry.payload).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO agent_entries (id, session_id, role, payload_json, created_at, position) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![entry.id, entry.session_id, entry.role, payload, entry.created_at, entry.position],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_agent_proposal(app: AppHandle, proposal: AgentProposalRecord) -> Result<(), String> {
    let conn = open_connection(&app)?;
    ensure_workspace_row(&conn, &proposal.workspace_id, proposal.updated_at)?;
    ensure_agent_session_row(
        &conn,
        &proposal.session_id,
        &proposal.workspace_id,
        proposal.updated_at,
    )?;
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
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_agent_proposals(
    app: AppHandle,
    workspace_id: String,
) -> Result<Vec<AgentProposalRecord>, String> {
    let conn = open_connection(&app)?;
    let mut statement = conn.prepare(
        "SELECT id, workspace_id, session_id, state, payload_json, created_at, updated_at FROM agent_proposals WHERE workspace_id = ?1 ORDER BY updated_at DESC LIMIT 100"
    ).map_err(|error| error.to_string())?;
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
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn map_agent_session_row(row: &Row<'_>) -> rusqlite::Result<AgentSessionRecord> {
    Ok(AgentSessionRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        card_name: row.get(5)?,
        current_path: row.get(6)?,
        entry_count: row.get(7)?,
        pinned: row.get::<_, i64>(8)? != 0,
        is_read: row.get::<_, i64>(9)? != 0,
    })
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    purge_legacy_history_files(&app_data_dir)?;
    let conn =
        Connection::open(app_data_dir.join(DATABASE_FILE)).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    init_db(&conn)?;
    Ok(conn)
}

fn purge_legacy_history_files(app_data_dir: &Path) -> Result<(), String> {
    for path in legacy_database_paths(app_data_dir) {
        if path.is_file() {
            fs::remove_file(&path).map_err(|error| {
                format!(
                    "Could not remove legacy Agent history {}: {error}",
                    path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn legacy_database_paths(app_data_dir: &Path) -> [PathBuf; 3] {
    [
        app_data_dir.join(LEGACY_DATABASE_FILE),
        app_data_dir.join(format!("{LEGACY_DATABASE_FILE}-wal")),
        app_data_dir.join(format!("{LEGACY_DATABASE_FILE}-shm")),
    ]
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS card_workspaces (
          id TEXT PRIMARY KEY,
          card_name TEXT,
          current_path TEXT,
          card_revision INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(workspace_id) REFERENCES card_workspaces(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS agent_session_metadata (
          session_id TEXT PRIMARY KEY,
          pinned INTEGER NOT NULL DEFAULT 0,
          is_read INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
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
        CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace_updated ON agent_sessions(workspace_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_entries_session_position ON agent_entries(session_id, position ASC);
        CREATE INDEX IF NOT EXISTS idx_agent_proposals_workspace_updated ON agent_proposals(workspace_id, updated_at DESC);
        UPDATE agent_sessions SET title = '新会话' WHERE title IN ('卡片 Agent 会话', 'Card Agent session');
        "#,
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn rename_agent_session_row(
    conn: &Connection,
    session_id: &str,
    title: &str,
) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE agent_sessions SET title = ?1 WHERE id = ?2",
            params![title, session_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("Agent session was not found.".to_string());
    }
    Ok(())
}

fn ensure_workspace_row(conn: &Connection, workspace_id: &str, now: i64) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO card_workspaces (id, card_revision, created_at, updated_at) VALUES (?1, 0, ?2, ?2)",
        params![workspace_id, now],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_agent_session_row(
    conn: &Connection,
    session_id: &str,
    workspace_id: &str,
    now: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO agent_sessions (id, workspace_id, title, created_at, updated_at) VALUES (?1, ?2, '新会话', ?3, ?3)",
        params![session_id, workspace_id, now],
    ).map_err(|error| error.to_string())?;
    ensure_agent_session_metadata_row(conn, session_id)?;
    Ok(())
}

fn ensure_agent_session_metadata_row(conn: &Connection, session_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO agent_session_metadata (session_id, pinned, is_read) VALUES (?1, 0, 1)",
        params![session_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn update_agent_session_metadata(
    app: &AppHandle,
    session_id: &str,
    pinned: Option<bool>,
    is_read: Option<bool>,
) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("Session id is required.".to_string());
    }
    let conn = open_connection(app)?;
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM agent_sessions WHERE id = ?1)",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !exists {
        return Err("Agent session was not found.".to_string());
    }
    ensure_agent_session_metadata_row(&conn, session_id)?;
    if let Some(pinned) = pinned {
        conn.execute(
            "UPDATE agent_session_metadata SET pinned = ?1 WHERE session_id = ?2",
            params![i64::from(pinned), session_id],
        )
        .map_err(|error| error.to_string())?;
    }
    if let Some(is_read) = is_read {
        conn.execute(
            "UPDATE agent_session_metadata SET is_read = ?1 WHERE session_id = ?2",
            params![i64::from(is_read), session_id],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn default_is_read() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_only_exact_legacy_database_files() {
        let dir =
            std::env::temp_dir().join(format!("card-creator-agent-history-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for path in legacy_database_paths(&dir) {
            fs::write(path, b"legacy").unwrap();
        }
        let keep = dir.join("card-draft.json");
        fs::write(&keep, b"keep").unwrap();
        purge_legacy_history_files(&dir).unwrap();
        assert!(legacy_database_paths(&dir)
            .iter()
            .all(|path| !path.exists()));
        assert!(keep.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn renames_a_session_without_changing_its_history_order() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        ensure_workspace_row(&conn, "workspace", 10).unwrap();
        ensure_agent_session_row(&conn, "session", "workspace", 10).unwrap();
        rename_agent_session_row(&conn, "session", "优化都市世界书").unwrap();

        let (title, updated_at): (String, i64) = conn
            .query_row(
                "SELECT title, updated_at FROM agent_sessions WHERE id = 'session'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "优化都市世界书");
        assert_eq!(updated_at, 10);
    }

    #[test]
    fn creates_default_session_metadata_and_cascades_on_delete() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        init_db(&conn).unwrap();
        ensure_workspace_row(&conn, "workspace", 10).unwrap();
        ensure_agent_session_row(&conn, "session", "workspace", 10).unwrap();

        let defaults: (i64, i64) = conn
            .query_row(
                "SELECT pinned, is_read FROM agent_session_metadata WHERE session_id = 'session'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(defaults, (0, 1));

        conn.execute(
            "UPDATE agent_session_metadata SET pinned = 1, is_read = 0 WHERE session_id = 'session'",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM agent_sessions WHERE id = 'session'", [])
            .unwrap();
        let metadata_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM agent_session_metadata WHERE session_id = 'session'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(metadata_count, 0);
    }

    #[test]
    fn normalizes_pre_title_history_rows() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        ensure_workspace_row(&conn, "workspace", 10).unwrap();
        conn.execute(
            "INSERT INTO agent_sessions (id, workspace_id, title, created_at, updated_at) VALUES ('session', 'workspace', '卡片 Agent 会话', 10, 10)",
            [],
        )
        .unwrap();

        init_db(&conn).unwrap();
        let title: String = conn
            .query_row(
                "SELECT title FROM agent_sessions WHERE id = 'session'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "新会话");
    }
}
