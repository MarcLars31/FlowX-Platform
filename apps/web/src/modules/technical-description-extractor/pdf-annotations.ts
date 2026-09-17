import type { TechnicalDescriptionAnnotation } from "./types";

const COMMENT_TYPES = new Set([
  "Text", "FreeText", "Highlight", "Underline", "Squiggly", "StrikeOut",
  "Stamp", "Caret", "Ink", "Square", "Circle", "Polygon", "PolyLine", "Line"
]);

/** Keep PDF comments as source evidence, separate from the specification text. */
export function commentsFromPdfAnnotations(values: readonly unknown[], textItems: readonly unknown[] = []): TechnicalDescriptionAnnotation[] {
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
  const posts = positionedPosts(textItems);
  return comments.map(comment => {
    if (!comment.rect) return comment;
    // The note icon rises above its anchor; its centre can fall into the
    // previous compact row. Use the lower edge in PDF's bottom-up coordinates.
    const y = Math.min(comment.rect[1], comment.rect[3]) + 3;
    const post = posts.find((post, index) => y <= post.y + 5
      && (index === posts.length - 1 || y > posts[index + 1].y + 5)
      && comment.rect![0] > post.x + 40);
    return post ? { ...comment, postNumber: post.number } : comment;
  });
}

function positionedPosts(values: readonly unknown[]) {
  const items = values.flatMap(value => {
    const item = value as { str?: unknown; transform?: unknown } | null;
    if (!item || typeof item.str !== "string" || !Array.isArray(item.transform)
      || !/^\.?\d+(?:\.\d+)+\.?$/.test(item.str.trim())) return [];
    const x = Number(item.transform[4]); const y = Number(item.transform[5]);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ number: item.str.trim(), x, y }] : [];
  });
  const left = Math.min(...items.map(item => item.x));
  const column = items.filter(item => Math.abs(item.x - left) < 4).sort((a, b) => b.y - a.y);
  const posts: typeof column = [];
  for (let index = 0; index < column.length; index += 1) {
    const item = column[index]; const next = column[index + 1];
    const stem = item.number.split(".").slice(0, 2).join(".");
    if (next && item.y - next.y > 3 && item.y - next.y < 18
      && !next.number.startsWith(`${stem}.`)
      && (item.number.endsWith(".") || next.number.startsWith(".") || item.number.split(".").length >= 4)) {
      posts.push({ ...item, number: `${item.number.replace(/\.$/, next.number.startsWith(".") ? "" : ".")}${next.number}` });
      index += 1;
    } else posts.push(item);
  }
  return posts;
}
