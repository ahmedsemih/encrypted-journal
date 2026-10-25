import { useState } from "react";
import { toISODate, today } from "../dates";
import { useI18n } from "../i18n";

interface Props {
  /** Days that have at least one entry. */
  marked: Set<string>;
  selected: string | null;
  onSelect: (day: string | null) => void;
}

export function Calendar({ marked, selected, onSelect }: Props) {
  const { t, locale } = useI18n();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  // Monday-first grid.
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(year, month, i + 1))),
  ];
  const todayStr = today();
  const shift = (n: number) => setCursor(new Date(year, month + n, 1));

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={t.calendar.prev}>
          ‹
        </button>
        <button
          className="calendar-title"
          title={t.calendar.thisMonth}
          onClick={() => {
            const d = new Date();
            setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
        >
          {cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={t.calendar.next}>
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {t.calendar.weekdays.map((w) => (
          <span key={w} className="weekday">
            {w}
          </span>
        ))}
        {cells.map((day, i) =>
          day ? (
            <button
              key={day}
              className={[
                "day",
                marked.has(day) ? "marked" : "",
                day === todayStr ? "today" : "",
                day === selected ? "selected" : "",
              ].join(" ")}
              onClick={() => onSelect(day === selected ? null : day)}
            >
              {Number(day.slice(8))}
            </button>
          ) : (
            <span key={`pad-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
