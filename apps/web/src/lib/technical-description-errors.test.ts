import assert from "node:assert/strict";
import test from "node:test";
import { permanentPdfError, importFailure } from "./technical-description-errors";
import { technicalDescriptionErrorResponse } from "./technical-description-processor";
import { extractTechnicalDescriptionPages } from "../modules/technical-description-extractor/pdf";

test("a genuinely corrupt PDF produces one permanent actionable failure", async () => {
  let error: unknown;
  try { await extractTechnicalDescriptionPages(Buffer.from("%PDF-1.7\nnot a complete PDF")); } catch (caught) {error=caught;}
  assert.ok(error);
  const response=technicalDescriptionErrorResponse(error);
  assert.equal(response.status,422);
  const failure=importFailure(response.status,await response.json());
  assert.equal(failure.permanent,true);
  assert.equal(failure.code,"INVALID_PDF");
});
test("password errors are permanent but storage, rate limits and unknown parser errors can retry", () => {
  assert.equal(permanentPdfError({name:"PasswordException"})?.code,"PASSWORD_PROTECTED");
  for (const error of [new Error("Storage timeout"),new TypeError("parser crashed"),null]) assert.equal(permanentPdfError(error),undefined);
  for (const status of [429,500,503]) assert.equal(importFailure(status,{}).permanent,false);
  for (const status of [400,403,404,413,422]) assert.equal(importFailure(status,{}).permanent,true);
});
