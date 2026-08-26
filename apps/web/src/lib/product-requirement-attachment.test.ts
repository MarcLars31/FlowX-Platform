import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentContentDisposition,
  MAX_REQUIREMENT_ATTACHMENT_BYTES,
  parseProductRequirementAttachments,
  requirementAttachmentStoragePath,
  validateRequirementAttachmentUpload,
  withProductRequirementAttachment,
  type ProductRequirementAttachment
} from "./product-requirement-attachment";

const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  requirementId: "33333333-3333-4333-8333-333333333333"
};

const attachment: ProductRequirementAttachment = {
  id: "44444444-4444-4444-8444-444444444444",
  fileName: "Sprinkler ritning.pdf",
  storageFileName: "Sprinkler_ritning.pdf",
  contentType: "application/pdf",
  sizeBytes: 4096,
  comment: "Kontrollerad ritning",
  uploadedAt: "2026-08-26T10:00:00.000Z",
  uploadedBy: "55555555-5555-4555-8555-555555555555"
};

const safePdfBytes = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
);

test("validates and normalizes a safe requirement attachment", () => {
  const result = validateRequirementAttachmentUpload({
    fileName: "  Sprinkler ritning.pdf ",
    contentType: "application/pdf; charset=binary",
    sizeBytes: safePdfBytes.byteLength,
    comment: "  Kontrollerad ritning  ",
    fileBytes: safePdfBytes
  });

  assert.deepEqual(result, {
    data: {
      fileName: "Sprinkler ritning.pdf",
      storageFileName: "Sprinkler_ritning.pdf",
      contentType: "application/pdf",
      sizeBytes: safePdfBytes.byteLength,
      comment: "Kontrollerad ritning"
    }
  });
});

test("rejects oversized, executable and active-content attachments", () => {
  const tooLarge = validateRequirementAttachmentUpload({
    fileName: "ritning.pdf",
    contentType: "application/pdf",
    sizeBytes: MAX_REQUIREMENT_ATTACHMENT_BYTES + 1,
    comment: null
  });
  assert.equal("status" in tooLarge ? tooLarge.status : null, 413);

  for (const input of [
    { fileName: "ritning.pdf.exe", contentType: "application/pdf" },
    { fileName: "ritning.svg", contentType: "image/svg+xml" },
    { fileName: "ritning.pdf", contentType: "text/html" }
  ]) {
    const result = validateRequirementAttachmentUpload({
      ...input,
      sizeBytes: safePdfBytes.byteLength,
      comment: null,
      fileBytes: safePdfBytes
    });
    assert.ok("error" in result);
  }

  const disguisedExecutable = validateRequirementAttachmentUpload({
    fileName: "ritning.pdf",
    contentType: "application/pdf",
    sizeBytes: 4,
    comment: null,
    fileBytes: Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])
  });
  assert.ok("error" in disguisedExecutable);

  const activePdf = new TextEncoder().encode(
    "%PDF-1.7\n1 0 obj\n<< /OpenAction << /JS (alert) >> >>\nendobj"
  );
  const activeContent = validateRequirementAttachmentUpload({
    fileName: "ritning.pdf",
    contentType: "application/pdf",
    sizeBytes: activePdf.byteLength,
    comment: null,
    fileBytes: activePdf
  });
  assert.ok("error" in activeContent);
});

test("accepts only allowlisted formats whose bytes match the extension", () => {
  const validFiles = [
    {
      fileName: "bild.png",
      contentType: "image/png",
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    },
    {
      fileName: "foto.jpeg",
      contentType: "image/jpeg",
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])
    },
    {
      fileName: "bild.webp",
      contentType: "image/webp",
      bytes: new TextEncoder().encode("RIFF0000WEBP")
    },
    {
      fileName: "notering.txt",
      contentType: "text/plain",
      bytes: new TextEncoder().encode("Kontrollerad av projektledare")
    },
    {
      fileName: "lista.csv",
      contentType: "application/vnd.ms-excel",
      bytes: new TextEncoder().encode("NRF;Antal\n9254014;2")
    }
  ];

  for (const file of validFiles) {
    const result = validateRequirementAttachmentUpload({
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.bytes.byteLength,
      comment: null,
      fileBytes: file.bytes
    });
    assert.ok("data" in result, file.fileName);
  }

  const renamedFile = validateRequirementAttachmentUpload({
    fileName: "program.pdf",
    contentType: "application/pdf",
    sizeBytes: 8,
    comment: null,
    fileBytes: new TextEncoder().encode("not-pdf")
  });
  assert.ok("error" in renamedFile);

  const officeDocument = validateRequirementAttachmentUpload({
    fileName: "ritning.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 4,
    comment: null,
    fileBytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04])
  });
  assert.ok("error" in officeDocument);
});

test("rejects path components and overlong comments", () => {
  const traversal = validateRequirementAttachmentUpload({
    fileName: "../ritning.pdf",
    contentType: "application/pdf",
    sizeBytes: 100,
    comment: null
  });
  assert.ok("error" in traversal);

  const longComment = validateRequirementAttachmentUpload({
    fileName: "ritning.pdf",
    contentType: "application/pdf",
    sizeBytes: safePdfBytes.byteLength,
    comment: "x".repeat(2_001),
    fileBytes: safePdfBytes
  });
  assert.ok("error" in longComment);
});

test("parses only valid metadata and preserves other requirement values", () => {
  const valueJson = withProductRequirementAttachment(
    { productResolution: { status: "not_in_catalog" }, productAttachments: [{}] },
    attachment
  );
  assert.deepEqual(valueJson.productResolution, { status: "not_in_catalog" });
  assert.deepEqual(parseProductRequirementAttachments(valueJson), [attachment]);

  assert.deepEqual(
    parseProductRequirementAttachments({
      productAttachments: [
        attachment,
        attachment,
        { ...attachment, id: "../../outside" },
        { ...attachment, storageFileName: "../outside.pdf" },
        {
          ...attachment,
          fileName: "invoice.exe",
          storageFileName: "invoice.exe"
        }
      ]
    }),
    [attachment]
  );
});

test("builds a requirement-scoped storage path without trusting path input", () => {
  assert.equal(
    requirementAttachmentStoragePath({ ...scope, attachment }),
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/requirements/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444-Sprinkler_ritning.pdf"
  );

  assert.throws(() =>
    requirementAttachmentStoragePath({
      ...scope,
      projectId: "../outside",
      attachment
    })
  );
  assert.throws(() =>
    requirementAttachmentStoragePath({
      ...scope,
      attachment: { ...attachment, storageFileName: "../outside.pdf" }
    })
  );
});

test("creates a download-only content disposition without header injection", () => {
  const header = attachmentContentDisposition("Ritning åäö.pdf");
  assert.match(header, /^attachment;/);
  assert.match(header, /filename="Ritning_aao\.pdf"/);
  assert.match(header, /filename\*=UTF-8''Ritning%20%C3%A5%C3%A4%C3%B6\.pdf/);
  assert.doesNotMatch(header, /[\r\n]/);
});
