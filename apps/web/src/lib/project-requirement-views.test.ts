import assert from "node:assert/strict";
import test from "node:test";
import { groupProjectRequirementViews } from "./project-requirement-views";
import { splitDistributorRequirementLines } from "./distributor-requirement-lines";

test("RS takes priority and unquantified posts have their own information table", () => {
  const requirements = [
    { id: "hose", value_text: "Sprinklerslange", value_json: { unit: "st", quantity: 132 } },
    { id: "demolition", value_text: "Demontering", value_json: { operation: "remove", unit: "RS" } },
    { id: "drilling", value_text: "HULLTAKING FOR RØRGJENNOMFØRING", value_json: { unit: "st", quantity: 4 } },
    { id: "rs", value_text: "Maling av rør", value_json: { unit: " RS ", quantity: 1 } },
    { id: "rund-sum", value_text: "Komplett anlegg", value_json: { unit: "rund sum" } },
    { id: "inferred-rs", value_text: "BRANNSLOKKEANLEGG - KOMPLETT Rund sum", value_json: {} },
    { id: "missing", value_text: "SPRINKLER", value_json: { unit: "st", quantity: null } },
    { id: "empty", value_json: { quantity: " " } },
    { id: "invalid", value_json: { quantity: "unknown" } },
    { id: "measured-removal", value_json: { quantity: 10, unit: "m", operation: "remove" } },
    { id: "rejected", status: "rejected", value_json: { unit: "RS" } },
    { id: "superseded", status: "superseded", value_json: { operation: "remove" } }
  ];
  const views = groupProjectRequirementViews(requirements);
  assert.deepEqual(views.products.map(row => row.id), ["hose", "drilling", "measured-removal"]);
  assert.deepEqual(views.removal.map(row => row.id), ["missing", "empty", "invalid"]);
  assert.deepEqual(views.work, []);
  assert.deepEqual(views.rs.map(row => row.id), ["demolition", "rs", "rund-sum", "inferred-rs"]);
  const ids = Object.values(views).flat().map(row => row.id);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(splitDistributorRequirementLines(requirements).workRequirements.map(row => row.id), ["drilling", "rs", "rund-sum", "inferred-rs"]);
});

test("a number without a purchasing unit and free technical text are project information", () => {
  const units = [null, undefined, "", " ", "?", "—", "unknown", "bar", "DN80"];
  const information = units.map((unit, index) => ({ id: `missing-${index}`, value_json: { quantity: 12, unit } }));
  const text = { id: "leading-text", value_text: 'Lokalisering: Tilkobling til eksisterende anlegg, DN80, i "Gamlebygget" plan 1. Se tilbudstegning.', value_json: { attributes: { "dimensjon hovedledning": "DN80", trykk: "12 bar" } } };
  const measured = ["m", "M", "meter", "stk", "STK", "st", "m²", "m3", "kg", "liter"].map((unit, index) => ({ id: `measured-${index}`, value_json: { unit, quantity: "1,5" } }));
  const views = groupProjectRequirementViews([...information, text, ...measured]);
  assert.deepEqual(views.removal.map(row => row.id), [...information, text].map(row => row.id));
  assert.deepEqual(views.products.map(row => row.id), measured.map(row => row.id));
  assert.equal(views.rs.length, 0);
});

test("measured child posts do not inherit the parent's RS category", () => {
  const views = groupProjectRequirementViews([
    { id: "pipe", value_text: "Stålrør DN25", value_json: { quantity: 12, unit: "m", technicalSpecification: "Komplett anlegg Rund sum" } },
    { id: "work", value_text: "HULLTAKING", value_json: { quantity: 4, unit: "st", technicalSpecification: "Komplett anlegg Rund sum" } },
    { id: "missing", value_text: "Sprinkler", value_json: { technicalSpecification: "Komplett anlegg Rund sum" } }
  ]);
  assert.deepEqual(views.products.map(row => row.id), ["pipe", "work"]);
  assert.deepEqual(views.work, []);
  assert.deepEqual(views.removal.map(row => row.id), ["missing"]);
  assert.deepEqual(views.rs, []);
  assert.deepEqual(groupProjectRequirementViews([]), { products: [], removal: [], work: [], rs: [] });
});

test("recovered information stays informational when an older extraction supplied a quantity", () => {
  const information = { id: "information", value_json: { quantity: 12, unit: "st", reviewFlags: ["project-information"] } };
  const rs = { id: "rs", value_json: { unit: "RS", reviewFlags: ["project-information"] } };
  const views = groupProjectRequirementViews([information, rs]);
  assert.deepEqual(views.removal, [information]);
  assert.deepEqual(views.rs, [rs]);
  assert.deepEqual(views.products, []);
  assert.deepEqual(splitDistributorRequirementLines([information]).workRequirements, [information]);
});
