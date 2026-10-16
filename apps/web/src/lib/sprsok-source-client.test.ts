import assert from "node:assert/strict";
import test from "node:test";
import {
  createSprsokSource,
  getSprsokSourceConfig
} from "./sprsok-source-client";

test("source client sends cursor pagination without leaking token into URL", async () => {
  let requestedUrl = "";
  let authorization = "";
  const source = createSprsokSource(
    {
      apiUrl: "https://supplier.example.test/products",
      token: "secret-test-token",
      paginationMode: "cursor",
      pageSize: 25,
      timeoutMs: 1000,
      cursorParameter: "after",
      offsetParameter: "offset",
      limitParameter: "page_size",
      minimumIntervalMs: 0,
      maxResponseBytes: 100_000
    },
    {
      fetch: async (input, init) => {
        requestedUrl = String(input);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return Response.json({ items: [{ id: 1 }], next_cursor: "next" });
      }
    }
  );
  const page = await source.fetchPage({ cursor: "current", offset: 25, pageNumber: 2 });
  assert.match(requestedUrl, /after=current/);
  assert.match(requestedUrl, /page_size=25/);
  assert.doesNotMatch(requestedUrl, /secret-test-token/);
  assert.equal(authorization, "Bearer secret-test-token");
  assert.equal(page.next?.cursor, "next");
});

test("source config rejects insecure remote HTTP", () => {
  assert.throws(
    () => getSprsokSourceConfig({ NODE_ENV: "production", SPRSOK_API_URL: "http://example.com" }),
    /HTTPS/
  );
});

test("source config permits local HTTP during development", () => {
  const config = getSprsokSourceConfig({
    NODE_ENV: "development",
    SPRSOK_API_URL: "http://127.0.0.1:8090/products",
    SPRSOK_API_PAGINATION: "offset"
  });
  assert.equal(config.paginationMode, "offset");
});
