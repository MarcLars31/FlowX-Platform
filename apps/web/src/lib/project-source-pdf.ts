type Row = Record<string, unknown> & { id: string };

export type ProjectSourcePdfLookup = {
  projectDocumentIds: readonly string[];
  byTechnicalDescriptionId: Readonly<Record<string, string | null>>;
  fallbackDocumentId: string | null;
};

export function buildProjectSourcePdfLookup(
  projectDocuments: readonly Row[],
  technicalDescriptions: readonly Row[]
): ProjectSourcePdfLookup {
  const usableDocuments = projectDocuments.filter((document) => isUuid(document.id));
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
