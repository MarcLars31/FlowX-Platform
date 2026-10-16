export const PRODUCT_ATTACHMENTS_KEY = "productAttachments";
export const MAX_REQUIREMENT_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_REQUIREMENT_ATTACHMENT_COMMENT_LENGTH = 2_000;
export const MAX_REQUIREMENT_ATTACHMENTS = 50;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_BINARY_CONTENT_TYPE = "application/octet-stream";
const ALLOWED_ATTACHMENT_TYPES = {
  pdf: {
    contentType: "application/pdf",
    acceptedContentTypes: new Set(["application/pdf", "application/x-pdf"])
  },
  png: {
    contentType: "image/png",
    acceptedContentTypes: new Set(["image/png"])
  },
  jpg: {
    contentType: "image/jpeg",
    acceptedContentTypes: new Set(["image/jpeg", "image/pjpeg"])
  },
  jpeg: {
    contentType: "image/jpeg",
    acceptedContentTypes: new Set(["image/jpeg", "image/pjpeg"])
  },
  webp: {
    contentType: "image/webp",
    acceptedContentTypes: new Set(["image/webp"])
  },
  txt: {
    contentType: "text/plain",
    acceptedContentTypes: new Set(["text/plain"])
  },
  csv: {
    contentType: "text/csv",
    acceptedContentTypes: new Set([
      "application/csv",
      "application/vnd.ms-excel",
      "text/comma-separated-values",
      "text/csv"
    ])
  }
} as const;

const PDF_ACTIVE_CONTENT_TOKENS = [
  "/acroform",
  "/embeddedfile",
  "/javascript",
  "/js",
  "/launch",
  "/openaction",
  "/richmedia",
  "/xfa"
] as const;

export type ProductRequirementAttachment = {
  id: string;
  fileName: string;
  storageFileName: string;
  contentType: string;
  sizeBytes: number;
  comment: string | null;
  uploadedAt: string;
  uploadedBy: string;
};

type AttachmentUploadInput = {
  fileName: unknown;
  contentType: unknown;
  sizeBytes: unknown;
  comment: unknown;
  fileBytes?: Uint8Array;
};

export type AttachmentUploadValidation =
  | {
      data: Pick<
        ProductRequirementAttachment,
        "fileName" | "storageFileName" | "contentType" | "sizeBytes" | "comment"
      >;
    }
  | { error: string; status: 400 | 413 };

export function validateRequirementAttachmentUpload(
  input: AttachmentUploadInput
): AttachmentUploadValidation {
  const fileName = normalizedFileName(input.fileName);
  if (!fileName) {
    return { error: "Bilagans filnamn är ogiltigt.", status: 400 };
  }

  if (!Number.isSafeInteger(input.sizeBytes) || Number(input.sizeBytes) <= 0) {
    return { error: "Bilagan är tom eller har en ogiltig storlek.", status: 400 };
  }
  if (Number(input.sizeBytes) > MAX_REQUIREMENT_ATTACHMENT_BYTES) {
    return {
      error: "Bilagan får vara högst 4 MB.",
      status: 413
    };
  }

  const fileType = allowedFileType(fileName);
  if (!fileType) {
    return {
      error: "Filtypen stöds inte. Använd PDF, PNG, JPG, WebP, TXT eller CSV.",
      status: 400
    };
  }

  const claimedContentType = normalizedContentType(input.contentType);
  if (
    !claimedContentType ||
    (claimedContentType !== GENERIC_BINARY_CONTENT_TYPE &&
      !fileType.acceptedContentTypes.has(claimedContentType))
  ) {
    return { error: "Filens typ stämmer inte med filnamnet.", status: 400 };
  }

  if (
    !input.fileBytes ||
    input.fileBytes.byteLength !== Number(input.sizeBytes) ||
    !matchesAllowedFileContent(fileName, input.fileBytes)
  ) {
    return { error: "Filens innehåll stämmer inte med den valda filtypen.", status: 400 };
  }

  const comment = normalizedComment(input.comment);
  if (comment === undefined) {
    return {
      error: `Kommentaren får vara högst ${MAX_REQUIREMENT_ATTACHMENT_COMMENT_LENGTH} tecken.`,
      status: 400
    };
  }

  return {
    data: {
      fileName,
      storageFileName: storageSafeFileName(fileName),
      contentType: fileType.contentType,
      sizeBytes: Number(input.sizeBytes),
      comment
    }
  };
}

