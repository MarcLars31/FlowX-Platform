import assert from "node:assert/strict";

// Explicit loopback only. The local platform uses its own database and blocks
// remote database writes; only public Ahlsell GETs may leave this test setup.
const origin = "http://127.0.0.1:3100";
const endpoint = `${origin}/api/material-import/match`;
const input = { description: "Kobberrør", unit: "m", category: "Rør (m)", dimension: "15", fittingDimension: "", dimensionKind: "outside", details: "", query: "5002206" };
const anonymous = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
assert.equal(anonymous.status, 401);
const session = await fetch(`${origin}/api/local/session`, { method: "POST", headers: { Origin: origin }, body: new URLSearchParams({ view: "customer" }), redirect: "manual" });
assert.equal(session.status, 303, "Start npm run dev:local in the isolated development checkout first.");
const cookie = session.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
const headers = { "Content-Type": "application/json", Cookie: cookie, Origin: origin };
const invalid = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ ...input, dimensionKind: "guess" }) });
assert.equal(invalid.status, 400);
const excessive = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ ...input, details: "x".repeat(17000) }) });
assert.equal(excessive.status, 413);
console.log("Local API: anonymous access denied; malformed and oversized rows rejected.");

if (process.argv.includes("--public-catalog")) {
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(input), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const candidate = result.candidates.find((item: { articleNumber: string }) => item.articleNumber === input.query);
  assert.ok(candidate, "Exact requested Ahlsell article is returned.");
  assert.equal(candidate.identityVerified, true);
  assert.equal(candidate.conflict, false);
  assert.equal("selected" in result, false);
  console.log(`Public Ahlsell read through local API: ${candidate.articleNumber}, page identity verified, no automatic selection.`);
}
