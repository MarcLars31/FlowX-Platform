import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupabaseHeaders,
  isLegacyJwtApiKey
} from "./supabase-headers";

test("does not send opaque Supabase keys as bearer tokens", () => {
  const headers = buildSupabaseHeaders("sb_publishable_example");

  assert.deepEqual(headers, { apikey: "sb_publishable_example" });
  assert.equal(isLegacyJwtApiKey("sb_secret_example"), false);
});

test("uses the signed-in user's access token as bearer token", () => {
  const headers = buildSupabaseHeaders(
    "sb_publishable_example",
    "user-access-token"
  );

  assert.deepEqual(headers, {
    apikey: "sb_publishable_example",
    Authorization: "Bearer user-access-token"
  });
});

test("keeps legacy JWT API keys compatible", () => {
  const legacyKey = "eyJheader.payload.signature";

  assert.equal(isLegacyJwtApiKey(legacyKey), true);
  assert.deepEqual(buildSupabaseHeaders(legacyKey), {
    apikey: legacyKey,
    Authorization: `Bearer ${legacyKey}`
  });
});
