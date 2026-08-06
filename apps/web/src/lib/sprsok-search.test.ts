import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSprsokSearchOr,
  isMissingSprsokSearchView,
  sprsokIlikeContains
} from "./sprsok-search";

test("indexed query searches both display text and normalized article number", () => {
  const filter = buildSprsokSearchOr(["sin", "leverandor"], "00-12 3", true);
  assert.match(filter, /sin\.ilike\.\*00-12 3\*/);
  assert.match(filter, /normalized_article_number\.ilike\.\*00123\*/);
});

test("PostgREST filters remove wildcard and control syntax without quoting the pattern", () => {
  assert.equal(sprsokIlikeContains('A"B\\C,*%_()'), "ilike.*ABC*");
});

test("legacy fallback is limited to explicit missing-schema errors", () => {
  assert.equal(isMissingSprsokSearchView(new Error("PGRST205 table not found")), true);
  assert.equal(isMissingSprsokSearchView(new Error("Supabase 403 permission denied")), false);
  assert.equal(isMissingSprsokSearchView(new Error("Supabase 500 timeout")), false);
});
