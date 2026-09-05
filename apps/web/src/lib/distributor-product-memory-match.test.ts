import assert from "node:assert/strict";
import test from "node:test";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import {
  applyLearnedProductEvidence,
  learnedProductSearchQueries,
  rankDistributorProductMemoryHints,
  type DistributorProductMemoryEvidence
} from "./distributor-product-memory-match";

test("uses the confirmed Vågå V2704 choice for a technically equivalent quick-response upright post", () => {
  const requirement = sprinklerRequirement({
    fingerprint: "new-project-fingerprint",
    placement: "Stående i teknisk rom",
    kFactor: "80"
  });
  const hints = rankDistributorProductMemoryHints(requirement, [memory({
    fingerprint: "vagaa-33.332.4.2",
    productNumber: "9254043",
    productName: "Sprinklerhoder Modell V2704 QR Victaulic® FireLock™ - Opp",
    attributes: sprinklerAttributes({ placement: "Stående", kFactor: "80" })
  })]);

  assert.deepEqual(learnedProductSearchQueries(hints), ["9254043"]);
  assert.equal(hints[0]?.exactFingerprint, false);
  assert.ok((hints[0]?.matchScore ?? 0) >= 75);
});

test("does not reuse a confirmed recessed head when its cover plate still requires compatibility review", () => {
  const requirement = {
    ...sprinklerRequirement({
      fingerprint: "new-recessed",
      placement: "Innfelt, synlig montasje i tak i nytt møterom",
      kFactor: "80"
    }),
    value_json: {
      attributes: sprinklerAttributes({
        placement: "Innfelt, synlig montasje i tak i nytt møterom",
        kFactor: "80",
        deckPlate: "Ja"
      }),
      quantity: 42
    }
  };
  const hints = rankDistributorProductMemoryHints(requirement, [memory({
    fingerprint: "vagaa-33.332.4.3",
    productNumber: "9257423",
    productName: "Sprinklerhoder Modell V2762 QR Victaulic® FireLock™ - Ned",
    attributes: sprinklerAttributes({
      placement: "Innfelt, synlig montasje i tak",
      kFactor: "80",
      deckPlate: "Ja"
    })
  })]);

  assert.deepEqual(hints, []);
});

test("does not borrow the confirmed K80 sidewall product for the unconfirmed K160 post", () => {
  const requirement = sprinklerRequirement({
    fingerprint: "vagaa-unconfirmed-33.332.4.1",
    placement: "Horisontalt på vegg",
    kFactor: "160",
    dn: "DN20 / 3/4\""
  });
  const hints = rankDistributorProductMemoryHints(requirement, [memory({
    fingerprint: "vagaa-33.332.4.4",
    productNumber: "9254065",
    productName: "Sprinklerhoder Modell V2710 QR Victaulic® FireLock™ - Horisontal",
    attributes: sprinklerAttributes({
      placement: "Horisontalt på vegg",
      kFactor: "80",
      dn: "DN20 / 3/4\""
    })
  })]);

  assert.deepEqual(hints, []);
});

test("keeps confirmed pipe dimensions separate", () => {
  const requirement = pipeRequirement("DN40");
  const hints = rankDistributorProductMemoryHints(requirement, [
    pipeMemory("1118751", "DN100"),
    pipeMemory("1118743", "DN40")
  ]);

  assert.deepEqual(learnedProductSearchQueries(hints), ["1118743"]);
});

test("never learns across product categories", () => {
  const hints = rankDistributorProductMemoryHints(
    sprinklerRequirement({ fingerprint: "sprinkler", placement: "Stående", kFactor: "80" }),
    [pipeMemory("1118741", "DN32")]
  );

  assert.deepEqual(hints, []);
});

test("does not generalize a weak one-field or unknown-category precedent", () => {
  const unknownRequirement = {
    mapping_fingerprint: "unknown",
    category: "unknown",
    requirement_key: "misc",
    value_text: "BESKYTTELSESGITTER",
    value_json: { attributes: {} }
  };
  const hints = rankDistributorProductMemoryHints(unknownRequirement, [memory({
    category: "unknown",
    fingerprint: "old-unknown",
    productNumber: "9254088",
    productName: "Sprinkler gitter",
    valueText: "BESKYTTELSESGITTER",
    attributes: {}
  })]);

  assert.deepEqual(hints, []);
});

