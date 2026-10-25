/** Local-time YYYY-MM-DD (never UTC, which would shift the day). */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatLong(s: string, locale: string): string {
  return parseISODate(s).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShort(s: string, locale: string): string {
  return parseISODate(s).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Consecutive days with at least one entry, ending today (or yesterday). */
export function currentStreak(dates: Set<string>): number {
  let day = today();
  if (!dates.has(day)) day = addDays(day, -1);
  let streak = 0;
  while (dates.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** Items from earlier years on the same month and day; Feb 29 ones show on Feb 28 in common years. */
export function onThisDay<T extends { date: string }>(items: T[], day = today()): T[] {
  const md = day.slice(5);
  const leap = new Date(Number(day.slice(0, 4)), 1, 29).getMonth() === 1;
  const matches = (d: string) => d.slice(5) === md || (!leap && md === "02-28" && d.slice(5) === "02-29");
  return items.filter((m) => m.date < day && matches(m.date));
}

export type DateQuery = { kind: "day"; day: string } | { kind: "month"; from: string; to: string };

/**
 * Reads a date out of free text: `2025-10-25`, `25.10.2025`, `25/10`, a relative
 * word ("today"/"yesterday" in either language) or a month name with a year.
 */
export function parseDateQuery(
  input: string,
  locale: string,
  words: { today: string[]; yesterday: string[] },
): DateQuery | null {
  const q = input.trim().toLocaleLowerCase(locale);
  if (!q) return null;
  if (words.today.includes(q)) return { kind: "day", day: today() };
  if (words.yesterday.includes(q)) return { kind: "day", day: addDays(today(), -1) };

  const valid = (y: number, m: number, d: number) => {
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? toISODate(date) : null;
  };
  const asDay = (day: string | null): DateQuery | null => (day ? { kind: "day", day } : null);

  let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return asDay(valid(+m[1], +m[2], +m[3]));
  m = q.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/);
  if (m) return asDay(valid(m[3] ? +m[3] : new Date().getFullYear(), +m[2], +m[1]));

  m = q.match(/^(\p{L}{3,})\s+(\d{4})$/u);
  if (!m) return null;
  const [, name, yearText] = m;
  const month = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale, { month: "long" }).toLocaleLowerCase(locale),
  ).findIndex((full) => full.startsWith(name));
  if (month < 0) return null;
  const year = +yearText;
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month + 1, 0).getDate();
  return { kind: "month", from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` };
}
