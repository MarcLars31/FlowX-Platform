import assert from "node:assert/strict";
import test from "node:test";
import {
  AHLSELL_MLDL_PRODUCT_COUNT,
  ahlsellMldlProducts,
  findAhlsellMldlCandidates
} from "./ahlsell-mldl-catalog";

test("imports the complete MLDL assortment without duplicate article numbers", () => {
  const products = ahlsellMldlProducts();
  assert.equal(AHLSELL_MLDL_PRODUCT_COUNT, 759);
  assert.equal(products.length, 759);
  assert.equal(new Set(products.map((product) => product.articleNumber)).size, 759);
});

test("ranks the known V761 butterfly valve from the full database", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "valve",
    value_text: "114.3mm spjeldventil sort V761 rillet PN20 - VKS"
  });

  assert.equal(candidates[0]?.articleNumber, "9253207");
  assert.equal(candidates[0]?.source, "structured_database");
  assert.equal(candidates[0]?.recommendation, "recommended");
  assert.ok((candidates[0]?.matchScore ?? 0) >= 90);
});

test("uses Norwegian product words to restrict the database to the right family", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "fitting",
    value_text: "76,1 mm fast kupling rillet"
  });

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => /kupling|kobling|coupling/i.test(candidate.productName)));
});

test("uses UB1.3311 to exclude rigid pipes and fittings from the MLDL pool", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "pipe",
    value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE",
    value_json: {
      nsCode: "UB1.33114699900A",
      unit: "st",
      attributes: { dimensjon: "DN25" }
    }
  });

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0]?.articleNumber, "9255525");
  assert.ok(candidates.every((candidate) =>
    /sprinklerslange|sprinkler slange|vicflex|dryflex|fleksibelslange/i.test(candidate.productName)
  ));
  assert.ok(candidates.every((candidate) => !/konstruksjonsrør|t-rør|bend t\/sprinklerslange|nippel f\/.*sprinklerslange/i.test(candidate.productName)));
});

test("selects NRF 9253499 for the supervised-open DN100 handwheel valve", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "valve",
    requirement_key: "UC1.9111118A",
    value_text: "INNENDØRS STENGEVENTIL",
    value_json: { attributes: {
      ventiltype: "Dreiespjeldventil med tilkobling for signal ved stengt ventil, myk stenging.",
      betjening: "Manuell med ratt",
      materiale: "Støpejern",
      skjøt: "Rilleskjøt",
      "dimensjon, tilkoblinger": "DN100"
    } }
  });

  assert.equal(candidates[0]?.articleNumber, "9253499");
  assert.equal(candidates[0]?.recommendation, "recommended");
  assert.ok(candidates[0]?.evidenceSources?.includes("victaulic_verified"));
  assert.ok(candidates[0]?.matchReasons?.some((reason) => reason.includes("övervakad i öppet")));
  assert.ok(candidates.slice(1, 4).every((candidate) => candidate.recommendation !== "recommended"));
});

test("selects the LC Eidsvoll V2763 brass head for PDF post 33.500.2", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "sprinkler_head",
    requirement_key: "UE2.11111232",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Hengende i tak",
      følsomhetsgrad: "Standard-respons A",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      trykk: "PN10",
      "gjengedimensjon (dn)": "DN25",
      overflatebehandling: "Som standard for produkt",
      "dekkskive/pyntering (ved innfelling)": "Ingen",
      beskyttelse: "Ingen"
    } }
  });

  assert.equal(candidates[0]?.articleNumber, "9257387");
  assert.equal(candidates[0]?.assortmentPriority, 1);
  assert.ok(candidates[0]?.matchReasons?.some((reason) => reason.includes("LC Eidsvoll")));
  assert.ok(candidates[0]?.matchWarnings?.some((warning) => warning.includes("DN25") && warning.includes("DN15")));
  assert.ok(candidates.slice(0, 3).every((candidate) => !/skjult|concealed/i.test(`${candidate.productName} ${candidate.description}`)));
});
