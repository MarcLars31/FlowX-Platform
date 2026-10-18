import assert from "node:assert/strict";
import { buildProductPostTree, productPostNavigationGroups, productPostExpansionKeys } from "./product-post-tree";
import { productChapterContents } from "./product-post-tree";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPostNavigation } from "../components/ProductPostNavigation";
import { createProjectDeliveryResource } from "./project-delivery-resource";
import test from "node:test";
import { groupProductRequirementsByPdfChapter } from "./product-post-groups";
import { groupProjectRequirementViews } from "./project-requirement-views";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";

const title = "1404 LB - 40.434 Elkraftfordeling til driftstekniske installasjoner";

test("chapter introductions stay first when products are explicitly sorted", () => {
  const intro = { ...post("intro", undefined, 1), value_json: { sourceChapter: { title, sourcePage: 1 }, chapterInformation: true, sourceOrder: 1 } };
  const first = post("first", "1404.40.434.1", 2);
  const second = post("second", "1404.40.434.2", 3);
  const groups = groupProductRequirementsByPdfChapter([second, first, intro], { allRequirements: [intro, first, second], preserveRowOrder: true });
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["intro", "second", "first"]);
});

test("electrical chapters include RS, information and products together, retaining page continuations", () => {
  const result = extractTechnicalDescriptionFromPages([
    { pageNumber: 1, method: "text" as const, confidence: .98, text: `1404.40.434.1 AM1.824A
KOORDINERENDE YTELSER
Rund Sum RS 0,00 0,00
Andre krav:
a) Omfang og prisgrunnlag
Gjelder maskininstallasjoner.
Sum denne side:
${title}
Postnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum` },
    { pageNumber: 2, method: "text" as const, confidence: .98, text: `b) Materialer
Korrosjonsklasse C4.
1404.40.434.2 WD2.1A
FELLES KRAV FOR FORDELING
Materiale: Stål
1404.40.434.2.1 WD2.1A
FORDELINGSSKAP
Antall stk 2
Sum denne side:
${title}
Postnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum` }
  ]);
  const rows = result.materialLines.map(line => ({ id: line.id, source_page: line.sourcePage,
    value_text: line.description, category: line.category, value_json: line }));
  const types = groupProjectRequirementViews(rows);
  assert.deepEqual([types.products.length, types.rs.length, types.removal.length], [1, 1, 1]);
  const chapters = groupProductRequirementsByPdfChapter([...types.products, ...types.rs, ...types.removal]);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, title);
  assert.deepEqual(chapters[0].requirements.map(row => row.value_json.postNumber),
    ["1404.40.434.1", "1404.40.434.2", "1404.40.434.2.1"]);
  assert.match(types.rs[0].value_json.technicalSpecification!, /Korrosjonsklasse C4/);
  assert.deepEqual(types.rs[0].value_json.sourcePages, [1, 2]);
});
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

test("numbered information headings stay in numeric order and own all their children", () => {
  const parent = { ...post("parent", "30.332.7", 1), value_json: { postNumber: "30.332.7", sourceChapter: { title }, chapterInformation: true } };
  const children = [7, 2, 1, 6, 3, 5, 4].map(n => post(`child${n}`, `30.332.7.${n}`, n + 3));
  const rows = [parent, ...children, post("previous6", "30.332.6", 2), post("previous5", "30.332.5", 2), post("next", "30.332.8", 3)];
  const [group] = productPostNavigationGroups(rows);
  assert.deepEqual(group.posts.map(node => node.requirement?.id), ["previous5", "previous6", "parent", "next"]);
  assert.deepEqual(group.posts[2].children.map(node => node.requirement?.id), Array.from({ length: 7 }, (_, n) => `child${n + 1}`));
  assert.deepEqual(group.requirements.map(row => row.id), ["previous5", "previous6", "parent", "child1", "child2", "child3", "child4", "child5", "child6", "child7", "next"]);
});

test("post trees use nearest numbered ancestor, numeric siblings and segment boundaries", () => {
  const rows = [post("ten", "30.332.7.10", 1), post("deep", "30.332.7.2.1", 1), post("two", "30.332.7.2", 2),
    post("parent", "30.332.7", 3), post("separate", "30.332.70.1", 1), post("missing-middle", "30.332.7.4.1", 1)];
  const roots = buildProductPostTree(rows);
  assert.deepEqual(roots.map(node => node.requirement?.id), ["parent", "separate"]);
  assert.deepEqual(roots[0].children.map(node => node.requirement?.id), ["two", "missing-middle", "ten"]);
  assert.equal(roots[0].children[0].children[0].requirement?.id, "deep");
});

