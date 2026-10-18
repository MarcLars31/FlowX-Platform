import { extractPostScope, normalizedPageLines, tableDescription } from "./document-parser";
import { pagePostInventory } from "./post-inventory";
import type { TechnicalDescriptionMaterialLine, TechnicalDescriptionPage, TechnicalDescriptionWarning } from "./types";

export type PostCoverageCheck = {
  sourcePage: number;
  method: "column" | "text";
  status: "checked" | "requires_review";
  observedPostNumbers: string[];
  representedPostNumbers: string[];
  recoveredPostNumbers: string[];
  unresolvedPostNumbers: string[];
};

/** A source occurrence needs its own post on that page. Mentions in another
 * post, inherited specifications and an equal number elsewhere do not count.
 * Repeated labels on continuation pages can be covered by the same saved post. */
export function reconcileSourcePosts(pages: TechnicalDescriptionPage[], lines: TechnicalDescriptionMaterialLine[], warnings: TechnicalDescriptionWarning[]): PostCoverageCheck[] {
  return pages.map(page => {
    const inventory = pagePostInventory(page);
    const used = new Set<TechnicalDescriptionMaterialLine>();
    const recovered: string[] = [], represented: string[] = [];
    for (const [index, post] of inventory.posts.entries()) {
      let line = lines.find(line => !used.has(line) && line.postNumber === post.postNumber
        && (line.sourcePages ?? [line.sourcePage]).includes(page.pageNumber));
      if (!line) {
        const body = normalizedPageLines(post.sourceText);
        const own = body[0]?.replace(new RegExp(`^${post.postNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?\\s*`), "");
        const description = tableDescription([...(own ? [own] : []), ...body.slice(1)]);
        line = {
          id: `technical-source-${page.pageNumber}-${index + 1}`,
          postNumber: post.postNumber, postScope: extractPostScope(normalizedPageLines(page.text)),
          description: description.description || description.nsCode || `PDF-post ${post.postNumber}`,
          nsCode: description.nsCode, category: "unknown", operation: "unknown",
          attributes: {}, standardRefs: [], sourcePage: page.pageNumber, sourcePages: [page.pageNumber],
          sourceText: post.sourceText || post.postNumber, technicalSpecification: post.sourceText || post.postNumber,
          confidence: Math.min(page.confidence, .5),
          reviewFlags: ["project-information", "recovered-source-post", ...(page.method === "ocr" ? ["ocr-source"] : [])]
        };
        lines.push(line);
        recovered.push(post.postNumber);
      }
      used.add(line);
      represented.push(post.postNumber);
    }
    const unverified = page.status === "partial" || page.status === "failed" || Boolean(page.ocrReason)
      || page.method === "ocr" || inventory.method === "text";
    // Every uncertain source remains visible, including extra parser rows
    // that cannot be located in the independent physical-column inventory.
    const extra = lines.filter(line => line.sourcePage === page.pageNumber && line.postNumber && !used.has(line));
    for (const line of [...(unverified ? used : []), ...extra]) {
      line.reviewFlags = [...new Set([...line.reviewFlags, "unverified-post-source"])];
    }
    if (recovered.length) warnings.push({ id: `recovered-posts-${page.pageNumber}`, code: "SOURCE_POSTS_RECOVERED", sourcePage: page.pageNumber,
      message: `Sida ${page.pageNumber}: ${recovered.length} post(er) återställdes från källan och visas för granskning: ${recovered.slice(0, 20).join(", ")}.`, severity: "warning" });
    if (unverified || extra.length) warnings.push({ id: `post-inventory-${page.pageNumber}`, code: "POST_INVENTORY_UNVERIFIED", sourcePage: page.pageNumber,
      message: `Sida ${page.pageNumber}: identifierade postnummer har stämts av, men sidans fullständiga postkolumn kunde inte verifieras. Kontrollera original-PDF:n.`, severity: "warning" });
    const remaining = [...used];
    const unresolved = inventory.posts.filter(post => {
      const index = remaining.findIndex(line => line.postNumber === post.postNumber
        && (line.sourcePages ?? [line.sourcePage]).includes(page.pageNumber));
      if (index < 0) return true;
      remaining.splice(index, 1);
      return false;
    }).map(post => post.postNumber);
    return { sourcePage: page.pageNumber, method: inventory.method, status: recovered.length || unverified || extra.length || unresolved.length ? "requires_review" : "checked",
      observedPostNumbers: inventory.posts.map(post => post.postNumber), representedPostNumbers: represented,
      recoveredPostNumbers: recovered, unresolvedPostNumbers: unresolved };
  });
}
