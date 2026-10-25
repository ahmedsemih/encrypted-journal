//! On-disk layout of user vaults.
//!
//! ```text
//! <app data>/users/<sha256(username)>/
//!     vault.json          KDF params + DEK wrapped by the password-derived key
//!     settings.enc        encrypted settings JSON
//!     entries/<uuid>.md.enc   one encrypted Markdown file per entry
//! ```
//!
//! Directory names are hashes so usernames are not visible on disk, and entry
//! file names are random UUIDs so they leak neither dates nor titles.

use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::crypto::{self, KdfParams, SecretKey};
use crate::entry::{self, Entry};
use crate::error::{AppError, AppResult};

const USERS_DIR: &str = "users";
const VAULT_FILE: &str = "vault.json";
const SETTINGS_FILE: &str = "settings.enc";
const ENTRIES_DIR: &str = "entries";
const ENTRY_SUFFIX: &str = ".md.enc";
const VAULT_VERSION: u32 = 1;
const BACKUP_FORMAT: &str = "encrypted-journal-backup";
const MIN_PASSWORD_CHARS: usize = 8;
/// Trashed entries are purged for good after this many days.
const TRASH_RETENTION_DAYS: i64 = 30;
const AUTO_BACKUP_PREFIX: &str = "journal-auto-";
const BACKUP_EXTENSION: &str = "ejbackup";

const KEY_WRAP_AAD: &[u8] = b"encrypted-journal:vault-key:v1";
const SETTINGS_AAD: &[u8] = b"encrypted-journal:settings:v1";

fn entry_aad(id: &str) -> Vec<u8> {
    format!("encrypted-journal:entry:v1:{id}").into_bytes()
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultHeader {
    pub version: u32,
    pub kdf: KdfParams,
    /// Base64 of the sealed data-encryption key.
    pub wrapped_key: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: String,
    version: u32,
    user_id: String,
    created_at: String,
    vault: VaultHeader,
    settings: Option<String>,
    /// Entry id -> base64 of the still-encrypted entry file.
    entries: HashMap<String, String>,
}

/// An unlocked vault. Dropping it wipes the key and decrypted entries.
pub struct Session {
    pub username: String,
    dir: PathBuf,
    key: SecretKey,
    pub entries: HashMap<String, Entry>,
}

// ---------- helpers ----------

pub fn normalize_username(username: &str) -> AppResult<String> {
    let name = username.trim().to_lowercase();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err(AppError::Invalid("invalidUsername"));
    }
    Ok(name)
}

fn validate_password(password: &str) -> AppResult<()> {
    if password.chars().count() < MIN_PASSWORD_CHARS {
        return Err(AppError::Invalid("weakPassword"));
    }
    Ok(())
}

fn user_id(normalized_username: &str) -> String {
    format!("{:x}", Sha256::digest(normalized_username.as_bytes()))
}

fn user_dir(root: &Path, username: &str) -> AppResult<(String, PathBuf)> {
    let name = normalize_username(username)?;
    let dir = root.join(USERS_DIR).join(user_id(&name));
    Ok((name, dir))
}

fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

/// Write to a temp file then rename, so a crash never leaves a half-written file.
fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)
}

fn read_header(dir: &Path) -> AppResult<VaultHeader> {
    let raw = fs::read(dir.join(VAULT_FILE)).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => AppError::InvalidCredentials,
        _ => AppError::Io(e),
    })?;
    let header: VaultHeader = serde_json::from_slice(&raw)?;
    if header.version > VAULT_VERSION {
        return Err(AppError::Invalid("vaultTooNew"));
    }
    Ok(header)
}

fn wrap_key(dek: &SecretKey, password: &str) -> AppResult<VaultHeader> {
    let kdf = KdfParams::generate();
    wrap_key_with(dek, password, kdf)
}

fn wrap_key_with(dek: &SecretKey, password: &str, kdf: KdfParams) -> AppResult<VaultHeader> {
    let kek = crypto::derive_key(password, &kdf)?;
    let wrapped = crypto::seal(&kek, &dek[..], KEY_WRAP_AAD)?;
    Ok(VaultHeader { version: VAULT_VERSION, kdf, wrapped_key: B64.encode(wrapped), created_at: entry::now() })
}