test("filtered product views retain ancestor information and expose the active branch", () => {
  const parent = post("parent", "30.332.7", 1), middle = post("middle", "30.332.7.2", 2), child = post("child", "30.332.7.2.1", 3);
  const groups = productPostNavigationGroups([child], [post("other", "30.332.8", 4), parent, middle, child]);
  assert.deepEqual(groups[0].requirements.map(row => row.id), ["parent", "middle", "child"]);
  assert.deepEqual(productPostExpansionKeys(groups, "child"), [groups[0].key, "post:parent", "post:middle"]);
  assert.deepEqual(productPostExpansionKeys(groups, "parent"), [groups[0].key]);
});

test("a repeated number in another document or section never supplies a parent", () => {
  const parent = post("parent", "30.332.7", 1);
  const child = post("child", "30.332.7.1", 2, title, "other-pdf");
  const scopedChild = { ...post("scope-child", "30.332.7.2", 2), value_json: { postNumber: "30.332.7.2", postScope: "another-section" } };
  assert.equal(buildProductPostTree([parent, child, scopedChild]).length, 3);
  const duplicate = { ...parent, id: "duplicate" };
  assert.equal(buildProductPostTree([parent, duplicate, post("ambiguous", "30.332.7.1", 2)]).length, 3);
});

test("unnumbered chapter information remains first without swallowing numbered posts", () => {
  const intro = { ...post("intro", undefined, 1), value_json: { chapterInformation: true, sourceChapter: { title } } };
  const rows = [post("last", undefined, 2), post("parent", "30.332.7", 1), intro, post("child", "30.332.7.1", 1)];
  const tree = buildProductPostTree(rows);
  assert.deepEqual(tree.map(node => node.requirement?.id), ["intro", "parent", "last"]);
  assert.equal(tree[1].children[0].requirement?.id, "child");
});


test("PDF subchapter headings group six products without creating a seventh product", () => {
  const rows = [6, 2, 1, 5, 3, 4].map(n => ({ ...post(`sprinkler${n}`, `33.500.${n}`, Math.ceil(n / 2), "33 Brannslokking"),
    value_json: { postNumber: `33.500.${n}`, parentPostNumber: "33.500", parentDescription: "Utstyr for brannslokking med sprinkler",
      sourceChapter: { title: "33 Brannslokking" }, quantity: n, unit: "st" } }));
  const before = JSON.stringify(rows);
  const [group] = productPostNavigationGroups(rows);
  assert.equal(group.title, "33 Brannslokking");
  assert.equal(group.posts.length, 1);
  const parent = group.posts[0];
  assert.equal(parent.requirement, null);
  assert.deepEqual(parent.heading, { postNumber: "33.500", description: "Utstyr for brannslokking med sprinkler" });
  assert.deepEqual(parent.children.map(node => node.requirement?.id), Array.from({ length: 6 }, (_, n) => `sprinkler${n + 1}`));
  assert.equal(group.requirements.length, 6);
  assert.deepEqual(productPostExpansionKeys([group], "sprinkler4"), [group.key, parent.key]);
  const filtered = productPostNavigationGroups([rows[2]], rows)[0];
  assert.equal(filtered.posts[0].key, parent.key);
  assert.equal(filtered.requirements.length, 1);
  assert.equal(JSON.stringify(rows), before);
});

test("navigation-only headings respect document, scope and number boundaries", () => {
  const child = (id: string, number: string, document = "pdf", scope = "") => ({
    ...post(id, number, 1, "33 Brannslokking", document),
    value_json: { postNumber: number, parentPostNumber: "33.500", parentDescription: "Utstyr", postScope: scope }
  });
  const tree = buildProductPostTree([child("a", "33.500.1"), child("b", "33.500.1", "other"),
    child("c", "33.500.1", "pdf", "building-b"), child("unrelated", "33.5000.1")]);
  assert.equal(tree.length, 4);
  assert.equal(tree.filter(node => node.heading).length, 3);
  assert.equal(tree.find(node => node.requirement?.id === "unrelated")?.children.length, 0);
  const existing = post("real-parent", "33.500", 1, "33 Brannslokking");
  const realTree = buildProductPostTree([child("a", "33.500.1"), existing]);
  assert.equal(realTree.length, 1);
  assert.equal(realTree[0].requirement?.id, "real-parent");
  assert.equal(realTree[0].heading, undefined);
  const chapterChild = { ...child("a", "33.500"), value_json: { postNumber: "33.500", parentPostNumber: "33", sourceChapter: { title: "33 Brannslokking" } } };
  assert.equal(productPostNavigationGroups([chapterChild])[0].posts[0].heading, undefined);
});

