import type { TechnicalDescriptionAnnotation } from "./types";

const COMMENT_TYPES = new Set([
  "Text", "FreeText", "Highlight", "Underline", "Squiggly", "StrikeOut",
  "Stamp", "Caret", "Ink", "Square", "Circle", "Polygon", "PolyLine", "Line"
]);

/** Keep PDF comments as source evidence, separate from the specification text. */
export function commentsFromPdfAnnotations(values: readonly unknown[]): TechnicalDescriptionAnnotation[] {
  const comments: TechnicalDescriptionAnnotation[] = [];
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!value || typeof value !== "object") continue;
    const annotation = value as {
      id?: unknown;
      subtype?: unknown;
      contentsObj?: { str?: unknown };
      rect?: unknown;
    };
    // Popup annotations repeat their parent's text. Links and form actions are
    // not comments and must never enter the requirement or matching text.
    if (typeof annotation.subtype !== "string" || !COMMENT_TYPES.has(annotation.subtype)) continue;
    const raw = annotation.contentsObj?.str;
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim();
    if (!text) continue;
    const id = typeof annotation.id === "string" ? annotation.id : `comment-${index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const rect = Array.isArray(annotation.rect) && annotation.rect.length === 4
      && annotation.rect.every(n => typeof n === "number" && Number.isFinite(n))
      ? annotation.rect as number[] : undefined;
    comments.push({ id, text, subtype: annotation.subtype, ...(rect ? { rect } : {}) });
  }
  return comments;
}
