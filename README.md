# Şifreli Günlük (Encrypted Journal)

Tauri 2 + React + TypeScript ile geliştirilmiş, uçtan uca şifreli, çapraz platform (Linux, Windows, macOS) bir masaüstü günlük uygulaması. Her kayıt **Markdown** olarak tutulur ve diske yalnızca **şifreli** olarak yazılır.

## Özellikler

- 🔐 Kullanıcı adı + parola ile çoklu kullanıcı desteği; parola hiçbir yerde saklanmaz
- 📝 Markdown editörü: araç çubuğu, kısayollar, liste devamı, yaz / bölünmüş / önizleme görünümleri
- 💾 Otomatik kaydetme (her değişiklikten kısa süre sonra, kayıt değiştirirken, kilitlerken ve pencere kapanırken)
- 📅 Takvim görünümü, güne göre filtreleme
- 🔎 Tam metin arama (başlık, gövde, etiketler)
- 🏷️ Etiketler, 😄 ruh hali, ★ favoriler
- 🕰️ "Geçmişte bugün", seri (streak) ve kelime istatistikleri
- 🔒 Hareketsizlikte otomatik kilit, manuel kilit (Ctrl+L)
- 🔑 Parola değiştirme (kayıtlar yeniden şifrelenmeden)
- 📦 Şifreli tek dosya yedek alma / geri yükleme
- 📤 Şifresiz Markdown olarak dışa aktarma (uyarı ile)
- 🌗 Açık / koyu / sistem teması
- 🌐 Türkçe / İngilizce arayüz (giriş ekranından veya Ayarlar > Görünüm'den)

### Kısayollar

| Kısayol | İşlev |
| --- | --- |
| Ctrl+N | Yeni kayıt |
| Ctrl+F | Ara |
| Ctrl+L | Kilitle |
| Ctrl+, | Ayarlar |
| Ctrl+S | Hemen kaydet |
| Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+K | Kalın / italik / kod / bağlantı |
| Tab / Shift+Tab | Satırı girintile / girintiyi azalt |

## Güvenlik tasarımı

```
parola ──Argon2id(m=64 MiB, t=3, p=4, rastgele tuz)──▶ KEK
rastgele 256-bit DEK ──XChaCha20-Poly1305(KEK)──▶ vault.json içindeki wrappedKey
her kayıt (Markdown) ──XChaCha20-Poly1305(DEK, AAD=kayıt kimliği)──▶ entries/<uuid>.md.enc
```

- **İki katmanlı anahtar**: Parola değiştiğinde yalnızca DEK yeniden sarılır; kayıtlar yeniden şifrelenmez.
- **Doğrulanmış şifreleme**: Değiştirilmiş veya başka dosyayla yer değiştirilmiş kayıtlar reddedilir (AAD = kayıt kimliği).
- **Meta veri gizliliği**: Kullanıcı klasörleri kullanıcı adının SHA-256 özeti, kayıt dosyaları rastgele UUID ile adlandırılır; tarih, başlık, etiket gibi bilgiler de şifreli içeriktedir.
- **Bellek**: Anahtar ve çözülmüş kayıtlar kilitlendiğinde bellekten silinir (`zeroize`).
- **Atomik yazma**: Dosyalar önce geçici dosyaya yazılıp yeniden adlandırılır; çökme yarım dosya bırakmaz.
- Markdown önizlemesinde ham HTML çalıştırılmaz; CSP uzak kaynakları (ör. izleme pikselleri) engeller.

> ⚠️ Parolanızı unutursanız verileriniz **kurtarılamaz**. Düzenli olarak şifreli yedek alın.

### Şifre çözülmüş kayıt formatı

```markdown
---
title: "Başlık"
date: "2026-10-25"
created_at: "2026-10-25T21:04:11+03:00"
updated_at: "2026-10-25T21:30:42+03:00"
tags: ["iş", "spor"]
mood: "good"
favorite: false
---

Kaydın **markdown** gövdesi…
```

### Veri konumu

| Platform | Klasör |
| --- | --- |
| Linux | `~/.local/share/dev.ahmedsemih.encryptedjournal/` |
| macOS | `~/Library/Application Support/dev.ahmedsemih.encryptedjournal/` |
| Windows | `%APPDATA%\dev.ahmedsemih.encryptedjournal\` |

## Geliştirme

### Gereksinimler

- [Rust](https://rustup.rs) (stable)
- Node.js 20+
- Platforma özel Tauri bağımlılıkları: <https://v2.tauri.app/start/prerequisites/>

Fedora için:

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install c-development
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Komutlar

```bash
npm install
npm run tauri dev              # geliştirme modunda çalıştır
npm run tauri build            # dağıtım paketlerini oluştur (deb/rpm/AppImage, msi, dmg…)
cd src-tauri && cargo test     # backend testleri
```

## Proje yapısı

```
src/                   React arayüzü
  components/          Auth, Journal, Sidebar, Calendar, EntryList, Editor, Settings…
  markdown.ts          Editör metin dönüşümleri
  i18n.tsx             Türkçe/İngilizce sözlükler; backend hata kodlarının çevirisi
src-tauri/src/
  crypto.rs            Argon2id + XChaCha20-Poly1305
  entry.rs             Kayıt modeli, Markdown/front matter dönüşümü
  vault.rs             Disk düzeni, hesap işlemleri, yedekleme
  commands.rs          Tauri komutları
```
