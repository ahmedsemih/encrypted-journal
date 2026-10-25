import { FormEvent, useEffect, useState } from "react";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../api";
import { today } from "../dates";
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
    onChange({ ...settings, [key]: value }).catch((e) => setMessage({ kind: "error", text: errorMessage(e) }));

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await task();
      if (text) setMessage({ kind: "notice", text });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setMessage({ kind: "error", text: "Yeni parolalar eşleşmiyor" });
      return;
    }
    run(async () => {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      return "Parola değiştirildi.";
    });
  };

  const exportMarkdown = () =>
    run(async () => {
      const ok = await ask(
        "Dışa aktarılan dosyalar ŞİFRESİZ düz markdown olacaktır. Bu dosyalara erişen herkes günlüğünüzü okuyabilir. Devam edilsin mi?",
        { title: "Şifresiz dışa aktarım", kind: "warning", okLabel: "Devam et", cancelLabel: "Vazgeç" },
      );
      if (!ok) return null;
      const dir = await open({ directory: true, title: "Dışa aktarma klasörünü seçin" });
      if (typeof dir !== "string") return null;
      await flush();
      const out = await api.exportMarkdown(dir);
      return `Kayıtlar dışa aktarıldı: ${out}`;
    });

  const exportBackup = () =>
    run(async () => {
      const path = await save({
        title: "Şifreli yedeği kaydet",
        defaultPath: `gunluk-yedek-${today()}.ejbackup`,
        filters: [{ name: "Günlük yedeği", extensions: ["ejbackup"] }],
      });
      if (!path) return null;
      await flush();
      await api.exportBackup(path);
      return "Şifreli yedek oluşturuldu. Geri yüklemek için giriş ekranındaki “Yedekten geri yükle” seçeneğini kullanın.";
    });

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const ok = await ask(`“${username}” hesabı ve TÜM kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.`, {
        title: "Hesabı sil",
        kind: "warning",
        okLabel: "Kalıcı olarak sil",
        cancelLabel: "Vazgeç",
      });
      if (!ok) return null;
      await api.deleteAccount(deletePw);
      onAccountDeleted();
      return null;
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ayarlar">
        <header className="modal-head">
          <h2>Ayarlar</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </header>
        <div className="segmented">
          {(
            [
              ["appearance", "Görünüm"],
              ["security", "Güvenlik"],
              ["data", "Veri"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMessage(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "appearance" && (
            <>
              <label className="field row">
                <span>Tema</span>
                <select value={settings.theme} onChange={(e) => set("theme", e.target.value as Theme)}>
                  <option value="system">Sistem</option>
                  <option value="light">Açık</option>
                  <option value="dark">Koyu</option>
                </select>
              </label>
              <label className="field row">
                <span>Yazı boyutu</span>
                <select value={settings.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))}>
                  {[14, 15, 16, 17, 18, 20, 22].map((n) => (
                    <option key={n} value={n}>
                      {n}px
                    </option>
                  ))}
                </select>
              </label>
              <label className="field row">
                <span>Varsayılan görünüm</span>
                <select value={settings.defaultView} onChange={(e) => set("defaultView", e.target.value as EditorView)}>
                  <option value="edit">Yaz</option>
                  <option value="split">Bölünmüş</option>
                  <option value="preview">Önizle</option>
                </select>
              </label>
              <label className="field row checkbox">
                <span>Yazım denetimi</span>
                <input type="checkbox" checked={settings.spellcheck} onChange={(e) => set("spellcheck", e.target.checked)} />
              </label>
            </>
          )}

          {tab === "security" && (
            <>
              <label className="field row">
                <span>Otomatik kilit</span>
                <select value={settings.autoLockMinutes} onChange={(e) => set("autoLockMinutes", Number(e.target.value))}>
                  <option value={0}>Kapalı</option>
                  {[1, 5, 10, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} dk hareketsizlikten sonra
                    </option>
                  ))}
                </select>
              </label>
              <form className="sub-form" onSubmit={changePassword}>
                <h3>Parolayı değiştir</h3>
                <input type="password" placeholder="Mevcut parola" value={pw.current} autoComplete="current-password" onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
                <input type="password" placeholder="Yeni parola (en az 8 karakter)" value={pw.next} autoComplete="new-password" minLength={8} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
                <input type="password" placeholder="Yeni parola (tekrar)" value={pw.confirm} autoComplete="new-password" onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
                <button className="primary" disabled={busy}>
                  {busy ? "İşleniyor…" : "Parolayı değiştir"}
                </button>
              </form>
              <p className="muted small">
                Kayıtlar Argon2id ile parolanızdan türetilen anahtarla korunan rastgele bir 256-bit anahtarla, XChaCha20-Poly1305
                kullanılarak şifrelenir.
              </p>
            </>
          )}

          {tab === "data" && (
            <>
              <div className="action-row">
                <div>
                  <h3>Şifreli yedek</h3>
                  <p className="muted small">Tüm günlüğü şifreli tek bir dosyaya kaydeder. Başka bir bilgisayara taşımak için idealdir.</p>
                </div>
                <button disabled={busy} onClick={exportBackup}>
                  Yedek al
                </button>
              </div>
              <div className="action-row">
                <div>
                  <h3>Markdown olarak dışa aktar</h3>
                  <p className="muted small">Her kaydı şifresiz bir .md dosyası olarak seçtiğiniz klasöre yazar.</p>
                </div>
                <button disabled={busy} onClick={exportMarkdown}>
                  Dışa aktar
                </button>
              </div>
              <form className="sub-form danger-zone" onSubmit={deleteAccount}>
                <h3>Hesabı sil</h3>
                <p className="muted small">Hesabınızı ve tüm kayıtlarınızı bu bilgisayardan kalıcı olarak siler.</p>
                <input type="password" placeholder="Parolanız" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required />
                <button className="danger" disabled={busy}>
                  Hesabı sil
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
