import assert from "node:assert/strict";
import test from "node:test";
import {
  readJsonBody,
  RequestBodyTooLargeError
} from "./request-body";

test("reads JSON within the configured limit", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ products: [1, 2, 3] })
  });

  await assert.doesNotReject(async () => {
    assert.deepEqual(await readJsonBody(request, 1024), { products: [1, 2, 3] });
  });
});

test("rejects chunked JSON bodies that exceed the configured limit", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ payload: "x".repeat(128) })
  });

  await assert.rejects(
    () => readJsonBody(request, 32),
    (error: unknown) => error instanceof RequestBodyTooLargeError
  );
});
