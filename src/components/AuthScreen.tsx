import { FormEvent, useState } from "react";
import { message, open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { errorText, LANGUAGES, useI18n, type Language } from "../i18n";
import { RecoveryKeyDialog } from "./RecoveryKeyDialog";

interface Props {
  hasUsers: boolean;
  onUnlocked: (username: string) => void;
  onUsersChanged: () => void;
  onLanguage: (lang: Language) => void;
}

type Mode = "login" | "register" | "forgot";

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
  const [mode, setMode] = useState<Mode>(hasUsers ? "login" : "register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Shown after sign-up; the journal opens once the user confirms saving it. */
  const [newKey, setNewKey] = useState<{ code: string; username: string } | null>(null);

  const strength = passwordStrength(password);
  const settingPassword = mode !== "login";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (settingPassword && password !== confirm) {
      setError(t.auth.mismatch);
      return;
    }
    try {
      if (mode === "login") {
        setBusy(t.auth.unlocking);
        const info = await api.login(username, password);
        onUnlocked(info.username);
      } else if (mode === "forgot") {
        setBusy(t.auth.resetting);
        const info = await api.resetPassword(username, recoveryKey, password);
        setRecoveryKey("");
        onUnlocked(info.username);
      } else {
        setBusy(t.auth.creating);
        const info = await api.register(username, password);
        setBusy(t.recovery.preparing);
        try {
          setNewKey({ code: await api.createRecoveryKey(password), username: info.username });
        } catch {
          // The account works without one; it can be created later in Settings.
          await message(t.recovery.failed, { kind: "warning" });
          onUnlocked(info.username);
        }
      }
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setError(null);
    setNotice(null);
    const path = await open({ multiple: false, filters: [{ name: t.backupFilter, extensions: ["ejbackup", "json"] }] });
    if (typeof path !== "string") return;
    try {
      await api.importBackup(path);
      switchMode("login");
      setNotice(t.auth.restored);
      onUsersChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  if (newKey) {
    return <RecoveryKeyDialog code={newKey.code} onDone={() => onUnlocked(newKey.username)} />;
  }

  const intro = { login: t.auth.loginIntro, register: t.auth.registerIntro, forgot: t.auth.forgotIntro }[mode];
  const submitLabel = { login: t.auth.unlock, register: t.auth.create, forgot: t.auth.reset }[mode];

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
          {mode === "forgot" ? "🔑" : "🔒"}
        </div>
        <h1>{mode === "forgot" ? t.auth.forgot : t.appName}</h1>
        <p className="muted">{intro}</p>

        {mode !== "forgot" && (
          <div className="segmented" role="tablist">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
              {t.auth.login}
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>
              {t.auth.register}
            </button>
          </div>
        )}

        <label className="field">
          <span>{t.auth.username}</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        {mode === "forgot" && (
          <label className="field">
            <span>{t.auth.recoveryKey}</span>
            <input
              className="mono"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
        )}
        <label className="field">
          <span>{mode === "forgot" ? t.auth.newPassword : t.auth.password}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={settingPassword ? "new-password" : "current-password"}
            minLength={settingPassword ? 8 : undefined}
            required
          />
        </label>
        {settingPassword && (
          <>
            <div className="strength" data-score={strength}>
              <div className="strength-bar">
                <span style={{ width: `${(strength / 5) * 100}%` }} />
              </div>
              <small>{password ? t.auth.strength[strength] : t.auth.minChars}</small>
            </div>
            <label className="field">
              <span>{mode === "forgot" ? t.auth.newPasswordRepeat : t.auth.passwordRepeat}</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
          </>
        )}
        {mode === "register" && <p className="warning">{t.auth.warning}</p>}

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button className="primary block" disabled={busy !== null}>
          {busy ?? submitLabel}
        </button>

        <div className="auth-links">
          {mode === "forgot" ? (
            <button type="button" className="link" onClick={() => switchMode("login")}>
              ← {t.auth.backToLogin}
            </button>
          ) : (
            <>
              {mode === "login" && (
                <button type="button" className="link" onClick={() => switchMode("forgot")}>
                  {t.auth.forgot}
                </button>
              )}
              <button type="button" className="link" onClick={restore}>
                {t.auth.restore}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
