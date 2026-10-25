import { ClipboardEvent, KeyboardEvent, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api } from "../api";
import { IMAGE_EXTENSIONS, imageMarkdown, isImagePath } from "../attachments";
import { errorText, useI18n } from "../i18n";
import { formatLong } from "../dates";
import type { EditorView, Entry, EntryInput, EntryMeta, Settings } from "../types";
import { MOODS } from "../types";
import { contentStyle } from "../typography";
import { MarkdownView } from "./MarkdownView";
import { TagInput } from "./TagInput";
import { FORMATS, applyFormat, continueList, type FormatKind } from "../markdown";
import * as history from "../history";

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

/** Caret position right after the region where `before` and `after` differ. */
function changedCaret(before: string, after: string): number {
  let suffix = 0;
  while (
    suffix < before.length &&
    suffix < after.length &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  return after.length - suffix;
}

function formatTime(iso: string, locale: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function Editor({ entry, settings, tagSuggestions, onSaved, onDelete, onDiscard, flushRef }: Props) {
  const { t, locale } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [draft, setDraft] = useState<EntryInput>(() => toInput(entry));
  const [view, setView] = useState<EditorView>(settings.defaultView);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(entry.updatedAt);
  const updatedAtRef = useRef(entry.updatedAt);
  updatedAtRef.current = updatedAt;
  const [addingImages, setAddingImages] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
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
      setSaveError(errorText(tRef.current, e));
      setSaveState("error");
    }
  }, []);

  // Called by the parent before switching entries, locking or closing.
  useEffect(() => {
    flushRef.current = async () => {
      if (doneRef.current) return;
      // Never saved since creation: a blank or untouched template entry.
      const neverEdited = !dirtyRef.current && updatedAtRef.current === entry.createdAt;
      if (isEmpty(draftRef.current) || neverEdited) {
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
  }, [flushRef, save, entry.createdAt]);

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

  const setDirtyDraft = useCallback((next: EntryInput) => {
    draftRef.current = next;
    dirtyRef.current = true;
    setSaveState("dirty");
    setDraft(next);
  }, []);

  /** Applies an edit and records an undo point; edits sharing `group` are merged while typing. */
  const update = useCallback(
    (patch: Partial<EntryInput>, group: string | null = null) => {
      const before = draftRef.current;
      history.record(before.id, before, group);
      setDirtyDraft({ ...before, ...patch });
    },
    [setDirtyDraft],
  );

  const travel = (direction: "undo" | "redo") => {
    const current = draftRef.current;
    const target = direction === "undo" ? history.undo(current.id, current) : history.redo(current.id, current);
    if (!target) return;
    if (target.body !== current.body && view !== "preview") {
      const caret = changedCaret(current.body, target.body);
      pendingSelection.current = [caret, caret];
    }
    setDirtyDraft(target);
  };

  // Our own undo stack replaces the browser's, which breaks on programmatic edits.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "z" || key === "y") {
      e.preventDefault();
      travel(key === "y" || e.shiftKey ? "redo" : "undo");
    }
  };

  /** Inserts text at the caret (or the end) on its own line. */
  const insertBlock = (snippet: string) => {
    const body = draftRef.current.body;
    const ta = textRef.current;
    const at = ta && document.activeElement === ta ? ta.selectionEnd : body.length;
    const before = at > 0 && body[at - 1] !== "\n" ? "\n" : "";
    const after = body[at] === "\n" ? "" : "\n";
    const text = before + snippet + after;
    if (ta) pendingSelection.current = [at + text.length, at + text.length];
    update({ body: body.slice(0, at) + text + body.slice(at) });
  };

  /** Encrypts images one by one and inserts a Markdown reference for each. */
  const addImages = async (sources: { name: string; add: () => Promise<string> }[]) => {
    if (!sources.length) return;
    setImageError(null);
    setAddingImages((n) => n + sources.length);
    const snippets: string[] = [];
    for (const src of sources) {
      try {
        snippets.push(imageMarkdown(await src.add(), src.name));
      } catch (e) {
        setImageError(errorText(tRef.current, e));
      } finally {
        setAddingImages((n) => n - 1);
      }
    }
    if (snippets.length && !doneRef.current) insertBlock(snippets.join("\n"));
  };

  const addImagePaths = (paths: string[]) =>
    addImages(
      paths.filter(isImagePath).map((path) => ({
        name: path.split(/[\\/]/).pop() ?? "",
        add: () => api.addAttachmentFile(path),
      })),
    );

  const pickImages = async () => {
    const picked = await open({ multiple: true, filters: [{ name: t.editor.imageFilter, extensions: IMAGE_EXTENSIONS }] });
    if (picked) await addImagePaths(Array.isArray(picked) ? picked : [picked]);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    void addImages(
      files.map((f) => ({ name: f.name, add: async () => api.addAttachment(new Uint8Array(await f.arrayBuffer())) })),
    );
  };

  // Files dropped onto the window arrive as paths through Tauri, not as DOM drop events.
  const addImagePathsRef = useRef(addImagePaths);
  addImagePathsRef.current = addImagePaths;
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === "enter" || type === "over") setDragging(true);
      else if (type === "leave") setDragging(false);
      else if (type === "drop") {
        setDragging(false);
        void addImagePathsRef.current(event.payload.paths);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const format = (kind: FormatKind) => {
    if (kind === "image") {
      void pickImages();
      return;
    }
    const ta = textRef.current;
    if (!ta) return;
    if (view === "preview") setView("edit");
    const r = applyFormat(draftRef.current.body, ta.selectionStart, ta.selectionEnd, kind, t.placeholders);
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
      const r = applyFormat(draftRef.current.body, ta.selectionStart, ta.selectionEnd, e.shiftKey ? "outdent" : "indent", t.placeholders);
      pendingSelection.current = [r.selStart, r.selEnd];
      update({ body: r.text });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
      const r = continueList(draftRef.current.body, ta.selectionStart);
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
    saved: t.editor.saved,
    dirty: t.editor.dirty,
    saving: t.editor.saving,
    error: t.editor.saveFailed(saveError ?? ""),
  };

  return (
    <div
      className={`editor${view === "split" ? " split" : ""}`}
      style={contentStyle(settings)}
      onKeyDownCapture={onKeyDownCapture}
    >
      <header className="editor-header">
        <div className="editor-meta-row">
          <input
            type="date"
            className="date-input"
            value={draft.date}
            onChange={(e) => e.target.value && update({ date: e.target.value })}
            title={formatLong(draft.date, locale)}
          />
          <div className="mood-picker" role="radiogroup" aria-label={t.editor.mood}>
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={draft.mood === m.id ? "active" : ""}
                title={t.moods[m.id]}
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
            title={draft.favorite ? t.editor.favRemove : t.editor.favAdd}
            onClick={() => update({ favorite: !draft.favorite })}
          >
            {draft.favorite ? "★" : "☆"}
          </button>
          <div className="segmented small">
            {(["edit", "split", "preview"] as const).map((v) => (
              <button key={v} type="button" className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {t.editor.views[v]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn danger"
            title={t.editor.deleteEntry}
            onClick={async () => {
              await save();
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
          placeholder={t.editor.titlePlaceholder}
          value={draft.title}
          maxLength={200}
          onChange={(e) => update({ title: e.target.value }, "title")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              textRef.current?.focus();
            }
          }}
        />
        <div className="editor-date-long">{formatLong(draft.date, locale)}</div>
        <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => update({ tags })} />
      </header>

      {view !== "preview" && (
        <div className="toolbar" role="toolbar">
          {FORMATS.map((f, i) =>
            f.kind === "separator" ? (
              <span key={`sep-${i}`} className="toolbar-sep" />
            ) : (
              <button
                key={f.kind}
                type="button"
                title={f.shortcut ? `${t.formats[f.kind]} (Ctrl+${f.shortcut.toUpperCase()})` : t.formats[f.kind]}
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
        {dragging && <div className="drop-overlay">🖼 {t.editor.dropImages}</div>}
        {view !== "preview" && (
          <textarea
            ref={textRef}
            className="body-input"
            placeholder={t.editor.bodyPlaceholder}
            value={draft.body}
            spellCheck={settings.spellcheck}
            onChange={(e) => update({ body: e.target.value }, "body")}
            onKeyDown={onBodyKey}
            onPaste={onPaste}
            onBlur={() => void save()}
          />
        )}
        {view !== "edit" && (
          <div className="preview">
            {draft.body.trim() ? <MarkdownView source={draft.body} /> : <p className="muted">{t.editor.nothingToPreview}</p>}
          </div>
        )}
      </div>

      <footer className="status-bar">
        <span>{t.editor.words(words)}</span>
        <span>{t.editor.chars(draft.body.length)}</span>
        <span>{t.editor.readTime(readMinutes)}</span>
        <span className="spacer" />
        {addingImages > 0 && <span>{t.editor.addingImage}</span>}
        {imageError && (
          <span className="save-state error" onClick={() => setImageError(null)}>
            {imageError}
          </span>
        )}
        <span title={t.editor.created(formatTime(entry.createdAt, locale))}>
          {t.editor.lastEdited(formatTime(updatedAt, locale))}
        </span>
        <span className={`save-state ${saveState}`}>
          {saveState === "saved" ? "🔒 " : ""}
          {saveLabel[saveState]}
        </span>
      </footer>
    </div>
  );
}