fn unwrap_key(header: &VaultHeader, password: &str) -> AppResult<SecretKey> {
    let kek = crypto::derive_key(password, &header.kdf)?;
    let wrapped = B64.decode(&header.wrapped_key).map_err(|_| AppError::Crypto)?;
    // An AEAD failure here means the password is wrong.
    let raw = crypto::open(&kek, &wrapped, KEY_WRAP_AAD).map_err(|_| AppError::InvalidCredentials)?;
    crypto::key_from_slice(&raw)
}

// ---------- account operations ----------

pub fn has_any_user(root: &Path) -> bool {
    fs::read_dir(root.join(USERS_DIR))
        .map(|dir| dir.flatten().any(|e| e.path().join(VAULT_FILE).is_file()))
        .unwrap_or(false)
}

pub fn register(root: &Path, username: &str, password: &str) -> AppResult<Session> {
    register_with(root, username, password, KdfParams::generate())
}

fn register_with(root: &Path, username: &str, password: &str, kdf: KdfParams) -> AppResult<Session> {
    let (name, dir) = user_dir(root, username)?;
    validate_password(password)?;
    if dir.join(VAULT_FILE).exists() {
        return Err(AppError::UserExists);
    }
    create_private_dir(&root.join(USERS_DIR))?;
    create_private_dir(&dir)?;
    create_private_dir(&dir.join(ENTRIES_DIR))?;

    let dek = crypto::random_key();
    let header = wrap_key_with(&dek, password, kdf)?;
    write_atomic(&dir.join(VAULT_FILE), &serde_json::to_vec_pretty(&header)?)?;
    Ok(Session { username: name, dir, key: dek, entries: HashMap::new() })
}

pub fn login(root: &Path, username: &str, password: &str) -> AppResult<Session> {
    let (name, dir) = user_dir(root, username)?;
    let header = read_header(&dir)?;
    let key = unwrap_key(&header, password)?;
    let mut session = Session { username: name, dir, key, entries: HashMap::new() };
    session.load_entries()?;
    session.purge_expired_trash();
    Ok(session)
}

pub fn change_password(root: &Path, username: &str, current: &str, new: &str) -> AppResult<()> {
    validate_password(new)?;
    let (_, dir) = user_dir(root, username)?;
    let header = read_header(&dir)?;
    let dek = unwrap_key(&header, current)?;
    let mut new_header = wrap_key(&dek, new)?;
    new_header.created_at = header.created_at;
    write_atomic(&dir.join(VAULT_FILE), &serde_json::to_vec_pretty(&new_header)?)?;
    Ok(())
}

pub fn delete_account(root: &Path, username: &str, password: &str) -> AppResult<()> {
    let (_, dir) = user_dir(root, username)?;
    let header = read_header(&dir)?;
    unwrap_key(&header, password)?;
    fs::remove_dir_all(&dir)?;
    Ok(())
}

/// Restores an encrypted backup. Data stays encrypted; the user logs in with
/// the username and password that were valid when the backup was taken.
pub fn import_backup(root: &Path, path: &Path) -> AppResult<()> {
    let backup: Backup = serde_json::from_slice(&fs::read(path)?)
        .map_err(|_| AppError::Invalid("invalidBackup"))?;
    if backup.format != BACKUP_FORMAT || backup.version > VAULT_VERSION {
        return Err(AppError::Invalid("unsupportedBackup"));
    }
    if backup.user_id.len() != 64 || !backup.user_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::Invalid("corruptBackup"));
    }
    let mut files = Vec::with_capacity(backup.entries.len());
    for (id, data) in &backup.entries {
        entry::validate_id(id)?;
        let blob = B64.decode(data).map_err(|_| AppError::Invalid("corruptBackup"))?;
        files.push((format!("{id}{ENTRY_SUFFIX}"), blob));
    }
    let settings = backup
        .settings
        .as_deref()
        .map(|s| B64.decode(s).map_err(|_| AppError::Invalid("corruptBackup")))
        .transpose()?;

    let dir = root.join(USERS_DIR).join(&backup.user_id);
    if dir.join(VAULT_FILE).exists() {
        return Err(AppError::Invalid("backupUserExists"));
    }
    create_private_dir(&root.join(USERS_DIR))?;
    create_private_dir(&dir)?;
    create_private_dir(&dir.join(ENTRIES_DIR))?;
    for (name, blob) in files {
        write_atomic(&dir.join(ENTRIES_DIR).join(name), &blob)?;
    }
    if let Some(settings) = settings {
        write_atomic(&dir.join(SETTINGS_FILE), &settings)?;
    }
    // Header last: the account only "exists" once everything else is written.
    write_atomic(&dir.join(VAULT_FILE), &serde_json::to_vec_pretty(&backup.vault)?)?;
    Ok(())
}

