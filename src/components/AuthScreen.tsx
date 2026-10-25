import { FormEvent, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../api";

interface Props {
  hasUsers: boolean;
  onUnlocked: (username: string) => void;
  onUsersChanged: () => void;
}

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zçğıöşü]/.test(pw) && /[A-ZÇĞİÖŞÜ]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\p{L}\d]/u.test(pw)) score++;
  const labels = ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü", "Çok güçlü"];
  return { score, label: labels[score] };
}

export function AuthScreen({ hasUsers, onUnlocked, onUsersChanged }: Props) {
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
      setError("Parolalar eşleşmiyor");
      return;
    }
    setBusy(true);
    try {
      const info = registering ? await api.register(username, password) : await api.login(username, password);
      setPassword("");
      setConfirm("");
      onUnlocked(info.username);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setError(null);
    setNotice(null);
    const path = await open({ multiple: false, filters: [{ name: "Günlük yedeği", extensions: ["ejbackup", "json"] }] });
    if (typeof path !== "string") return;
    try {
      await api.importBackup(path);
      setMode("login");
      setNotice("Yedek geri yüklendi. Yedeği aldığınız andaki kullanıcı adı ve parolayla giriş yapın.");
      onUsersChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo" aria-hidden>
          🔒
        </div>
        <h1>Şifreli Günlük</h1>
        <p className="muted">
          {registering
            ? "Yeni bir günlük oluşturun. Tüm kayıtlarınız parolanızdan türetilen anahtarla şifrelenir."
            : "Günlüğünüzün kilidini açmak için giriş yapın."}
        </p>

        <div className="segmented" role="tablist">
          <button type="button" className={!registering ? "active" : ""} onClick={() => setMode("login")}>
            Giriş yap
          </button>
          <button type="button" className={registering ? "active" : ""} onClick={() => setMode("register")}>
            Kayıt ol
          </button>
        </div>

        <label className="field">
          <span>Kullanıcı adı</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Parola</span>
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
            <div className="strength" data-score={strength.score}>
              <div className="strength-bar">
                <span style={{ width: `${(strength.score / 5) * 100}%` }} />
              </div>
              <small>{password ? strength.label : "En az 8 karakter"}</small>
            </div>
            <label className="field">
              <span>Parola (tekrar)</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <p className="warning">
              ⚠️ Parolanızı unutursanız kayıtlarınız <strong>kurtarılamaz</strong>. Parola hiçbir yerde saklanmaz.
            </p>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button className="primary block" disabled={busy}>
          {busy ? (registering ? "Kasa oluşturuluyor…" : "Kilit açılıyor…") : registering ? "Günlüğü oluştur" : "Kilidi aç"}
        </button>

        <button type="button" className="link" onClick={restore}>
          Yedekten geri yükle
        </button>
      </form>
    </div>
  );
}