export function parseProductRequirementAttachments(
  valueJson: unknown
): ProductRequirementAttachment[] {
  const value = record(valueJson);
  const rawAttachments = value[PRODUCT_ATTACHMENTS_KEY];
  if (!Array.isArray(rawAttachments)) return [];

  const seenIds = new Set<string>();
  const attachments: ProductRequirementAttachment[] = [];
  for (const rawAttachment of rawAttachments.slice(0, MAX_REQUIREMENT_ATTACHMENTS)) {
    const parsed = parseAttachment(rawAttachment);
    if (!parsed || seenIds.has(parsed.id)) continue;
    seenIds.add(parsed.id);
    attachments.push(parsed);
  }
  return attachments;
}

export function withProductRequirementAttachment(
  valueJson: unknown,
  attachment: ProductRequirementAttachment
): Record<string, unknown> {
  const value = record(valueJson);
  return {
    ...value,
    [PRODUCT_ATTACHMENTS_KEY]: [
      ...parseProductRequirementAttachments(value),
      attachment
    ]
  };
}

export function requirementAttachmentStoragePath({
  organizationId,
  projectId,
  requirementId,
  attachment
}: {
  organizationId: string;
  projectId: string;
  requirementId: string;
  attachment: ProductRequirementAttachment;
}) {
  for (const value of [organizationId, projectId, requirementId, attachment.id]) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error("Attachment storage scope contains an invalid identifier.");
    }
  }
  if (
    attachment.storageFileName !== storageSafeFileName(attachment.fileName) ||
    !/^[a-zA-Z0-9._-]{1,120}$/.test(attachment.storageFileName)
  ) {
    throw new Error("Attachment storage filename is invalid.");
  }

  return [
    organizationId,
    projectId,
    "requirements",
    requirementId,
    `${attachment.id}-${attachment.storageFileName}`
  ].join("/");
}

export function attachmentContentDisposition(fileName: string) {
  const normalized = normalizedFileName(fileName) ?? "attachment";
  const fallback = storageSafeFileName(normalized);
  const encoded = encodeURIComponent(normalized).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function parseAttachment(value: unknown): ProductRequirementAttachment | null {
  const attachment = record(value);
  const id = typeof attachment.id === "string" ? attachment.id : "";
  const uploadedBy =
    typeof attachment.uploadedBy === "string" ? attachment.uploadedBy : "";
  const fileName = normalizedFileName(attachment.fileName);
  const contentType = normalizedContentType(attachment.contentType);
  const sizeBytes = Number(attachment.sizeBytes);
  const comment = normalizedComment(attachment.comment);
  const uploadedAt =
    typeof attachment.uploadedAt === "string" ? attachment.uploadedAt : "";
  const storageFileName =
    typeof attachment.storageFileName === "string"
      ? attachment.storageFileName
      : "";

  if (
    !UUID_PATTERN.test(id) ||
    !UUID_PATTERN.test(uploadedBy) ||
    !fileName ||
    !contentType ||
    !isStoredAllowedFileType(fileName, contentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_REQUIREMENT_ATTACHMENT_BYTES ||
    comment === undefined ||
    !validIsoTimestamp(uploadedAt) ||
    storageFileName !== storageSafeFileName(fileName)
  ) {
    return null;
  }

  return {
    id,
    fileName,
    storageFileName,
    contentType,
    sizeBytes,
    comment,
    uploadedAt,
    uploadedBy
  };
}

function normalizedFileName(value: unknown) {
  if (typeof value !== "string") return null;
  const fileName = value.normalize("NFKC").trim();
  if (
    fileName.length === 0 ||
    fileName.length > 180 ||
    fileName === "." ||
    fileName === ".." ||
    fileName.endsWith(".") ||
    /[\u0000-\u001f\u007f/\\:]/.test(fileName)
  ) {
    return null;
  }
  return fileName;
}

function normalizedContentType(value: unknown) {
  if (typeof value !== "string") return GENERIC_BINARY_CONTENT_TYPE;
  const contentType = value.split(";", 1)[0].trim().toLowerCase();
  if (
    contentType.length === 0 ||
    contentType.length > 120 ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType)
  ) {
    return contentType.length === 0 ? GENERIC_BINARY_CONTENT_TYPE : null;
  }
  return contentType;
}

function normalizedComment(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const comment = value.trim();
  if (comment.length > MAX_REQUIREMENT_ATTACHMENT_COMMENT_LENGTH) return undefined;
  return comment || null;
}

function fileNameExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : "";
}