// ---------- unlocked session ----------

impl Session {
    fn entry_path(&self, id: &str) -> PathBuf {
        self.dir.join(ENTRIES_DIR).join(format!("{id}{ENTRY_SUFFIX}"))
    }

    fn load_entries(&mut self) -> AppResult<()> {
        let dir = self.dir.join(ENTRIES_DIR);
        create_private_dir(&dir)?;
        for item in fs::read_dir(&dir)?.flatten() {
            let file_name = item.file_name();
            let Some(id) = file_name.to_str().and_then(|n| n.strip_suffix(ENTRY_SUFFIX)) else {
                continue;
            };
            if entry::validate_id(id).is_err() {
                continue;
            }
            let loaded = fs::read(item.path())
                .map_err(AppError::from)
                .and_then(|blob| crypto::open(&self.key, &blob, &entry_aad(id)))
                .and_then(|plain| {
                    let text = std::str::from_utf8(&plain).map_err(|_| AppError::Crypto)?;
                    Entry::from_markdown(id, text)
                });
            match loaded {
                Ok(e) => {
                    self.entries.insert(id.to_string(), e);
                }
                // A single corrupt file must not lock the user out of everything.
                Err(err) => eprintln!("skipping unreadable entry {id}: {err}"),
            }
        }
        Ok(())
    }

    pub fn save_entry(&mut self, entry: Entry) -> AppResult<()> {
        entry::validate_id(&entry.id)?;
        let markdown = entry.to_markdown();
        let blob = crypto::seal(&self.key, markdown.as_bytes(), &entry_aad(&entry.id))?;
        write_atomic(&self.entry_path(&entry.id), &blob)?;
        self.entries.insert(entry.id.clone(), entry);
        Ok(())
    }

    fn set_trashed(&mut self, id: &str, trashed: bool) -> AppResult<Entry> {
        let mut entry = self.entries.get(id).cloned().ok_or(AppError::NotFound)?;
        entry.deleted_at = trashed.then(entry::now);
        self.save_entry(entry.clone())?;
        Ok(entry)
    }

    /// Moves an entry to the trash (it stays encrypted on disk until purged).
    pub fn trash_entry(&mut self, id: &str) -> AppResult<Entry> {
        self.set_trashed(id, true)
    }

    pub fn restore_entry(&mut self, id: &str) -> AppResult<Entry> {
        self.set_trashed(id, false)
    }

    pub fn purge_expired_trash(&mut self) {
        let cutoff = chrono::Local::now() - chrono::Duration::days(TRASH_RETENTION_DAYS);
        let expired: Vec<String> = self
            .entries
            .values()
            .filter(|e| {
                e.deleted_at
                    .as_deref()
                    .and_then(|d| chrono::DateTime::parse_from_rfc3339(d).ok())
                    .is_some_and(|d| d < cutoff)
            })
            .map(|e| e.id.clone())
            .collect();
        for id in expired {
            if let Err(err) = self.purge_entry(&id) {
                eprintln!("could not purge trashed entry {id}: {err}");
            }
        }
    }

