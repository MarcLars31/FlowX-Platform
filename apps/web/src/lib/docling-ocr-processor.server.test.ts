import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { processTechnicalDescription } from "./technical-description-processor";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";

test("import waits for primary OCR before fallback, and tries fallback before rejecting an empty document", async () => {
  const project = randomUUID(), organization = randomUUID();
  const auth = { user: { id: randomUUID() }, context: { organization: { id: organization, name: "Test" }, permissions: [] } };
  const db = { selectUserRows: async () => [{ id: project, organization_id: organization, name: "Project" }] } as unknown as NonNullable<Parameters<typeof processTechnicalDescription>[2]>;
  const original: TechnicalDescriptionPage[] = [{ pageNumber: 1, text: "", method: "text", confidence: 0, status: "failed" }];
  let calls = 0;
  const request = (attempted: boolean) => {
    const form = new FormData(); form.set("projectId", project);
    form.set("file", new File(["%PDF-1.7\n"], "scan.pdf", { type: "application/pdf" }));
    if (attempted) form.set("ocrPages", JSON.stringify([{ pageNumber: 1, text: "", confidence: 0 }]));
    return new Request("http://localhost/import", { method: "POST", body: form });
  };
  const options = { extractPages: async () => original,
    recoverOcr: async (input: import("./docling-ocr.server").DoclingInput) => { calls++; assert.equal(input.attempted.length, 1); return input.pages; } };
  const first = await processTechnicalDescription(request(false), auth, db, options);
  assert.equal(first.status, 422); assert.equal((await first.json()).code, "OCR_REQUIRED"); assert.equal(calls, 0);
  const second = await processTechnicalDescription(request(true), auth, db, options);
  assert.equal(second.status, 422); assert.equal((await second.json()).code, "OCR_FAILED"); assert.equal(calls, 1);
});

test("project authorization rejects access before any OCR or fallback processing", async () => {
  const db = { selectUserRows: async () => [] } as unknown as NonNullable<Parameters<typeof processTechnicalDescription>[2]>;
  const form = new FormData(); form.set("projectId", randomUUID());
  const unexpected = async (): Promise<never> => { throw new Error("unauthorized processing"); };
  const response = await processTechnicalDescription(new Request("http://localhost/import", { method: "POST", body: form }),
    { user: { id: randomUUID() }, context: { organization: { id: randomUUID(), name: "Test" }, permissions: [] } }, db,
    { extractPages: unexpected, recoverOcr: unexpected });
  assert.equal(response.status, 404);
});
