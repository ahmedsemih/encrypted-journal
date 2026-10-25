import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import { errorText, useI18n } from "../i18n";
import { instantiate, templatesOf } from "../templates";
import { today } from "../dates";
import * as history from "../history";
import { clearAttachmentCache } from "../attachments";
import { applyFilters, NO_FILTERS, type Filters } from "../filters";
import type { Entry, EntryMeta, SearchHit, Settings } from "../types";
import { CommandPalette, type PaletteActions } from "./CommandPalette";
import { Editor } from "./Editor";
import { EntryLinksContext, type EntryLinks } from "./EntryLinks";
import { EntryList } from "./EntryList";
import { SettingsModal, type Tab as SettingsTab } from "./SettingsModal";
import { Sidebar } from "./Sidebar";
import { TrashView } from "./TrashView";
import { StatsView } from "./StatsView";

interface Props {
  username: string;
  settings: Settings;
  onSettingsChange: (s: Settings) => Promise<void>;
  onLock: () => Promise<void>;
  onAccountDeleted: () => void;
}

export type Section = "entries" | "trash" | "stats";

interface Toast {
  kind: "error" | "info";
  text: string;
  action?: { label: string; run: () => void };
}

/** Emitted by the backend when the system sleeps or the screen locks. */
const SYSTEM_LOCK_EVENT = "system-lock";
const AUTO_BACKUP_CHECK_MS = 15 * 60_000;
const TOAST_MS = 6000;

