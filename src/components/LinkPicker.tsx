import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { formatShort } from "../dates";
import { useI18n } from "../i18n";
import { linkCandidates } from "../links";
import { moodEmoji, type EntryMeta } from "../types";
import { useEntryLinks } from "./EntryLinks";

interface Props {
  /** Viewport position of the popup's top-left corner. */
  at: { top: number; left: number };
  excludeId: string;
  onPick: (meta: EntryMeta) => void;
  onClose: () => void;
}

/** Search-as-you-type list of entries to link to. */
export function LinkPicker({ at, excludeId, onPick, onClose }: Props) {
  const { t, locale } = useI18n();
  const { metas } = useEntryLinks();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => linkCandidates(metas, query, excludeId), [metas, query, excludeId]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [query]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + candidates.length) % Math.max(1, candidates.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (candidates[active]) onPick(candidates[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <>
      <div className="menu-scrim" onMouseDown={onClose} />
      <div className="link-picker" style={{ top: at.top, left: at.left }} role="dialog" aria-label={t.links.insert}>
        <input
          ref={inputRef}
          value={query}
          placeholder={t.links.search}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="link-options" role="listbox">
          {candidates.length === 0 && <p className="muted">{t.links.none}</p>}
          {candidates.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(m)}
            >
              <span className="link-option-title">
                {moodEmoji(m.mood)} {m.title || t.untitled}
              </span>
              <span className="muted">{formatShort(m.date, locale)}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
