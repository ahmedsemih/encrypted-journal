import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../api";
import { formatShort, parseDateQuery } from "../dates";
import type { Filters } from "../filters";
import { useI18n } from "../i18n";
import { fold } from "../text";
import { moodEmoji, type EntryMeta, type SearchHit, type Template } from "../types";
import type { Section } from "./Journal";
import type { Tab as SettingsTab } from "./SettingsModal";

export interface PaletteActions {
  openEntry: (id: string) => void;
  openTrashEntry: (id: string) => void;
  /** Shows the entry list with exactly these filters. */
  filter: (filters: Partial<Filters>) => void;
  newEntry: (templateId?: string | null) => void;
  section: (section: Section) => void;
  settings: (tab: SettingsTab) => void;
  focus: () => void;
  fullscreen: () => void;
  backup: (() => void) | null;
  lock: () => void;
}

interface Props {
  metas: EntryMeta[];
  trash: EntryMeta[];
  tags: [string, number][];
  templates: Template[];
  actions: PaletteActions;
  onClose: () => void;
}

type Group = "dates" | "recent" | "entries" | "tags" | "commands" | "trash";
const GROUP_ORDER: Group[] = ["dates", "recent", "entries", "tags", "commands", "trash"];
const MAX_ENTRIES = 8;
const MAX_TRASH = 4;
const MAX_TAGS = 6;
const SEARCH_DELAY_MS = 120;

interface Item {
  key: string;
  group: Group;
  icon: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  hint?: string;
  run: () => void;
}

function Snippet({ hit }: { hit: SearchHit | undefined }) {
  if (!hit?.snippet.length) return null;
  return <>{hit.snippet.map(([text, match], i) => (match ? <mark key={i}>{text}</mark> : text))}</>;
}

