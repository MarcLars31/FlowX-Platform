import test from "node:test";
import assert from "node:assert/strict";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { findAhlsellMldlCandidates } from "./ahlsell-mldl-catalog";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { refreshSession, SessionRefreshError } from "./session-refresh";
import { boundedMap } from "./bounded-map";
import { requirementSnapshot } from "./requirement-snapshot";

for (const [name, code, category] of [
  ["KABEL FOR SPENNINGSBÅND LV", "WJ2.211", "fitting"],
  ["KABELSTIGE", "WC2.522A", "pipe"],
  ["ARMATURSKINNE", "WC2.311", "pipe"],
  ["VENTILASJONSKANAL", "VB3.111", "pipe"]
]) test(`${name} cannot inherit sprinkler parts from chapter prose`, () => {
  const row = { id: "r", category, value_text: name, value_json: { nsCode: code, unit: "m", quantity: 71.75,
    technicalSpecification: "Kapittel: Sprinkler Stålrør DN150 K80 Victaulic", attributes: {} } };
  assert.equal(ahlsellRequirementIntent(row), "generic");
  assert.equal(buildAhlsellRequirementGuide(row).searchQuery, name);
  assert.deepEqual(findAhlsellMldlCandidates(row), []);
});

test("named unknown metre products do not become pipe", () => {
  assert.equal(ahlsellRequirementIntent({ category: "pipe", value_text: "GUMMILIST", value_json: { unit: "m" } }), "generic");
  assert.equal(ahlsellRequirementIntent({ category: "pipe", value_text: "DN25 komplett med deler", value_json: { unit: "m", nsCode: "UB1.3111" } }), "pipe");
});

test("canonical snapshots preserve comments, quantities and saved corrections without mutation", () => {
  const raw = { id: "r", updated_at: "2026-09-27T10:00:00Z", source_excerpt: "Own post", value_json: {
    unit: "m", quantity: 71.75, technicalSpecification: "Full text\nComments after page break", attributes: { materiale: "Aluminium" }
  } };
  const snapshot = requirementSnapshot(raw);
  assert.deepEqual(requirementSnapshot(snapshot), snapshot);
  assert.equal(snapshot.value_json.technicalSpecification, raw.value_json.technicalSpecification);
  assert.equal(snapshot.value_json.quantity, 71.75);
  assert.ok(!("extractionVersion" in raw.value_json));
});

test("refresh rejects transient failures without marking the session invalid", async () => {
  for (const status of [429, 500, 502, 503, 401]) {
    await assert.rejects(refreshSession("https://auth.example/token", {}, "fake", async () => Response.json({ code: "unexpected_failure" }, { status })),
      (error: unknown) => error instanceof SessionRefreshError && !error.invalidSession);
  }
  await assert.rejects(refreshSession("https://auth.example/token", {}, "fake", async () => { throw new TypeError("network"); }), TypeError);
  await assert.rejects(refreshSession("https://auth.example/token", {}, "fake", async () => Response.json({ error_code: "refresh_token_not_found" }, { status: 400 })),
    (error: unknown) => error instanceof SessionRefreshError && error.invalidSession);
});

test("successful refresh rotates tokens and malformed success is temporary", async () => {
  const session = { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 };
  assert.deepEqual(await refreshSession("https://auth.example/token", {}, "fake", async () => Response.json(session)), session);
  await assert.rejects(refreshSession("https://auth.example/token", {}, "fake", async () => Response.json({})),
    (error: unknown) => error instanceof SessionRefreshError && !error.invalidSession);
});

test("bounded fan-out preserves order and does not launch unbounded work", async () => {
  let active = 0, maximum = 0;
  const result = await boundedMap([5, 4, 3, 2, 1], 2, async n => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, n)); active--; return n * 2;
  });
  assert.deepEqual(result, [10, 8, 6, 4, 2]);
  assert.equal(maximum, 2);
});
