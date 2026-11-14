import assert from "node:assert/strict";
import test from "node:test";
import catalog from "@/data/ns3420-code-catalog.json";
import { ns3420CodeInfo } from "./ns3420-code-catalog";

test("looks up the complete sprinkler code despite OCR spacing and letter case", () => {
  const info = ns3420CodeInfo(" ue2. 11112912 \n");
  assert.equal(info?.code, "UE2.11112912");
  assert.equal(info?.kind, "reference");
  assert.equal(info?.label, "Sprinkler");
  assert.equal(info?.additionalRequirements, false);
});

test("distinguishes a hose from a complete pipe system and a pipe part", () => {
  assert.equal(ns3420CodeInfo("UB1.33114699900A")?.label, "Slang för brandsläckning");
  assert.equal(ns3420CodeInfo("UB1.31114399900")?.label, "Rörledning för brandsläckning – komplett");
  assert.equal(ns3420CodeInfo("UB1.349999449923332")?.label, "Rördel för brandsläckning");
});

test("distinguishes shutoff, check and special valves", () => {
  assert.equal(ns3420CodeInfo("UC1.3121151")?.label, "Avstängningsventil inomhus");
  assert.equal(ns3420CodeInfo("UC4.591110")?.label, "Backventil inomhus");
  assert.equal(ns3420CodeInfo("UC4.77999951")?.label, "Specialventil inomhus");
});

test("retains the A suffix and explains that the post has additional requirements", () => {
  const info = ns3420CodeInfo("UE2.11112512A");
  assert.equal(info?.kind, "reference");
  assert.equal(info?.code, "UE2.11112512A");
  assert.equal(info?.additionalRequirements, true);
  assert.equal(ns3420CodeInfo("UE2.11112512")?.additionalRequirements, false);
});

test("does not infer a missing meaning from a similar code or a known base code", () => {
  for (const code of ["UE2.11112999", "UE2.11112912X", "UD2.27A", "UE2.11", "XYZ.123", "NS 3420 UE2.11112912"]) {
    assert.equal(ns3420CodeInfo(code)?.kind, "unknown", code);
    assert.equal(ns3420CodeInfo(code)?.heading, null, code);
  }
});

test("never interprets project-specific percent codes as shared NS definitions", () => {
  for (const code of ["%SMA.032", "%UE2.11112912", "%UZA.204"]) {
    assert.equal(ns3420CodeInfo(code)?.kind, "project");
    assert.equal(ns3420CodeInfo(code)?.heading, null);
  }
});

test("handles missing code values without inventing a value", () => {
  for (const value of [undefined, null, "", "  ", 123, {}, []]) assert.equal(ns3420CodeInfo(value), null);
});

test("every shared reference is unique, has a meaning and identifies its source page", () => {
  assert.equal(catalog.scope, "document_heading_reference");
  assert.equal(catalog.standardEdition, null);
  assert.equal(new Set(catalog.codes.map((item) => item.code)).size, catalog.codes.length);
  assert.equal(new Set(catalog.meanings.map((item) => item.id)).size, catalog.meanings.length);
  for (const entry of catalog.codes) {
    assert.match(entry.code, /^[A-Z]{2}\d\.\d+A?$/);
    assert.ok(catalog.meanings.some((item) => item.id === entry.meaningId));
    assert.ok(entry.references.length > 0);
    for (const ref of entry.references) {
      assert.ok(catalog.sources.some((source) => source.id === ref.sourceId));
      assert.ok(Number.isInteger(ref.page) && ref.page > 0);
    }
  }
});
