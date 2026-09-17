import test from "node:test";
import assert from "node:assert/strict";
import { hasPdfSignature } from "./pdf-security";

test("PDF uploads require the PDF magic header", () => {
  assert.equal(hasPdfSignature(new TextEncoder().encode("%PDF-1.7")), true);
  assert.equal(hasPdfSignature(new TextEncoder().encode("<!doctype")), false);
  assert.equal(hasPdfSignature(new Uint8Array([0x25, 0x50])), false);
});
