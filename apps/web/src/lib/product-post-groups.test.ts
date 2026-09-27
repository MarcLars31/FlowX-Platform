import assert from "node:assert/strict";
import test from "node:test";
import { groupProductRequirementsByPdfChapter } from "./product-post-groups";

const title = "1404 LB - 40.434 Elkraftfordeling til driftstekniske installasjoner";
function post(id: string, postNumber: string | undefined, source_page: number, chapter = title, document = "pdf") {
  return { id, source_page, source_technical_description_document_id: document,
    value_json: { postNumber, sourceChapter: chapter ? { title: chapter, sourcePage: 1 } : null } };
}

test("puts every main post and child under the full PDF chapter title in source order", () => {
  const rows = [post("child2", "1404.40.434.13.2", 1499), post("main12", "1404.40.434.12", 1498),
    post("child1", "1404.40.434.13.1", 1499), post("main10", "1404.40.434.10", 1498)];
  const groups = groupProductRequirementsByPdfChapter(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, title);
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["main10", "main12", "child1", "child2"]);
});

test("chapter and row order follow PDF pages rather than a global post-number sort", () => {
  const first = post("early", "90.4.10", 2, "90 Ventiler");
  const later = post("late", "10.4.1", 8, "10 Rør");
  const laterInFirst = post("late-first", "90.4.1", 3, "90 Ventiler");
  const groups = groupProductRequirementsByPdfChapter([later, laterInFirst, first]);
  assert.deepEqual(groups.map(group => group.title), ["90 Ventiler", "10 Rør"]);
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["early", "late-first"]);
});

test("explicit column sorting stays inside chapters and filtering does not change chapter order", () => {
  const first = post("first", "1.1", 1, "A");
  const second = post("second", "1.2", 2, "A");
  const other = post("other", "2.1", 3, "B");
  const groups = groupProductRequirementsByPdfChapter([other, second, first], {
    allRequirements: [first, second, other], preserveRowOrder: true
  });
  assert.deepEqual(groups.map(group => group.title), ["A", "B"]);
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["second", "first"]);
  assert.equal(groupProductRequirementsByPdfChapter([second], { allRequirements: [first, second, other] })[0].key, groups[0].key);
});

test("retains unnumbered rows and keeps buildings and documents separate", () => {
  const rows = [post("lb", "1404.40.434.1", 1),
    post("hm", "1401.40.434.1", 2, title.replace("1404 LB", "1401 HM")),
    post("other-pdf", "1404.40.434.1", 1, title, "other"), post("unnumbered", undefined, 3, "")];
  const groups = groupProductRequirementsByPdfChapter(rows);
  assert.equal(groups.length, 4);
  assert.equal(groups.find(group => group.requirements[0].id === "unnumbered")?.title, "Kapitel saknas i PDF");
  assert.equal(new Set(groups.flatMap(group => group.requirements.map(row => row.id))).size, rows.length);
});
