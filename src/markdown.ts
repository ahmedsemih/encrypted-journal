/** Pure text transforms behind the editor toolbar and shortcuts. */

export type FormatKind =
  | "bold"
  | "italic"
  | "strike"
  | "heading"
  | "quote"
  | "bullet"
  | "numbered"
  | "task"
  | "code"
  | "codeblock"
  | "link"
  | "hr"
  | "table"
  | "indent"
  | "outdent";

interface FormatButton {
  kind: FormatKind | "separator";
  icon?: string;
  shortcut?: string;
}

export const FORMATS: FormatButton[] = [
  { kind: "heading", icon: "H" },
  { kind: "bold", icon: "B", shortcut: "b" },
  { kind: "italic", icon: "I", shortcut: "i" },
  { kind: "strike", icon: "S" },
  { kind: "separator" },
  { kind: "bullet", icon: "•" },
  { kind: "numbered", icon: "1." },
  { kind: "task", icon: "☐" },
  { kind: "quote", icon: "❝" },
  { kind: "separator" },
  { kind: "code", icon: "</>", shortcut: "e" },
  { kind: "codeblock", icon: "{ }" },
  { kind: "link", icon: "🔗", shortcut: "k" },
  { kind: "table", icon: "▦" },
  { kind: "hr", icon: "―" },
];

/** Localized text inserted when formatting without a selection. */
export interface Placeholders {
  bold: string;
  italic: string;
  strike: string;
  code: string;
  link: string;
  column: (n: number) => string;
}

export interface EditResult {
  text: string;
  selStart: number;
  selEnd: number;
}

const WRAPS: Partial<Record<FormatKind, [string, string, keyof Placeholders]>> = {
  bold: ["**", "**", "bold"],
  italic: ["_", "_", "italic"],
  strike: ["~~", "~~", "strike"],
  code: ["`", "`", "code"],
};

const PREFIXES: Partial<Record<FormatKind, string>> = {
  heading: "## ",
  quote: "> ",
  bullet: "- ",
  numbered: "1. ",
  task: "- [ ] ",
};

function lineBounds(text: string, start: number, end: number): [number, number] {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;
  return [lineStart, lineEnd];
}

function replaceLines(
  text: string,
  start: number,
  end: number,
  fn: (lines: string[]) => string[],
): EditResult {
  const [ls, le] = lineBounds(text, start, end);
  const replaced = fn(text.slice(ls, le).split("\n")).join("\n");
  return { text: text.slice(0, ls) + replaced + text.slice(le), selStart: ls, selEnd: ls + replaced.length };
}

function insert(text: string, start: number, end: number, snippet: string, selFrom: number, selTo: number): EditResult {
  return { text: text.slice(0, start) + snippet + text.slice(end), selStart: start + selFrom, selEnd: start + selTo };
}

export function applyFormat(
  text: string,
  start: number,
  end: number,
  kind: FormatKind,
  ph: Placeholders,
): EditResult {
  const selected = text.slice(start, end);

  const wrap = WRAPS[kind];
  if (wrap) {
    const [before, after, phKey] = wrap;
    // Toggle off when the selection is already wrapped.
    if (text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
      return {
        text: text.slice(0, start - before.length) + selected + text.slice(end + after.length),
        selStart: start - before.length,
        selEnd: end - before.length,
      };
    }
    const inner = selected || (ph[phKey] as string);
    return insert(text, start, end, before + inner + after, before.length, before.length + inner.length);
  }

  const prefix = PREFIXES[kind];
  if (prefix) {
    return replaceLines(text, start, end, (lines) => {
      const all = lines.every((l) => l.startsWith(prefix));
      return lines.map((l, i) => {
        if (all) return l.slice(prefix.length);
        const p = kind === "numbered" ? `${i + 1}. ` : prefix;
        return p + l.replace(/^(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+\. )/, "");
      });
    });
  }

  switch (kind) {
    case "indent":
      return replaceLines(text, start, end, (lines) => lines.map((l) => "  " + l));
    case "outdent":
      return replaceLines(text, start, end, (lines) => lines.map((l) => l.replace(/^ {1,2}|^\t/, "")));
    case "link": {
      const label = selected || ph.link;
      const snippet = `[${label}](https://)`;
      const urlStart = label.length + 3;
      return insert(text, start, end, snippet, urlStart, urlStart + "https://".length);
    }
    case "codeblock": {
      const inner = selected || ph.code;
      const lead = start > 0 && text[start - 1] !== "\n" ? "\n" : "";
      return insert(text, start, end, `${lead}\`\`\`\n${inner}\n\`\`\`\n`, lead.length + 4, lead.length + 4 + inner.length);
    }
    case "hr": {
      const snippet = "\n\n---\n\n";
      return insert(text, start, end, snippet, snippet.length, snippet.length);
    }
    case "table": {
      const [c1, c2] = [ph.column(1), ph.column(2)];
      const snippet = `\n| ${c1} | ${c2} |\n| --- | --- |\n| | |\n`;
      const at = snippet.indexOf(c1);
      return insert(text, start, end, snippet, at, at + c1.length);
    }
    default:
      return { text, selStart: start, selEnd: end };
  }
}

/** Continues (or ends, when empty) a list item on Enter. Returns null when not in a list. */
export function continueList(text: string, pos: number): EditResult | null {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const line = text.slice(lineStart, pos);
  const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)\. |> )/);
  if (!m) return null;
  const [whole, indent, marker, num] = m;

  if (line.length === whole.length) {
    // Empty item: remove the marker and stop the list.
    return { text: text.slice(0, lineStart) + text.slice(pos), selStart: lineStart, selEnd: lineStart };
  }
  let next = marker;
  if (num) next = `${Number(num) + 1}. `;
  else if (/\[[ xX]\]/.test(marker)) next = marker.replace(/\[[xX]\]/, "[ ]");
  const snippet = "\n" + indent + next;
  return { text: text.slice(0, pos) + snippet + text.slice(pos), selStart: pos + snippet.length, selEnd: pos + snippet.length };
}