test("conflicting parent titles are not silently attributed to another post", () => {
  const rows = ["Rør", "Ventiler"].map((name, n) => ({ ...post(String(n), `33.500.${n + 1}`, 1),
    value_json: { postNumber: `33.500.${n + 1}`, parentPostNumber: "33.500", parentDescription: name } }));
  assert.equal(buildProductPostTree(rows)[0].heading?.description, "Hovedpost");
});

test("subchapters open directly on their own posts without repeating the outer PDF chapter", () => {
  const rows = ["02.30.300", "02.30.311"].flatMap((number, index) => {
    const chapter = `${number} ${index ? "Bunnledninger" : "VVS-installasjoner, generelt"}`;
    const parent = { ...post(`main${index}`, number, index + 1, chapter),
      value_text: `Hovedpost ${number}`, value_json: { postNumber: number, parentPostNumber: "02.30",
        parentDescription: "VVS-installasjoner", sourceChapter: { title: chapter }, chapterInformation: true } };
    const child = { ...post(`child${index}`, `${number}.1`, index + 1, chapter),
      value_json: { postNumber: `${number}.1`, parentPostNumber: number, sourceChapter: { title: chapter }, quantity: 12, unit: "m" } };
    return [parent, child];
  });
  const original = JSON.stringify(rows);
  const groups = productPostNavigationGroups(rows);
  assert.deepEqual(groups.map(group => group.key), groupProductRequirementsByPdfChapter(rows).map(group => group.key));
  assert.equal(groups.length, 2);
  groups.forEach((group, index) => {
    assert.equal(group.posts.length, 1);
    assert.equal(group.posts[0].requirement?.id, `main${index}`);
    assert.equal(group.posts[0].heading, undefined);
    assert.equal(group.posts[0].children[0].requirement?.id, `child${index}`);
    assert.deepEqual(group.requirements.map(row => row.id), [`main${index}`, `child${index}`]);
    assert.deepEqual(productPostExpansionKeys(groups, `child${index}`), [group.key, `post:main${index}`]);
  });
  const filtered = productPostNavigationGroups([rows[1]], rows);
  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0].requirements.map(row => row.id), ["main0", "child0"]);
  assert.equal(filtered[0].posts[0].requirement?.id, "main0");
  assert.equal(JSON.stringify(rows), original);
});

function sanitaryChapter() {
  const chapter = "02.30.315 Utstyr for sanitærinstallasjoner";
  const intro = { ...post("sanitary-intro", "02.30.315", 1, chapter), value_text: "Utstyr for sanitærinstallasjoner",
    value_json: { postNumber: "02.30.315", chapterInformation: true, sourceChapter: { title: chapter } } };
  const children = Array.from({ length: 28 }, (_, index) => ({
    ...post(`sanitary-${index + 1}`, `02.30.315.${index + 1}`, 2, chapter), value_text: `Produkt ${index + 1}`
  }));
  return [intro, ...children];
}

