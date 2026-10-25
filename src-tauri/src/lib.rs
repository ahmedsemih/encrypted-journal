mod commands;
mod crypto;
mod entry;
mod error;
mod vault;

use std::{path::PathBuf, sync::Mutex};

use tauri::Manager;

pub struct AppState {
    /// The unlocked vault, `None` while locked.
    pub session: Mutex<Option<vault::Session>>,
    pub data_root: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_root = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_root)?;
            app.manage(AppState { session: Mutex::new(None), data_root });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::register,
            commands::login,
            commands::lock,
            commands::change_password,
            commands::delete_account,
            commands::import_backup,
            commands::list_entries,
            commands::get_entry,
            commands::create_entry,
            commands::save_entry,
            commands::delete_entry,
            commands::search_entries,
            commands::get_settings,
            commands::save_settings,
            commands::export_markdown,
            commands::export_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
