#[cfg(feature = "tauri-app")]
mod ai;
#[cfg(feature = "tauri-app")]
mod ai_history;
mod card_schema;
mod charx;
#[cfg(feature = "tauri-app")]
mod commands;
mod errors;
mod migration;
mod png_card;
mod validation;

#[cfg(feature = "tauri-app")]
pub fn run() {
    tauri::Builder::default()
        .manage(ai::AiRuntime::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::open_card_file,
            commands::path_exists,
            commands::save_card_json,
            commands::export_card_png,
            commands::import_card_png,
            commands::export_charx,
            commands::import_charx,
            commands::validate_card,
            ai::configure_ai_profile,
            ai::start_ai_http_stream,
            ai::cancel_ai_http_stream,
            ai::store_ai_credential,
            ai::ai_credential_status,
            ai::delete_ai_credential,
            ai::fetch_ai_models,
            ai_history::list_ai_chat_sessions,
            ai_history::load_ai_chat_session,
            ai_history::save_ai_chat_session,
            ai_history::delete_ai_chat_session,
            ai_history::clear_ai_chat_sessions,
            ai_history::list_agent_sessions,
            ai_history::list_agent_session_history,
            ai_history::list_agent_entries,
            ai_history::save_agent_session,
            ai_history::append_agent_entry,
            ai_history::save_agent_proposal,
            ai_history::list_agent_proposals,
            ai_history::save_card_workspace,
            ai_history::workspace_for_path
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri app");
}

#[cfg(not(feature = "tauri-app"))]
pub fn run() {}
