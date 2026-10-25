import { useMemo } from "react";
import { currentStreak, today } from "../dates";
import { useI18n } from "../i18n";
import type { EntryMeta } from "../types";
import { Calendar } from "./Calendar";
import type { Filters } from "./Journal";

interface Props {
  username: string;
  metas: EntryMeta[];
  tags: [string, number][];
  filters: Filters;
  onFilters: (f: Filters | ((f: Filters) => Filters)) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onLock: () => void;
  onSettings: () => void;
}

export function Sidebar({ username, metas, tags, filters, onFilters, onSelect, onNew, onLock, onSettings }: Props) {
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

  // Entries written on this calendar day in earlier years.
  const onThisDay = useMemo(() => {
    const t = today();
    const md = t.slice(5);
    return metas.filter((m) => m.date.slice(5) === md && m.date < t).slice(0, 5);
  }, [metas]);

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

      <button className="primary block" onClick={onNew}>
        {t.sidebar.newEntry}
      </button>

      <Calendar marked={dates} selected={filters.day} onSelect={(day) => onFilters((f) => ({ ...f, day }))} />

      <nav className="nav">
        <button
          className={!filters.favorites && !filters.tag && !filters.day ? "active" : ""}
          onClick={() => onFilters((f) => ({ ...f, favorites: false, tag: null, day: null }))}
        >
          {t.sidebar.all} <span className="count">{metas.length}</span>
        </button>
        <button
          className={filters.favorites ? "active" : ""}
          onClick={() => onFilters((f) => ({ ...f, favorites: !f.favorites }))}
        >
          {t.sidebar.favorites} <span className="count">{metas.filter((m) => m.favorite).length}</span>
        </button>
      </nav>

      {tags.length > 0 && (
        <section className="side-section">
          <h4>{t.sidebar.tags}</h4>
          <div className="tag-cloud">
            {tags.map(([tag, n]) => (
              <button
                key={tag}
                className={`tag ${filters.tag === tag ? "active" : ""}`}
                onClick={() => onFilters((f) => ({ ...f, tag: f.tag === tag ? null : tag }))}
              >
                #{tag} <small>{n}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {onThisDay.length > 0 && (
        <section className="side-section">
          <h4>{t.sidebar.onThisDay}</h4>
          {onThisDay.map((m) => (
            <button key={m.id} className="on-this-day" onClick={() => onSelect(m.id)}>
              <span className="muted">{m.date.slice(0, 4)}</span> {m.title || t.untitled}
            </button>
          ))}
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
