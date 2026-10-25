import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { AuthScreen } from "./components/AuthScreen";
import { Journal } from "./components/Journal";
import type { Settings, Theme } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const THEME_KEY = "theme";

function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

type Phase = { kind: "loading" } | { kind: "locked"; hasUsers: boolean } | { kind: "unlocked"; username: string };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, theme: storedTheme() });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const unlock = useCallback(async (username: string) => {
    try {
      setSettings(await api.getSettings());
    } catch (e) {
      setError(errorMessage(e));
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
      .catch((e) => setError(errorMessage(e)));
  }, [unlock]);

  const lock = useCallback(async () => {
    await api.lock().catch(() => {});
    await showLocked();
  }, [showLocked]);

  const updateSettings = useCallback(async (next: Settings) => {
    setSettings(next);
    await api.saveSettings(next);
  }, []);

  if (phase.kind === "loading") {
    return <div className="splash">{error ?? "Yükleniyor…"}</div>;
  }
  if (phase.kind === "locked") {
    return <AuthScreen hasUsers={phase.hasUsers} onUnlocked={unlock} onUsersChanged={showLocked} />;
  }
  return (
    <Journal
      username={phase.username}
      settings={settings}
      onSettingsChange={updateSettings}
      onLock={lock}
      onAccountDeleted={showLocked}
    />
  );
}
