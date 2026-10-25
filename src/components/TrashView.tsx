import { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { formatLong } from "../dates";
import { useI18n } from "../i18n";
import type { Entry } from "../types";
import { MarkdownView } from "./MarkdownView";

export const TRASH_RETENTION_DAYS = 30;

/** Days left before a trashed entry is purged automatically. */
export function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const elapsed = (Date.now() - Date.parse(deletedAt)) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

interface Props {
  id: string;
  onRestore: (id: string) => Promise<unknown>;
  onPurge: (id: string) => Promise<void>;
  onError: (e: unknown) => void;
}

/** Read-only view of a trashed entry. */
export function TrashView({ id, onRestore, onPurge, onError }: Props) {
  const { t, locale } = useI18n();
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    api.getEntry(id).then(setEntry).catch(onError);
  }, [id]);

  if (!entry) return null;

  const purge = async () => {
    const ok = await ask(t.trash.purgeConfirm, {
      title: t.trash.purge,
      kind: "warning",
      okLabel: t.trash.purge,
      cancelLabel: t.cancel,
    });
    if (ok) await onPurge(id);
  };

  return (
    <div className="editor trash-view">
      <div className="trash-banner">
        <span>🗑 {t.trash.willBePurged(daysLeft(entry.deletedAt))}</span>
        <span className="spacer" />
        <button className="primary" onClick={() => onRestore(id)}>
          {t.trash.restore}
        </button>
        <button className="danger" onClick={purge}>
          {t.trash.purge}
        </button>
      </div>
      <header className="editor-header">
        <h1 className="title-input">{entry.title || t.untitled}</h1>
        <div className="editor-date-long">{formatLong(entry.date, locale)}</div>
        {entry.tags.length > 0 && (
          <div className="entry-tags">
            {entry.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </header>
      <div className="preview">
        {entry.body.trim() ? <MarkdownView source={entry.body} /> : <p className="muted">{t.editor.nothingToPreview}</p>}
      </div>
    </div>
  );
}
