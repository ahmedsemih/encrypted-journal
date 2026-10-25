import { FocusEvent, PointerEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { currentStreak, formatLong } from "../dates";
import { useI18n } from "../i18n";
import {
  compact,
  computeYear,
  MOOD_ORDER,
  niceMax,
  quartileBins,
  TIME_SLOTS,
  yearsOf,
  yearWeeks,
  type DayStat,
  type MonthStat,
  type YearStats,
} from "../stats";
import type { EntryMeta } from "../types";
import { MOODS } from "../types";

interface Props {
  metas: EntryMeta[];
  onPickDay: (day: string) => void;
}

// ---------- shared pieces ----------

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

/** One tooltip per card, positioned relative to the card. */
function useTooltip() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: PointerEvent | FocusEvent, content: ReactNode) => {
    const card = cardRef.current?.getBoundingClientRect();
    if (!card) return;
    let x: number;
    let y: number;
    if ("clientX" in e) {
      x = e.clientX;
      y = e.clientY;
    } else {
      const r = (e.target as Element).getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top;
    }
    setTip({ x: x - card.left, y: y - card.top, content });
  };
  return { cardRef, tip, show, hide: () => setTip(null) };
}
type TooltipApi = ReturnType<typeof useTooltip>;

/** Rect with 4px rounding on the data end(s) only, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, round: { left?: boolean; right?: boolean; top?: boolean }) {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0 || h <= 0) return "";
  const [tl, tr, br, bl] = round.top
    ? [r, r, 0, 0]
    : [round.left ? r : 0, round.right ? r : 0, round.right ? r : 0, round.left ? r : 0];
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `Q${x + w},${y} ${x + w},${y + tr}` : "",
    `V${y + h - br}`,
    br ? `Q${x + w},${y + h} ${x + w - br},${y + h}` : "",
    `H${x + bl}`,
    bl ? `Q${x},${y + h} ${x},${y + h - bl}` : "",
    `V${y + tl}`,
    tl ? `Q${x},${y} ${x + tl},${y}` : "",
    "Z",
  ].join(" ");
}

interface CardProps {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
  tooltip?: TooltipApi;
  children: ReactNode;
  wide?: boolean;
}

function ChartCard({ title, subtitle, legend, table, tooltip, children, wide }: CardProps) {
  const { t } = useI18n();
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`chart-card ${wide ? "wide" : ""}`} ref={tooltip?.cardRef}>
      <header className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <button className="link small" onClick={() => setShowTable((v) => !v)}>
          {showTable ? t.stats.showChart : t.stats.showTable}
        </button>
      </header>
      {showTable ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legend}
          {children}
        </>
      )}
      {tooltip?.tip && !showTable && (
        <div className="chart-tooltip" style={{ left: tooltip.tip.x, top: tooltip.tip.y }}>
          {tooltip.tip.content}
        </div>
      )}
    </section>
  );
}

function TipRows({ title, rows }: { title: string; rows: { value: string; label: string; color?: string }[] }) {
  return (
    <>
      <div className="tip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="tip-row">
          {r.color && <span className="tip-key" style={{ background: r.color }} />}
          <strong>{r.value}</strong>
          <span>{r.label}</span>
        </div>
      ))}
    </>
  );
}

// ---------- charts ----------

const HEAT_VARS = ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];

function Heatmap({ year, days, onPickDay, tooltip }: { year: number; days: Map<string, DayStat>; onPickDay: (d: string) => void; tooltip: TooltipApi }) {
  const { t, locale } = useI18n();
  const [ref, width] = useWidth<HTMLDivElement>();
  const weeks = useMemo(() => yearWeeks(year), [year]);
  const bins = useMemo(() => quartileBins([...days.values()].map((d) => d.words || 1)), [days]);
  const labelW = 26;
  const headH = 16;
  const gap = 3;
  const cell = Math.max(8, Math.min(14, Math.floor((width - labelW) / weeks.length) - gap));
  const step = cell + gap;
  const level = (d?: DayStat) => (!d ? 0 : 1 + bins.findIndex((b) => (d.words || 1) <= b));

  const monthStarts = weeks
    .map((w, i) => ({ i, day: w.find((d) => d?.endsWith("-01")) }))
    .filter((m): m is { i: number; day: string } => Boolean(m.day));

  return (
    <div ref={ref} className="heatmap">
      {width > 0 && (
        <svg width={labelW + weeks.length * step} height={headH + 7 * step} role="img" aria-label={t.stats.heatmapTitle}>
          {monthStarts.map(({ i, day }) => (
            <text key={day} x={labelW + i * step} y={11} className="axis-label">
              {new Date(year, Number(day.slice(5, 7)) - 1, 1).toLocaleDateString(locale, { month: "short" })}
            </text>
          ))}
          {[0, 2, 4].map((row) => (
            <text key={row} x={0} y={headH + row * step + cell - 2} className="axis-label">
              {t.calendar.weekdays[row]}
            </text>
          ))}
          {weeks.map((week, wi) =>
            week.map((date, di) => {
              if (!date) return null;
              const stat = days.get(date);
              const x = labelW + wi * step;
              const y = headH + di * step;
              return (
                <g
                  key={date}
                  className="heat-cell"
                  onPointerMove={(e) =>
                    tooltip.show(
                      e,
                      <TipRows
                        title={formatLong(date, locale)}
                        rows={
                          stat
                            ? [
                                { value: String(stat.entries), label: t.stats.entriesLabel },
                                { value: stat.words.toLocaleString(locale), label: t.stats.wordsLabel },
                              ]
                            : [{ value: "–", label: t.stats.noEntry }]
                        }
                      />,
                    )
                  }
                  onPointerLeave={tooltip.hide}
                  onClick={() => stat && onPickDay(date)}
                  style={{ cursor: stat ? "pointer" : "default" }}
                >
                  <rect x={x - 1} y={y - 1} width={step} height={step} fill="transparent" />
                  <rect x={x} y={y} width={cell} height={cell} rx={2} fill={HEAT_VARS[level(stat)]} />
                </g>
              );
            }),
          )}
        </svg>
      )}
      <div className="heat-legend">
        <span>{t.stats.less}</span>
        {HEAT_VARS.map((c) => (
          <span key={c} className="heat-swatch" style={{ background: c }} />
        ))}
        <span>{t.stats.more}</span>
      </div>
    </div>
  );
}

const MOOD_VARS: Record<string, string> = {
  awful: "var(--mood-awful)",
  bad: "var(--mood-bad)",
  okay: "var(--mood-okay)",
  good: "var(--mood-good)",
  great: "var(--mood-great)",
};

/** Diverging stacked bars per month: negative moods left, positive right, "okay" straddling the center. */
function MoodChart({ months, tooltip }: { months: MonthStat[]; tooltip: TooltipApi }) {
  const { t, locale } = useI18n();
  const [ref, width] = useWidth<HTMLDivElement>();
  const labelW = 44;
  const rowH = 16;
  const rowGap = 10;
  const plotW = Math.max(0, width - labelW - 8);
  const center = labelW + plotW / 2;
  const domain = Math.max(
    1,
    ...months.map((m) => Math.max(m.moods.awful + m.moods.bad, m.moods.good + m.moods.great) + m.moods.okay / 2),
  );
  const scale = (n: number) => (n / domain) * (plotW / 2);
  const gap = 2;

  const segments = (m: MonthStat, y: number) => {
    const out: ReactNode[] = [];
    const half = m.moods.okay / 2;
    // Left arm, from the center outwards: okay/2, bad, awful.
    let x = center;
    const left: [string, number][] = [
      ["okay", half],
      ["bad", m.moods.bad],
      ["awful", m.moods.awful],
    ];
    const lastLeft = [...left].reverse().find(([, v]) => v > 0)?.[0];
    for (const [mood, v] of left) {
      if (!v) continue;
      const w = scale(v);
      const isOkay = mood === "okay";
      out.push(
        <path
          key={`l-${mood}`}
          d={barPath(x - w, y, Math.max(0, w - (isOkay ? 0 : gap)), rowH, { left: mood === lastLeft })}
          fill={MOOD_VARS[mood]}
        />,
      );
      x -= w;
    }
    x = center;
    const right: [string, number][] = [
      ["okay", half],
      ["good", m.moods.good],
      ["great", m.moods.great],
    ];
    const lastRight = [...right].reverse().find(([, v]) => v > 0)?.[0];
    for (const [mood, v] of right) {
      if (!v) continue;
      const w = scale(v);
      const isOkay = mood === "okay";
      out.push(
        <path
          key={`r-${mood}`}
          d={barPath(x + (isOkay ? 0 : gap), y, Math.max(0, w - (isOkay ? 0 : gap)), rowH, { right: mood === lastRight })}
          fill={MOOD_VARS[mood]}
        />,
      );
      x += w;
    }
    return out;
  };

  const height = months.length * (rowH + rowGap);
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t.stats.moodTitle}>
          {months.map((m, i) => {
            const y = i * (rowH + rowGap);
            const label = new Date(2000, m.month, 1).toLocaleDateString(locale, { month: "short" });
            const total = MOOD_ORDER.reduce((n, k) => n + m.moods[k], 0);
            const tip = (
              <TipRows
                title={new Date(2000, m.month, 1).toLocaleDateString(locale, { month: "long" })}
                rows={[...MOOD_ORDER].reverse().map((k) => ({
                  value: String(m.moods[k]),
                  label: `${MOODS.find((x) => x.id === k)?.emoji} ${t.moods[k]}`,
                  color: MOOD_VARS[k],
                }))}
              />
            );
            return (
              <g
                key={m.month}
                className="mood-row"
                tabIndex={total ? 0 : -1}
                onPointerMove={(e) => total && tooltip.show(e, tip)}
                onPointerLeave={tooltip.hide}
                onFocus={(e) => total && tooltip.show(e, tip)}
                onBlur={tooltip.hide}
              >
                <rect className="row-hit" x={0} y={y - rowGap / 2} width={width} height={rowH + rowGap} />
                <text x={0} y={y + rowH - 4} className="axis-label">
                  {label}
                </text>
                {segments(m, y)}
              </g>
            );
          })}
          <line x1={center} x2={center} y1={-4} y2={height - rowGap + 4} className="baseline" />
        </svg>
      )}
    </div>
  );
}

