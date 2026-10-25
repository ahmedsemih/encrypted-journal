/** Maps the typography settings to the CSS variables read by the editor and preview. */
import type { CSSProperties } from "react";
import type { ContentFont, ContentWidth, LineSpacing, Settings } from "./types";

export const CONTENT_FONTS: ContentFont[] = ["serif", "sans", "mono"];
export const LINE_SPACINGS: LineSpacing[] = ["compact", "normal", "relaxed"];
export const CONTENT_WIDTHS: ContentWidth[] = ["narrow", "medium", "wide"];

const FONT_VARS: Record<ContentFont, string> = {
  serif: "var(--font-serif)",
  sans: "var(--font-ui)",
  mono: "var(--font-mono)",
};
const LINE_HEIGHTS: Record<LineSpacing, number> = { compact: 1.5, normal: 1.7, relaxed: 1.95 };
const WIDTHS: Record<ContentWidth, string> = { narrow: "620px", medium: "760px", wide: "100%" };

type TypographySettings = Pick<Settings, "fontSize" | "contentFont" | "lineSpacing" | "contentWidth">;

export function contentStyle(s: TypographySettings): CSSProperties {
  return {
    ["--editor-font-size" as string]: `${s.fontSize}px`,
    ["--content-font" as string]: FONT_VARS[s.contentFont] ?? FONT_VARS.serif,
    ["--content-line-height" as string]: LINE_HEIGHTS[s.lineSpacing] ?? LINE_HEIGHTS.normal,
    ["--content-width" as string]: WIDTHS[s.contentWidth] ?? WIDTHS.medium,
  };
}
