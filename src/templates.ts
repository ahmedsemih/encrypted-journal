import { parseISODate } from "./dates";
import type { Dict } from "./i18n";
import type { EntryTemplate, Settings, Template } from "./types";

export const PLACEHOLDERS = ["{{date}}", "{{weekday}}", "{{time}}"] as const;

/** Localized starter templates, used until the user edits the list. */
export function builtInTemplates(t: Dict): Template[] {
  return t.templates.builtIns.map((b, i) => ({ id: `builtin-${i}`, ...b, tags: [...b.tags] }));
}

export function templatesOf(settings: Settings, t: Dict): Template[] {
  return settings.templates ?? builtInTemplates(t);
}

/** Fills placeholders for an entry dated `date` (YYYY-MM-DD). */
export function instantiate(template: Template, date: string, locale: string): EntryTemplate {
  const day = parseISODate(date);
  const values: Record<(typeof PLACEHOLDERS)[number], string> = {
    "{{date}}": day.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }),
    "{{weekday}}": day.toLocaleDateString(locale, { weekday: "long" }),
    "{{time}}": new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
  };
  const fill = (text: string) => PLACEHOLDERS.reduce((s, p) => s.split(p).join(values[p]), text);
  return { title: fill(template.title), body: fill(template.body), tags: template.tags };
}

export function newTemplateId(): string {
  return crypto.randomUUID();
}
