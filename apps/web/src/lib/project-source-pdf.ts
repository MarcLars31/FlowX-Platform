type Row = Record<string, unknown> & { id: string };

export type ProjectSourcePdfLookup = {
  projectDocumentIds: readonly string[];
  unavailableDocumentIds?: readonly string[];
  byTechnicalDescriptionId: Readonly<Record<string, string | null>>;
  fallbackDocumentId: string | null;
};

export function buildProjectSourcePdfLookup(
  projectDocuments: readonly Row[],
  technicalDescriptions: readonly Row[]
): ProjectSourcePdfLookup {
  const usableDocuments = projectDocuments.filter((document) => isUuid(document.id) && document.storage_path !== null);
  const documentsByHash = firstByKey(usableDocuments, documentHash);
  const documentsByName = uniqueByKey(usableDocuments, documentName);
  const technicalProjectDocuments = usableDocuments.filter(
    (document) => String(document.document_type ?? "").trim().toLowerCase() === "technical_description"
  );
  const fallbackDocumentId = technicalProjectDocuments.length === 1
    ? technicalProjectDocuments[0].id
    : null;
  const byTechnicalDescriptionId: Record<string, string | null> = {};

  for (const technicalDescription of technicalDescriptions) {
    if (!isUuid(technicalDescription.id)) continue;
    const hash = documentHash(technicalDescription);
    const name = documentName(technicalDescription);
    const matchingDocument = hash
      ? documentsByHash.get(hash)
      : name
        ? documentsByName.get(name)
        : undefined;
    byTechnicalDescriptionId[technicalDescription.id] = matchingDocument?.id
      ?? (!hash && !name ? fallbackDocumentId : null);
  }

  return {
    projectDocumentIds: usableDocuments.map((document) => document.id),
    unavailableDocumentIds: projectDocuments.filter(document => document.storage_path === null).map(document => document.id),
    byTechnicalDescriptionId,
    fallbackDocumentId
  };
}

export function projectRequirementSourcePdfHref(
  projectId: string,
  requirement: Row,
  lookup: ProjectSourcePdfLookup
) {
  if (!isUuid(projectId)) return null;
  const availableDocumentIds = new Set(lookup.projectDocumentIds);
  const directDocumentId = stringValue(requirement.source_document_id);
  if (directDocumentId && lookup.unavailableDocumentIds?.includes(directDocumentId)) return null;
  const technicalDescriptionId = stringValue(
    requirement.source_technical_description_document_id
  );
  const hasTechnicalDescriptionMatch = Boolean(
    technicalDescriptionId
      && Object.prototype.hasOwnProperty.call(
        lookup.byTechnicalDescriptionId,
        technicalDescriptionId
      )
  );
  const documentId = directDocumentId && availableDocumentIds.has(directDocumentId)
    ? directDocumentId
    : technicalDescriptionId
      ? hasTechnicalDescriptionMatch
        ? lookup.byTechnicalDescriptionId[technicalDescriptionId]
        : lookup.fallbackDocumentId
      : lookup.fallbackDocumentId;
  if (!documentId || !availableDocumentIds.has(documentId)) return null;

  const page = positiveInteger(requirement.source_page);
  const fileUrl = `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/file`;
  return page ? `${fileUrl}#page=${page}` : fileUrl;
}

function firstByKey(items: readonly Row[], keyForItem: (item: Row) => string | null) {
  const output = new Map<string, Row>();
  for (const item of items) {
    const key = keyForItem(item);
    if (key && !output.has(key)) output.set(key, item);
  }
  return output;
}

function uniqueByKey(items: readonly Row[], keyForItem: (item: Row) => string | null) {
  const output = new Map<string, Row>();
  const duplicateKeys = new Set<string>();
  for (const item of items) {
    const key = keyForItem(item);
    if (!key || duplicateKeys.has(key)) continue;
    if (output.has(key)) {
      output.delete(key);
      duplicateKeys.add(key);
    } else {
      output.set(key, item);
    }
  }
  return output;
}

function documentHash(document: Row) {
  return normalized(document.file_sha256 ?? document.checksum);
}

function documentName(document: Row) {
  return normalized(document.file_name ?? document.fileName ?? document.original_filename);
}

function normalized(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLocaleLowerCase()
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Locate the selected post without confusing 33.1 with 33.10 or a cross-reference. */
export function findPdfPostAnchor(items: readonly unknown[], postNumber: string) {
  const escaped = postNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return null;
  const pattern = new RegExp(`^${escaped}(?:\\s|$)`);
  const positioned = items.flatMap(item => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const { str, transform } = item;
    if (typeof str !== "string" || !Array.isArray(transform)) return [];
    const x = Number(transform[4]), y = Number(transform[5]);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ str: str.trim(), x, y }] : [];
  }).sort((left, right) => right.y - left.y || left.x - right.x);
  for (const item of positioned) {
    if (pattern.test(item.str)) return { x: item.x, y: item.y };
    // Post numbers can be split into adjacent PDF text fragments.
    const row = positioned.filter(other => Math.abs(other.y - item.y) <= 2 && other.x >= item.x).sort((a, b) => a.x - b.x);
    let prefix = "";
    for (const part of row.slice(0, 4)) {
      if (!/^[\d.]+$/.test(part.str)) break;
      prefix += part.str;
      if (prefix === postNumber.trim()) return { x: item.x, y: item.y };
      if (!postNumber.trim().startsWith(prefix)) break;
    }
  }
  return null;
}
