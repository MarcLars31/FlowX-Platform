import type { TechnicalDescriptionMaterialLine } from "@/modules/technical-description-extractor/types";
import { groupProductsByMainPost, isSourceChapter, resolvePostParents } from "./project-post-hierarchy";
import { productPostMeasurement } from "./project-requirement-views";

/** Use the saved-project resolver. OCR identities may form provisional display
 * groups; the original flags remain intact and no assignment is made here. */
export function localPdfPosts(lines: readonly TechnicalDescriptionMaterialLine[]) {
  const referencedSources = new Set(lines.flatMap(line => line.parentSourcePostId ? [line.parentSourcePostId] : []));
  const byId = new Map(lines.map(line => [line.id, line]));
  const rows = lines.map(line => ({ id: line.id, value_text: line.description, source_page: line.sourcePage,
    source_document_id: "local-pdf", value_json: { ...line, sourcePostId: line.id,
      // Every OCR row carries this broad coverage flag. An explicit source ID
      // still gives us a provisional parent; text-only guesses remain unresolved.
      reviewFlags: line.parentSourcePostId || referencedSources.has(line.id)
        ? line.reviewFlags.filter(flag => flag !== "unverified-post-source") : line.reviewFlags } }));
  const graph = resolvePostParents(rows);
  const parents = new Set(graph.parents.values());
  const productIds = new Set(rows.filter(row => !isSourceChapter(row) && (productPostMeasurement(row).visible
    || graph.parents.has(row.id) && !parents.has(row.id) && !graph.unresolved.has(row.id))).map(row => row.id));
  return {
    products: lines.filter(line => productIds.has(line.id)),
    groups: groupProductsByMainPost(rows, productIds).map(group => ({ ...group,
      review: group.review || [group.sourceId, ...group.requirementIds].some(id => id && byId.get(id)?.reviewFlags.includes("unverified-post-source"))
    })),
    sourceRows: lines.filter(line => !productIds.has(line.id))
  };
}
