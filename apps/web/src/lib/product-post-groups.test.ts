import assert from "node:assert/strict";
import test from "node:test";
import { groupProductRequirementsByMainPost } from "./product-post-groups";

function post(id: string, postNumber?: string, parentPostNumber?: string) {
  return { id, value_json: { postNumber, parentPostNumber } };
}

test("groups pipe dimensions by main post in numeric order without losing rows", () => {
  const rows = [post("dn65", "33.2.2.10", "33.2.2"), post("dn32", "33.2.2.2"),
    post("sprinkler", "33.4.1", "33.4"), post("dn25", "33.2.2.1", "33.2.2")];
  const groups = groupProductRequirementsByMainPost(rows);
  assert.deepEqual(groups.map(group => group.postNumber), ["33.2.2", "33.4"]);
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["dn25", "dn32", "dn65"]);
  assert.equal(groups.flatMap(group => group.requirements).length, rows.length);
});

test("priced main posts stay with their accessories when category filters hide the children", () => {
  const main = post("valve", "33.3.2", "33.3");
  const alarm = post("alarm", "33.3.2.1", "33.3.2");
  const allRequirements = [main, alarm];
  assert.deepEqual(groupProductRequirementsByMainPost(allRequirements).map(group => [group.postNumber, group.requirements.length]), [["33.3.2", 2]]);
  assert.equal(groupProductRequirementsByMainPost([main], { allRequirements })[0].postNumber, "33.3.2");
});

test("honors extracted parent numbers, retains unnumbered posts and preserves explicit table sorting", () => {
  const rows = [post("two", "B2.30.33.332.2.2", "B2.30.33.332.2"),
    post("one", "B2.30.33.332.2.1", "B2.30.33.332.2"), post("missing")];
  const groups = groupProductRequirementsByMainPost(rows, { preserveRowOrder: true });
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["two", "one"]);
  assert.equal(groups[0].postNumber, "B2.30.33.332.2");
  assert.equal(groups[1].postNumber, null);
  assert.equal(groups[1].requirements[0].id, "missing");
});
