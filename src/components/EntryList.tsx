import type { RefObject } from "react";
import { formatShort } from "../dates";
import type { EntryMeta } from "../types";
import { moodEmoji } from "../types";
import type { Filters } from "./Journal";

interface Props {
  entries: EntryMeta[];
  total: number;
  selectedId: string | null;
  filters: Filters;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (q: string) => void;
  onClearFilters: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function groupByMonth(entries: EntryMeta[]) {
  const groups: { label: string; items: EntryMeta[] }[] = [];
  for (const e of entries) {
    const [y, m] = e.date.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}

export function EntryList({ entries, total, selectedId, filters, searchRef, onQuery, onClearFilters, onSelect, onNew }: Props) {
  const filtered = Boolean(filters.query.trim() || filters.day || filters.tag || filters.favorites);

  return (
    <section className="entry-list">
      <div className="entry-list-head">
        <input
          ref={searchRef}
          type="search"
          className="search"
          placeholder="Ara…  (Ctrl+F)"
          value={filters.query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <button className="primary icon-only" title="Yeni kayıt (Ctrl+N)" onClick={onNew}>
          +
        </button>
      </div>
      {filtered && (
        <div className="filter-bar">
          <span>
            {entries.length} / {total} kayıt
            {filters.day && ` · ${formatShort(filters.day)}`}
            {filters.tag && ` · #${filters.tag}`}
            {filters.favorites && " · ★"}
          </span>
          <button className="link" onClick={onClearFilters}>
            Temizle
          </button>
        </div>
      )}
      <div className="entry-scroll">
        {entries.length === 0 && <p className="muted center pad">{filtered ? "Eşleşen kayıt yok." : "Henüz kayıt yok."}</p>}
        {groupByMonth(entries).map((g) => (
          <div key={g.label}>
            <h3 className="month-label">{g.label}</h3>
            {g.items.map((e) => (
              <button
                key={e.id}
                className={`entry-card ${e.id === selectedId ? "selected" : ""}`}
                onClick={() => onSelect(e.id)}
              >
                <div className="entry-card-top">
                  <span className="entry-date">{formatShort(e.date)}</span>
                  {moodEmoji(e.mood) && <span>{moodEmoji(e.mood)}</span>}
                  {e.favorite && <span className="star on">★</span>}
                </div>
                <div className="entry-title">{e.title || <span className="muted">Başlıksız</span>}</div>
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
