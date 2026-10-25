export interface EntryMeta {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  mood: string | null;
  favorite: boolean;
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
}

export const DEFAULT_SETTINGS: Omit<Settings, "language"> = {
  theme: "system",
  autoLockMinutes: 10,
  fontSize: 16,
  spellcheck: false,
  defaultView: "edit",
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
