import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshAccessToken } from "./supabase-auth-config";

function accessTokenWithExpiry(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
}

test("refreshes missing, malformed and nearly expired access tokens", () => {
  assert.equal(shouldRefreshAccessToken(undefined, 1_000), true);
  assert.equal(shouldRefreshAccessToken("not-a-jwt", 1_000), true);
  assert.equal(shouldRefreshAccessToken(accessTokenWithExpiry(1_060), 1_000), true);
});

test("keeps access tokens that remain valid beyond the refresh window", () => {
  assert.equal(
    shouldRefreshAccessToken(accessTokenWithExpiry(1_061), 1_000),
    false
  );
});
