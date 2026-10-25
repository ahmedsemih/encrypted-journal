/** Links between entries: `[text](entry:<uuid>)`, resolved by id so renames don't break them. */
import { fold } from "./text";
import type { EntryMeta } from "./types";

export const ENTRY_SCHEME = "entry:";
const LINK_ID = /entry:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

export function entryLink(label: string, id: string): string {
  return `[${label.replace(/([[\]\\])/g, "\\$1")}](${ENTRY_SCHEME}${id})`;
}

/** Ids linked from a body, in order of first appearance. */
export function outgoingIds(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(LINK_ID), (m) => m[1].toLowerCase()))];
}

/** Picker candidates: title or date contains the query; newest first (metas arrive sorted). */
export function linkCandidates(metas: EntryMeta[], query: string, exclude: string, limit = 8): EntryMeta[] {
  const q = fold(query.trim());
  return metas.filter((m) => m.id !== exclude && (!q || fold(`${m.title} ${m.date}`).includes(q))).slice(0, limit);
}
