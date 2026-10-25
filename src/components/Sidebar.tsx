import { useMemo, useState } from "react";
import { currentStreak, onThisDay as earlierYears, today } from "../dates";
import { useI18n } from "../i18n";
import { MOODS, type EntryMeta, type Template } from "../types";
import { Calendar } from "./Calendar";
import { hasFilters, NO_FILTERS, toggle, type Filters } from "../filters";
import type { Section } from "./Journal";

interface Props {
  username: string;
  metas: EntryMeta[];
  trashCount: number;
  section: Section;
  tags: [string, number][];
  filters: Filters;
  onFilters: (f: Filters | ((f: Filters) => Filters)) => void;
  onSection: (s: Section) => void;
  onSelect: (id: string) => void;
  onNew: (templateId?: string | null) => void;
  templates: Template[];
  defaultTemplateId: string | null;
  onManageTemplates: () => void;
  onLock: () => void;
  onSettings: () => void;
}

export function Sidebar(props: Props) {
  const {
    username,
    metas,
    trashCount,
    section,
    tags,
    filters,
    onFilters,
    onSection,
    onSelect,
    onNew,
    templates,
    defaultTemplateId,
    onManageTemplates,
    onLock,
    onSettings,
  } = props;
  const inTrash = section === "trash";
  const [menuOpen, setMenuOpen] = useState(false);
  const pick = (id: string | null) => {
    setMenuOpen(false);
    onNew(id);
  };
  const inEntries = section === "entries";
  const { t, locale } = useI18n();
  const dates = useMemo(() => new Set(metas.map((m) => m.date)), [metas]);

  const stats = useMemo(() => {
    const month = today().slice(0, 7);
    return {
      total: metas.length,
      words: metas.reduce((n, m) => n + m.wordCount, 0),
      thisMonth: metas.filter((m) => m.date.startsWith(month)).length,
      streak: currentStreak(dates),
    };
  }, [metas, dates]);

  const onThisDay = useMemo(() => earlierYears(metas), [metas]);
  const thisYear = new Date().getFullYear();

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="user">
          <span className="avatar">{username.slice(0, 1).toUpperCase()}</span>
          <span className="username" title={username}>
            {username}
          </span>
        </div>
        <button className="icon-btn" title={t.sidebar.settings} onClick={onSettings}>
          ⚙
        </button>
        <button className="icon-btn" title={t.sidebar.lock} onClick={onLock}>
          🔒
        </button>
      </div>

      <div className="new-entry">
        <button className="primary" onClick={() => onNew()}>
          {t.sidebar.newEntry}
        </button>
        <button
          className="primary menu-toggle"
          aria-label={t.templates.choose}
          title={t.templates.choose}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ▾
        </button>
        {menuOpen && (
          <>
            <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
            <div className="menu" role="menu">
              {[{ id: null, name: t.templates.blank }, ...templates].map((tpl) => (
                <button key={tpl.id ?? "blank"} role="menuitem" onClick={() => pick(tpl.id)}>
                  {tpl.name || t.untitled}
                  {tpl.id === defaultTemplateId && <span className="badge">{t.templates.isDefault}</span>}
                </button>
              ))}
              <hr />
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onManageTemplates();
                }}
              >
                {t.templates.manage}
              </button>
            </div>
          </>
        )}
      </div>

      <Calendar marked={dates} selected={filters.day} onSelect={(day) => onFilters((f) => ({ ...f, day }))} />

      <nav className="nav">
        <button
          className={inEntries && !hasFilters(filters) ? "active" : ""}
          onClick={() => onFilters((f) => ({ ...NO_FILTERS, query: f.query }))}
        >
          {t.sidebar.all} <span className="count">{metas.length}</span>
        </button>
        <button
          className={inEntries && filters.favorites ? "active" : ""}
          onClick={() => onFilters((f) => ({ ...f, favorites: !f.favorites }))}
        >
          {t.sidebar.favorites} <span className="count">{metas.filter((m) => m.favorite).length}</span>
        </button>
        <button className={section === "stats" ? "active" : ""} onClick={() => onSection("stats")}>
          {t.sidebar.stats}
        </button>
        <button className={inTrash ? "active" : ""} onClick={() => onSection("trash")}>
          {t.sidebar.trash} {trashCount > 0 && <span className="count">{trashCount}</span>}
        </button>
      </nav>

      {onThisDay.length > 0 && (
        <section className="side-section">
          <h4>{t.sidebar.onThisDay}</h4>
          <div className="on-this-day-list">
            {onThisDay.map((m) => (
              <button key={m.id} className="on-this-day" onClick={() => onSelect(m.id)}>
                <span className="otd-when">
                  {t.sidebar.yearsAgo(thisYear - Number(m.date.slice(0, 4)))} · {m.date.slice(0, 4)}
                  {m.mood && <span>{MOODS.find((x) => x.id === m.mood)?.emoji}</span>}
                </span>
                <span className="otd-title">{m.title || t.untitled}</span>
                {m.excerpt && <span className="otd-excerpt">{m.excerpt}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {tags.length > 0 && (
        <section className="side-section">
          <h4>{t.sidebar.tags}</h4>
          <div className="tag-cloud">
            {tags.map(([tag, n]) => (
              <button
                key={tag}
                className={`tag ${filters.tags.includes(tag) ? "active" : ""}`}
                onClick={() => onFilters((f) => ({ ...f, tags: toggle(f.tags, tag) }))}
              >
                #{tag} <small>{n}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="side-section stats">
        <div>
          <strong>{stats.streak}</strong>
          <span>{t.sidebar.streak}</span>
        </div>
        <div>
          <strong>{stats.thisMonth}</strong>
          <span>{t.sidebar.thisMonth}</span>
        </div>
        <div>
          <strong>{stats.words.toLocaleString(locale)}</strong>
          <span>{t.sidebar.words}</span>
        </div>
      </section>
    </aside>
  );
}
