import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProductPdfError,
  parseProductPdfPayload
} from "./product-pdf-processing";

test("accepts the existing Product PDF Extractor response shape", () => {
  const payload = parseProductPdfPayload({
    products: [{ sin: "V2703" }],
    accessories: [],
    documentInfo: { manufacturer: "Victaulic" }
  });

  assert.equal(payload?.products.length, 1);
  assert.equal(payload?.products[0]?.sin, "V2703");
});

test("classifies permanent and retryable extractor failures", () => {
  assert.deepEqual(classifyProductPdfError("PDF is password protected", 422), {
    status: "unreadable",
    code: "password_protected",
    publicMessage: "PDF-filen är lösenordsskyddad.",
    retryable: false
  });
  assert.equal(classifyProductPdfError("upstream timeout", 503).retryable, true);
  assert.equal(
    classifyProductPdfError("PDFPasswordIncorrect", 500).code,
    "password_protected"
  );
  assert.equal(classifyProductPdfError("PDFSyntaxError: broken xref", 500).code, "corrupt_file");
  assert.equal(
    classifyProductPdfError("no product identifiers found", 422).status,
    "no_products_found"
  );
  assert.equal(
    classifyProductPdfError("No coupling Style numbers found", 422).code,
    "no_product_identifiers"
  );
  assert.equal(
    classifyProductPdfError("Extractor validation failed", 422).code,
    "table_extraction_failed"
  );
});
