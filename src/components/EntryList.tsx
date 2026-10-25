import { useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { formatShort } from "../dates";
import { hasFilters, NO_FILTERS, type Filters } from "../filters";
import { useI18n } from "../i18n";
import type { EntryMeta, SearchHit } from "../types";
import { moodEmoji } from "../types";
import { FilterPanel } from "./FilterPanel";
import type { Section } from "./Journal";
import { daysLeft } from "./TrashView";

interface Props {
  section: Section;
  entries: EntryMeta[];
  total: number;
  selectedId: string | null;
  filters: Filters;
  hits: Map<string, SearchHit> | null;
  tags: [string, number][];
  searchRef: RefObject<HTMLInputElement | null>;
  onFilters: Dispatch<SetStateAction<Filters>>;
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
    hits,
    tags,
    searchRef,
    onFilters,
    onSelect,
    onNew,
    onEmptyTrash,
  } = props;
  const { t, locale } = useI18n();
  const inTrash = section === "trash";
  const filtered = !inTrash && Boolean(filters.query.trim() || hasFilters(filters));
  const [panelOpen, setPanelOpen] = useState(false);
  const activeCount =
    filters.tags.length +
    filters.moods.length +
    Number(filters.favorites) +
    Number(Boolean(filters.from || filters.to));

  // One removable chip per active filter.
  const chips: { key: string; label: ReactNode; clear: (f: Filters) => Filters }[] = [];
  if (filters.day)
    chips.push({ key: "day", label: formatShort(filters.day, locale), clear: (f) => ({ ...f, day: null }) });
  if (filters.from || filters.to) {
    const from = filters.from ? formatShort(filters.from, locale) : "…";
    const to = filters.to ? formatShort(filters.to, locale) : "…";
    chips.push({ key: "range", label: `${from} – ${to}`, clear: (f) => ({ ...f, from: null, to: null }) });
  }
  filters.moods.forEach((mood) =>
    chips.push({
      key: `mood-${mood}`,
      label: moodEmoji(mood),
      clear: (f) => ({ ...f, moods: f.moods.filter((m) => m !== mood) }),
    }),
  );
  filters.tags.forEach((tag) =>
    chips.push({
      key: `tag-${tag}`,
      label: `#${tag}`,
      clear: (f) => ({ ...f, tags: f.tags.filter((x) => x !== tag) }),
    }),
  );
  if (filters.favorites) chips.push({ key: "fav", label: "★", clear: (f) => ({ ...f, favorites: false }) });

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
            onChange={(e) => {
              const query = e.target.value;
              onFilters((f) => ({ ...f, query }));
            }}
          />
          <button
            className={`filter-toggle ${panelOpen ? "open" : ""}`}
            title={t.filters.title}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M1.5 2.5h13l-5 6v5l-3-1.5v-3.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {activeCount > 0 && <span className="count">{activeCount}</span>}
          </button>
          <button className="primary icon-only" title={t.list.newEntryShortcut} onClick={() => onNew()}>
            +
          </button>
        </div>
      )}
      {!inTrash && panelOpen && <FilterPanel filters={filters} tags={tags} onFilters={onFilters} />}
      {filtered && (
        <div className="filter-bar">
          <span>{t.list.count(entries.length, total)}</span>
          {chips.map((c) => (
            <button key={c.key} className="chip active" title={t.filters.remove} onClick={() => onFilters(c.clear)}>
              {c.label} ×
            </button>
          ))}
          <button className="link" onClick={() => onFilters(NO_FILTERS)}>
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
                {hits?.get(e.id)?.snippet.length ? (
                  <div className="entry-excerpt snippet">
                    {hits.get(e.id)!.snippet.map(([text, hit], i) => (hit ? <mark key={i}>{text}</mark> : text))}
                  </div>
                ) : (
                  e.excerpt && <div className="entry-excerpt">{e.excerpt}</div>
                )}
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