function MonthlyColumns({ months, tooltip }: { months: MonthStat[]; tooltip: TooltipApi }) {
  const { t, locale } = useI18n();
  const [ref, width] = useWidth<HTMLDivElement>();
  const axisW = 40;
  const plotH = 150;
  const bottomH = 20;
  const topPad = 16;
  const max = niceMax(Math.max(...months.map((m) => m.words)));
  const band = Math.max(0, (width - axisW) / 12);
  const colW = Math.min(24, band * 0.6);
  const y = (v: number) => topPad + plotH - (v / max) * plotH;
  const peak = months.reduce((best, m) => (m.words > best.words ? m : best), months[0]);

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={topPad + plotH + bottomH} role="img" aria-label={t.stats.wordsTitle}>
          {[0, max / 2, max].map((tick) => (
            <g key={tick}>
              <line x1={axisW} x2={width} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "baseline" : "gridline"} />
              <text x={axisW - 6} y={y(tick) + 4} textAnchor="end" className="axis-label tabular">
                {compact(tick, locale)}
              </text>
            </g>
          ))}
          {months.map((m) => {
            const cx = axisW + band * m.month + band / 2;
            const h = plotH - (y(m.words) - topPad);
            const label = new Date(2000, m.month, 1).toLocaleDateString(locale, { month: "short" });
            const tip = (
              <TipRows
                title={new Date(2000, m.month, 1).toLocaleDateString(locale, { month: "long" })}
                rows={[
                  { value: m.words.toLocaleString(locale), label: t.stats.wordsLabel },
                  { value: String(m.entries), label: t.stats.entriesLabel },
                ]}
              />
            );
            return (
              <g
                key={m.month}
                className="column"
                tabIndex={0}
                onPointerMove={(e) => tooltip.show(e, tip)}
                onPointerLeave={tooltip.hide}
                onFocus={(e) => tooltip.show(e, tip)}
                onBlur={tooltip.hide}
              >
                <rect className="row-hit" x={cx - band / 2} y={topPad} width={band} height={plotH} />
                <path d={barPath(cx - colW / 2, y(m.words), colW, h, { top: true })} fill="var(--series-1)" />
                {m === peak && m.words > 0 && (
                  <text x={cx} y={y(m.words) - 5} textAnchor="middle" className="value-label">
                    {compact(m.words, locale)}
                  </text>
                )}
                <text x={cx} y={topPad + plotH + 15} textAnchor="middle" className="axis-label">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Horizontal bars with labels and values; every value is printed, so no tooltip is needed. */
function BarList({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value > 0)) return <p className="muted small">{empty}</p>;
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bar-label" title={r.label}>
            {r.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            <span className="bar-value">{r.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- view ----------

export function StatsView({ metas, onPickDay }: Props) {
  const { t, locale } = useI18n();
  const years = useMemo(() => yearsOf(metas), [metas]);
  const [year, setYear] = useState(years[0]);
  useEffect(() => {
    if (!years.includes(year)) setYear(years[0]);
  }, [years, year]);

  const stats: YearStats = useMemo(() => computeYear(metas, year), [metas, year]);
  const streakNow = useMemo(() => currentStreak(new Set(metas.map((m) => m.date))), [metas]);
  const heatTip = useTooltip();
  const moodTip = useTooltip();
  const wordsTip = useTooltip();
  const monthName = (m: number) => new Date(2000, m, 1).toLocaleDateString(locale, { month: "long" });
  const isCurrentYear = year === new Date().getFullYear();
  const hasMoods = stats.months.some((m) => MOOD_ORDER.some((k) => m.moods[k] > 0));

  const tiles: { label: string; value: string; note?: string }[] = [
    { label: t.stats.entriesTile, value: stats.entries.toLocaleString(locale) },
    {
      label: t.stats.wordsTile,
      value: compact(stats.words, locale),
      note: stats.entries ? t.stats.avgWords(Math.round(stats.words / stats.entries)) : undefined,
    },
    {
      label: t.stats.daysTile,
      value: stats.daysWritten.toLocaleString(locale),
      note: stats.daysElapsed ? t.stats.ofDays(stats.daysElapsed) : undefined,
    },
    { label: t.stats.longestStreak, value: t.stats.days(stats.longestStreak) },
    ...(isCurrentYear ? [{ label: t.stats.currentStreak, value: t.stats.days(streakNow) }] : []),
  ];

  return (
    <div className="stats-view">
      <div className="stats-filters">
        <h2>{t.stats.title}</h2>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t.stats.year}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="stat-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="stat-tile">
            <span className="stat-label">{tile.label}</span>
            <span className="stat-value">{tile.value}</span>
            {tile.note && <span className="stat-note">{tile.note}</span>}
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <ChartCard
          wide
          title={t.stats.heatmapTitle}
          subtitle={t.stats.heatmapSubtitle}
          tooltip={heatTip}
          table={{
            head: [t.stats.date, t.stats.entriesLabel, t.stats.wordsLabel],
            rows: [...stats.days.values()]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((d) => [formatLong(d.date, locale), d.entries, d.words]),
          }}
        >
          <Heatmap year={year} days={stats.days} onPickDay={onPickDay} tooltip={heatTip} />
        </ChartCard>

        <ChartCard
          title={t.stats.moodTitle}
          subtitle={t.stats.moodSubtitle}
          tooltip={moodTip}
          legend={
            <div className="chart-legend">
              {MOOD_ORDER.map((k) => (
                <span key={k}>
                  <span className="legend-swatch" style={{ background: MOOD_VARS[k] }} />
                  {MOODS.find((m) => m.id === k)?.emoji} {t.moods[k]}
                </span>
              ))}
            </div>
          }
          table={{
            head: [t.stats.month, ...MOOD_ORDER.map((k) => t.moods[k])],
            rows: stats.months.map((m) => [monthName(m.month), ...MOOD_ORDER.map((k) => m.moods[k])]),
          }}
        >
          {hasMoods ? <MoodChart months={stats.months} tooltip={moodTip} /> : <p className="muted small">{t.stats.noMoods}</p>}
        </ChartCard>

        <ChartCard
          title={t.stats.wordsTitle}
          tooltip={wordsTip}
          table={{
            head: [t.stats.month, t.stats.wordsLabel, t.stats.entriesLabel],
            rows: stats.months.map((m) => [monthName(m.month), m.words, m.entries]),
          }}
        >
          <MonthlyColumns months={stats.months} tooltip={wordsTip} />
        </ChartCard>

        <ChartCard
          title={t.stats.tagsTitle}
          table={{ head: [t.stats.tag, t.stats.entriesLabel], rows: stats.tags.map(([tag, n]) => [`#${tag}`, n]) }}
        >
          <BarList rows={stats.tags.slice(0, 8).map(([tag, n]) => ({ label: `#${tag}`, value: n }))} empty={t.stats.noTags} />
        </ChartCard>

        <ChartCard
          title={t.stats.timeTitle}
          subtitle={t.stats.timeSubtitle}
          table={{ head: [t.stats.timeOfDay, t.stats.entriesLabel], rows: TIME_SLOTS.map((s) => [t.stats.slots[s], stats.timeOfDay[s]]) }}
        >
          <BarList rows={TIME_SLOTS.map((s) => ({ label: t.stats.slots[s], value: stats.timeOfDay[s] }))} empty={t.stats.noEntries} />
        </ChartCard>
      </div>
    </div>
  );
}
