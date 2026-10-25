/**
 * In-memory undo/redo per entry. Lives only while the journal is unlocked:
 * nothing is written to disk and everything is dropped on lock or exit.
 */
import type { EntryInput } from "./types";

const LIMIT = 300;
/** Keystrokes closer together than this form one undo step… */
const GROUP_GAP_MS = 1000;
/** …but a step never spans more than this. */
const GROUP_MAX_MS = 5000;

interface Stack {
  past: EntryInput[];
  future: EntryInput[];
  group: string | null;
  groupStart: number;
  lastAt: number;
}

const stacks = new Map<string, Stack>();

function stackFor(id: string): Stack {
  let s = stacks.get(id);
  if (!s) {
    s = { past: [], future: [], group: null, groupStart: 0, lastAt: 0 };
    stacks.set(id, s);
  }
  return s;
}

/**
 * Records `before` as an undo point. Consecutive edits with the same `group`
 * (e.g. typing in the body) are merged; `null` always starts a new step.
 */
export function record(id: string, before: EntryInput, group: string | null) {
  const s = stackFor(id);
  const now = Date.now();
  const continues =
    group !== null && s.group === group && now - s.lastAt < GROUP_GAP_MS && now - s.groupStart < GROUP_MAX_MS;
  if (!continues) {
    s.past.push(before);
    if (s.past.length > LIMIT) s.past.shift();
    s.groupStart = now;
  }
  s.group = group;
  s.lastAt = now;
  s.future = [];
}

export function undo(id: string, current: EntryInput): EntryInput | null {
  const s = stackFor(id);
  const prev = s.past.pop();
  if (!prev) return null;
  s.future.push(current);
  s.group = null;
  return prev;
}

export function redo(id: string, current: EntryInput): EntryInput | null {
  const s = stackFor(id);
  const next = s.future.pop();
  if (!next) return null;
  s.past.push(current);
  s.group = null;
  return next;
}

export function forget(id: string) {
  stacks.delete(id);
}

export function clearAll() {
  stacks.clear();
}
