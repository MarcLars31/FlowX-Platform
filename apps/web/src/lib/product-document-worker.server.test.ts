import assert from "node:assert/strict";
import test from "node:test";
import { runProductDocumentWorker } from "./product-document-worker.server";

test("an empty product queue never starts processing or writes a job", async t => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only-key";
  try {
    for (const result of [null, {
      document_id: null, requested_by: null, trigger_type: null, status: null,
      attempts: null, lease_id: null, lease_until: null, next_attempt_at: null,
      created_at: null, updated_at: null, error_code: null
    }]) {
      await t.test(result === null ? "JSON null" : "PostgREST null composite", async subtest => {
        const requests: string[] = [];
        subtest.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
          const url = String(input);
          requests.push(url);
          assert.equal(url, "https://supabase.invalid/rest/v1/rpc/claim_product_document_job");
          return Response.json(result);
        });
        await runProductDocumentWorker();
        assert.equal(requests.length, 1, "only the queue claim is allowed");
      });
    }
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});
