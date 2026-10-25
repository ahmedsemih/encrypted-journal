import { KeyboardEvent, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api";
import { formatLong } from "../dates";
import type { EditorView, Entry, EntryInput, EntryMeta, Settings } from "../types";
import { MOODS } from "../types";
import { MarkdownView } from "./MarkdownView";
import { TagInput } from "./TagInput";
import { FORMATS, applyFormat, continueList, type FormatKind } from "../markdown";

interface Props {
  entry: Entry;
  settings: Settings;
  tagSuggestions: string[];
  onSaved: (meta: EntryMeta) => void;
  onDelete: (id: string) => Promise<boolean>;
  onDiscard: (id: string) => Promise<void>;
  flushRef: RefObject<(() => Promise<void>) | null>;
}

type SaveState = "saved" | "dirty" | "saving" | "error";

const AUTOSAVE_MS = 600;

function toInput(e: Entry): EntryInput {
  return { id: e.id, title: e.title, date: e.date, tags: e.tags, mood: e.mood, favorite: e.favorite, body: e.body };
}

function isEmpty(d: EntryInput) {
  return !d.title.trim() && !d.body.trim() && d.tags.length === 0 && !d.mood && !d.favorite;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export function Editor({ entry, settings, tagSuggestions, onSaved, onDelete, onDiscard, flushRef }: Props) {
  const [draft, setDraft] = useState<EntryInput>(() => toInput(entry));
  const [view, setView] = useState<EditorView>(settings.defaultView);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(entry.updatedAt);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(false);
  /** Set once the entry was deleted or discarded; nothing may be saved after. */
  const doneRef = useRef(false);
  const callbacks = useRef({ onSaved, onDiscard });
  callbacks.current = { onSaved, onDiscard };

  const save = useCallback(async () => {
    if (!dirtyRef.current || doneRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      const meta = await api.saveEntry(draftRef.current);
      callbacks.current.onSaved(meta);
      setUpdatedAt(meta.updatedAt);
      setSaveError(null);
      setSaveState(dirtyRef.current ? "dirty" : "saved");
    } catch (e) {
      dirtyRef.current = true;
      setSaveError(errorMessage(e));
      setSaveState("error");
    }
  }, []);

  // Called by the parent before switching entries, locking or closing.
  useEffect(() => {
    flushRef.current = async () => {
      if (doneRef.current) return;
      if (isEmpty(draftRef.current)) {
        doneRef.current = true;
        await callbacks.current.onDiscard(draftRef.current.id);
        return;
      }
      await save();
    };
    return () => {
      flushRef.current = null;
      // Last-chance save if we unmount without an explicit flush.
      void save();
    };
  }, [flushRef, save]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, save]);

  // New, empty entries start with the cursor in the title.
  useEffect(() => {
    if (!entry.title && !entry.body) titleRef.current?.focus();
  }, [entry]);

  // Restore the caret after programmatic body edits (toolbar, list continuation).
  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    const ta = textRef.current;
    if (sel && ta) {
      ta.focus();
      ta.setSelectionRange(sel[0], sel[1]);
      pendingSelection.current = null;
    }
  });

  const update = useCallback((patch: Partial<EntryInput>) => {
    dirtyRef.current = true;
    setSaveState("dirty");
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const format = (kind: FormatKind) => {
    const ta = textRef.current;
    if (!ta) return;
    if (view === "preview") setView("edit");
    const r = applyFormat(draft.body, ta.selectionStart, ta.selectionEnd, kind);
    pendingSelection.current = [r.selStart, r.selEnd];
    update({ body: r.text });
  };

  const onBodyKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
      return;
    }
    if (mod) {
      const kind = FORMATS.find((f) => f.shortcut && f.shortcut === e.key.toLowerCase())?.kind;
      if (kind && kind !== "separator") {
        e.preventDefault();
        format(kind);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const r = applyFormat(draft.body, ta.selectionStart, ta.selectionEnd, e.shiftKey ? "outdent" : "indent");
      pendingSelection.current = [r.selStart, r.selEnd];
      update({ body: r.text });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
      const r = continueList(draft.body, ta.selectionStart);
      if (r) {
        e.preventDefault();
        pendingSelection.current = [r.selStart, r.selEnd];
        update({ body: r.text });
      }
    }
  };

  const words = draft.body.split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(words / 200));
  const saveLabel: Record<SaveState, string> = {
    saved: "Kaydedildi",
    dirty: "Değişiklikler var…",
    saving: "Kaydediliyor…",
    error: `Kaydedilemedi: ${saveError ?? ""}`,
  };

  return (
    <div className="editor" style={{ ["--editor-font-size" as string]: `${settings.fontSize}px` }}>
      <header className="editor-header">
        <div className="editor-meta-row">
          <input
            type="date"
            className="date-input"
            value={draft.date}
            onChange={(e) => e.target.value && update({ date: e.target.value })}
            title={formatLong(draft.date)}
          />
          <div className="mood-picker" role="radiogroup" aria-label="Ruh hali">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={draft.mood === m.id ? "active" : ""}
                title={m.label}
                aria-checked={draft.mood === m.id}
                role="radio"
                onClick={() => update({ mood: draft.mood === m.id ? null : m.id })}
              >
                {m.emoji}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <button
            type="button"
            className={`icon-btn star ${draft.favorite ? "on" : ""}`}
            title={draft.favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
            onClick={() => update({ favorite: !draft.favorite })}
          >
            {draft.favorite ? "★" : "☆"}
          </button>
          <div className="segmented small">
            {(["edit", "split", "preview"] as const).map((v) => (
              <button key={v} type="button" className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {{ edit: "Yaz", split: "Bölünmüş", preview: "Önizle" }[v]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn danger"
            title="Kaydı sil"
            onClick={async () => {
              doneRef.current = true;
              if (!(await onDelete(entry.id))) doneRef.current = false;
            }}
          >
            🗑
          </button>
        </div>
        <input
          ref={titleRef}
          className="title-input"
          placeholder="Başlık"
          value={draft.title}
          maxLength={200}
          onChange={(e) => update({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              textRef.current?.focus();
            }
          }}
        />
        <div className="editor-date-long">{formatLong(draft.date)}</div>
        <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => update({ tags })} />
      </header>

      {view !== "preview" && (
        <div className="toolbar" role="toolbar">
          {FORMATS.map((f) =>
            f.kind === "separator" ? (
              <span key={f.label} className="toolbar-sep" />
            ) : (
              <button
                key={f.kind}
                type="button"
                title={f.shortcut ? `${f.label} (Ctrl+${f.shortcut.toUpperCase()})` : f.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => format(f.kind as FormatKind)}
              >
                {f.icon}
              </button>
            ),
          )}
        </div>
      )}

      <div className={`editor-body view-${view}`}>
        {view !== "preview" && (
          <textarea
            ref={textRef}
            className="body-input"
            placeholder="Bugün neler oldu? (Markdown desteklenir)"
            value={draft.body}
            spellCheck={settings.spellcheck}
            onChange={(e) => update({ body: e.target.value })}
            onKeyDown={onBodyKey}
            onBlur={() => void save()}
          />
        )}
        {view !== "edit" && (
          <div className="preview">
            {draft.body.trim() ? <MarkdownView source={draft.body} /> : <p className="muted">Önizlenecek bir şey yok.</p>}
          </div>
        )}
      </div>

      <footer className="status-bar">
        <span>{words} kelime</span>
        <span>{draft.body.length} karakter</span>
        <span>~{readMinutes} dk okuma</span>
        <span className="spacer" />
        <span title={`Oluşturuldu: ${formatTime(entry.createdAt)}`}>Son düzenleme: {formatTime(updatedAt)}</span>
        <span className={`save-state ${saveState}`}>
          {saveState === "saved" ? "🔒 " : ""}
          {saveLabel[saveState]}
        </span>
      </footer>
    </div>
  );
}
