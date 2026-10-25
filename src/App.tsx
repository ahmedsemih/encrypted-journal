import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { AuthScreen } from "./components/AuthScreen";
import { Journal } from "./components/Journal";
import { errorText, I18nProvider, makeI18n, type Language } from "./i18n";
import { rememberPrefs, storedLanguage, storedTheme } from "./prefs";
import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

type Phase = { kind: "loading" } | { kind: "locked"; hasUsers: boolean } | { kind: "unlocked"; username: string };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    theme: storedTheme(),
    language: storedLanguage(),
  }));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const { theme, language } = settings;
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
    rememberPrefs(theme, language);
    getCurrentWindow()
      .setTitle(makeI18n(language).t.appName)
      .catch(() => {});
  }, [settings.theme, settings.language]);

  const unlock = useCallback(async (username: string) => {
    try {
      setSettings(await api.getSettings());
    } catch (e) {
      setError(e);
    }
    setPhase({ kind: "unlocked", username });
  }, []);

  const showLocked = useCallback(async () => {
    const status = await api.appStatus();
    setPhase({ kind: "locked", hasUsers: status.hasUsers });
  }, []);

  useEffect(() => {
    api
      .appStatus()
      .then((s) => (s.username ? unlock(s.username) : setPhase({ kind: "locked", hasUsers: s.hasUsers })))
      .catch(setError);
  }, [unlock]);

  const lock = useCallback(async () => {
    await api.lock().catch(() => {});
    await showLocked();
  }, [showLocked]);

  const updateSettings = useCallback(async (next: Settings) => {
    setSettings(next);
    await api.saveSettings(next);
  }, []);

  // Before sign-in the language only lives in localStorage.
  const setLanguage = useCallback((language: Language) => setSettings((s) => ({ ...s, language })), []);

  const { t } = makeI18n(settings.language);
  let content;
  if (phase.kind === "loading") {
    content = <div className="splash">{error ? errorText(t, error) : t.loading}</div>;
  } else if (phase.kind === "locked") {
    content = (
      <AuthScreen
        hasUsers={phase.hasUsers}
        onUnlocked={unlock}
        onUsersChanged={showLocked}
        onLanguage={setLanguage}
      />
    );
  } else {
    content = (
      <Journal
        username={phase.username}
        settings={settings}
        onSettingsChange={updateSettings}
        onLock={lock}
        onAccountDeleted={showLocked}
      />
    );
  }
  return <I18nProvider lang={settings.language}>{content}</I18nProvider>;
}
