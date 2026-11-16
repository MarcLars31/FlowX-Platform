import assert from "node:assert/strict";
import test from "node:test";
import { validatePdfFile } from "@/components/PdfDropzone";

function file(name: string, type: string, size: number) {
  return { name, type, size } as File;
}

test("accepts PDF files selected or dropped from the desktop", () => {
  assert.equal(
    validatePdfFile(file("teknisk-beskrivning.pdf", "application/pdf", 1024)),
    null
  );
  assert.equal(validatePdfFile(file("ritning.pdf", "", 2048)), null);
});

test("rejects non-PDF, empty and oversized files before upload", () => {
  assert.equal(
    validatePdfFile(file("anteckningar.txt", "text/plain", 1024)),
    "Filen måste vara en PDF."
  );
  assert.equal(validatePdfFile(file("tom.pdf", "application/pdf", 0)), "PDF-filen är tom.");
  assert.equal(
    validatePdfFile(file("stor.pdf", "application/pdf", 31 * 1024 * 1024)),
    "PDF-filen får vara högst 30 MB."
  );
});