function allowedFileType(fileName: string) {
  const extension = fileNameExtension(fileName);
  return ALLOWED_ATTACHMENT_TYPES[
    extension as keyof typeof ALLOWED_ATTACHMENT_TYPES
  ] ?? null;
}

function isStoredAllowedFileType(fileName: string, contentType: string) {
  const fileType = allowedFileType(fileName);
  return Boolean(fileType && fileType.contentType === contentType);
}

function matchesAllowedFileContent(fileName: string, bytes: Uint8Array) {
  const extension = fileNameExtension(fileName);
  if (hasExecutableSignature(bytes)) return false;

  switch (extension) {
    case "pdf":
      return (
        containsBytes(bytes.subarray(0, Math.min(bytes.length, 1024)), [
          0x25, 0x50, 0x44, 0x46, 0x2d
        ]) &&
        !PDF_ACTIVE_CONTENT_TOKENS.some((token) =>
          containsAsciiTokenIgnoreCase(bytes, token)
        )
      );
    case "png":
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case "webp":
      return (
        startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        bytes.length >= 12 &&
        startsWithBytes(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
      );
    case "txt":
    case "csv":
      return isValidUtf8Text(bytes);
    default:
      return false;
  }
}

function hasExecutableSignature(bytes: Uint8Array) {
  return (
    startsWithBytes(bytes, [0x4d, 0x5a]) ||
    startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    startsWithBytes(bytes, [0x23, 0x21]) ||
    [
      [0xca, 0xfe, 0xba, 0xbe],
      [0xbe, 0xba, 0xfe, 0xca],
      [0xcf, 0xfa, 0xed, 0xfe],
      [0xce, 0xfa, 0xed, 0xfe],
      [0xfe, 0xed, 0xfa, 0xcf],
      [0xfe, 0xed, 0xfa, 0xce]
    ].some((signature) => startsWithBytes(bytes, signature))
  );
}

function startsWithBytes(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function containsBytes(bytes: Uint8Array, expected: number[]) {
  if (expected.length === 0 || bytes.length < expected.length) return false;
  for (let offset = 0; offset <= bytes.length - expected.length; offset += 1) {
    if (expected.every((value, index) => bytes[offset + index] === value)) return true;
  }
  return false;
}

function containsAsciiTokenIgnoreCase(bytes: Uint8Array, token: string) {
  const expected = Array.from(token, (character) => character.charCodeAt(0));
  if (bytes.length < expected.length) return false;
  for (let offset = 0; offset <= bytes.length - expected.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < expected.length; index += 1) {
      const byte = bytes[offset + index];
      const lowered = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
      if (lowered !== expected[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function isValidUtf8Text(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function storageSafeFileName(fileName: string) {
  const safe = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_ .-]+|[_ .-]+$/g, "")
    .slice(0, 120);
  return safe || "attachment";
}

function validIsoTimestamp(value: string) {
  if (value.length < 20 || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
