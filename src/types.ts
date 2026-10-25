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
  /** null until the user edits templates; the localized built-ins are used meanwhile. */
  templates: Template[] | null;
  /** Template used by Ctrl+N and the "New entry" button; null means blank. */
  defaultTemplateId: string | null;
}

export interface Template {
  id: string;
  name: string;
  title: string;
  body: string;
  tags: string[];
}

/** What the backend receives: a template with placeholders already filled. */
export type EntryTemplate = Pick<Template, "title" | "body" | "tags">;

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
  templates: null,
  defaultTemplateId: null,
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
