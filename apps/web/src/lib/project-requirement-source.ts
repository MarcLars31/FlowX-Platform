import { parseStructuredPostStart } from "@/modules/technical-description-extractor/document-parser";

export type ProjectRequirementSourceSection = {
  postNumber: string | null;
  relation: "current" | "inherited" | "context";
  text: string;
};

/** Presentation only: retain the saved specification and every source clause. */
export function projectRequirementSourceSections(
  specification: string,
  currentPostNumber: string | null
): ProjectRequirementSourceSection[] {
  return specification.split(/\r?\n\s*UNDERPOST\s*\r?\n/i).flatMap(raw => {
    const original = raw.trim();
    if (!original) return [];
    const lines = original.split(/\r?\n/).map(line => line.trim());
    const start = parseStructuredPostStart(lines, 0);
    const postNumber = start?.postNumber ?? null;
    const relation = postNumber && currentPostNumber
      ? postNumber === currentPostNumber ? "current"
        : currentPostNumber.startsWith(`${postNumber}.`) ? "inherited" : "context"
      : "context";

    // Only detach a leading identity from its text. Keep quantities, NS codes,
    // and prose verbatim; formats with a leading quantity use the raw fallback.
    const numberPrefix = /^(?:[A-Z]\d*\.)?\d+(?:\.\d+)*\.?(?=\s|$)\s*/i;
    if (start && numberPrefix.test(lines[0])) {
      const body = [...lines];
      body[0] = body[0].replace(numberPrefix, "").replace(/^[|)]{1,2}\s*/, "");
      if (start.consumedLineCount === 2) body[1] = body[1].replace(numberPrefix, "");
      return [{ postNumber, relation, text: body.join("\n").trim() }];
    }
    return [{ postNumber, relation, text: original }];
  });
}
