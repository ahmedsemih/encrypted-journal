import { invoke } from "@tauri-apps/api/core";
import { storedLanguage } from "./prefs";
import type { AppStatus, Entry, EntryInput, EntryMeta, EntryTemplate, SearchHit, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export const api = {
  appStatus: () => invoke<AppStatus>("app_status"),
  register: (username: string, password: string) =>
    invoke<{ username: string }>("register", { username, password }),
  login: (username: string, password: string) =>
    invoke<{ username: string }>("login", { username, password }),
  lock: () => invoke<void>("lock"),
  changePassword: (currentPassword: string, newPassword: string) =>
    invoke<void>("change_password", { currentPassword, newPassword }),
  deleteAccount: (password: string) => invoke<void>("delete_account", { password }),
  createRecoveryKey: (password: string) => invoke<string>("create_recovery_key", { password }),
  removeRecoveryKey: (password: string) => invoke<void>("remove_recovery_key", { password }),
  recoveryStatus: () => invoke<string | null>("recovery_status"),
  resetPassword: (username: string, recoveryKey: string, newPassword: string) =>
    invoke<{ username: string }>("reset_password", { username, recoveryKey, newPassword }),
  importBackup: (path: string) => invoke<void>("import_backup", { path }),

  listEntries: () => invoke<EntryMeta[]>("list_entries"),
  getEntry: (id: string) => invoke<Entry>("get_entry", { id }),
  createEntry: (date: string, template?: EntryTemplate) => invoke<Entry>("create_entry", { date, template }),
  saveEntry: (input: EntryInput) => invoke<EntryMeta>("save_entry", { input }),
  listTrash: () => invoke<EntryMeta[]>("list_trash"),
  trashEntry: (id: string) => invoke<EntryMeta>("trash_entry", { id }),
  restoreEntry: (id: string) => invoke<EntryMeta>("restore_entry", { id }),
  purgeEntry: (id: string) => invoke<void>("purge_entry", { id }),
  emptyTrash: () => invoke<void>("empty_trash"),
  searchEntries: (query: string) => invoke<SearchHit[]>("search_entries", { query }),

  getSettings: async (): Promise<Settings> => ({
    ...DEFAULT_SETTINGS,
    language: storedLanguage(),
    ...(await invoke<Partial<Settings>>("get_settings")),
  }),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  exportMarkdown: (dir: string) => invoke<string>("export_markdown", { dir }),
  exportBackup: (path: string) => invoke<void>("export_backup", { path }),
  autoBackup: (dir: string, keep: number) => invoke<string>("auto_backup", { dir, keep }),

  /** Raw bytes go in the request body instead of a slow JSON number array. */
  addAttachment: (bytes: Uint8Array) => invoke<string>("add_attachment", bytes),
  addAttachmentFile: (path: string) => invoke<string>("add_attachment_file", { path }),
  getAttachment: (id: string) => invoke<ArrayBuffer>("get_attachment", { id }),
};
