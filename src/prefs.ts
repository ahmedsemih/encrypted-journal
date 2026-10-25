/** Preferences mirrored in localStorage so they apply before sign-in. */
import { detectLanguage, type Language } from "./i18n";
import type { Theme } from "./types";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function storedTheme(): Theme {
  const t = read("theme");
  return t === "light" || t === "dark" || t === "system" ? t : "system";
}

export function storedLanguage(): Language {
  const l = read("language");
  return l === "tr" || l === "en" ? l : detectLanguage();
}

export function rememberPrefs(theme: Theme, language: Language) {
  write("theme", theme);
  write("language", language);
}
