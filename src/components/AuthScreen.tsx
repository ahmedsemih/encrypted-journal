import { FormEvent, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { errorText, LANGUAGES, useI18n, type Language } from "../i18n";

interface Props {
  hasUsers: boolean;
  onUnlocked: (username: string) => void;
  onUsersChanged: () => void;
  onLanguage: (lang: Language) => void;
}

function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\p{Ll}/u.test(pw) && /\p{Lu}/u.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\p{L}\d]/u.test(pw)) score++;
  return score;
}

export function AuthScreen({ hasUsers, onUnlocked, onUsersChanged, onLanguage }: Props) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<"login" | "register">(hasUsers ? "login" : "register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const registering = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (registering && password !== confirm) {
      setError(t.auth.mismatch);
      return;
    }
    setBusy(true);
    try {
      const info = registering ? await api.register(username, password) : await api.login(username, password);
      setPassword("");
      setConfirm("");
      onUnlocked(info.username);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setError(null);
    setNotice(null);
    const path = await open({ multiple: false, filters: [{ name: t.backupFilter, extensions: ["ejbackup", "json"] }] });
    if (typeof path !== "string") return;
    try {
      await api.importBackup(path);
      setMode("login");
      setNotice(t.auth.restored);
      onUsersChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="auth">
      <div className="lang-switch">
        {LANGUAGES.map((l) => (
          <button key={l.id} className={lang === l.id ? "active" : ""} onClick={() => onLanguage(l.id)} title={l.label}>
            {l.id.toUpperCase()}
          </button>
        ))}
      </div>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo" aria-hidden>
          🔒
        </div>
        <h1>{t.appName}</h1>
        <p className="muted">{registering ? t.auth.registerIntro : t.auth.loginIntro}</p>

        <div className="segmented" role="tablist">
          <button type="button" className={!registering ? "active" : ""} onClick={() => setMode("login")}>
            {t.auth.login}
          </button>
          <button type="button" className={registering ? "active" : ""} onClick={() => setMode("register")}>
            {t.auth.register}
          </button>
        </div>

        <label className="field">
          <span>{t.auth.username}</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>{t.auth.password}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registering ? "new-password" : "current-password"}
            minLength={registering ? 8 : undefined}
            required
          />
        </label>
        {registering && (
          <>
            <div className="strength" data-score={strength}>
              <div className="strength-bar">
                <span style={{ width: `${(strength / 5) * 100}%` }} />
              </div>
              <small>{password ? t.auth.strength[strength] : t.auth.minChars}</small>
            </div>
            <label className="field">
              <span>{t.auth.passwordRepeat}</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <p className="warning">{t.auth.warning}</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button className="primary block" disabled={busy}>
          {busy ? (registering ? t.auth.creating : t.auth.unlocking) : registering ? t.auth.create : t.auth.unlock}
        </button>

        <button type="button" className="link" onClick={restore}>
          {t.auth.restore}
        </button>
      </form>
    </div>
  );
}
