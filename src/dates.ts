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