    /// Permanently deletes an entry.
    pub fn purge_entry(&mut self, id: &str) -> AppResult<()> {
        entry::validate_id(id)?;
        if !self.entries.contains_key(id) {
            return Err(AppError::NotFound);
        }
        match fs::remove_file(self.entry_path(id)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
        self.entries.remove(id);
        Ok(())
    }

    pub fn load_settings(&self) -> AppResult<Value> {
        match fs::read(self.dir.join(SETTINGS_FILE)) {
            Ok(blob) => Ok(serde_json::from_slice(&crypto::open(&self.key, &blob, SETTINGS_AAD)?)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Object(Default::default())),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save_settings(&self, settings: &Value) -> AppResult<()> {
        let blob = crypto::seal(&self.key, &serde_json::to_vec(settings)?, SETTINGS_AAD)?;
        write_atomic(&self.dir.join(SETTINGS_FILE), &blob)?;
        Ok(())
    }

    /// Writes all entries as plain, decrypted Markdown files into a new
    /// sub-folder of `target`. Returns the folder that was created.
    pub fn export_markdown(&self, target: &Path) -> AppResult<PathBuf> {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let out = target.join(format!("journal-export-{stamp}"));
        fs::create_dir_all(&out)?;
        let mut used = std::collections::HashSet::new();
        let mut entries: Vec<&Entry> = self.entries.values().filter(|e| !e.is_trashed()).collect();
        entries.sort_by(|a, b| (&a.date, &a.created_at).cmp(&(&b.date, &b.created_at)));
        for e in entries {
            let title = sanitize_file_name(&e.title);
            let base = if title.is_empty() { e.date.clone() } else { format!("{} {}", e.date, title) };
            let mut name = format!("{base}.md");
            let mut n = 2;
            while !used.insert(name.to_lowercase()) {
                name = format!("{base} ({n}).md");
                n += 1;
            }
            fs::write(out.join(&name), e.to_markdown().as_bytes())?;
        }
        Ok(out)
    }

    /// Writes a single-file backup containing the still-encrypted vault.
    pub fn export_backup(&self, path: &Path) -> AppResult<()> {
        let header = read_header(&self.dir)?;
        let settings = match fs::read(self.dir.join(SETTINGS_FILE)) {
            Ok(b) => Some(B64.encode(b)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(e.into()),
        };
        let mut entries = HashMap::new();
        for id in self.entries.keys() {
            entries.insert(id.clone(), B64.encode(fs::read(self.entry_path(id))?));
        }
        let user_id = self.dir.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        let backup = Backup {
            format: BACKUP_FORMAT.into(),
            version: VAULT_VERSION,
            user_id,
            created_at: entry::now(),
            vault: header,
            settings,
            entries,
        };
        write_atomic(path, &serde_json::to_vec(&backup)?)?;
        Ok(())
    }

    /// Writes a timestamped backup into `dir` and deletes this user's older
    /// automatic backups beyond `keep`. Other files in `dir` are never touched.
    pub fn auto_backup(&self, dir: &Path, keep: usize) -> AppResult<PathBuf> {
        let user_id = self.dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        // A short user tag keeps several users' backups in one folder apart.
        let prefix = format!("{AUTO_BACKUP_PREFIX}{}-", &user_id[..user_id.len().min(8)]);
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let path = dir.join(format!("{prefix}{stamp}.{BACKUP_EXTENSION}"));
        self.export_backup(&path)?;

        let suffix = format!(".{BACKUP_EXTENSION}");
        let mut existing: Vec<PathBuf> = fs::read_dir(dir)?
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(&suffix))
            })
            .collect();
        // Timestamps sort lexicographically, newest last.
        existing.sort();
        let excess = existing.len().saturating_sub(keep.max(1));
        for old in &existing[..excess] {
            fs::remove_file(old)?;
        }
        Ok(path)
    }
}

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { ' ' } else { c })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    cleaned.trim_matches('.').chars().take(80).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entry::EntryInput;

    fn setup() -> (tempfile::TempDir, Session) {
        let tmp = tempfile::tempdir().unwrap();
        let session = register_with(tmp.path(), "Ahmet", "parola123", KdfParams::fast_for_tests()).unwrap();
        (tmp, session)
    }

    fn input(e: &Entry, body: &str) -> EntryInput {
        EntryInput {
            id: e.id.clone(),
            title: "Başlık".into(),
            date: e.date.clone(),
            tags: vec!["test".into()],
            mood: None,
            favorite: false,
            body: body.into(),
        }
    }

    #[test]
    fn register_login_and_persist() {
        let (tmp, mut s) = setup();
        assert!(has_any_user(tmp.path()));
        let mut e = Entry::new("2026-10-25").unwrap();
        e.apply(&input(&e, "gizli metin")).unwrap();
        let id = e.id.clone();
        s.save_entry(e).unwrap();

        // Nothing readable on disk.
        let raw = fs::read(s.entry_path(&id)).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("gizli"));

        let s2 = login(tmp.path(), " ahmet ", "parola123").unwrap();
        assert_eq!(s2.entries[&id].body, "gizli metin");
        assert!(matches!(login(tmp.path(), "ahmet", "yanlis-parola"), Err(AppError::InvalidCredentials)));
        assert!(matches!(login(tmp.path(), "baskasi", "parola123"), Err(AppError::InvalidCredentials)));
    }

    #[test]
    fn duplicate_user_rejected() {
        let (tmp, _s) = setup();
        assert!(matches!(
            register_with(tmp.path(), "AHMET", "parola123", KdfParams::fast_for_tests()),
            Err(AppError::UserExists)
        ));
    }

    #[test]
    fn change_password_keeps_data() {
        let (tmp, mut s) = setup();
        let e = Entry::new("2026-10-25").unwrap();
        let id = e.id.clone();
        s.save_entry(e).unwrap();
        assert!(change_password(tmp.path(), "ahmet", "yanlis-parola", "yeniparola1").is_err());
        change_password(tmp.path(), "ahmet", "parola123", "yeniparola1").unwrap();
        assert!(login(tmp.path(), "ahmet", "parola123").is_err());
        assert!(login(tmp.path(), "ahmet", "yeniparola1").unwrap().entries.contains_key(&id));
    }

    #[test]
    fn backup_roundtrip() {
        let (tmp, mut s) = setup();
        let e = Entry::new("2026-10-25").unwrap();
        let id = e.id.clone();
        s.save_entry(e).unwrap();
        s.save_settings(&serde_json::json!({"theme": "dark"})).unwrap();
        let backup = tmp.path().join("yedek.json");
        s.export_backup(&backup).unwrap();

        let other = tempfile::tempdir().unwrap();
        import_backup(other.path(), &backup).unwrap();
        let restored = login(other.path(), "ahmet", "parola123").unwrap();
        assert!(restored.entries.contains_key(&id));
        assert_eq!(restored.load_settings().unwrap()["theme"], "dark");
        assert!(import_backup(other.path(), &backup).is_err());
    }

    #[test]
    fn swapped_entry_files_are_rejected() {
        let (tmp, mut s) = setup();
        let a = Entry::new("2026-10-25").unwrap();
        let b = Entry::new("2026-10-26").unwrap();
        let (ida, idb) = (a.id.clone(), b.id.clone());
        s.save_entry(a).unwrap();
        s.save_entry(b).unwrap();
        fs::copy(s.entry_path(&ida), s.entry_path(&idb)).unwrap();
        let s2 = login(tmp.path(), "ahmet", "parola123").unwrap();
        assert!(s2.entries.contains_key(&ida));
        assert!(!s2.entries.contains_key(&idb));
    }

    #[test]
    fn trash_restore_and_purge() {
        let (tmp, mut s) = setup();
        let e = Entry::new("2026-10-25").unwrap();
        let id = e.id.clone();
        s.save_entry(e).unwrap();

        s.trash_entry(&id).unwrap();
        let s2 = login(tmp.path(), "ahmet", "parola123").unwrap();
        assert!(s2.entries[&id].is_trashed());

        s.restore_entry(&id).unwrap();
        assert!(!s.entries[&id].is_trashed());

        // Entries trashed long ago are purged on login.
        let mut old = s.entries[&id].clone();
        old.deleted_at = Some((chrono::Local::now() - chrono::Duration::days(31)).to_rfc3339());
        s.save_entry(old).unwrap();
        let s3 = login(tmp.path(), "ahmet", "parola123").unwrap();
        assert!(!s3.entries.contains_key(&id));
        assert!(!s.entry_path(&id).exists());
    }

    #[test]
    fn auto_backup_keeps_only_newest() {
        let (tmp, s) = setup();
        let dir = tmp.path().join("backups");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("unrelated.ejbackup"), b"x").unwrap();
        let prefix = format!("{AUTO_BACKUP_PREFIX}{}-", &s.dir.file_name().unwrap().to_str().unwrap()[..8]);
        for stamp in ["20200101-000000", "20200102-000000", "20200103-000000"] {
            fs::write(dir.join(format!("{prefix}{stamp}.ejbackup")), b"old").unwrap();
        }
        let newest = s.auto_backup(&dir, 2).unwrap();
        let mut names: Vec<String> =
            fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().into_string().unwrap()).collect();
        names.sort();
        assert_eq!(names.len(), 3);
        assert!(names.contains(&"unrelated.ejbackup".to_string()));
        assert!(names.contains(&format!("{prefix}20200103-000000.ejbackup")));
        assert!(newest.exists());
    }

    #[test]
    fn delete_account_requires_password() {
        let (tmp, _s) = setup();
        assert!(delete_account(tmp.path(), "ahmet", "yanlis-parola").is_err());
        delete_account(tmp.path(), "ahmet", "parola123").unwrap();
        assert!(!has_any_user(tmp.path()));
    }

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(sanitize_file_name("a/b:c?  d."), "a b c d");
    }
}
