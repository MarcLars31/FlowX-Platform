import { projectPostSourceStart } from "./project-requirement-source";
import { captureInheritedProductRequirements } from "./inherited-product-requirements";
import { normalizeOcrDnTokens, repairedOcrPostAttributes, withoutPdfHeaderContinuations, withoutPdfPageSumFooters } from "./pdf-post-text";

type Row = Record<string, unknown>;

const boundary = /\n\s*UNDERPOST\s*\n/i;
const metadata = /^(?:kapittel|kapittelpost|chapter|chapterpost)$/;
const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/[\s_–—-]+/g, " ").trim();

/** A read-only view of the post's own PDF fields. Proven parent product
 * requirements stay separate and are resolved explicitly for search/evaluation. */
export function currentPostRequirement<T extends Row>(requirement: T): T {
  const inheritedProductRequirements = captureInheritedProductRequirements(requirement);
  const value = record(requirement.value_json);
  const post = text(value.postNumber);
  const leadingPost = (source: string) => projectPostSourceStart(source.trim().split(/\r?\n/).map(line => line.trim()), post)?.postNumber;
  const origins = record(value.attributeSources);
  const specification = text(value.technicalSpecification);
  const parts = specification.split(boundary);
  const ownPart = (source: string) => {
    const sections = source.split(boundary);
    if (sections.length === 1) return post && leadingPost(source) && leadingPost(source) !== post ? "" : source;
    // The extractor appends each descendant after UNDERPOST. Retain the whole
    // current block, including its continuation pages and internal references.
    const match = sections.find(section => post && leadingPost(section) === post);
    if (match) return match.trim();
    const last = sections.at(-1)!.trim();
    return post && leadingPost(last) && leadingPost(last) !== post ? "" : last;
  };
  const source = [text(value.sourceText), text(requirement.source_excerpt), specification].map(ownPart).find(Boolean) ?? "";
  const foreign = parts.length > 1 || Boolean(post && leadingPost(specification) && leadingPost(specification) !== post)
    || Object.values(origins).some(origin => text(record(origin).postNumber) && text(record(origin).postNumber) !== post);
  const ownSpecification = parts.length > 1 ? ownPart(specification) || source
    : foreign && leadingPost(specification) !== post ? source || ownPart(specification) : specification || source;
  const ownText = [ownSpecification, source, text(requirement.value_text)].filter(Boolean).join("\n");
  const ancestors = parts.filter(part => foreign && part.trim() !== ownSpecification.trim()).join("\n");
  // Keep numbered ancestor text available for the PDF view across repeated
  // projections. It remains separate from this post's own fields and quantity.
  const inheritedSpecification = text(value.inheritedSpecification) || parts.filter(part => {
    const ancestor = leadingPost(part);
    return ancestor && post.startsWith(ancestor + ".");
  }).join("\n\nUNDERPOST\n");
  const sourceUnassignedReadings = [...new Set([
    ...(Array.isArray(value.sourceUnassignedReadings) ? value.sourceUnassignedReadings.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []),
    ...[text(value.sourceText), text(requirement.source_excerpt), specification].flatMap(source => source.split(boundary))
      .map(part => part.trim()).filter(part => {
        const identity = leadingPost(part);
        return identity && identity !== post && !post.startsWith(identity + ".");
      })
  ])];
  const ownLabels = labels(ownText);
  const ancestorLabels = labels(ancestors);
  const attributes = Object.fromEntries(Object.entries(record(value.attributes)).filter(([key, raw]) => {
    const label = normalized(key);
    if (metadata.test(label)) return false;
    const origin = text(record(origins[key]).postNumber);
    if (origin && post && origin !== post) return false;
    if (origin && origin === post) return true;
    // Legacy snapshots have no per-field origins. A field found only in an
    // ancestor must not be promoted to an own field during a read.
    if (ancestorLabels.has(label) && !ownLabels.has(label)) return false;
    if (label === "generelle krav" && !ownLabels.has(label)) return false;
    if (foreign && source && !ownLabels.has(label) && !normalized(ownText).includes(normalized(raw))
      && (normalized(ancestors).includes(normalized(raw)) || /^(?:dimensjon|dimension)(?:\s|$)/.test(label))) return false;
    return true;
  }));
  const repairOcr = !requirement.reviewed_at && !requirement.reviewed_by
    && (!requirement.status || /^(?:extracted|inferred)_unreviewed$/.test(String(requirement.status)))
    && Array.isArray(value.reviewFlags) && value.reviewFlags.includes("ocr-source");
  const canonicalText = (source: string) => {
    const body = withoutPdfPageSumFooters(withoutPdfHeaderContinuations(source));
    return repairOcr ? normalizeOcrDnTokens(body) : body;
  };
  const canonicalAttributes = repairOcr ? repairedOcrPostAttributes(attributes, ownText) : attributes;
  const standardRefs = Array.isArray(value.standardRefs) ? value.standardRefs.filter(ref =>
    !foreign || normalized(ownText).replace(/\W/g, "").includes(normalized(ref).replace(/\W/g, ""))) : [];
  const inheritedCode = foreign && text(value.nsCode) && !normalized(ownText).includes(normalized(value.nsCode));
  return {
    ...requirement,
    ...(inheritedCode && requirement.requirement_key === value.nsCode ? { requirement_key: null } : {}),
    ...(repairOcr && typeof requirement.value_text === "string" ? { value_text: canonicalText(requirement.value_text) } : {}),
    source_excerpt: canonicalText(source || ownSpecification),
    value_json: {
      ...value, attributes: canonicalAttributes,
      ...(sourceUnassignedReadings.length ? { sourceUnassignedReadings } : {}),
      ...(inheritedProductRequirements ? { inheritedProductRequirements } : {}),
      ...(inheritedSpecification ? { inheritedSpecification: canonicalText(inheritedSpecification) } : {}),
      ...(repairOcr && typeof value.description === "string" ? { description: canonicalText(value.description) } : {}),
      attributeSources: Object.fromEntries(Object.entries(origins).filter(([key]) => Object.hasOwn(attributes, key))),
      sourceText: canonicalText(source || ownSpecification), technicalSpecification: canonicalText(ownSpecification),
      standardRefs,
      ...(inheritedCode ? { nsCode: null } : {}),
      // Parent identity remains available for the expandable post list only.
      parentDescription: null,
      ...(foreign && !normalized(ownText).includes(normalized(value.system)) ? { system: null } : {})
    }
  };
}

function labels(source: string) {
  return new Set([...source.matchAll(/^([^:\n]{1,100}):/gm)].map(match => normalized(match[1])));
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
