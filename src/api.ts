import { invoke } from "@tauri-apps/api/core";
import type { AppStatus, Entry, EntryInput, EntryMeta, Settings } from "./types";
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
  importBackup: (path: string) => invoke<void>("import_backup", { path }),

  listEntries: () => invoke<EntryMeta[]>("list_entries"),
  getEntry: (id: string) => invoke<Entry>("get_entry", { id }),
  createEntry: (date: string) => invoke<Entry>("create_entry", { date }),
  saveEntry: (input: EntryInput) => invoke<EntryMeta>("save_entry", { input }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  searchEntries: (query: string) => invoke<string[]>("search_entries", { query }),

  getSettings: async (): Promise<Settings> => ({
    ...DEFAULT_SETTINGS,
    ...(await invoke<Partial<Settings>>("get_settings")),
  }),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  exportMarkdown: (dir: string) => invoke<string>("export_markdown", { dir }),
  exportBackup: (path: string) => invoke<void>("export_backup", { path }),
};

/** Tauri rejects with the serialized AppError string. */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Beklenmeyen bir hata oluştu";
}
