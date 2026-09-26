import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProjectSourcePdfLookup,
  projectRequirementSourcePdfHref
} from "./project-source-pdf";

const projectId = "11111111-1111-4111-8111-111111111111";
const firstDocumentId = "22222222-2222-4222-8222-222222222222";
const secondDocumentId = "33333333-3333-4333-8333-333333333333";
const technicalDescriptionId = "44444444-4444-4444-8444-444444444444";

test("builds an exact technical-description to project-document match from the file hash", () => {
  const lookup = buildProjectSourcePdfLookup(
    [
      { id: firstDocumentId, file_sha256: "source-hash", document_type: "technical_description" },
      { id: secondDocumentId, file_sha256: "other-hash", document_type: "drawing" }
    ],
    [{ id: technicalDescriptionId, file_sha256: "SOURCE-HASH" }]
  );

  assert.equal(lookup.byTechnicalDescriptionId[technicalDescriptionId], firstDocumentId);
});

test("falls back to a matching file name and then to one unambiguous technical PDF", () => {
  const byName = buildProjectSourcePdfLookup(
    [{ id: firstDocumentId, file_name: "Sprinkler.PDF" }],
    [{ id: technicalDescriptionId, file_name: "sprinkler.pdf" }]
  );
  assert.equal(byName.byTechnicalDescriptionId[technicalDescriptionId], firstDocumentId);

  const soleTechnicalPdf = buildProjectSourcePdfLookup(
    [
      { id: firstDocumentId, document_type: "technical_description" },
      { id: secondDocumentId, document_type: "drawing" }
    ],
    [{ id: technicalDescriptionId }]
  );
  assert.equal(soleTechnicalPdf.byTechnicalDescriptionId[technicalDescriptionId], firstDocumentId);
});

test("uses the requirement's direct document before the technical-description match", () => {
  const lookup = buildProjectSourcePdfLookup(
    [
      { id: firstDocumentId, file_sha256: "source-hash" },
      { id: secondDocumentId, file_sha256: "direct-hash" }
    ],
    [{ id: technicalDescriptionId, file_sha256: "source-hash" }]
  );
  const href = projectRequirementSourcePdfHref(projectId, {
    id: "55555555-5555-4555-8555-555555555555",
    source_document_id: secondDocumentId,
    source_technical_description_document_id: technicalDescriptionId,
    source_page: 17
  }, lookup);

  assert.equal(href, `/api/projects/${projectId}/documents/${secondDocumentId}/file#page=17`);
});

test("returns no link when several project documents cannot be matched", () => {
  const lookup = buildProjectSourcePdfLookup(
    [
      { id: firstDocumentId, document_type: "drawing" },
      { id: secondDocumentId, document_type: "certificate" }
    ],
    [{ id: technicalDescriptionId }]
  );

  assert.equal(projectRequirementSourcePdfHref(projectId, {
    id: "55555555-5555-4555-8555-555555555555",
    source_technical_description_document_id: technicalDescriptionId,
    source_page: 2
  }, lookup), null);
});

test("never opens a same-name PDF when its hash conflicts with the source", () => {
  const lookup = buildProjectSourcePdfLookup(
    [{
      id: firstDocumentId,
      document_type: "technical_description",
      file_name: "sprinkler.pdf",
      file_sha256: "different-hash"
    }],
    [{
      id: technicalDescriptionId,
      file_name: "sprinkler.pdf",
      file_sha256: "authoritative-source-hash"
    }]
  );

  assert.equal(lookup.byTechnicalDescriptionId[technicalDescriptionId], null);
  assert.equal(projectRequirementSourcePdfHref(projectId, {
    id: "55555555-5555-4555-8555-555555555555",
    source_technical_description_document_id: technicalDescriptionId,
    source_page: 10
  }, lookup), null);
});

test("requires a unique file-name match when hash metadata is missing", () => {
  const lookup = buildProjectSourcePdfLookup(
    [
      { id: firstDocumentId, file_name: "sprinkler.pdf" },
      { id: secondDocumentId, file_name: "SPRINKLER.PDF" }
    ],
    [{ id: technicalDescriptionId, file_name: "sprinkler.pdf" }]
  );

  assert.equal(lookup.byTechnicalDescriptionId[technicalDescriptionId], null);
});
