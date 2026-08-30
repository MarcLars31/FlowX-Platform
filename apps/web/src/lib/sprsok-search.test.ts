import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSprsokSearchOr,
  isMissingSprsokSearchView,
  sprsokIlikeContains
} from "./sprsok-search";
import {
  mergeSprsokAssistedAhlsellQueries,
  rankSprsokTechnicalReferences,
  type SprsokTechnicalRow
} from "./sprsok-technical-match";

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

test("technical matching uses exact K, response and orientation instead of substring similarity", () => {
  const references = rankSprsokTechnicalReferences(
    sprinklerRequirement({
      model: "V2704",
      kFactor: "80",
      response: "Kvikk respons",
      placement: "Opp"
    }),
    [
      sprsokRow({ id: 1, sin: "V2704", type: "Standard Dekning", utforelse: "Stående | Upright", k_verdi: "80 (5.6)", rti: "QR" }),
      sprsokRow({ id: 2, type: "Sprinklerhode Modell V2704 QR", utforelse: "Opp", k_verdi: "180", rti: "QR" }),
      sprsokRow({ id: 3, type: "Sprinklerhode Modell V2704 SR", utforelse: "Opp", k_verdi: "80", rti: "SR" }),
      sprsokRow({ id: 4, type: "Sprinklerhode Modell V2704 QR", utforelse: "Ned", k_verdi: "80", rti: "QR" })
    ]
  );

  assert.deepEqual(references.map((reference) => reference.sourceId), ["1"]);
  assert.equal(references[0]?.queryEligible, true);
  assert.match(references[0]?.ahlsellSearchQuery ?? "", /^V2704 K80 QR Opp$/);
});

test("implausible source K1145 blocks a stored OCR decimal and all technical assistance", () => {
  const requirement = sprinklerRequirement({
    model: "V2704",
    kFactor: "114.5",
    response: "Kvikk respons",
    placement: "Opp"
  });
  requirement.source_excerpt = "SPRINKLER\nK-faktor: 1145\nKvikk respons\nOpp";

  assert.deepEqual(rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, k_verdi: "115", rti: "QR", utforelse: "Opp" })
  ]), []);
});

test("generic text and the phrase opp til do not invent an upright sprinkler match", () => {
  const requirement = sprinklerRequirement({
    model: "",
    kFactor: "80",
    response: "",
    placement: ""
  });
  requirement.value_text = "Sprinkler, åpning opp til 19 mm";
  requirement.source_excerpt = "K-faktor: 80. Åpning opp til 19 mm.";

  assert.deepEqual(rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, k_verdi: "80", utforelse: "Opp" })
  ]), []);
});

test("saved product-resolution text is ignored when building the requirement profile", () => {
  const requirement = sprinklerRequirement({
    model: "",
    kFactor: "80",
    response: "",
    placement: ""
  });
  requirement.value_json = {
    attributes: { "K-faktor": "80" },
    productResolution: { productName: "V2704 QR Opp" },
    attachments: [{ comment: "Victaulic V2704 QR Opp" }]
  };

  assert.deepEqual(rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, type: "Sprinklerhode V2704 QR", utforelse: "Opp", k_verdi: "80", rti: "QR" })
  ]), []);
});

test("numeric RTI is not silently converted to a response class", () => {
  const references = rankSprsokTechnicalReferences(
    sprinklerRequirement({
      model: "V2704",
      kFactor: "80",
      response: "Kvikk respons",
      placement: "Opp"
    }),
    [sprsokRow({ id: 1, type: "Sprinklerhode V2704", utforelse: "Opp", k_verdi: "80", rti: "50" })]
  );

  assert.equal(references.length, 1);
  assert.doesNotMatch(references[0]?.ahlsellSearchQuery ?? "", /\bQR\b/);
  assert.ok(!references[0]?.matchedFields.includes("quick respons"));
});

test("assisted queries keep the original search first, stay bounded and never use SIN as NRF", () => {
  const [reference] = rankSprsokTechnicalReferences(
    sprinklerRequirement({
      model: "V2704",
      kFactor: "80",
      response: "Kvikk respons",
      placement: "Opp"
    }),
    [sprsokRow({ id: 1, sin: "SIN-DO-NOT-SAVE", type: "Sprinklerhode V2704 QR", utforelse: "Opp", k_verdi: "80", rti: "QR" })]
  );
  const merged = mergeSprsokAssistedAhlsellQueries(
    ["Sprinklerhode K80", "Sprinkler K80 QR Opp", "Sprinkler 68"],
    reference ? [reference] : []
  );

  assert.equal(merged.used, true);
  assert.equal(merged.queries[0], "Sprinklerhode K80");
  assert.equal(merged.queries[1], "Sprinkler K80 QR Opp");
  assert.equal(merged.queries.length, 3);
  assert.ok(merged.queries.every((query) => !query.includes("SIN-DO-NOT-SAVE")));
});

