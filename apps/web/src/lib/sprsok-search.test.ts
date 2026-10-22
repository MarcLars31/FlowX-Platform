import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSprsokSearchOr,
  isMissingSprsokSearchView,
  sprsokIlikeContains,
  sprsokExactNumberFilter
} from "./sprsok-search";

test("indexed query searches both display text and normalized article number", () => {
  const filter = buildSprsokSearchOr(["sin", "leverandor"], "00-12 3", true);
  assert.ok(filter);
  assert.match(filter, /sin\.ilike\.\*00-12\*/);
  assert.match(filter, /sin\.ilike\.\*3\*/);
  assert.match(filter, /normalized_article_number\.ilike\.\*00123\*/);
});

test("multi-word search requires all words but allows them in different columns and product names", () => {
  const filter = buildSprsokSearchOr(["sin", "leverandor", "rti"], "Tyco QR", true);
  assert.ok(filter);
  assert.match(filter, /^\(and\(or\(/);
  assert.match(filter, /leverandor\.ilike\.\*tyco\*/);
  assert.match(filter, /rti\.ilike\.\*qr\*/);
  assert.match(filter, /search_document\.ilike\.\*tyco\*/);
  assert.match(filter, /rti\.ilike\.\*quick response\*/);
  assert.doesNotMatch(filter, /\*tyco qr\*/i);
  assert.doesNotMatch(buildSprsokSearchOr(["sin"], "Tyco QR", false)!, /search_document|normalized_article_number/);
});

test("punctuation-only searches do not generate match-all clauses", () => {
  assert.equal(buildSprsokSearchOr(["sin"], '\\"%_*(),[]{}', true), null);
});

test("numeric filters match whole values, decimal commas and dual notation without substring false positives", () => {
  const pattern = new RegExp(sprsokExactNumberFilter("80,0").slice("imatch.".length), "i");
  for (const value of ["80", "K80", "80.0", "80 (5.6)"]) assert.ok(pattern.test(value), value);
  for (const value of ["800", "180", "80.5", "0.80"]) assert.ok(!pattern.test(value), value);
});

test("PostgREST filters remove wildcard and control syntax without quoting the pattern", () => {
  assert.equal(sprsokIlikeContains('A"B\\C,*%_()'), "ilike.*ABC*");
});

test("legacy fallback is limited to explicit missing-schema errors", () => {
  assert.equal(isMissingSprsokSearchView(new Error("PGRST205 table not found")), true);
  assert.equal(isMissingSprsokSearchView(new Error("Supabase 403 permission denied")), false);
  assert.equal(isMissingSprsokSearchView(new Error("Supabase 500 timeout")), false);
});
