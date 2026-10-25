# Şifreli Günlük (Encrypted Journal)

Tauri 2 + React + TypeScript ile geliştirilmiş, uçtan uca şifreli, çapraz platform (Linux, Windows, macOS) bir masaüstü günlük uygulaması. Her kayıt **Markdown** olarak tutulur ve diske yalnızca **şifreli** olarak yazılır.

## Özellikler

- 🔐 Kullanıcı adı + parola ile çoklu kullanıcı desteği; parola hiçbir yerde saklanmaz
- 📝 Markdown editörü: araç çubuğu, kısayollar, liste devamı, yaz / bölünmüş / önizleme görünümleri
- 💾 Otomatik kaydetme (her değişiklikten kısa süre sonra, kayıt değiştirirken, kilitlerken ve pencere kapanırken)
- ↩️ Geri al / yinele (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y): yalnızca uygulama açıkken, bellekte tutulur; kilitlenince silinir
- 🗑 Çöp kutusu: silinen kayıtlar 30 gün saklanır, sonra kalıcı olarak silinir
- 💽 Otomatik şifreli yedek: seçilen klasöre düzenli yedek, eski yedeklerin otomatik temizliği
- 📅 Takvim görünümü, güne göre filtreleme
- 🔎 Tam metin arama: büyük/küçük harf ve ş/s, ı/i gibi farkları önemsemez; "tam ifade" ve -hariç tutma destekler, eşleşen yeri vurgulu gösterir
- 🧰 Filtreler: tarih aralığı, ruh hali, birden çok etiket (hepsi), favoriler; birleştirilebilir
- 🔗 Kayıtlar arası bağlantılar: `[[` yazınca kayıt seçici açılır, `[metin](entry:<id>)` olarak saklanır (yeniden adlandırmada kopmaz); önizlemede tıklanabilir, editör altında giden bağlantılar ve "bu kayda bağlananlar" listelenir; Markdown dışa aktarımında dosyalara yönlenir
- 🧭 Komut paleti (Ctrl+P): kayıtları, çöp kutusunu, etiketleri, tarihleri ve komutları tek kutudan arar
- 🏷️ Etiketler, 😄 ruh hali, ★ favoriler
- 🕰️ "Geçmişte bugün", seri (streak) ve kelime istatistikleri
- 🖼 Şifreli resim ekleri (araç çubuğu, yapıştırma veya sürükle-bırak); yedeğe ve dışa aktarıma dahil
- 📊 İstatistikler: yazma takvimi, aylık ruh hali, kelime sayısı, etiketler, yazma saatleri (her grafik tablo olarak da görülebilir)
- 🔒 Hareketsizlikte otomatik kilit, manuel kilit (Ctrl+L); bilgisayar uykuya geçince (tüm platformlar) veya ekran kilitlenince (Linux) kilit
- 🔑 Parola değiştirme (kayıtlar yeniden şifrelenmeden)
- 🗝 Kurtarma anahtarı: hesap oluştururken bir kez gösterilir; parola unutulursa yeni parola belirlemenin tek yolu
- 📝 Şablonlar: hazır ve kişisel şablonlar, `{{date}}` / `{{weekday}}` / `{{time}}` alanları, varsayılan şablon
- 📦 Şifreli tek dosya yedek alma / geri yükleme
- 📤 Şifresiz Markdown olarak dışa aktarma (uyarı ile)
- 🌗 Açık / koyu / sistem teması
- 🔤 Yazı tipi (serif / sans-serif / eş aralıklı, uygulamaya gömülü), boyutu, satır aralığı ve satır genişliği ayarları
- 🎯 Odak modu (Ctrl+Shift+F): yalnızca başlık ve metin kalır, isteğe bağlı daktilo kaydırması; F11 ile tam ekran
- 🌐 Türkçe / İngilizce arayüz (giriş ekranından veya Ayarlar > Görünüm'den)

### Kısayollar

| Kısayol | İşlev |
| --- | --- |
| Ctrl+N | Yeni kayıt |
| Ctrl+P | Her yerde ara: kayıtlar, çöp kutusu, etiketler, tarihler ("dün", "25.10.2025", "ekim 2025") ve komutlar |
| Ctrl+F | Listede ara |
| Ctrl+L | Kilitle |
| Ctrl+, | Ayarlar |
| Ctrl+Shift+F / Esc | Odak moduna gir / çık |
| F11 | Tam ekran |
| Ctrl+S | Hemen kaydet |
| Ctrl+Z / Ctrl+Shift+Z | Geri al / yinele |
| Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+K | Kalın / italik / kod / bağlantı |
| Tab / Shift+Tab | Satırı girintile / girintiyi azalt |

## Güvenlik tasarımı

```
parola ──Argon2id(m=64 MiB, t=3, p=4, rastgele tuz)──▶ KEK
rastgele 256-bit DEK ──XChaCha20-Poly1305(KEK)──▶ vault.json içindeki wrappedKey
her kayıt (Markdown) ──XChaCha20-Poly1305(DEK, AAD=kayıt kimliği)──▶ entries/<uuid>.md.enc
```

- **İki katmanlı anahtar**: Parola değiştiğinde yalnızca DEK yeniden sarılır; kayıtlar yeniden şifrelenmez.
- **Kurtarma anahtarı**: 160-bit rastgele bir sır (Crockford Base32, 32 karakter). DEK, Argon2id ile bu sırdan türetilen anahtarla ikinci kez sarılır; parola ile kurtarma anahtarından herhangi biri kasayı açar.
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
  attachments.rs       Resim türü tespiti, Markdown referansları
  recovery.rs          Kurtarma anahtarı üretimi ve doğrulaması
  commands.rs          Tauri komutları
  syslock.rs           Uyku / ekran kilidi algılama
```