function sortMetas(metas: EntryMeta[]): EntryMeta[] {
  return [...metas].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

async function toggleFullscreen() {
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}

function metaOf(e: Entry): EntryMeta {
  const { body, ...rest } = e;
  return { ...rest, excerpt: "", wordCount: body.split(/\s+/).filter(Boolean).length };
}

export function Journal({ username, settings, onSettingsChange, onLock, onAccountDeleted }: Props) {
  const { t, locale } = useI18n();
  const [metas, setMetas] = useState<EntryMeta[]>([]);
  const [trash, setTrash] = useState<EntryMeta[]>([]);
  const [section, setSection] = useState<Section>("entries");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [hits, setHits] = useState<Map<string, SearchHit> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trashSelectedId, setTrashSelectedId] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [showSettings, setShowSettings] = useState<SettingsTab | false>(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Saves the open editor (and drops it if left empty). Set by the Editor. */
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const showError = useCallback((e: unknown) => setToast({ kind: "error", text: errorText(t, e) }), [t]);

  const flush = useCallback(async () => {
    await flushRef.current?.();
  }, []);

  // Undo history and decrypted images must not outlive the unlocked session.
  useEffect(
    () => () => {
      history.clearAll();
      clearAttachmentCache();
    },
    [],
  );

  useEffect(() => {
    Promise.all([api.listEntries(), api.listTrash()])
      .then(([list, trashed]) => {
        setMetas(list);
        setTrash(trashed);
        setSelectedId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(showError);
  }, []);

  useEffect(() => {
    if (!toast || toast.kind === "error") return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Load the selected entry.
  useEffect(() => {
    if (!selectedId) {
      setEntry(null);
      return;
    }
    let cancelled = false;
    api
      .getEntry(selectedId)
      .then((e) => !cancelled && setEntry(e))
      .catch((e) => !cancelled && showError(e));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Full-text search runs in the backend over decrypted entries.
  useEffect(() => {
    const q = filters.query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .searchEntries(q)
        .then((found) => setHits(new Map(found.map((h) => [h.id, h]))))
        .catch(showError);
    }, 200);
    return () => clearTimeout(timer);
  }, [filters.query, metas]);

  const visible = useMemo(() => applyFilters(metas, filters, hits), [metas, filters, hits]);

  const select = useCallback(
    async (id: string | null) => {
      if (section === "trash") {
        setTrashSelectedId(id);
        return;
      }
      if (id === selectedId) return;
      await flush();
      setSelectedId(id);
    },
    [section, selectedId, flush],
  );

  const openSection = useCallback(
    async (next: Section) => {
      if (next === section) return;
      await flush();
      setSection(next);
    },
    [section, flush],
  );

  /** Opens an entry from anywhere (links, sidebar), leaving the trash or statistics if needed. */
  const openEntry = useCallback(
    async (id: string) => {
      await flush();
      setSection("entries");
      setSelectedId(id);
    },
    [flush],
  );

  const entryLinks = useMemo<EntryLinks>(
    () => ({ metas, byId: new Map(metas.map((m) => [m.id, m])), open: (id) => void openEntry(id) }),
    [metas, openEntry],
  );

  const lock = useCallback(async () => {
    await flush();
    await onLock();
  }, [flush, onLock]);

  /** `templateId` undefined uses the default template, null a blank entry. */
  const newEntry = useCallback(
    async (templateId?: string | null) => {
      try {
        await flush();
        const current = settingsRef.current;
        const id = templateId === undefined ? current.defaultTemplateId : templateId;
        const template = id ? templatesOf(current, t).find((tpl) => tpl.id === id) : undefined;
        const date = filters.day ?? today();
        const e = await api.createEntry(date, template && instantiate(template, date, locale));
        setMetas((prev) => sortMetas([metaOf(e), ...prev]));
        setFilters((f) => ({ ...NO_FILTERS, day: f.day }));
        setSection("entries");
        setEntry(e);
        setSelectedId(e.id);
      } catch (err) {
        showError(err);
      }
    },
    [flush, filters.day, showError, t, locale],
  );

  const onSaved = useCallback((meta: EntryMeta) => {
    setMetas((prev) => sortMetas(prev.map((m) => (m.id === meta.id ? meta : m))));
  }, []);

  const removeLocally = useCallback((id: string) => {
    setMetas((prev) => prev.filter((m) => m.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const restore = useCallback(
    async (id: string) => {
      try {
        const meta = await api.restoreEntry(id);
        setTrash((prev) => prev.filter((m) => m.id !== id));
        setTrashSelectedId((cur) => (cur === id ? null : cur));
        setMetas((prev) => sortMetas([meta, ...prev.filter((m) => m.id !== id)]));
        return meta;
      } catch (err) {
        showError(err);
        return null;
      }
    },
    [showError],
  );

  // Deleting moves the entry to the trash, so no confirmation is needed.
  const onDelete = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const meta = await api.trashEntry(id);
        const idx = visible.findIndex((m) => m.id === id);
        const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
        removeLocally(id);
        setTrash((prev) => [meta, ...prev]);
        setSelectedId(next?.id ?? null);
        setToast({
          kind: "info",
          text: t.trash.moved,
          action: {
            label: t.trash.undo,
            run: async () => {
              await flush();
              setSection("entries");
              if (await restore(id)) setSelectedId(id);
            },
          },
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [visible, removeLocally, restore, flush, showError, t],
  );

  const purge = useCallback(
    async (id: string) => {
      try {
        await api.purgeEntry(id);
        history.forget(id);
        setTrash((prev) => prev.filter((m) => m.id !== id));
        setTrashSelectedId((cur) => (cur === id ? null : cur));
      } catch (err) {
        showError(err);
      }
    },
    [showError],
  );

  const emptyTrash = useCallback(async () => {
    try {
      await api.emptyTrash();
      trash.forEach((m) => history.forget(m.id));
      setTrash([]);
      setTrashSelectedId(null);
    } catch (err) {
      showError(err);
    }
  }, [trash, showError]);

  // Empty drafts are dropped for good, not trashed.
  const onDiscard = useCallback(
    async (id: string) => {
      await api.purgeEntry(id).catch(() => {});
      history.forget(id);
      removeLocally(id);
    },
    [removeLocally],
  );

  // ---------- automatic encrypted backups ----------
  const backupRunning = useRef(false);
  const runAutoBackup = useCallback(
    async (force = false) => {
      const { dir, intervalHours, keep, lastAt } = settingsRef.current.autoBackup;
      if (!dir || backupRunning.current) return;
      const due = !lastAt || Date.now() - Date.parse(lastAt) >= intervalHours * 3_600_000;
      if (!force && !due) return;
      backupRunning.current = true;
      try {
        await flush();
        await api.autoBackup(dir, keep);
        const latest = settingsRef.current;
        await onSettingsChange({ ...latest, autoBackup: { ...latest.autoBackup, lastAt: new Date().toISOString() } });
      } catch (err) {
        setToast({ kind: "error", text: `${t.backup.failed}: ${errorText(t, err)}` });
        throw err;
      } finally {
        backupRunning.current = false;
      }
    },
    [flush, onSettingsChange, t],
  );

  useEffect(() => {
    const check = () => void runAutoBackup().catch(() => {});
    const first = setTimeout(check, 5000);
    const timer = setInterval(check, AUTO_BACKUP_CHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [runAutoBackup]);

  // ---------- locking ----------

  // Auto-lock after inactivity.
  useEffect(() => {
    const minutes = settings.autoLockMinutes;
    if (!minutes) return;
    let timer = setTimeout(lock, minutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, minutes * 60_000);
    };
    const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [settings.autoLockMinutes, lock]);

  // Lock when the computer sleeps or the screen locks.
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    const unlisten = listen(SYSTEM_LOCK_EVENT, () => {
      if (settingsRef.current.lockOnSystemLock) void lockRef.current();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Persist pending edits before the window closes.
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      await flush();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [flush]);

  // Global shortcuts.
  const modalOpen = showSettings !== false || paletteOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (e.key === "Escape" && focusMode && !modalOpen) {
        setFocusMode(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
        setFocusMode((on) => !on);
      } else if (key === "n") {
        e.preventDefault();
        newEntry();
      } else if (key === "f") {
        e.preventDefault();
        setFocusMode(false);
        void openSection("entries").then(() => searchRef.current?.focus());
      } else if (key === "l") {
        e.preventDefault();
        lock();
      } else if (key === ",") {
        e.preventDefault();
        setShowSettings("appearance");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newEntry, lock, openSection, focusMode, modalOpen]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    metas.forEach((m) => m.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [metas]);

  const inTrash = section === "trash";
  const editing = section === "entries" && !!entry && entry.id === selectedId;
  const focus = focusMode && editing;
  useEffect(() => {
    if (!editing) setFocusMode(false);
  }, [editing]);

  const paletteActions: PaletteActions = {
    openEntry: (id) => void openEntry(id),
    openTrashEntry: async (id) => {
      await flush();
      setSection("trash");
      setTrashSelectedId(id);
    },
    filter: async (patch) => {
      await openSection("entries");
      setFilters({ ...NO_FILTERS, ...patch });
    },
    newEntry: (templateId) => void newEntry(templateId),
    section: (s) => void openSection(s),
    settings: setShowSettings,
    focus: () => setFocusMode((on) => !on),
    fullscreen: () => void toggleFullscreen(),
    backup: settings.autoBackup.dir ? () => void runAutoBackup(true).catch(() => {}) : null,
    lock: () => void lock(),
  };
  const palette = paletteOpen && (
    <CommandPalette
      metas={metas}
      trash={trash}
      tags={allTags}
      templates={templatesOf(settings, t)}
      actions={paletteActions}
      onClose={() => setPaletteOpen(false)}
    />
  );

  const pickDay = (day: string) => {
    setFilters({ ...NO_FILTERS, day });
    setSection("entries");
  };

  if (section === "stats") {
    return (
      <div className="journal stats-mode">
        <Sidebar
          username={username}
          metas={metas}
          trashCount={trash.length}
          section={section}
          tags={allTags}
          filters={filters}
          onFilters={(f) => {
            setSection("entries");
            setFilters(f);
          }}
          onSection={openSection}
          onSelect={openEntry}
          onNew={newEntry}
          onLock={lock}
          onSettings={() => setShowSettings("appearance")}
          onSearch={() => setPaletteOpen(true)}
          templates={templatesOf(settings, t)}
          defaultTemplateId={settings.defaultTemplateId}
          onManageTemplates={() => setShowSettings("templates")}
        />
        <main className="stats-pane">
          <StatsView metas={metas} onPickDay={pickDay} />
        </main>
        {palette}
        {showSettings && (
          <SettingsModal
            username={username}
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => setShowSettings(false)}
            onAccountDeleted={onAccountDeleted}
            onBackupNow={() => runAutoBackup(true)}
            initialTab={showSettings || undefined}
            flush={flush}
          />
        )}
      </div>
    );
  }

  return (
    <EntryLinksContext.Provider value={entryLinks}>
      <div className={`journal${focus ? " focus" : ""}`}>
        {!focus && (
          <>
            <Sidebar
              username={username}
              metas={metas}
              trashCount={trash.length}
              section={section}
              tags={allTags}
              filters={filters}
              onFilters={(f) => {
                void openSection("entries");
                setFilters(f);
              }}
              onSection={openSection}
              onSelect={openEntry}
              onNew={newEntry}
              onLock={lock}
              onSettings={() => setShowSettings("appearance")}
              onSearch={() => setPaletteOpen(true)}
              templates={templatesOf(settings, t)}
              defaultTemplateId={settings.defaultTemplateId}
              onManageTemplates={() => setShowSettings("templates")}
            />
            <EntryList
              section={section}
              entries={inTrash ? trash : visible}
              total={inTrash ? trash.length : metas.length}
              selectedId={inTrash ? trashSelectedId : selectedId}
              filters={filters}
              hits={hits}
              tags={allTags}
              searchRef={searchRef}
              onFilters={setFilters}
              onSelect={select}
              onNew={newEntry}
              onEmptyTrash={emptyTrash}
            />
          </>
        )}
        <main className="editor-pane">
          {toast && (
            <div className={`toast ${toast.kind}`}>
              <span onClick={() => setToast(null)}>{toast.text}</span>
              {toast.action && (
                <button
                  className="link"
                  onClick={() => {
                    toast.action?.run();
                    setToast(null);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
          {inTrash ? (
            trashSelectedId ? (
              <TrashView
                key={trashSelectedId}
                id={trashSelectedId}
                onRestore={restore}
                onPurge={purge}
                onError={showError}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🗑</div>
                <h2>{trash.length ? t.trash.select : t.trash.empty}</h2>
                <p className="muted">{t.trash.retention}</p>
              </div>
            )
          ) : entry && entry.id === selectedId ? (
            <Editor
              key={entry.id}
              entry={entry}
              settings={settings}
              tagSuggestions={allTags.map(([tag]) => tag)}
              onSaved={onSaved}
              onDelete={onDelete}
              onDiscard={onDiscard}
              flushRef={flushRef}
              focus={focus}
              onToggleFocus={() => setFocusMode((on) => !on)}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📔</div>
              <h2>{metas.length ? t.journal.selectEntry : t.journal.emptyJournal}</h2>
              <p className="muted">{t.journal.emptyHint}</p>
              <button className="primary" onClick={() => newEntry()}>
                {t.journal.newEntry} <kbd>Ctrl+N</kbd>
              </button>
            </div>
          )}
        </main>
        {palette}
        {showSettings && (
          <SettingsModal
            username={username}
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => setShowSettings(false)}
            onAccountDeleted={onAccountDeleted}
            onBackupNow={() => runAutoBackup(true)}
            initialTab={showSettings || undefined}
            flush={flush}
          />
        )}
      </div>
    </EntryLinksContext.Provider>
  );
}