test("the chapter count excludes its repeated introduction and one expansion reveals all 28 posts", () => {
  const rows = sanitaryChapter();
  const original = JSON.stringify(rows);
  const groups = productPostNavigationGroups(rows);
  const contents = productChapterContents(groups[0]);
  assert.deepEqual(contents.posts.map(node => node.requirement?.id), rows.slice(1).map(row => row.id));
  assert.equal(contents.requirements.length, 28);
  assert.deepEqual(contents.chapterPosts.map(row => row.id), ["sanitary-intro"]);
  // Keep the original row available to the product card, assignment and back/next navigation.
  assert.equal(groups[0].requirements.length, 29);
  assert.equal(JSON.stringify(rows), original);

  const render = (expandedKeys: Set<string>) => renderToStaticMarkup(createElement(ProductPostNavigation, {
    groups, requirements: rows, projectId: "test", resource: createProjectDeliveryResource("test"),
    expandedKeys, onToggle: () => {}, onSelect: () => true, handledIds: new Set(["sanitary-intro", "sanitary-1"]), disabled: false
  }));
  const closed = render(new Set());
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /<small>28 poster<\/small>/);
  assert.match(closed, /<small>1 håndtert<\/small>/);
  assert.doesNotMatch(closed, /id="product-post-row-sanitary-/);
  const open = render(new Set([groups[0].key]));
  for (const row of rows.slice(1)) assert.ok(open.includes(`id="product-post-row-${row.id}"`));
  assert.match(open, /id="product-post-row-sanitary-intro"/);
  assert.match(open, /Åpne kapitteltekst: 02.30.315 Utstyr for sanitærinstallasjoner/);
  assert.doesNotMatch(open, /Hovedpost · 28 underposter|product-post-parent-toggle/);
  assert.equal((open.match(/Utstyr for sanitærinstallasjoner<\/span>/g) ?? []).length, 1);
});

test("opening a filtered chapter shows parent and nested posts as separate rows without extra expansions", () => {
  const rows = sanitaryChapter();
  const nested = { ...post("nested", "02.30.315.2.1", 3, "02.30.315 Utstyr for sanitærinstallasjoner"), value_text: "Underpost" };
  const all = [...rows, nested];
  const [group] = productPostNavigationGroups([nested], all);
  const contents = productChapterContents(group);
  assert.deepEqual(contents.posts.map(node => node.requirement?.id), ["sanitary-2"]);
  assert.deepEqual(contents.posts[0].children.map(node => node.requirement?.id), ["nested"]);
  assert.deepEqual(contents.requirements.map(row => row.id), ["sanitary-2", "nested"]);
  assert.deepEqual(contents.chapterPosts.map(row => row.id), ["sanitary-intro"]);
  assert.equal(new Set(contents.requirements.map(row => row.id)).size, contents.requirements.length);
  const html = renderToStaticMarkup(createElement(ProductPostNavigation, {
    groups: [group], requirements: all, projectId: "test", resource: createProjectDeliveryResource("test"),
    expandedKeys: new Set([group.key]), onToggle: () => {}, onSelect: () => true,
    handledIds: new Set<string>(), disabled: false
  }));
  assert.match(html, /id="product-post-row-nested"/);
  assert.match(html, /id="product-post-row-sanitary-2"/);
  assert.doesNotMatch(html, /product-post-parent-toggle|product-post-children|aria-expanded="false"/);
});

test("02.30.312 shows every level in numeric order after only opening its chapter", () => {
  const chapter = "02.30.312 Ledningsnett for sanitærinstallasjoner";
  const row = (id: string, number: string, parent?: string) => ({
    ...post(id, number, 1, chapter), value_text: id,
    value_json: { postNumber: number, parentPostNumber: parent, parentDescription: "Rørledninger", sourceChapter: { title: chapter }, quantity: 2, unit: "m" }
  });
  const rows = [row("ten", "02.30.312.1.10"), row("deep", "02.30.312.1.2.1"),
    row("two", "02.30.312.1.2"), row("main", "02.30.312.1"),
    row("synthetic-child", "02.30.312.2.1", "02.30.312.2"), row("direct", "02.30.312.3")];
  const other = post("other", "02.30.313.1", 2, "02.30.313 Annet kapittel");
  const all = [...rows, other];
  const before = JSON.stringify(all);
  const groups = productPostNavigationGroups(all);
  const group = groups.find(item => item.title === chapter)!;
  const html = renderToStaticMarkup(createElement(ProductPostNavigation, {
    groups, requirements: all, projectId: "test", resource: createProjectDeliveryResource("test"),
    expandedKeys: new Set([group.key]), onToggle: () => {}, onSelect: () => true,
    handledIds: new Set(["two"]), activeRequirementId: "deep", disabled: false
  }));
  assert.deepEqual([...html.matchAll(/id="product-post-row-([^"]+)"/g)].map(match => match[1]),
    ["main", "two", "deep", "ten", "synthetic-child", "direct"]);
  assert.match(html, /<small>6 poster<\/small>/);
  assert.match(html, /<small>1 håndtert<\/small>/);
  assert.match(html, /id="product-post-row-deep"[^>]*aria-current="true"/);
  assert.doesNotMatch(html, /product-post-parent-toggle|product-post-children|Hovedpost ·|Underkapittel ·/);
  assert.equal(JSON.stringify(all), before);
});

