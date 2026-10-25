//! Tauri command handlers. Password-based operations run Argon2 on a blocking
//! thread so the UI never freezes.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::State;
use zeroize::Zeroizing;

use crate::entry::{Entry, EntryInput, EntryMeta};
use crate::error::{AppError, AppResult};
use crate::vault::{self, Session};
use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    has_users: bool,
    username: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    username: String,
}

fn with_session<T>(state: &AppState, f: impl FnOnce(&mut Session) -> AppResult<T>) -> AppResult<T> {
    let mut guard = state.session.lock().map_err(|_| AppError::Internal("poisoned state".into()))?;
    f(guard.as_mut().ok_or(AppError::Locked)?)
}

fn current_username(state: &AppState) -> AppResult<String> {
    with_session(state, |s| Ok(s.username.clone()))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

fn start_session(state: &AppState, session: Session) -> AppResult<SessionInfo> {
    let info = SessionInfo { username: session.username.clone() };
    *state.session.lock().map_err(|_| AppError::Internal("poisoned state".into()))? = Some(session);
    Ok(info)
}

// ---------- auth ----------

#[tauri::command]
pub fn app_status(state: State<'_, AppState>) -> AppStatus {
    AppStatus {
        has_users: vault::has_any_user(&state.data_root),
        username: current_username(&state).ok(),
    }
}

#[tauri::command]
pub async fn register(state: State<'_, AppState>, username: String, password: String) -> AppResult<SessionInfo> {
    let root = state.data_root.clone();
    let password = Zeroizing::new(password);
    let session = blocking(move || vault::register(&root, &username, &password)).await?;
    start_session(&state, session)
}

#[tauri::command]
pub async fn login(state: State<'_, AppState>, username: String, password: String) -> AppResult<SessionInfo> {
    let root = state.data_root.clone();
    let password = Zeroizing::new(password);
    let session = blocking(move || vault::login(&root, &username, &password)).await?;
    start_session(&state, session)
}

#[tauri::command]
pub fn lock(state: State<'_, AppState>) -> AppResult<()> {
    *state.session.lock().map_err(|_| AppError::Internal("poisoned state".into()))? = None;
    Ok(())
}

#[tauri::command]
pub async fn change_password(
    state: State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> AppResult<()> {
    let username = current_username(&state)?;
    let root = state.data_root.clone();
    let (current, new) = (Zeroizing::new(current_password), Zeroizing::new(new_password));
    blocking(move || vault::change_password(&root, &username, &current, &new)).await
}

#[tauri::command]
pub async fn delete_account(state: State<'_, AppState>, password: String) -> AppResult<()> {
    let username = current_username(&state)?;
    let root = state.data_root.clone();
    let password = Zeroizing::new(password);
    blocking(move || vault::delete_account(&root, &username, &password)).await?;
    lock(state)
}

#[tauri::command]
pub fn import_backup(state: State<'_, AppState>, path: PathBuf) -> AppResult<()> {
    vault::import_backup(&state.data_root, &path)
}

// ---------- entries ----------

#[tauri::command]
pub fn list_entries(state: State<'_, AppState>) -> AppResult<Vec<EntryMeta>> {
    with_session(&state, |s| {
        let mut metas: Vec<EntryMeta> = s.entries.values().map(Entry::meta).collect();
        metas.sort_by(|a, b| b.date.cmp(&a.date).then_with(|| b.created_at.cmp(&a.created_at)));
        Ok(metas)
    })
}

#[tauri::command]
pub fn get_entry(state: State<'_, AppState>, id: String) -> AppResult<Entry> {
    with_session(&state, |s| s.entries.get(&id).cloned().ok_or(AppError::NotFound))
}

#[tauri::command]
pub fn create_entry(state: State<'_, AppState>, date: String) -> AppResult<Entry> {
    with_session(&state, |s| {
        let entry = Entry::new(&date)?;
        s.save_entry(entry.clone())?;
        Ok(entry)
    })
}

#[tauri::command]
pub fn save_entry(state: State<'_, AppState>, input: EntryInput) -> AppResult<EntryMeta> {
    with_session(&state, |s| {
        let mut entry = s.entries.get(&input.id).cloned().ok_or(AppError::NotFound)?;
        entry.apply(&input)?;
        let meta = entry.meta();
        s.save_entry(entry)?;
        Ok(meta)
    })
}

#[tauri::command]
pub fn delete_entry(state: State<'_, AppState>, id: String) -> AppResult<()> {
    with_session(&state, |s| s.delete_entry(&id))
}

/// Full-text search over decrypted entries; returns matching ids.
#[tauri::command]
pub fn search_entries(state: State<'_, AppState>, query: String) -> AppResult<Vec<String>> {
    let terms: Vec<String> = query.to_lowercase().split_whitespace().map(String::from).collect();
    with_session(&state, |s| {
        Ok(s.entries.values().filter(|e| e.matches(&terms)).map(|e| e.id.clone()).collect())
    })
}

// ---------- settings & data ----------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Value> {
    with_session(&state, |s| s.load_settings())
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Value) -> AppResult<()> {
    with_session(&state, |s| s.save_settings(&settings))
}

#[tauri::command]
pub fn export_markdown(state: State<'_, AppState>, dir: PathBuf) -> AppResult<String> {
    with_session(&state, |s| Ok(s.export_markdown(&dir)?.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn export_backup(state: State<'_, AppState>, path: PathBuf) -> AppResult<()> {
    with_session(&state, |s| s.export_backup(&path))
}
