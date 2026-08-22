import assert from "node:assert/strict";
import test from "node:test";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

test("ranks the DN100 Series 751 wet alarm station above a gate valve and residential manifold", () => {
  const requirement = {
    category: "valve",
    value_text: "KONTROLLVENTILSETT FOR SPRINKLERANLEGG",
    value_json: {
      attributes: {
        "Type kontrollventilsett": "Våt alarmventil",
        Lokalisering: "I sprinklersentral",
        "Dimensjon (DN)": "100",
        Trykk: "PN16"
      }
    }
  };
  const candidates: AhlsellPublicCandidate[] = [
    candidate(
      "5505469",
      "Sprinklerventil S-1155 m/stillingsindikator og ratt. Ulefos",
      "Brukes i forbindelse med vann og sprinkleranlegg. Trykklasse PN16.",
      "/va-armatur/sluseventiler/5505469/"
    ),
    candidate(
      "9257148",
      "UMC sprinklerventil for bolig",
      "Inneholder stengeventil, tilbakeslagsventil og tilkobling til alarmsentral.",
      "/sprinklersentraler/9257148---114.3mm-umc-boligsentral/"
    ),
    candidate(
      "9257287",
      "Sprinklersentral S751 svart VQR CE/FG",
      "Sprinklersentral for vått anlegg med hydraulisk brannalarm.",
      "/sprinklersentraler/9257287---114.3mm-sprinklersentral-vat-v751/"
    )
  ];

  const ranked = rankAhlsellCandidates(requirement, candidates);

  assert.equal(ranked[0].articleNumber, "9257287");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.equal(ranked[0].matchScore, 100);
  assert.ok(ranked[0].matchReasons?.some((reason) => reason.includes("DN100")));
  assert.equal(ranked.find((item) => item.articleNumber === "5505469")?.recommendation, "unlikely");
  assert.ok(ranked.find((item) => item.articleNumber === "5505469")?.matchWarnings?.some((warning) => warning.includes("avstängningsventil")));
});

test("does not recommend a dry valve for a wet alarm requirement", () => {
  const [ranked] = rankAhlsellCandidates({
    value_text: "Våt alarmventil DN100"
  }, [candidate(
    "9253995",
    "Sprinklersentral, Vic D768N tørr",
    "Tørr sprinklersentral",
    "/sprinklersentraler/9253995---114.3mm/"
  )]);

  assert.equal(ranked.recommendation, "unlikely");
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("torrt system")));
});

test("recommends the exact K80 68C standard upright sprinkler variant", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      "k-faktor": "80",
      utløsningstemperatur: "68 C",
      følsomhetsgrad: "Standard-respons",
      plassering: "Stående",
      "gjengedimensjon (dn)": "15"
    } }
  }, [{
    ...candidate("9254042", "Sprinklerhoder V2703 SR - Opp", "Standard sprinklerhode", "/sprinkler/9254042/"),
    specifications: ["K-faktor: 80", "Responstemperatur: 68 °C", "Responstid: Standardrespons", "Farge: Messing"]
  }]);

  assert.equal(ranked.recommendation, "recommended");
  assert.ok(ranked.matchReasons?.some((reason) => reason.includes("K80")));
  assert.ok(ranked.matchReasons?.some((reason) => reason.includes("68")));
});

test("keeps a ductile flanged bend as possible when the PDF explicitly requires steel", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "fitting",
    value_text: "Bend av stålrør med flens",
    value_json: { attributes: { dimensjon: "DN100", trykk: "PN16", materiale: "Stål" } }
  }, [candidate("2022849", "Flensebend 90° Duktilt DN100 PN10/16", "Duktilt støpejern", "/bend/2022849/")]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("gjutjärn")));
});

test("recognizes Ahlsell manometer terminology from a generic measuring-instrument post", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "control",
    value_text: "MÅLEINSTRUMENT",
    value_json: { attributes: { type: "Analog, absolutt trykk, direkte måling" } }
  }, [candidate("9255634", "Manometer til sprinkler", "Manometer for sprinkleranlegg", "/manometer/9255634/")]);

  assert.equal(ranked.recommendation, "recommended");
});

function candidate(articleNumber: string, productName: string, description: string, path: string): AhlsellPublicCandidate {
  return {
    articleNumber,
    productName,
    manufacturer: articleNumber === "5505469" ? "Ulefos" : "Victaulic",
    productUrl: `https://www.ahlsell.no/products${path}`,
    description,
    specifications: [],
    source: "catalog_search"
  };
}
