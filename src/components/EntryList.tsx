import type { RefObject } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { formatShort } from "../dates";
import { useI18n } from "../i18n";
import type { EntryMeta } from "../types";
import { moodEmoji } from "../types";
import type { Filters, Section } from "./Journal";
import { daysLeft } from "./TrashView";

interface Props {
  section: Section;
  entries: EntryMeta[];
  total: number;
  selectedId: string | null;
  filters: Filters;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (q: string) => void;
  onClearFilters: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onEmptyTrash: () => void;
}

function groupByMonth(entries: EntryMeta[], locale: string) {
  const groups: { label: string; items: EntryMeta[] }[] = [];
  for (const e of entries) {
    const [y, m] = e.date.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}

export function EntryList(props: Props) {
  const {
    section,
    entries,
    total,
    selectedId,
    filters,
    searchRef,
    onQuery,
    onClearFilters,
    onSelect,
    onNew,
    onEmptyTrash,
  } = props;
  const { t, locale } = useI18n();
  const inTrash = section === "trash";
  const filtered = !inTrash && Boolean(filters.query.trim() || filters.day || filters.tag || filters.favorites);

  const emptyTrash = async () => {
    const ok = await ask(t.trash.emptyConfirm(total), {
      title: t.trash.emptyAll,
      kind: "warning",
      okLabel: t.trash.emptyAll,
      cancelLabel: t.cancel,
    });
    if (ok) onEmptyTrash();
  };

  return (
    <section className="entry-list">
      {inTrash ? (
        <div className="entry-list-head trash-head">
          <div>
            <h3>{t.trash.title}</h3>
            <small className="muted">{t.trash.retention}</small>
          </div>
          {total > 0 && (
            <button className="danger small-btn" onClick={emptyTrash}>
              {t.trash.emptyAll}
            </button>
          )}
        </div>
      ) : (
        <div className="entry-list-head">
          <input
            ref={searchRef}
            type="search"
            className="search"
            placeholder={t.list.search}
            value={filters.query}
            onChange={(e) => onQuery(e.target.value)}
          />
          <button className="primary icon-only" title={t.list.newEntryShortcut} onClick={() => onNew()}>
            +
          </button>
        </div>
      )}
      {filtered && (
        <div className="filter-bar">
          <span>
            {t.list.count(entries.length, total)}
            {filters.day && ` · ${formatShort(filters.day, locale)}`}
            {filters.tag && ` · #${filters.tag}`}
            {filters.favorites && " · ★"}
          </span>
          <button className="link" onClick={onClearFilters}>
            {t.list.clear}
          </button>
        </div>
      )}
      <div className="entry-scroll">
        {entries.length === 0 && (
          <p className="muted center pad">{inTrash ? t.trash.empty : filtered ? t.list.noMatch : t.list.noEntries}</p>
        )}
        {groupByMonth(entries, locale).map((g) => (
          <div key={g.label}>
            <h3 className="month-label">{g.label}</h3>
            {g.items.map((e) => (
              <button
                key={e.id}
                className={`entry-card ${e.id === selectedId ? "selected" : ""}`}
                onClick={() => onSelect(e.id)}
              >
                <div className="entry-card-top">
                  <span className="entry-date">{formatShort(e.date, locale)}</span>
                  {moodEmoji(e.mood) && <span>{moodEmoji(e.mood)}</span>}
                  {e.favorite && <span className="star on">★</span>}
                  {inTrash && <span className="purge-in">{t.trash.daysLeft(daysLeft(e.deletedAt))}</span>}
                </div>
                <div className="entry-title">{e.title || <span className="muted">{t.untitled}</span>}</div>
                {e.excerpt && <div className="entry-excerpt">{e.excerpt}</div>}
                {e.tags.length > 0 && (
                  <div className="entry-tags">
                    {e.tags.map((t) => (
                      <span key={t} className="tag small">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
