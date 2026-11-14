import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientOcrPayloadError,
  mergeClientOcrPages,
  parseClientOcrPages
} from "./technical-description-ocr-payload";

test("validates and clamps browser OCR pages", () => {
  const pages = parseClientOcrPages(
    JSON.stringify([{ pageNumber: 2, text: "  sprinkler  ", confidence: 1.4 }]),
    3
  );
  assert.deepEqual(pages, [
    { pageNumber: 2, text: "sprinkler", confidence: 1 }
  ]);
});

test("rejects duplicate and out-of-range OCR pages", () => {
  assert.throws(
    () =>
      parseClientOcrPages(
        JSON.stringify([
          { pageNumber: 1, text: "first", confidence: 0.8 },
          { pageNumber: 1, text: "duplicate", confidence: 0.8 }
        ]),
        2
      ),
    ClientOcrPayloadError
  );
  assert.throws(
    () =>
      parseClientOcrPages(
        JSON.stringify([{ pageNumber: 3, text: "outside", confidence: 0.8 }]),
        2
      ),
    ClientOcrPayloadError
  );
});

test("keeps readable server text and fills image-only pages with OCR", () => {
  const merged = mergeClientOcrPages(
    [
      {
        pageNumber: 1,
        text: "A".repeat(120),
        method: "text",
        confidence: 0.98,
        status: "success"
      },
      {
        pageNumber: 2,
        text: "",
        method: "text",
        confidence: 0,
        status: "failed",
        errorCode: "ocr_failed"
      }
    ],
    [
      { pageNumber: 1, text: "must not replace text", confidence: 0.7 },
      { pageNumber: 2, text: "B".repeat(140), confidence: 0.87 }
    ]
  );

  assert.equal(merged[0].method, "text");
  assert.equal(merged[0].text, "A".repeat(120));
  assert.equal(merged[1].method, "ocr");
  assert.equal(merged[1].status, "success");
  assert.equal(merged[1].confidence, 0.87);
});

test("retains PDF comments when replacing an unreadable text layer with OCR", () => {
  const annotations = [{ id: "1R", text: "Check article", subtype: "Text" }];
  const [page] = mergeClientOcrPages([
    { pageNumber: 1, text: "", method: "text", confidence: 0, annotations }
  ], [{ pageNumber: 1, text: "OCR text ".repeat(20), confidence: 0.8 }]);
  assert.equal(page.method, "ocr");
  assert.deepEqual(page.annotations, annotations);
});

test("accepts OCR for long header-only pages, discards stale digital table indices and keeps annotations", () => {
  const annotations = [{ id: "1R", text: "Check article", subtype: "Text" }];
  const [page] = mergeClientOcrPages([
    { pageNumber: 1, text: "Digital header ".repeat(12), method: "text", confidence: 0.55,
      status: "partial", ocrReason: "image-body", annotations, annotationReadFailed: true,
      postTable: { text: "header", siteTitle: "site", posts: [], quantities: [] } }
  ], [{ pageNumber: 1, text: "Recovered requirement text ".repeat(12), confidence: 0.9 }]);
  assert.equal(page.method, "ocr");
  assert.equal(page.status, "success");
  assert.equal(page.ocrReason, undefined);
  assert.equal(page.postTable, undefined);
  assert.deepEqual(page.annotations, annotations);
  assert.equal(page.annotationReadFailed, true);
});

test("missing, empty and unchanged header OCR do not mark an unreadable image body as successful", () => {
  const server: Parameters<typeof mergeClientOcrPages>[0] = [
    { pageNumber: 1, text: "Digital header ".repeat(12), method: "text", confidence: 0.55, status: "partial", ocrReason: "image-body" }
  ];
  for (const client of [undefined, [], [{ pageNumber: 2, text: "Other page ".repeat(12), confidence: 0.9 }],
    [{ pageNumber: 1, text: " ", confidence: 0 }], [{ pageNumber: 1, text: server[0].text, confidence: 0.9 }]]) {
    assert.equal(mergeClientOcrPages(server, client)[0], server[0]);
  }
  const [short] = mergeClientOcrPages(server, [{ pageNumber: 1, text: "Unreadable", confidence: 0.3 }]);
  assert.equal(short.status, "partial");
  assert.equal(short.ocrReason, "image-body");
});


test("low-confidence OCR remains uncertain even when it returns plenty of text", async () => {
  const { extractTechnicalDescriptionFromPages } = await import("../modules/technical-description-extractor/extractor");
  const { extractionQualitySummary } = await import("./technical-description-quality");
  const text = "33.500.1 UE2.1111132\nSPRINKLER\nAntall stk 60\nMateriale: Messing\nUtløsningstemperatur: 68 °C\nAndre krav: Nei";
  for (const confidence of [0, 0.3, 0.69]) {
    const pages = mergeClientOcrPages([{pageNumber:1,text:"",method:"text",confidence:0,status:"failed"}],
      [{pageNumber:1,text,confidence}]);
    assert.equal(pages[0].confidence, confidence);
    assert.equal(pages[0].status, "partial");
    const result = extractTechnicalDescriptionFromPages(pages);
    assert.equal(extractionQualitySummary(result).incompletePageCount, 1);
    assert.ok(result.materialLines.length > 0);
    assert.ok(result.materialLines.every(line => line.confidence <= confidence));
    assert.ok(result.materialLines.every(line => line.reviewFlags.includes("low-ocr-confidence")));
  }
});