test("a priced chapter post stays selectable and counted while its children appear directly", () => {
  const rows = sanitaryChapter();
  const priced = { ...rows[0], value_json: { ...rows[0].value_json, chapterInformation: false, quantity: 1, unit: "st" } };
  const [group] = productPostNavigationGroups([priced, ...rows.slice(1)]);
  const contents = productChapterContents(group);
  assert.equal(contents.chapterPosts.length, 0);
  assert.equal(contents.requirements.length, 29);
  assert.equal(contents.posts[0].requirement?.id, priced.id);
  assert.equal(contents.posts[0].children.length, 0);
  assert.equal(contents.posts.length, 29);
  assert.equal(group.posts[0].children.length, 28);
});

test("chapter text alone remains accessible and unrelated chapter numbers keep their hierarchy", () => {
  const [intro] = sanitaryChapter();
  const [group] = productPostNavigationGroups([intro]);
  assert.equal(productChapterContents(group).chapterPosts[0].id, intro.id);
  assert.equal(productChapterContents(group).requirements.length, 0);
  const rows = sanitaryChapter();
  const [other] = productPostNavigationGroups(rows.map(row => ({ ...row,
    value_json: { ...row.value_json, sourceChapter: { title: "02.30.3150 Et annet kapittel" } }
  })));
  assert.equal(productChapterContents(other).chapterPosts.length, 0);
  assert.equal(productChapterContents(other).posts[0].children.length, 28);
});

test("redundant headings use complete chapter segments and allow trailing chapter dots", () => {
  const child = (parent: string) => ({ ...post("child", `${parent}.1`, 1),
    value_json: { postNumber: `${parent}.1`, parentPostNumber: parent, parentDescription: "Overskrift" } });
  for (const chapter of ["02.30.300", "02.30.300."]) {
    for (const parent of ["02", "02.30", "02.30.300"]) {
      assert.equal(buildProductPostTree([child(parent)], chapter)[0].heading, undefined);
    }
    for (const parent of ["02.30.300.2", "02.30.30"]) {
      assert.equal(buildProductPostTree([child(parent)], chapter)[0].heading?.postNumber, parent);
    }
  }
  assert.equal(buildProductPostTree([child("02.30")])[0].heading?.postNumber, "02.30");
});

test("real ancestor posts remain accessible even when their number is above the current chapter", () => {
  const parent = post("real-parent", "02.30", 1, "02.30.300 VVS-installasjoner, generelt");
  const child = { ...post("child", "02.30.300.1", 2, "02.30.300 VVS-installasjoner, generelt"),
    value_json: { postNumber: "02.30.300.1", parentPostNumber: "02.30", parentDescription: "VVS-installasjoner" } };
  const tree = buildProductPostTree([parent, child], "02.30.300");
  assert.equal(tree.length, 1);
  assert.equal(tree[0].requirement?.id, parent.id);
  assert.equal(tree[0].children[0].requirement?.id, child.id);
});

test("Sprinkler PDF extraction preserves the subchapter even without a priced heading row", () => {
  const result = extractTechnicalDescriptionFromPages([{ pageNumber: 1, method: "text", confidence: .99,
    text: `Kapittel: 33 Brannslokking
Postnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum
33.500 Utstyr for brannslokking med sprinkler
33.500.1 UE2.11111132
SPRINKLER
Antall stk 60
Sprinkleranlegg: Våtanlegg
33.500.2 UE2.11111232
SPRINKLER
Antall stk 67
Sprinkleranlegg: Våtanlegg` }]);
  assert.equal(result.materialLines.length, 2);
  assert.equal(result.materialLines[0].parentPostNumber, "33.500");
  assert.equal(result.materialLines[0].parentDescription, "Utstyr for brannslokking med sprinkler");
  const rows = result.materialLines.map(line => ({ id: line.id, value_json: line }));
  assert.equal(productPostNavigationGroups(rows)[0].posts[0].heading?.postNumber, "33.500");
});
