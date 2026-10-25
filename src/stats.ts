/** Pure aggregations behind the statistics view. Everything runs on entry metadata. */
import { addDays, parseISODate, toISODate } from "./dates";
import type { EntryMeta } from "./types";

export const MOOD_ORDER = ["awful", "bad", "okay", "good", "great"] as const;
export type MoodId = (typeof MOOD_ORDER)[number];

export interface DayStat {
  date: string;
  entries: number;
  words: number;
}

export interface MonthStat {
  month: number; // 0-11
  entries: number;
  words: number;
  moods: Record<MoodId, number>;
}

export interface YearStats {
  entries: number;
  words: number;
  daysWritten: number;
  /** Days of the year so far (the whole year for past years). */
  daysElapsed: number;
  longestStreak: number;
  days: Map<string, DayStat>;
  months: MonthStat[];
  tags: [string, number][];
  timeOfDay: Record<TimeSlot, number>;
}

export const TIME_SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

function slotOf(hour: number): TimeSlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function emptyMoods(): Record<MoodId, number> {
  return { awful: 0, bad: 0, okay: 0, good: 0, great: 0 };
}

export function yearsOf(metas: EntryMeta[]): number[] {
  const years = new Set(metas.map((m) => Number(m.date.slice(0, 4))));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

export function longestStreak(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function computeYear(metas: EntryMeta[], year: number): YearStats {
  const prefix = `${year}-`;
  const inYear = metas.filter((m) => m.date.startsWith(prefix));
  const days = new Map<string, DayStat>();
  const months: MonthStat[] = Array.from({ length: 12 }, (_, month) => ({
    month,
    entries: 0,
    words: 0,
    moods: emptyMoods(),
  }));
  const tagCounts = new Map<string, number>();
  const timeOfDay: Record<TimeSlot, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  for (const m of inYear) {
    const day = days.get(m.date) ?? { date: m.date, entries: 0, words: 0 };
    day.entries++;
    day.words += m.wordCount;
    days.set(m.date, day);

    const month = months[Number(m.date.slice(5, 7)) - 1];
    month.entries++;
    month.words += m.wordCount;
    if (m.mood && m.mood in month.moods) month.moods[m.mood as MoodId]++;

    m.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1));

    const created = new Date(m.createdAt);
    if (!isNaN(created.getTime())) timeOfDay[slotOf(created.getHours())]++;
  }

  const now = new Date();
  const start = new Date(year, 0, 1);
  const end = year === now.getFullYear() ? now : new Date(year, 11, 31);
  const daysElapsed = year > now.getFullYear() ? 0 : Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  return {
    entries: inYear.length,
    words: inYear.reduce((n, m) => n + m.wordCount, 0),
    daysWritten: days.size,
    daysElapsed,
    longestStreak: longestStreak(days.keys()),
    days,
    months,
    tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    timeOfDay,
  };
}

/** Heatmap grid: Monday-first weeks covering the whole year. */
export function yearWeeks(year: number): (string | null)[][] {
  const first = new Date(year, 0, 1);
  const offset = (first.getDay() + 6) % 7;
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(offset).fill(null);
  for (let d = first; d.getFullYear() === year; d = parseISODate(addDays(toISODate(d), 1))) {
    week.push(toISODate(d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
}

/** Upper bounds of the 4 intensity bins, from quartiles of non-zero values. */
export function quartileBins(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return [1, 1, 1, 1];
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return [q(0.25), q(0.5), q(0.75), Infinity];
}

/** A "nice" axis maximum: 1, 2 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((m) => m * pow >= value) ?? 10) * pow;
}

export function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