test("learned history only breaks ties and never changes technical classification", () => {
  const requirement = sprinklerRequirement({
    fingerprint: "new-project-fingerprint",
    placement: "Stående",
    kFactor: "80"
  });
  const [hint] = rankDistributorProductMemoryHints(requirement, [memory({
    fingerprint: "vagaa-33.332.4.2",
    productNumber: "9254043",
    productName: "Sprinklerhoder Modell V2704 QR Victaulic® FireLock™ - Opp",
    attributes: sprinklerAttributes({ placement: "Stående", kFactor: "80" })
  })]);
  const sparseCandidate: AhlsellPublicCandidate = {
    articleNumber: "9254043",
    productName: "Sprinklerhoder Modell V2704 QR Victaulic® FireLock™ - Opp",
    manufacturer: "Victaulic",
    productUrl: "https://www.ahlsell.no/9254043",
    specifications: [],
    source: "catalog_search"
  };
  const ranked = rankAhlsellCandidates(requirement, [sparseCandidate]);
  const [assisted] = applyLearnedProductEvidence(ranked, [hint]);

  assert.equal(assisted.recommendation, ranked[0].recommendation);
  assert.equal(assisted.matchScore, ranked[0].matchScore);
  assert.equal(assisted.exactMatch, ranked[0].exactMatch);
  assert.equal(assisted.source, ranked[0].source);
  assert.equal(assisted.learningEvidence?.kind, "similar_confirmed");
  assert.ok(assisted.matchReasons?.some((reason) => reason.includes("valts tidigare")));
});

function sprinklerRequirement({
  fingerprint,
  placement,
  kFactor,
  dn = "DN15 / 1/2\""
}: {
  fingerprint: string;
  placement: string;
  kFactor: string;
  dn?: string;
}) {
  return {
    mapping_fingerprint: fingerprint,
    category: "sprinkler_head",
    requirement_key: "sprinkler",
    value_text: "SPRINKLER",
    value_json: {
      attributes: sprinklerAttributes({ placement, kFactor, dn })
    }
  };
}

function sprinklerAttributes({
  placement,
  kFactor,
  dn = "DN15 / 1/2\"",
  deckPlate = "Nei"
}: {
  placement: string;
  kFactor: string;
  dn?: string;
  deckPlate?: string;
}) {
  return {
    sprinkleranlegg: "Våtanlegg",
    "type sprinkler": "Konvensjonell sprinkler",
    plassering: placement,
    følsomhetsgrad: "Kvikk respons",
    utløsningstemperatur: "68 °C",
    "k-faktor": kFactor,
    "gjengedimensjon (dn)": dn,
    "dekkskive/pyntering (ved innfelling)": deckPlate
  };
}

function pipeRequirement(dn: string) {
  return {
    mapping_fingerprint: `pipe-${dn}`,
    category: "pipe",
    requirement_key: "sprinkler_pipe",
    value_text: "SPRINKLERRØR AV STÅL",
    value_json: {
      unit: "m",
      attributes: {
        materiale: "Stål — varmforsinket",
        skjøt: "Rillet skjøt",
        dimensjon: dn,
        trykk: "PN16"
      }
    }
  };
}

function pipeMemory(productNumber: string, dn: string) {
  return memory({
    category: "pipe",
    fingerprint: `vagaa-pipe-${dn}`,
    productNumber,
    productName: "Galvaniserte rillede rør, 6 m lengder",
    valueText: "SPRINKLERRØR AV STÅL",
    unit: "m",
    attributes: {
      materiale: "Stål — varmforsinket",
      skjøt: "Rillet skjøt",
      dimensjon: dn,
      trykk: "PN16"
    }
  });
}

function memory({
  category = "sprinkler_head",
  fingerprint,
  productNumber,
  productName,
  valueText = "SPRINKLER",
  unit = "st",
  attributes
}: {
  category?: string;
  fingerprint: string;
  productNumber: string;
  productName: string;
  valueText?: string;
  unit?: string;
  attributes: Record<string, unknown>;
}): DistributorProductMemoryEvidence {
  return {
    id: `memory-${productNumber}`,
    requirement_fingerprint: fingerprint,
    requirement_category: category,
    requirement_key: category === "pipe" ? "sprinkler_pipe" : "sprinkler",
    requirement_snapshot: {
      valueText,
      value: { unit, attributes }
    },
    product_name: productName,
    product_number: productNumber,
    manufacturer_name: "Victaulic",
    usage_count: 1
  };
}