test("generic technical requirements never inject arbitrary SPRSÖK brands or models", () => {
  const requirement = sprinklerRequirement({
    model: "",
    kFactor: "80",
    response: "Kvikk respons",
    placement: "Opp"
  });
  const references = rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, sin: "TY313", leverandor: "Tyco", type: "Standard Dekning", utforelse: "Stående | Upright", k_verdi: "80 (5.6)", rti: "QR" }),
    sprsokRow({ id: 2, sin: "V2704", leverandor: "Victaulic", type: "Standard Dekning", utforelse: "Stående | Upright", k_verdi: "80 (5.6)", rti: "QR" })
  ]);
  const merged = mergeSprsokAssistedAhlsellQueries(
    ["Sprinklerhode K80", "Sprinkler K80 QR Opp"],
    references
  );

  assert.equal(merged.used, false);
  assert.deepEqual(merged.queries, ["Sprinklerhode K80", "Sprinkler K80 QR Opp"]);
  assert.ok(references.every((reference) => !reference.queryEligible));
});

test("a dry sprinkler requirement never uses a wet standard SPRSÖK reference", () => {
  const requirement = sprinklerRequirement({
    model: "V2704",
    kFactor: "80",
    response: "Kvikk respons",
    placement: "Opp"
  });
  requirement.value_text = "Tørrsprinkler V2704";
  requirement.source_excerpt = "Tørrsprinkler V2704\nK-faktor: 80\nKvikk respons\nPlassering: Opp";

  assert.deepEqual(rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, sin: "V2704", type: "Standard Dekning", utforelse: "Stående | Upright", k_verdi: "80 (5.6)", rti: "QR" })
  ]), []);
});

test("a boligsprinkler requirement rejects an ordinary standard-coverage row", () => {
  const requirement = sprinklerRequirement({
    model: "V2704",
    kFactor: "80",
    response: "Kvikk respons",
    placement: "Opp"
  });
  requirement.value_text = "Boligsprinkler V2704";
  requirement.source_excerpt = "Boligsprinkler V2704\nK-faktor: 80\nKvikk respons\nPlassering: Opp";

  assert.deepEqual(rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, sin: "V2704", type: "Standard Dekning", utforelse: "Stående | Upright", k_verdi: "80 (5.6)", rti: "QR" })
  ]), []);
});

test("a punctuated SPRSÖK SIN can match the same explicit model in the PDF", () => {
  const requirement = sprinklerRequirement({
    model: "TY-B",
    kFactor: "80",
    response: "Kvikk respons",
    placement: "Opp"
  });
  const references = rankSprsokTechnicalReferences(requirement, [
    sprsokRow({ id: 1, sin: "TY-B", leverandor: "Tyco", type: "Standard Dekning", utforelse: "Stående | Upright", k_verdi: "80 (5.6)", rti: "QR" })
  ]);

  assert.equal(references[0]?.queryEligible, true);
  assert.match(references[0]?.ahlsellSearchQuery ?? "", /^TY-B K80 QR Opp$/);
});

function sprinklerRequirement({
  model,
  kFactor,
  response,
  placement
}: {
  model: string;
  kFactor: string;
  response: string;
  placement: string;
}): Record<string, unknown> {
  return {
    category: "sprinkler_head",
    requirement_key: "sprinkler",
    display_name: `Sprinklerhode ${model}`,
    value_text: `Sprinklerhode ${model}`,
    source_excerpt: `Sprinklerhode ${model}\nK-faktor: ${kFactor}\n${response}\n${placement}`,
    value_json: {
      attributes: {
        "K-faktor": kFactor,
        Følsomhetsgrad: response,
        Plassering: placement
      },
      sourceText: `Sprinklerhode ${model}\nK-faktor: ${kFactor}\n${response}\n${placement}`
    }
  };
}

function sprsokRow(overrides: Partial<SprsokTechnicalRow>): SprsokTechnicalRow {
  return {
    id: 1,
    sin: "123456",
    leverandor: "Victaulic",
    type: "Sprinklerhode Modell V2704 QR",
    utforelse: "Opp",
    k_verdi: "80",
    rti: "QR",
    datablad: "https://example.test/datablad.pdf",
    ...overrides
  };
}
