# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-25

First public release. Prebuilt packages are provided for Linux (RPM, DEB and AppImage). Windows and macOS users can build the app from source, as described in the README.

### Writing

- Markdown editor with a formatting toolbar, shortcuts, list continuation and write / split / preview views
- Autosave, plus per-entry undo / redo that is kept in memory only and cleared on lock
- Encrypted image attachments via the toolbar, paste or drag and drop
- Links between entries (`[[`), stored by ID so they survive renames and date changes, with a list of outgoing links and backlinks
- Built-in and custom templates with `{{date}}`, `{{weekday}}` and `{{time}}` placeholders
- Tags, mood and favorites
- Focus mode (Ctrl+Shift+F) with typewriter scrolling, and full screen (F11)
- Typeface, font size, line spacing and line width settings, with bundled fonts

### Finding things

- Command palette (Ctrl+P) for entries, the trash, tags, dates typed as text, and commands
- Full-text search that ignores case and diacritics with Turkish rules, supports exact phrases and excluded words, and highlights snippets
- Filters for date range, moods, tags and favorites
- Calendar, "On this day" and a statistics view (writing heatmap, mood by month, word counts, top tags, time of day)

### Safety

- Multiple local users. Entries are encrypted with XChaCha20-Poly1305 under a random data key, and that key is wrapped with an Argon2id-derived key
- Recovery key, shown once at sign-up, that can reset a forgotten password
- Auto-lock after inactivity, manual lock (Ctrl+L), and locking when the computer sleeps or (on Linux) the screen locks
- Trash that keeps deleted entries for 30 days
- Automatic and manual encrypted backups, restored from the login screen
- Unencrypted Markdown export, with images and working links between entries

### Interface

- Light, dark and system themes
- English and Turkish UI

[0.1.0]: https://github.com/ahmedsemih/encrypted-journal/releases/tag/v0.1.0
