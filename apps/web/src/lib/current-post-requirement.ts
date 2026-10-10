type Row = Record<string, unknown>;

const boundary = /\n\s*UNDERPOST\s*\n/i;
const metadata = /^(?:kapittel|kapittelpost|chapter|chapterpost)$/;
const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/[\s_–—-]+/g, " ").trim();

/** A read-only view of the saved post. Ancestors stay in the extraction and
 * navigation, but never become this product's fields, prose or search terms. */
export function currentPostRequirement<T extends Row>(requirement: T): T {
  const value = record(requirement.value_json);
  const post = text(value.postNumber);
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
  const standardRefs = Array.isArray(value.standardRefs) ? value.standardRefs.filter(ref =>
    !foreign || normalized(ownText).replace(/\W/g, "").includes(normalized(ref).replace(/\W/g, ""))) : [];
  const inheritedCode = foreign && text(value.nsCode) && !normalized(ownText).includes(normalized(value.nsCode));
  return {
    ...requirement,
    ...(inheritedCode && requirement.requirement_key === value.nsCode ? { requirement_key: null } : {}),
    source_excerpt: source || ownSpecification,
    value_json: {
      ...value, attributes,
      attributeSources: Object.fromEntries(Object.entries(origins).filter(([key]) => Object.hasOwn(attributes, key))),
      sourceText: source || ownSpecification, technicalSpecification: ownSpecification,
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
function leadingPost(source: string) {
  const split = source.trim().match(/^(\d+(?:\.\d+)+)\.\s+(\d+(?:\.\d+)*)\b/);
  return split ? `${split[1]}.${split[2]}` : source.trim().match(/^(\d+(?:\.\d+)+)\b/)?.[1];
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
