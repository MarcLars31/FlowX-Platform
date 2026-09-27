import test from "node:test";
import assert from "node:assert/strict";
import { consumeRateLimit } from "./request-rate-limit";

test("rate limiter blocks only after the configured window quota", () => {
  const key = `test-${crypto.randomUUID()}`;
  assert.equal(consumeRateLimit(key, 2, 1_000, 10_000).allowed, true);
  assert.equal(consumeRateLimit(key, 2, 1_000, 10_100).allowed, true);
  const blocked = consumeRateLimit(key, 2, 1_000, 10_200);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.equal(consumeRateLimit(key, 2, 1_000, 11_100).allowed, true);
});
