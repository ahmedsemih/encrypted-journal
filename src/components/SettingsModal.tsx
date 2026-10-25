import { FormEvent, useEffect, useState } from "react";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { today } from "../dates";
import { errorText, LANGUAGES, useI18n, type Language } from "../i18n";
import type { EditorView, Settings, Theme } from "../types";

interface Props {
  username: string;
  settings: Settings;
  onChange: (s: Settings) => Promise<void>;
  onClose: () => void;
  onAccountDeleted: () => void;
  flush: () => Promise<void>;
}

type Tab = "appearance" | "security" | "data";

export function SettingsModal({ username, settings, onChange, onClose, onAccountDeleted, flush }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("appearance");
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [deletePw, setDeletePw] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value }).catch((e) => setMessage({ kind: "error", text: errorText(t, e) }));

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await task();
      if (text) setMessage({ kind: "notice", text });
    } catch (e) {
      setMessage({ kind: "error", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setMessage({ kind: "error", text: t.settings.passwordMismatch });
      return;
    }
    run(async () => {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      return t.settings.passwordChanged;
    });
  };

  const exportMarkdown = () =>
    run(async () => {
      const ok = await ask(t.settings.exportWarning, {
        title: t.settings.exportWarningTitle,
        kind: "warning",
        okLabel: t.settings.continue,
        cancelLabel: t.cancel,
      });
      if (!ok) return null;
      const dir = await open({ directory: true, title: t.settings.exportPickDir });
      if (typeof dir !== "string") return null;
      await flush();
      return t.settings.exportDone(await api.exportMarkdown(dir));
    });

  const exportBackup = () =>
    run(async () => {
      const path = await save({
        title: t.settings.backupDialogTitle,
        defaultPath: `${t.settings.backupFileName}-${today()}.ejbackup`,
        filters: [{ name: t.backupFilter, extensions: ["ejbackup"] }],
      });
      if (!path) return null;
      await flush();
      await api.exportBackup(path);
      return t.settings.backupDone;
    });

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const ok = await ask(t.settings.deleteConfirm(username), {
        title: t.settings.deleteTitle,
        kind: "warning",
        okLabel: t.settings.deleteForever,
        cancelLabel: t.cancel,
      });
      if (!ok) return null;
      await api.deleteAccount(deletePw);
      onAccountDeleted();
      return null;
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t.settings.title}>
        <header className="modal-head">
          <h2>{t.settings.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </header>
        <div className="segmented">
          {(["appearance", "security", "data"] as const).map((id) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMessage(null);
              }}
            >
              {t.settings.tabs[id]}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "appearance" && (
            <>
              <label className="field row">
                <span>{t.settings.language}</span>
                <select value={settings.language} onChange={(e) => set("language", e.target.value as Language)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field row">
                <span>{t.settings.theme}</span>
                <select value={settings.theme} onChange={(e) => set("theme", e.target.value as Theme)}>
                  {(["system", "light", "dark"] as const).map((th) => (
                    <option key={th} value={th}>
                      {t.settings.themes[th]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field row">
                <span>{t.settings.fontSize}</span>
                <select value={settings.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))}>
                  {[14, 15, 16, 17, 18, 20, 22].map((n) => (
                    <option key={n} value={n}>
                      {n}px
                    </option>
                  ))}
                </select>
              </label>
              <label className="field row">
                <span>{t.settings.defaultView}</span>
                <select value={settings.defaultView} onChange={(e) => set("defaultView", e.target.value as EditorView)}>
                  {(["edit", "split", "preview"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t.editor.views[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field row checkbox">
                <span>{t.settings.spellcheck}</span>
                <input type="checkbox" checked={settings.spellcheck} onChange={(e) => set("spellcheck", e.target.checked)} />
              </label>
            </>
          )}

          {tab === "security" && (
            <>
              <label className="field row">
                <span>{t.settings.autoLock}</span>
                <select value={settings.autoLockMinutes} onChange={(e) => set("autoLockMinutes", Number(e.target.value))}>
                  <option value={0}>{t.settings.autoLockOff}</option>
                  {[1, 5, 10, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {t.settings.autoLockAfter(n)}
                    </option>
                  ))}
                </select>
              </label>
              <form className="sub-form" onSubmit={changePassword}>
                <h3>{t.settings.changePassword}</h3>
                <input type="password" placeholder={t.settings.currentPassword} value={pw.current} autoComplete="current-password" onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
                <input type="password" placeholder={t.settings.newPassword} value={pw.next} autoComplete="new-password" minLength={8} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
                <input type="password" placeholder={t.settings.newPasswordRepeat} value={pw.confirm} autoComplete="new-password" onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
                <button className="primary" disabled={busy}>
                  {busy ? t.settings.working : t.settings.changePassword}
                </button>
              </form>
              <p className="muted small">{t.settings.cryptoInfo}</p>
            </>
          )}

          {tab === "data" && (
            <>
              <div className="action-row">
                <div>
                  <h3>{t.settings.backupTitle}</h3>
                  <p className="muted small">{t.settings.backupInfo}</p>
                </div>
                <button disabled={busy} onClick={exportBackup}>
                  {t.settings.backupButton}
                </button>
              </div>
              <div className="action-row">
                <div>
                  <h3>{t.settings.exportTitle}</h3>
                  <p className="muted small">{t.settings.exportInfo}</p>
                </div>
                <button disabled={busy} onClick={exportMarkdown}>
                  {t.settings.exportButton}
                </button>
              </div>
              <form className="sub-form danger-zone" onSubmit={deleteAccount}>
                <h3>{t.settings.deleteTitle}</h3>
                <p className="muted small">{t.settings.deleteInfo}</p>
                <input type="password" placeholder={t.settings.deletePassword} value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required />
                <button className="danger" disabled={busy}>
                  {t.settings.deleteTitle}
                </button>
              </form>
            </>
          )}

          {message && <p className={message.kind}>{message.text}</p>}
        </div>
      </div>
    </div>
  );
}
