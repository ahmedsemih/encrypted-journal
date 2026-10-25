export interface EntryMeta {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  mood: string | null;
  favorite: boolean;
  deletedAt: string | null;
  excerpt: string;
  wordCount: number;
}

export interface Entry {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  mood: string | null;
  favorite: boolean;
  deletedAt: string | null;
  body: string;
}

export type EntryInput = Pick<Entry, "id" | "title" | "date" | "tags" | "mood" | "favorite" | "body">;

import type { Language } from "./i18n";

export type Theme = "system" | "light" | "dark";
export type EditorView = "edit" | "split" | "preview";

export interface Settings {
  theme: Theme;
  autoLockMinutes: number;
  fontSize: number;
  spellcheck: boolean;
  defaultView: EditorView;
  language: Language;
  /** Lock when the computer sleeps or the screen locks. */
  lockOnSystemLock: boolean;
  autoBackup: AutoBackup;
}

export interface AutoBackup {
  /** Target folder; null disables automatic backups. */
  dir: string | null;
  intervalHours: number;
  keep: number;
  lastAt: string | null;
}

export const DEFAULT_SETTINGS: Omit<Settings, "language"> = {
  theme: "system",
  autoLockMinutes: 10,
  fontSize: 16,
  spellcheck: false,
  defaultView: "edit",
  lockOnSystemLock: true,
  autoBackup: { dir: null, intervalHours: 24, keep: 10, lastAt: null },
};

export interface AppStatus {
  hasUsers: boolean;
  username: string | null;
}

export const MOODS = [
  { id: "great", emoji: "😄" },
  { id: "good", emoji: "🙂" },
  { id: "okay", emoji: "😐" },
  { id: "bad", emoji: "😕" },
  { id: "awful", emoji: "😢" },
] as const;

export function moodEmoji(id: string | null): string | null {
  return MOODS.find((m) => m.id === id)?.emoji ?? null;
}
