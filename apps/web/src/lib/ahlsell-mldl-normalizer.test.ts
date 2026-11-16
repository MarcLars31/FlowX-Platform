import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAhlsellMldlRows, parseAhlsellMldlRow } from "./ahlsell-mldl-normalizer";

test("normalizes a conventional K80 sprinkler as DN15", () => {
  const row = parseAhlsellMldlRow('9254042 / 6 (1/2" V2703 sprinklerhode K80 SSU 68C SR .mess / LC Eidsvoll)');

  assert.ok(row);
  assert.equal(row.articleNumber, "9254042");
  assert.equal(row.category, "sprinkler_head");
  assert.deepEqual(row.dnValues, [15]);
  assert.equal(row.kFactor, 80);
  assert.equal(row.orientation, "upright");
  assert.equal(row.response, "SR");
  assert.equal(row.finish, "brass");
  assert.equal(row.sprinklerHeadType, "standard");
  assert.deepEqual(row.reviewFlags, []);
});

test("keeps dry sprinkler construction separate and accepts K80 DN25", () => {
  const row = parseAhlsellMldlRow('9256678 / 8 (1" V3613 sprinklerhode K80 317mm SSP tørr 68C hvit / Gardermoen Sentralla)');

  assert.ok(row);
  assert.deepEqual(row.dnValues, [25]);
  assert.equal(row.sprinklerHeadType, "dry");
  assert.equal(row.orientation, "pendent");
  assert.ok(row.reviewFlags.includes("Missing response type"));
  assert.ok(!row.reviewFlags.some((flag) => flag.includes("expected as DN25")));
});

test("recognizes Ahlsell typos and extended coverage", () => {
  const row = parseAhlsellMldlRow('9254051 / 6 (3/4" V3416 Sprinlerlhode K115 HSW 68C QR ext.cov.light. hvi / LC Eidsvoll)');

  assert.ok(row);
  assert.equal(row.category, "sprinkler_head");
  assert.deepEqual(row.dnValues, [20]);
  assert.equal(row.orientation, "sidewall");
  assert.equal(row.coverage, "extended");
  assert.equal(row.finish, "white");
});

test("accepts a leading inch fraction even when Ahlsell omitted the inch mark", () => {
  const row = parseAhlsellMldlRow("1364601 / 6 (3/4 V3702 Sprinklerhode K115 Ned 68°C QR Hvit / LC Eidsvoll)");

  assert.ok(row);
  assert.deepEqual(row.dnValues, [20]);
  assert.equal(row.nominalSizeRaw, "3/4");
  assert.deepEqual(row.reviewFlags, []);
});

test("keeps every branch size in a compound outside-diameter description", () => {
  const row = parseAhlsellMldlRow("9253071 / 6 (76.1x60.3mm reduksjon rød VIC 750 - VKS / LC Eidsvoll)");

  assert.ok(row);
  assert.deepEqual(row.outsideDiameterMm, [60.3, 76.1]);
  assert.deepEqual(row.dnValues, [50, 65]);
});

test("maps outside diameter to DN and retains the valve pressure class", () => {
  const row = parseAhlsellMldlRow("9253207 / 6 (114.3mm spjeldventil sort V761 rillet PN20 - VKS / LC Eidsvoll)");

  assert.ok(row);
  assert.equal(row.category, "valve");
  assert.deepEqual(row.outsideDiameterMm, [114.3]);
  assert.deepEqual(row.dnValues, [100]);
  assert.equal(row.model, "V761");
  assert.equal(row.pressureClass, "PN20");
  assert.equal(row.connection, "grooved");
});

test("merges warehouse rows by article number without losing source traceability", () => {
  const result = normalizeAhlsellMldlRows([
    "9253207 / 6 (114.3mm spjeldventil sort V761 rillet PN20 - VKS / LC Eidsvoll)",
    "9253207 / 8 (114.3mm spjeldventil sort V761 rillet PN20 - VKS / Gardermoen Sentralla)"
  ]);

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].sourceRowCount, 2);
  assert.deepEqual(result.products[0].locations, ["LC Eidsvoll", "Gardermoen Sentralla"]);
  assert.equal(result.products[0].dataStatus, "Ready for matching");
});
