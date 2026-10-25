/** Entry list filters. Full-text search runs in the backend; everything else here, on metadata. */
import { addDays, today } from "./dates";
import type { EntryMeta, SearchHit } from "./types";

export interface Filters {
  query: string;
  /** A single day picked on the calendar. */
  day: string | null;
  from: string | null;
  to: string | null;
  /** Entries must carry every one of these tags. */
  tags: string[];
  /** Entries must have one of these moods. */
  moods: string[];
  favorites: boolean;
}

export const NO_FILTERS: Filters = {
  query: "",
  day: null,
  from: null,
  to: null,
  tags: [],
  moods: [],
  favorites: false,
};

/** Filters other than the search text are active. */
export function hasFilters(f: Filters): boolean {
  return Boolean(f.day || f.from || f.to || f.tags.length || f.moods.length || f.favorites);
}

export function applyFilters(metas: EntryMeta[], f: Filters, hits: Map<string, SearchHit> | null): EntryMeta[] {
  return metas.filter(
    (m) =>
      (!f.favorites || m.favorite) &&
      (!f.day || m.date === f.day) &&
      (!f.from || m.date >= f.from) &&
      (!f.to || m.date <= f.to) &&
      f.tags.every((tag) => m.tags.includes(tag)) &&
      (!f.moods.length || (m.mood !== null && f.moods.includes(m.mood))) &&
      (!hits || hits.has(m.id)),
  );
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export const DATE_PRESETS = ["last7", "last30", "thisYear", "lastYear"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export function presetRange(preset: DatePreset): { from: string; to: string } {
  const now = today();
  const year = Number(now.slice(0, 4));
  switch (preset) {
    case "last7":
      return { from: addDays(now, -6), to: now };
    case "last30":
      return { from: addDays(now, -29), to: now };
    case "thisYear":
      return { from: `${year}-01-01`, to: now };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  }
}
