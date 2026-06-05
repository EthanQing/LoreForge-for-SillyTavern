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
            commands::save_card_json,
            commands::export_card_png,
            commands::import_card_png,
            commands::export_charx,
            commands::import_charx,
            commands::validate_card
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri app");
}

#[cfg(not(feature = "tauri-app"))]
pub fn run() {}
