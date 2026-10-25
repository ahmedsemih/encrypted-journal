/** Caret geometry for a <textarea>, measured with an off-screen mirror element. */

const COPIED = [
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "fontFeatureSettings",
  "fontVariationSettings",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "textIndent",
  "textTransform",
  "tabSize",
] as const;

export interface CaretRect {
  top: number;
  left: number;
  height: number;
}

/** The caret's box relative to the textarea's border box, ignoring scrolling. */
export function caretRect(ta: HTMLTextAreaElement): CaretRect {
  const style = getComputedStyle(ta);
  const mirror = document.createElement("div");
  for (const prop of COPIED) mirror.style[prop] = style[prop];
  Object.assign(mirror.style, {
    position: "absolute",
    top: "0",
    left: "-99999px",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    // clientWidth leaves out the scrollbar, which also narrows the text.
    width: `${ta.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`,
  });
  mirror.textContent = ta.value.slice(0, ta.selectionEnd);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.append(marker);
  document.body.append(mirror);
  const rect = { top: marker.offsetTop, left: marker.offsetLeft, height: marker.offsetHeight };
  mirror.remove();
  return rect;
}

/** Scrolls so the caret line sits in the vertical middle of the textarea. */
export function centerCaret(ta: HTMLTextAreaElement) {
  const caret = caretRect(ta);
  ta.scrollTop = caret.top + caret.height / 2 - ta.clientHeight / 2;
}
