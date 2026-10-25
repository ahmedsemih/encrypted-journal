mod attachments;
mod commands;
mod crypto;
mod entry;
mod error;
mod links;
mod recovery;
mod search;
mod syslock;
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
            syslock::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::register,
            commands::login,
            commands::lock,
            commands::change_password,
            commands::create_recovery_key,
            commands::remove_recovery_key,
            commands::recovery_status,
            commands::reset_password,
            commands::delete_account,
            commands::import_backup,
            commands::list_entries,
            commands::get_entry,
            commands::create_entry,
            commands::save_entry,
            commands::trash_entry,
            commands::restore_entry,
            commands::purge_entry,
            commands::empty_trash,
            commands::list_trash,
            commands::auto_backup,
            commands::add_attachment,
            commands::add_attachment_file,
            commands::get_attachment,
            commands::search_entries,
            commands::get_settings,
            commands::save_settings,
            commands::export_markdown,
            commands::export_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
