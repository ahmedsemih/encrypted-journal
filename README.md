# Encrypted Journal

A cross-platform desktop journal (Linux, Windows, macOS) built with Tauri 2, React and TypeScript. Every entry is written in **Markdown** and only ever stored on disk **encrypted**. It works fully offline: no accounts, no servers, no network requests.

## Features

### Writing

- 📝 Markdown editor with a formatting toolbar, shortcuts, list continuation and write / split / preview views
- 💾 Autosave shortly after each change, and when switching entries, locking or closing the window
- ↩️ Undo / redo per entry (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y). History lives in memory only and is cleared on lock
- 🖼 Encrypted image attachments (PNG, JPEG, GIF, WebP, up to 25 MB) via the toolbar, paste or drag and drop
- 🔗 Links between entries: type `[[` to pick an entry. Links are stored as `[text](entry:<id>)`, so they survive renames and date changes. The preview makes them clickable, and the editor lists outgoing links and backlinks
- 📋 Templates: built-in and custom, with `{{date}}`, `{{weekday}}` and `{{time}}` placeholders and an optional default template
- 🏷️ Tags, 😄 mood, ★ favorites
- 🎯 Focus mode (Ctrl+Shift+F): only the title and text remain, with optional typewriter scrolling. F11 toggles full screen
- 🔤 Typeface (serif, sans-serif or monospace, bundled with the app), font size, line spacing and line width

### Finding things

- 🧭 Command palette (Ctrl+P) that searches entries, the trash, tags, dates and commands from one box. Dates can be typed as text, for example "yesterday", "25.10.2025" or "october 2025"
- 🔎 Full-text search that ignores case and diacritics with Turkish rules (İ/I/ı all match "i", ş matches "s"), supports `"exact phrases"` and `-excluded` words, and highlights the matching snippet
- 🧰 Filters: date range with presets, moods, multiple tags (entries must have all of them) and favorites, shown as removable chips
- 📅 Calendar with days that have entries marked
- 🕰️ "On this day": entries written on today's date in earlier years
- 📊 Statistics: writing calendar heatmap, mood by month, word counts, top tags and time of day. Every chart can also be viewed as a table

### Safety

- 🔐 Multiple local users, each with a username and password. The password is never stored
- 🗝 Recovery key, shown once when the account is created. It is the only way to set a new password if you forget the old one
- 🔑 Changing the password does not re-encrypt entries (see the security design below)
- 🔒 Auto-lock after inactivity, manual lock (Ctrl+L), and locking when the computer sleeps (all platforms) or the screen locks (Linux)
- 🗑 Trash: deleted entries are kept for 30 days, then removed for good
- 💽 Automatic encrypted backups to a folder of your choice (every 6 hours to weekly), keeping the latest 3 to 30
- 📦 Manual encrypted single-file backup. Backups are restored from the login screen
- 📤 Unencrypted Markdown export (with a warning). Images are exported next to the files and links between entries point at the exported files

### Interface

- 🌗 Light, dark and system themes
- 🌐 English and Turkish UI, switchable from the login screen or Settings > Appearance

## Download