/** Ctrl+P: one box that searches entries, the trash, tags, dates and commands. */
export function CommandPalette({ metas, trash, tags, templates, actions, onClose }: Props) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; journal: SearchHit[]; trash: SearchHit[] }>({
    query: "",
    journal: [],
    trash: [],
  });
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([api.searchEntries(q), api.searchEntries(q, true)]).then(
        ([journal, trashed]) => !cancelled && setHits({ query: q, journal, trash: trashed }),
        () => {},
      );
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const items = useMemo(() => {
    const out: Item[] = [];
    const fq = fold(q);
    const run = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const entryItem = (m: EntryMeta, group: Group, hit?: SearchHit, open = actions.openEntry): Item => ({
      key: `${group}-${m.id}`,
      group,
      icon: moodEmoji(m.mood) ?? "📄",
      label: m.title || <span className="muted">{t.untitled}</span>,
      detail: hit?.snippet.length ? <Snippet hit={hit} /> : undefined,
      hint: formatShort(m.date, locale),
      run: run(() => open(m.id)),
    });

    // Dates typed as text.
    const date = parseDateQuery(q, locale, t.palette.dateWords);
    if (date?.kind === "day") {
      const count = metas.filter((m) => m.date === date.day).length;
      out.push({
        key: "date",
        group: "dates",
        icon: "📅",
        label: t.palette.goToDay(formatShort(date.day, locale)),
        hint: t.palette.entryCount(count),
        run: run(() => actions.filter({ day: date.day })),
      });
    } else if (date?.kind === "month") {
      out.push({
        key: "month",
        group: "dates",
        icon: "📅",
        label: t.palette.goToRange(`${formatShort(date.from, locale)} – ${formatShort(date.to, locale)}`),
        run: run(() => actions.filter({ from: date.from, to: date.to })),
      });
    }

    if (!q) {
      [...metas]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5)
        .forEach((m) => out.push(entryItem(m, "recent")));
    } else if (hits.query === q) {
      // Title matches first, then newest.
      const byId = new Map(hits.journal.map((h) => [h.id, h]));
      const found = metas.filter((m) => byId.has(m.id));
      const inTitle = (m: EntryMeta) => fold(m.title).includes(fq);
      found.sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)));
      found.slice(0, MAX_ENTRIES).forEach((m) => out.push(entryItem(m, "entries", byId.get(m.id))));
      if (found.length > MAX_ENTRIES) {
        out.push({
          key: "all-results",
          group: "entries",
          icon: "≡",
          label: t.palette.showAll(found.length),
          run: run(() => actions.filter({ query: q })),
        });
      }
      const trashById = new Map(hits.trash.map((h) => [h.id, h]));
      trash
        .filter((m) => trashById.has(m.id))
        .slice(0, MAX_TRASH)
        .forEach((m) => out.push(entryItem(m, "trash", trashById.get(m.id), actions.openTrashEntry)));
    }

    if (q) {
      const tagQuery = fq.replace(/^#/, "");
      tags
        .filter(([tag]) => fold(tag).includes(tagQuery))
        .slice(0, MAX_TAGS)
        .forEach(([tag, n]) =>
          out.push({
            key: `tag-${tag}`,
            group: "tags",
            icon: "#",
            label: tag,
            hint: String(n),
            run: run(() => actions.filter({ tags: [tag] })),
          }),
        );
    }

    const c = t.palette.commands;
    const commands: Omit<Item, "group">[] = [
      { key: "new", icon: "✎", label: c.newEntry, hint: "Ctrl+N", run: run(() => actions.newEntry()) },
      ...templates.map((tpl) => ({
        key: `tpl-${tpl.id}`,
        icon: "✎",
        label: c.newFromTemplate(tpl.name || t.untitled),
        run: run(() => actions.newEntry(tpl.id)),
      })),
      { key: "all", icon: "📚", label: c.allEntries, run: run(() => actions.filter({})) },
      { key: "favorites", icon: "★", label: c.favorites, run: run(() => actions.filter({ favorites: true })) },
      { key: "stats", icon: "📊", label: c.stats, run: run(() => actions.section("stats")) },
      { key: "trash", icon: "🗑", label: c.trash, run: run(() => actions.section("trash")) },
      { key: "focus", icon: "⛶", label: c.focus, hint: "Ctrl+Shift+F", run: run(actions.focus) },
      { key: "fullscreen", icon: "⤢", label: c.fullscreen, hint: "F11", run: run(actions.fullscreen) },
      { key: "settings", icon: "⚙", label: c.settings, hint: "Ctrl+,", run: run(() => actions.settings("appearance")) },
      { key: "templates", icon: "🗂", label: c.templates, run: run(() => actions.settings("templates")) },
      { key: "security", icon: "🛡", label: c.security, run: run(() => actions.settings("security")) },
      ...(actions.backup ? [{ key: "backup", icon: "💾", label: c.backup, run: run(actions.backup) }] : []),
      { key: "lock", icon: "🔒", label: c.lock, hint: "Ctrl+L", run: run(actions.lock) },
    ];
    commands
      .filter((cmd) => !q || fold(String(cmd.label)).includes(fq))
      .forEach((cmd) => out.push({ ...cmd, group: "commands" }));

    // "#tag" asks for tags, so they come first.
    const order: Group[] = q.startsWith("#") ? ["tags", ...GROUP_ORDER.filter((g) => g !== "tags")] : GROUP_ORDER;
    return order.flatMap((g) => out.filter((item) => item.group === g));
  }, [q, hits, metas, trash, tags, templates, actions, onClose, t, locale]);

  useEffect(() => setActive(0), [q, hits]);
  useEffect(() => {
    listRef.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const searching = Boolean(q) && hits.query !== q;

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={t.palette.title}>
        <input
          autoFocus
          className="palette-input"
          placeholder={t.palette.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
        />
        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {items.map((item, i) => (
            <div key={item.key}>
              {(i === 0 || items[i - 1].group !== item.group) && (
                <h4 className="palette-group">{t.palette.groups[item.group]}</h4>
              )}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`palette-item ${i === active ? "active" : ""}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={item.run}
              >
                <span className="palette-icon">{item.icon}</span>
                <span className="palette-text">
                  <span className="palette-label">{item.label}</span>
                  {item.detail && <span className="palette-detail snippet">{item.detail}</span>}
                </span>
                {item.hint && <span className="palette-hint">{item.hint}</span>}
              </button>
            </div>
          ))}
          {!items.length && !searching && <p className="muted center pad">{t.palette.noResults}</p>}
          {searching && !items.some((i) => i.group === "entries") && <p className="muted pad">{t.palette.searching}</p>}
        </div>
        <div className="palette-footer muted">{t.palette.keys}</div>
      </div>
    </div>
  );
}
