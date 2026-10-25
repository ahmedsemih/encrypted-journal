import { DATE_PRESETS, presetRange, toggle, type Filters } from "../filters";
import { useI18n } from "../i18n";
import { MOODS } from "../types";

interface Props {
  filters: Filters;
  tags: [string, number][];
  onFilters: (update: (f: Filters) => Filters) => void;
}

export function FilterPanel({ filters, tags, onFilters }: Props) {
  const { t } = useI18n();
  const set = (patch: Partial<Filters>) => onFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="filter-panel">
      <div className="filter-group">
        <h4>{t.filters.date}</h4>
        <div className="date-range">
          <input
            type="date"
            aria-label={t.filters.from}
            value={filters.from ?? ""}
            max={filters.to ?? undefined}
            onChange={(e) => set({ from: e.target.value || null, day: null })}
          />
          <span>–</span>
          <input
            type="date"
            aria-label={t.filters.to}
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            onChange={(e) => set({ to: e.target.value || null, day: null })}
          />
        </div>
        <div className="chip-row">
          {DATE_PRESETS.map((p) => {
            const range = presetRange(p);
            const active = filters.from === range.from && filters.to === range.to;
            return (
              <button
                key={p}
                type="button"
                className={`chip ${active ? "active" : ""}`}
                onClick={() => set(active ? { from: null, to: null } : { ...range, day: null })}
              >
                {t.filters.presets[p]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-group">
        <h4>{t.filters.mood}</h4>
        <div className="chip-row">
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip mood ${filters.moods.includes(m.id) ? "active" : ""}`}
              title={t.moods[m.id]}
              aria-pressed={filters.moods.includes(m.id)}
              onClick={() => onFilters((f) => ({ ...f, moods: toggle(f.moods, m.id) }))}
            >
              {m.emoji}
            </button>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="filter-group">
          <h4>{t.filters.tags}</h4>
          <div className="chip-row tag-choices">
            {tags.map(([tag]) => (
              <button
                key={tag}
                type="button"
                className={`chip ${filters.tags.includes(tag) ? "active" : ""}`}
                aria-pressed={filters.tags.includes(tag)}
                onClick={() => onFilters((f) => ({ ...f, tags: toggle(f.tags, tag) }))}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="field row checkbox">
        <span>{t.filters.favoritesOnly}</span>
        <input type="checkbox" checked={filters.favorites} onChange={(e) => set({ favorites: e.target.checked })} />
      </label>

      <p className="filter-help muted">{t.filters.searchHelp}</p>
    </div>
  );
}