Prebuilt Linux packages (RPM, DEB and AppImage) are attached to each [release](https://github.com/ahmedsemih/encrypted-journal/releases). Check them against `SHA256SUMS` with `sha256sum -c SHA256SUMS --ignore-missing`.

```bash
sudo dnf install ./encrypted-journal-0.1.0-1.x86_64.rpm     # Fedora, RHEL, openSUSE
sudo apt install ./encrypted-journal_0.1.0_amd64.deb        # Debian, Ubuntu
chmod +x encrypted-journal_0.1.0_amd64.AppImage && ./encrypted-journal_0.1.0_amd64.AppImage   # any distribution
```

There are no prebuilt packages for Windows or macOS yet. The app runs there too: build it from source as described under [Development](#development).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+P | Search everywhere: entries, trash, tags, dates and commands |
| Ctrl+N | New entry |
| Ctrl+F | Search the entry list |
| Ctrl+L | Lock |
| Ctrl+, | Settings |
| Ctrl+Shift+F / Esc | Enter / leave focus mode |
| F11 | Full screen |
| Ctrl+S | Save now |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+K | Bold / italic / code / link |
| `[[` | Link to another entry |
| Tab / Shift+Tab | Indent / outdent |

## Security design

```
password ──Argon2id(m=64 MiB, t=3, p=4, random salt)──▶ KEK
random 256-bit DEK ──XChaCha20-Poly1305(KEK)──▶ wrappedKey in vault.json
each entry (Markdown) ──XChaCha20-Poly1305(DEK, AAD=entry id)──▶ entries/<uuid>.md.enc
each image ──XChaCha20-Poly1305(DEK, AAD=attachment id)──▶ attachments/<uuid>.enc
```

- **Two-level keys.** Changing the password only re-wraps the DEK, so entries are not re-encrypted.
- **Recovery key.** A random 160-bit secret, shown as 32 Crockford Base32 characters. The DEK is wrapped a second time with a key derived from it by Argon2id, so either the password or the recovery key opens the vault.
- **Authenticated encryption.** Entries that were modified or swapped with another file are rejected, because the entry id is bound as associated data.
- **Metadata privacy.** User folders are named after a SHA-256 hash of the username, and files after random UUIDs. Title, date, tags and mood live inside the encrypted content.
- **Memory.** Keys and decrypted entries are wiped from memory on lock (`zeroize`). Undo history and decrypted images are kept in memory only.
- **Atomic writes.** Files are written to a temporary file and then renamed, so a crash never leaves a half-written file.
- **Preview.** Raw HTML in Markdown is not rendered, and the content security policy blocks remote resources such as tracking pixels.

> ⚠️ If you lose both your password and your recovery key, your entries **cannot be recovered**. Keep the recovery key somewhere safe and back up regularly.

### Decrypted entry format

```markdown
---
title: "Title"
date: "2026-10-25"
created_at: "2026-10-25T21:04:11+03:00"
updated_at: "2026-10-25T21:30:42+03:00"
tags: ["work", "sport"]
mood: "good"
favorite: false
---

The entry's **Markdown** body…
```

Front matter values are written as JSON, which is also valid YAML, so the files stay standard Markdown while parsing stays unambiguous.

### Data location

| Platform | Folder |
| --- | --- |
| Linux | `~/.local/share/dev.ahmedsemih.encryptedjournal/` |
| macOS | `~/Library/Application Support/dev.ahmedsemih.encryptedjournal/` |
| Windows | `%APPDATA%\dev.ahmedsemih.encryptedjournal\` |

Each user gets `users/<sha256 of username>/` containing `vault.json`, `settings.enc`, `entries/` and `attachments/`.

## Development

### Requirements

- [Rust](https://rustup.rs) (stable)
- Node.js 20+
- Tauri's platform dependencies: <https://v2.tauri.app/start/prerequisites/>

On Fedora:

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install c-development
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Commands

```bash
npm install
npm run tauri dev              # run in development mode
npm run tauri build            # build release bundles (deb/rpm/AppImage, msi, dmg…)
cd src-tauri && cargo test     # backend tests
```

### Installing on Fedora

```bash
npm run tauri build -- --bundles rpm
sudo dnf install "./src-tauri/target/release/bundle/rpm/Encrypted Journal-0.1.0-1.x86_64.rpm"
```

To update an installed copy, rebuild and run `sudo dnf reinstall` with the same file. After bumping `version` in `src-tauri/tauri.conf.json`, use `sudo dnf upgrade` instead. `sudo dnf remove encrypted-journal` uninstalls the app and leaves your data in place.

## Project structure

```
src/                     React UI
  components/            Auth, Journal, Sidebar, EntryList, Editor, CommandPalette, Settings, Stats…
  i18n.tsx               English/Turkish dictionaries and translations of backend error codes
  markdown.ts            Editor text transformations (toolbar, lists, indentation)
  filters.ts             Entry list filters
  links.ts               Links between entries
  history.ts             In-memory undo/redo
  attachments.ts         Decrypted image cache (blob URLs)
  stats.ts               Statistics aggregations
  templates.ts           Templates and placeholders
  typography.ts          Typeface, spacing and width settings
  caret.ts               Caret geometry (typewriter scrolling, link picker)
  assets/fonts/          Bundled Literata and JetBrains Mono (SIL OFL 1.1)
src-tauri/src/
  crypto.rs              Argon2id + XChaCha20-Poly1305
  vault.rs               Disk layout, accounts, backups, export
  entry.rs               Entry model and Markdown/front matter conversion
  search.rs              Full-text search with Turkish-aware folding and snippets
  links.rs               Entry link references
  attachments.rs         Image type detection and Markdown references
  recovery.rs            Recovery key generation and parsing
  syslock.rs             Sleep and screen lock detection
  commands.rs            Tauri commands
```

## License

[MIT](LICENSE). The bundled fonts are licensed under the SIL Open Font License 1.1; see `src/assets/fonts/`.
