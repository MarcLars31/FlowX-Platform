import assert from "node:assert/strict";
import test from "node:test";
import { MaterialSearchRequestError, requestMaterialMatch, waitForMaterialRetry } from "./material-import-client";
import type { MaterialSearchInput } from "./material-import";

const input: MaterialSearchInput = { description: "Kobberrør", unit: "m", category: "Rør (m)", dimension: "15", fittingDimension: "", dimensionKind: "outside", details: "", query: "" };
const empty = { candidates: [], searchUrl: "https://www.ahlsell.no/search", warnings: [], partial: false };

test("row requests respect Retry-After, then return a completed empty search", async () => {
  let calls = 0;
  const waits: number[] = [];
  const notices: number[] = [];
  const result = await requestMaterialMatch(input, new AbortController().signal, seconds => notices.push(seconds),
    async () => ++calls === 1 ? new Response("busy", { status: 429, headers: { "Retry-After": "17" } }) : Response.json(empty),
    async milliseconds => { waits.push(milliseconds); });
  assert.equal(calls, 2); assert.deepEqual(waits, [17000]); assert.deepEqual(notices, [17]); assert.deepEqual(result, empty);
});

test("persistent supplier throttling stops the queue after bounded retries", async () => {
  let calls = 0;
  await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => {
    calls++; return new Response("busy", { status: 429, headers: { "Retry-After": "1" } });
  }, async () => {}), error => error instanceof MaterialSearchRequestError && error.stopQueue);
  assert.equal(calls, 3);
});

test("stopping during supplier backoff cancels without another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestMaterialMatch(input, controller.signal, () => controller.abort(), async () => {
    calls++; return new Response("busy", { status: 429 });
  }), /abort/i);
  assert.equal(calls, 1);
});

test("cancelled waiting releases immediately", async () => {
  const controller = new AbortController();
  const pending = waitForMaterialRetry(60000, controller.signal);
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test("authentication loss, unavailable service and non-JSON answers stop batch processing", async () => {
  for (const status of [401, 403, 502]) {
    await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => Response.json({ error: "Unavailable" }, { status })),
      error => error instanceof MaterialSearchRequestError && error.stopQueue);
  }
  await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => new Response("<html>error</html>")),
    error => error instanceof MaterialSearchRequestError && error.stopQueue);
});

test("invalid individual input is distinguished from an outage", async () => {
  await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => Response.json({ error: "Invalid row" }, { status: 400 })),
    error => error instanceof MaterialSearchRequestError && !error.stopQueue);
});
