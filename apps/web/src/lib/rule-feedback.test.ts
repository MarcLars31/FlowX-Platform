import assert from "node:assert/strict";
import test from "node:test";
import { canResolveFeedback, parseRuleFeedback } from "./rule-feedback";
import { MATCHING_RULES, MATCHING_RULE_GROUPS, filterMatchingRules } from "./matching-rule-catalog";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sourceSnapshot from "./matching-rule-source-snapshot.json";
import { join } from "node:path";

const valid = { id: "00000000-0000-4000-8000-000000000001", rule_id: "dimension", kind: "error", body: "  DN25 blir fel  " };
test("feedback validates type, known rule, body and ID; server owns snapshots and scope", () => {
  const input = parseRuleFeedback({ ...valid, organization_id: "foreign", author_id: "spoof", rule_title: "false", rule_version: "false", status: "resolved" });
  assert.ok(input);
  assert.equal(input.body, "DN25 blir fel");
  assert.equal(input.rule.title, MATCHING_RULES.find(item => item.id === "dimension")!.title);
  assert.equal("organization_id" in input, false);
  for (const value of [null, [], 2, { ...valid, id: "a,b" }, { ...valid, rule_id: "unknown" }, { ...valid, kind: "resolve" }, { ...valid, body: " " }, { ...valid, body: "a".repeat(3001) }]) assert.equal(parseRuleFeedback(value), null);
  assert.ok(parseRuleFeedback({ ...valid, kind: "change", body: "a".repeat(3000) }));
});
test("matching source changes require a catalogue review before updating its snapshot", () => {
  const files = [...new Set(MATCHING_RULE_GROUPS.flatMap(group => group.sources))].sort();
  assert.deepEqual(Object.keys(sourceSnapshot.sources).sort(), files);
  for (const [file, expected] of Object.entries(sourceSnapshot.sources)) {
    const content = readFileSync(join(process.cwd(), "src/lib", file), "utf8").replaceAll("\r\n", "\n");
    assert.equal(createHash("sha256").update(content).digest("hex"), expected, `${file} changed: review its rule descriptions, then update the source snapshot`);
  }
});
test("only author or organization admin in the active organization, or platform admin, can handle a report", () => {
  const row = { organization_id: "org-a", author_id: "author" };
  const actor = { id: "author", organizationId: "org-a", organizationAdmin: false, platformAdmin: false };
  assert.equal(canResolveFeedback(row, actor), true);
  assert.equal(canResolveFeedback(row, { ...actor, id: "colleague" }), false);
  assert.equal(canResolveFeedback(row, { ...actor, id: "colleague", organizationAdmin: true }), true);
  assert.equal(canResolveFeedback(row, { ...actor, organizationId: "org-b", organizationAdmin: true }), false);
  assert.equal(canResolveFeedback({ ...row, organization_id: null }, { ...actor, organizationId: null }), false);
  assert.equal(canResolveFeedback(row, { ...actor, organizationId: null, platformAdmin: true }), true);
});
test("catalogue IDs and source references remain valid for stored reports and search", () => {
  assert.equal(new Set(MATCHING_RULES.map(rule => rule.id)).size, MATCHING_RULES.length);
  for (const rule of MATCHING_RULES) { assert.match(rule.id, /^[a-z0-9-]{1,120}$/); assert.ok(rule.title.length <= 300); }
  for (const group of MATCHING_RULE_GROUPS) for (const source of group.sources) assert.ok(existsSync(join(process.cwd(), "src/lib", source)), source);
  assert.ok(filterMatchingRules("tryck").length > 0);
  assert.deepEqual(filterMatchingRules("tillbehor"), filterMatchingRules("tillbehör"));
  assert.ok(filterMatchingRules("", "gap").every(rule => rule.kind === "gap"));
});
