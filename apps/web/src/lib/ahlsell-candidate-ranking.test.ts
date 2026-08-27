import assert from "node:assert/strict";
import test from "node:test";
import { orderAhlsellCandidatesForDisplay, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
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

test("prefers the V2704 QR quick-response sprinkler when another attribute says standard", () => {
  const ranked = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Stående",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15 / 1/2\"",
      overflatebehandling: "Som standard for produkt"
    } }
  }, [
    {
      ...candidate("9254042", "Sprinklerhoder Modell V2703 SR Victaulic FireLock - Opp", "Standard spraysprinkler", "/sprinkler/9254042/"),
      specifications: ["K-faktor: 80", "Responstemperatur: 68 °C", "Responstid: Standardrespons"]
    },
    {
      ...candidate("9254043", "Sprinklerhoder Modell V2704 QR Victaulic FireLock - Opp", "Standard spraysprinkler", "/sprinkler/9254043/"),
      specifications: ["K-faktor: 80", "Responstemperatur: 68 °C", "Responstid: Hurtig respons"]
    }
  ]);

  assert.equal(ranked[0].articleNumber, "9254043");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(ranked[0].matchReasons?.some((reason) => reason.includes("Quick response")));
  const standardResponse = ranked.find((candidate) => candidate.articleNumber === "9254042");
  assert.notEqual(standardResponse?.recommendation, "recommended");
  assert.ok(standardResponse?.matchWarnings?.some((warning) => warning.includes("responstid")));
});

test("does not recommend K115 when the raw PDF source says K1145", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      technicalSpecification: "Type sprinkler: Tørrsprinkler\nK-faktor: 1145",
      attributes: {
        "k-faktor": "114.5",
        utløsningstemperatur: "68 C",
        følsomhetsgrad: "Standard-respons",
        plassering: "Stående",
        "gjengedimensjon (dn)": "25"
      }
    }
  }, [{
    ...candidate("9254000", "Sprinklerhode K115 SR - Opp", "Standard sprinklerhode", "/sprinkler/9254000/"),
    specifications: ["K-faktor: 115", "Responstemperatur: 68 °C", "Responstid: Standardrespons"]
  }]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.ok(ranked.matchWarnings?.some((warning) =>
    warning.includes("PDF kräver K1145") && warning.includes("träffen anger K115")
  ));
});

test("does not confuse the phrase opp til with an upright sprinkler", () => {
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
    ...candidate("9254067", "Sprinklerhoder V2727 SR - Ned", "Justeringsområde opp til 19 mm", "/sprinkler/9254067/"),
    specifications: ["K-faktor: 80", "Responstemperatur: 68 °C", "Responstid: Standardrespons"]
  }]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("monteringsriktning")));
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

test("always places Scipx most likely product first without mutating the input", () => {
  const input: AhlsellPublicCandidate[] = [
    { ...candidate("2", "Möjlig produkt", "", "/2/"), matchScore: 60, recommendation: "possible" },
    { ...candidate("1", "Mest sannolik produkt", "", "/1/"), matchScore: 95, recommendation: "recommended" },
    { ...candidate("3", "Osannolik produkt", "", "/3/"), matchScore: 5, recommendation: "unlikely" }
  ];

  const ordered = orderAhlsellCandidatesForDisplay(input);

  assert.deepEqual(ordered.map((item) => item.articleNumber), ["1", "2", "3"]);
  assert.deepEqual(input.map((item) => item.articleNumber), ["2", "1", "3"]);
});

test("ranks a dimensionally matching sprinkler pipe above a tee from the same broad search", () => {
  const ranked = rankAhlsellCandidates({
    category: "unknown",
    value_text: "DN40",
    value_json: { unit: "m", attributes: { dimensjon: "DN40" } }
  }, [
    candidate("tee", "T-rør rett rillet", "DN40, utvendig diameter 48.3 mm", "/tee/"),
    candidate("pipe", "Malte rillede rør, 6 m lengder", "Sprinklerrør DN40, utvendig diameter 48.3 mm", "/pipe/")
  ]);

  assert.equal(ranked[0].articleNumber, "pipe");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.equal(ranked[1].recommendation, "unlikely");
});

test("recognizes common Ahlsell fitting and valve families", () => {
  const [bend] = rankAhlsellCandidates({
    category: "fitting",
    value_text: "DN80",
    value_json: { attributes: { rørdel: "Bend", dimensjon: "DN80" } }
  }, [candidate("bend", "Bend rillet 90º", "Nominell diameter tilkobling 1: DN80", "/bend/")]);
  const [checkValve] = rankAhlsellCandidates({
    category: "valve",
    value_text: "INNENDØRS TILBAKESLAGSVENTIL",
    value_json: { attributes: { "dimensjon, tilkoblinger": "DN100" } }
  }, [candidate("check", "Tilbakeslagsventil rillet", "Nominell diameter DN100", "/check/")]);

  assert.equal(bend.recommendation, "recommended");
  assert.equal(checkValve.recommendation, "recommended");
});

test("never marks a dimensioned ball-valve accessory as a safe valve", () => {
  const ranked = rankAhlsellCandidates({
    category: "valve",
    value_text: "INNENDØRS STENGEVENTIL",
    value_json: { attributes: { ventiltype: "Kuleventil", "dimensjon, tilkoblinger": "DN25", trykk: "PN16" } }
  }, [
    candidate("accessory", "Isolasjonspute til Kuleventiler", "DN25 isolering", "/accessory/"),
    candidate("valve", "Kuleventil 2-veis", "Nominell diameter DN25, PN16", "/valve/")
  ]);

  assert.equal(ranked[0].articleNumber, "valve");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.notEqual(ranked[1].recommendation, "recommended");
  assert.ok(ranked[1].matchWarnings?.some((warning) => warning.includes("tillbehör")));
});

test("keeps a springless check valve yellow when the PDF requires a spring", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "valve",
    value_text: "INNENDØRS TILBAKESLAGSVENTIL",
    value_json: { attributes: { ventiltype: "Fjærbelastet", "dimensjon, tilkoblinger": "DN150", trykk: "PN16" } }
  }, [candidate(
    "check",
    "Klaff, tilbakeslagsventil CV",
    "DN150 PN16, uten fjær",
    "/check/"
  )]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("utan fjäder")));
});

test("does not present an unrelated search result as an Ahlsell match", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "valve",
    value_text: "TESTARRANGEMENT FOR SPRINKLER",
    value_json: { attributes: {} }
  }, [candidate("oring", "O-Ring Rems", "Reservedel", "/oring/")]);

  assert.equal(ranked.recommendation, "unlikely");
  assert.equal(ranked.matchScore, 0);
});

test("ranks a submersible drainage pump above a groundwater pump", () => {
  const ranked = rankAhlsellCandidates({
    category: "valve",
    value_text: "PUMPE INNENDØRS",
    value_json: { attributes: { "type pumpe": "Neddykket pumpe", medium: "Avløpsvann" } }
  }, [
    candidate("ground", "Grunnvannspumpe SXM3 GW", "Pumpe", "/ground/"),
    candidate("drainage", "Lensepumpe HS", "Neddykket pumpe", "/drainage/")
  ]);

  assert.equal(ranked[0].articleNumber, "drainage");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(ranked[1].matchWarnings?.some((warning) => warning.includes("grundvattenpump")));
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
