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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::open_card_file,
            commands::path_exists,
            commands::save_card_json,
            commands::export_card_png,
            commands::import_card_png,
            commands::export_charx,
            commands::import_charx,
            commands::validate_card,
            ai::fetch_ai_models,
            ai::test_ai_connection,
            ai::send_ai_chat,
            ai_history::list_ai_chat_sessions,
            ai_history::load_ai_chat_session,
            ai_history::save_ai_chat_session,
            ai_history::delete_ai_chat_session,
            ai_history::clear_ai_chat_sessions
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri app");
}

#[cfg(not(feature = "tauri-app"))]
pub fn run() {}
