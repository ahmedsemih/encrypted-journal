import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../api";
import { errorText, useI18n } from "../i18n";
import { today } from "../dates";
import type { Entry, EntryMeta, Settings } from "../types";
import { Editor } from "./Editor";
import { EntryList } from "./EntryList";
import { SettingsModal } from "./SettingsModal";
import { Sidebar } from "./Sidebar";

interface Props {
  username: string;
  settings: Settings;
  onSettingsChange: (s: Settings) => Promise<void>;
  onLock: () => Promise<void>;
  onAccountDeleted: () => void;
}

export interface Filters {
  query: string;
  day: string | null;
  tag: string | null;
  favorites: boolean;
}

const NO_FILTERS: Filters = { query: "", day: null, tag: null, favorites: false };

function sortMetas(metas: EntryMeta[]): EntryMeta[] {
  return [...metas].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function metaOf(e: Entry): EntryMeta {
  const { body, ...rest } = e;
  return { ...rest, excerpt: "", wordCount: body.split(/\s+/).filter(Boolean).length };
}

export function Journal({ username, settings, onSettingsChange, onLock, onAccountDeleted }: Props) {
  const { t } = useI18n();
  const [metas, setMetas] = useState<EntryMeta[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Saves the open editor (and drops it if left empty). Set by the Editor. */
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const flush = useCallback(async () => {
    await flushRef.current?.();
  }, []);

  useEffect(() => {
    api
      .listEntries()
      .then((list) => {
        setMetas(list);
        setSelectedId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(errorText(t, e)));
  }, []);

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
      .catch((e) => !cancelled && setError(errorText(t, e)));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Full-text search runs in the backend over decrypted entries.
  useEffect(() => {
    const q = filters.query.trim();
    if (!q) {
      setSearchIds(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .searchEntries(q)
        .then((ids) => setSearchIds(new Set(ids)))
        .catch((e) => setError(errorText(t, e)));
    }, 200);
    return () => clearTimeout(timer);
  }, [filters.query, metas]);

  const visible = useMemo(
    () =>
      metas.filter(
        (m) =>
          (!filters.favorites || m.favorite) &&
          (!filters.tag || m.tags.includes(filters.tag)) &&
          (!filters.day || m.date === filters.day) &&
          (!searchIds || searchIds.has(m.id)),
      ),
    [metas, filters, searchIds],
  );

  const select = useCallback(
    async (id: string | null) => {
      if (id === selectedId) return;
      await flush();
      setSelectedId(id);
    },
    [selectedId, flush],
  );

  const lock = useCallback(async () => {
    await flush();
    await onLock();
  }, [flush, onLock]);

  const newEntry = useCallback(async () => {
    try {
      await flush();
      const e = await api.createEntry(filters.day ?? today());
      setMetas((prev) => sortMetas([metaOf(e), ...prev]));
      setFilters((f) => ({ ...NO_FILTERS, day: f.day }));
      setEntry(e);
      setSelectedId(e.id);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [flush, filters.day, t]);

  const onSaved = useCallback((meta: EntryMeta) => {
    setMetas((prev) => sortMetas(prev.map((m) => (m.id === meta.id ? meta : m))));
  }, []);

  const removeLocally = useCallback((id: string) => {
    setMetas((prev) => prev.filter((m) => m.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const onDelete = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await ask(t.journal.deleteConfirm, {
        title: t.journal.deleteTitle,
        kind: "warning",
        okLabel: t.journal.delete,
        cancelLabel: t.cancel,
      });
      if (!ok) return false;
      try {
        await api.deleteEntry(id);
        const idx = visible.findIndex((m) => m.id === id);
        const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
        removeLocally(id);
        setSelectedId(next?.id ?? null);
        return true;
      } catch (err) {
        setError(errorText(t, err));
        return false;
      }
    },
    [visible, removeLocally, t],
  );

  const onDiscard = useCallback(
    async (id: string) => {
      await api.deleteEntry(id).catch(() => {});
      removeLocally(id);
    },
    [removeLocally],
  );

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        newEntry();
      } else if (key === "f" && !e.shiftKey) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === "l") {
        e.preventDefault();
        lock();
      } else if (key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newEntry, lock]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    metas.forEach((m) => m.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  }, [metas]);

  return (
    <div className="journal">
      <Sidebar
        username={username}
        metas={metas}
        tags={allTags}
        filters={filters}
        onFilters={setFilters}
        onSelect={select}
        onNew={newEntry}
        onLock={lock}
        onSettings={() => setShowSettings(true)}
      />
      <EntryList
        entries={visible}
        total={metas.length}
        selectedId={selectedId}
        filters={filters}
        searchRef={searchRef}
        onQuery={(query) => setFilters((f) => ({ ...f, query }))}
        onClearFilters={() => setFilters(NO_FILTERS)}
        onSelect={select}
        onNew={newEntry}
      />
      <main className="editor-pane">
        {error && (
          <div className="toast error" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        {entry && entry.id === selectedId ? (
          <Editor
            key={entry.id}
            entry={entry}
            settings={settings}
            tagSuggestions={allTags.map(([t]) => t)}
            onSaved={onSaved}
            onDelete={onDelete}
            onDiscard={onDiscard}
            flushRef={flushRef}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📔</div>
            <h2>{metas.length ? t.journal.selectEntry : t.journal.emptyJournal}</h2>
            <p className="muted">{t.journal.emptyHint}</p>
            <button className="primary" onClick={newEntry}>
              {t.journal.newEntry} <kbd>Ctrl+N</kbd>
            </button>
          </div>
        )}
      </main>
      {showSettings && (
        <SettingsModal
          username={username}
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
          onAccountDeleted={onAccountDeleted}
          flush={flush}
        />
      )}
    </div>
  );
}
