import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellCandidateMatchState, isExactAhlsellCandidate, orderAhlsellCandidatesForDisplay, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
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

test("ranks K80 68C upright highest but requires system and construction before exact match", () => {
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
    specifications: ["K-faktor: 80", "Gjengedimensjon: DN15", "Responstemperatur: 68 °C", "Responstid: Standardrespons", "Farge: Messing"]
  }]);

  assert.equal(ranked.recommendation, "recommended");
  assert.equal(isExactAhlsellCandidate(ranked), false);
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
      specifications: ["K-faktor: 80", "Gjengedimensjon: DN15", "Responstemperatur: 68 °C", "Responstid: Standardrespons"]
    },
    {
      ...candidate("9254043", "Sprinklerhoder Modell V2704 QR Victaulic FireLock - Opp", "Standard spraysprinkler", "/sprinkler/9254043/"),
      specifications: ["K-faktor: 80", "Gjengedimensjon: DN15", "Responstemperatur: 68 °C", "Responstid: Hurtig respons"]
    }
  ]);

  assert.equal(ranked[0].articleNumber, "9254043");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.equal(ranked[0].exactMatch, true);
  assert.ok(ranked[0].matchReasons?.some((reason) => reason.includes("Quick response")));
  const standardResponse = ranked.find((candidate) => candidate.articleNumber === "9254042");
  assert.notEqual(standardResponse?.recommendation, "recommended");
  assert.equal(standardResponse?.exactMatch, false);
  assert.ok(standardResponse?.matchWarnings?.some((warning) => warning.includes("responstid")));
});

test("prioritizes recessed pendent V2762 over a conventional opp/ned head for an infellt ceiling post", () => {
  const requirement = {
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Innfelt, synlig montasje i tak",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      trykk: "PN16",
      "gjengedimensjon (dn)": "DN15 / 1/2\"",
      overflatebehandling: "Som standard for produkt",
      "dekkskive/pyntering (ved innfelling)": "Ja",
      beskyttelse: "Ja"
    } }
  };
  const ranked = rankAhlsellCandidates(requirement, [
    {
      ...candidate(
        "9254111",
        "Sprinklerhoder Modell V2726 QR Victaulic Firelock - Konvensjonell opp/ned",
        "Konvensjonell sprinkler som fordeler vann både oppover og nedover.",
        "/sprinkler/9254111/"
      ),
      specifications: [
        "Modell: V2726",
        "Utløsningstemperatur: 68°C",
        "Sprinklertype: Konv. SP/SSU",
        "K-faktor: 80",
        "Utvendig gjenge: 1/2\"",
        "Respons: Quick"
      ]
    },
    {
      ...candidate(
        "9257423",
        "Sprinklerhoder Modell V2762 QR Victaulic FireLock - Ned",
        "Standard spraysprinkler for kommersielle bruksområder.",
        "/sprinkler/9257423/"
      ),
      specifications: [
        "Modell: V2762",
        "Responstid: Hurtig respons",
        "Responstemperatur: 68 °C",
        "Farge: Hvit",
        "K-faktor: 80",
        "Tilkobling: Utvendige gjenger, gass, konisk (BSPT)",
        "Utvendig gjenge: 1/2\""
      ]
    }
  ]);

  assert.equal(ranked[0].articleNumber, "9257423");
  assert.equal(ranked[0].recommendation, "possible");
  assert.equal(ranked[0].exactMatch, false);
  assert.ok(ranked[0].matchReasons?.some((reason) => reason.includes("infällt pendentmontage")));
  assert.ok(ranked[0].matchWarnings?.some((warning) => warning.includes("Täckbricka")));

  const conventional = ranked.find((candidate) => candidate.articleNumber === "9254111");
  assert.notEqual(conventional?.recommendation, "recommended");
  assert.equal(conventional?.exactMatch, false);
  assert.ok(conventional?.matchWarnings?.some((warning) => warning.includes("konventionell upp/ned")));
});

test("keeps a conventional V2726 candidate preferred when the post does not require recessed mounting", () => {
  const ranked = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Synlig opp/ned-montasje",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  }, [
    {
      ...candidate("9257423", "Sprinklerhoder Modell V2762 QR - Ned", "Standard spraysprinkler", "/sprinkler/9257423/"),
      specifications: ["K-faktor: 80", "DN15", "68 °C", "Hurtig respons"]
    },
    {
      ...candidate("9254111", "Sprinklerhoder Modell V2726 QR - Konvensjonell opp/ned", "Konvensjonell sprinkler", "/sprinkler/9254111/"),
      specifications: ["K-faktor: 80", "DN15", "68 °C", "Hurtig respons"]
    }
  ]);

  assert.equal(ranked[0].articleNumber, "9254111");
});

test("ranks a visible V2762 pendent head above concealed heads for visible ceiling placement", () => {
  const requirement = {
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Spraysprinkler",
      plassering: "Hengende synlig i tak og over systemhimling",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "15",
      overflatebehandling: "Messing",
      "dekkskive/pyntering (ved innfelling)": "I.R.",
      beskyttelse: "Nei"
    } }
  };
  const ranked = rankAhlsellCandidates(requirement, [
    {
      ...candidate("9254074", "Sprinklerhoder Modell V3802 QR Victaulic FireLock - Skjult", "1/2 V3802 K80 SSP/skjult 68C QR mess", "/sprinkler/9254074/"),
      specifications: ["DN15", "K80", "68 °C", "Quick response", "Pendent", "Concealed", "Messing"]
    },
    {
      ...candidate("9257392", "Sprinklerhoder Modell V2762 QR Victaulic FireLock - Ned", "1/2 V2762 sprinklerhode K80 SSP 68C QR mess", "/sprinkler/9257392/"),
      specifications: ["DN15", "K80", "68 °C", "Quick response", "Pendent", "Standard spray", "Messing", "not a dry-type sprinkler"]
    }
  ]);

  assert.equal(ranked[0].articleNumber, "9257392");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(!ranked[0].matchWarnings?.some((warning) => /tillbehör/i.test(warning)));
  assert.ok(ranked[1].matchWarnings?.some((warning) => /synligt montage.*dold sprinkler/i.test(warning)));
});

test("treats K115 and K115.5 as the same nominal sprinkler family", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Konvensjonell standard coverage sprinkler",
      plassering: "Hengende",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "115.5",
      "gjengedimensjon (dn)": "DN20"
    } }
  }, [{
    ...candidate("1364601", "Sprinklerhode V3702 QR - Ned", "Standard spray sprinkler", "/sprinkler/1364601/"),
    specifications: ["K-faktor: 115", "DN20", "68 °C", "Quick response", "Pendent"]
  }]);

  assert.ok(ranked.matchReasons?.some((reason) => reason.includes("K115")));
  assert.ok(ranked.matchWarnings?.every((warning) => !warning.includes("Fel K-faktor")));
});

test("rejects an explicitly wet-only sprinkler for a dry system without requiring a dry-type head", () => {
  const ranked = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Tørranlegg",
      "type sprinkler": "Konvensjonell standard coverage sprinkler",
      plassering: "Stående",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  }, [
    {
      ...candidate("wet", "Sprinklerhode V2704 - Opp", "Standard spray. Wet system only.", "/wet/"),
      specifications: ["K80", "DN15", "Upright"]
    },
    {
      ...candidate("normal", "Sprinklerhode V2704 - Opp", "Standard automatic sprinkler", "/normal/"),
      specifications: ["K80", "DN15", "Upright"]
    }
  ]);

  assert.equal(ranked[0].articleNumber, "normal");
  assert.ok(ranked.find((item) => item.articleNumber === "wet")?.matchWarnings?.some((warning) => warning.includes("våtanläggning")));
  assert.ok(ranked.find((item) => item.articleNumber === "normal")?.matchWarnings?.every((warning) => !warning.includes("torrsprinkler")));
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

test("learning evidence only breaks ties between candidates with equal technical scores", () => {
  const learnedEvidence = {
    kind: "similar_confirmed" as const,
    supportCount: 2,
    similarityScore: 90
  };
  const higherTechnicalScore = {
    ...candidate("high", "Högre teknisk träff", "", "/high/"),
    matchScore: 99,
    recommendation: "recommended" as const
  };
  const learnedLowerScore = {
    ...candidate("learned-low", "Inlärd lägre träff", "", "/learned-low/"),
    matchScore: 75,
    recommendation: "recommended" as const,
    learningEvidence: learnedEvidence
  };
  const unlearnedTie = {
    ...candidate("tie", "Oinlärd likvärdig träff", "", "/tie/"),
    matchScore: 90,
    recommendation: "recommended" as const
  };
  const learnedTie = {
    ...candidate("learned-tie", "Inlärd likvärdig träff", "", "/learned-tie/"),
    matchScore: 90,
    recommendation: "recommended" as const,
    learningEvidence: learnedEvidence
  };

  assert.deepEqual(
    orderAhlsellCandidatesForDisplay([learnedLowerScore, higherTechnicalScore])
      .map((item) => item.articleNumber),
    ["high", "learned-low"]
  );
  assert.deepEqual(
    orderAhlsellCandidatesForDisplay([unlearnedTie, learnedTie])
      .map((item) => item.articleNumber),
    ["learned-tie", "tie"]
  );
});

test("reserves exact-match presentation for a complete 100-point match without warnings", () => {
  const exact = { ...candidate("exact", "Exakt produkt", "", "/exact/"), matchScore: 100, recommendation: "recommended" as const, matchWarnings: [], exactMatch: true };
  const strong = { ...candidate("strong", "Stark produkt", "", "/strong/"), matchScore: 95, recommendation: "recommended" as const, matchWarnings: [] };
  const mismatch = { ...candidate("wrong", "Fel produkt", "", "/wrong/"), matchScore: 100, recommendation: "possible" as const, matchWarnings: ["Fel respons."] };

  assert.equal(ahlsellCandidateMatchState(exact), "exact");
  assert.equal(ahlsellCandidateMatchState(strong), "review");
  assert.equal(ahlsellCandidateMatchState(mismatch), "mismatch");
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

test("flags a grooved pipe when the PDF requires a threaded joint", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "pipe",
    value_text: "SPRINKLERRØR AV STÅL",
    value_json: {
      unit: "m",
      attributes: {
        materiale: "Stål — varmforsinket",
        skjøt: "Gjenget skjøt",
        dimensjon: "DN40",
        trykk: "PN16"
      }
    }
  }, [candidate(
    "1118743",
    "Galvaniserte rillede rør, 6 m lengder",
    "Stålrør DN40 PN16 med rillet skjøt",
    "/pipe/1118743/"
  )]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.equal(ranked.exactMatch, false);
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("skarv")));
});

test("does not treat a PP-R sprinkler pipe as a steel pipe", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "pipe",
    value_text: "SPRINKLERRØR AV STÅL",
    value_json: {
      unit: "m",
      attributes: { materiale: "Stål", dimensjon: "DN65", trykk: "PN16" }
    }
  }, [candidate(
    "8755089",
    "Rør for sprinkling, Red pipe",
    "PP-R sprinklerør DN65 PN16",
    "/pipe/8755089/"
  )]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.equal(ranked.exactMatch, false);
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("material")));
});

test("requires explicit extended-coverage evidence for an extended-coverage sprinkler", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      "type sprinkler": "Tørrsprinkler med utvidet dekning",
      plassering: "Stående",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "115.5",
      "gjengedimensjon (dn)": "DN20"
    } }
  }, [{
    ...candidate("9254379", "Sprinklerhoder Modell V3402 QR - Opp", "Tørrsprinkler", "/sprinkler/9254379/"),
    specifications: ["K-faktor: 115.5", "DN20", "68 °C", "Hurtig respons"]
  }]);

  assert.equal(ranked.exactMatch, false);
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("extended coverage")));
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

test("separates a wet installation from its required dry sprinkler head", () => {
  const ranked = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Tørrsprinkler",
      plassering: "Hengende i tak",
      følsomhetsgrad: "Standard-respons",
      utløsningstemperatur: "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN25"
    } }
  }, [
    candidate("dry", "1\" V3613 sprinklerhode K80 SSP tørr 68C SR", "Tørrsprinkler", "/dry/"),
    candidate("wet", "1\" V9999 sprinklerhode K80 SSP 68C SR", "Konvensjonell sprinkler", "/wet/")
  ]);

  assert.equal(ranked[0].articleNumber, "dry");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(ranked[0].matchReasons?.some((reason) => reason.includes("Torrsprinklerutförandet")));
  assert.ok(ranked[1].matchWarnings?.some((warning) => warning.includes("konventionell sprinkler")));
});

test("keeps a conventional sprinkler head for a dry pipe installation", () => {
  const ranked = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Tørranlegg",
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Stående",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  }, [
    candidate("standard", "1/2\" V2704 sprinklerhode K80 SSU 68C QR", "Konvensjonell sprinkler", "/standard/"),
    candidate("dry", "1/2\" V9999 sprinklerhode K80 SSU tørr 68C QR", "Tørrsprinkler", "/dry/")
  ]);

  assert.equal(ranked[0].articleNumber, "standard");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(ranked[1].matchWarnings?.some((warning) => warning.includes("konventionellt sprinklerhuvud")));
});

test("recognizes 1/2 inch as DN15 and rejects it for a DN25 sprinkler requirement", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Stående",
      følsomhetsgrad: "Standard-respons",
      utløsningstemperatur: "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN25"
    } }
  }, [candidate(
    "9254042",
    "1/2\" V2703 sprinklerhode K80 SSU 68C SR",
    "Konvensjonell sprinkler",
    "/9254042/"
  )]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("DN25") && warning.includes("DN15")));
});

test("does not recommend a thermal sprinkler for an open window-sprinkler requirement", () => {
  const [ranked] = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SWV Vindu sprinkler Åpen",
    value_json: { attributes: {
      sprinkleranlegg: "Delugeanlegg",
      "type sprinkler": "Spesial - Window Sprinkler",
      følsomhetsgrad: "Uten termisk element",
      utløsningstemperatur: "Uten termisk element",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  }, [candidate(
    "9257423",
    "1/2\" V2762 sprinklerhode K80 SSP 68C QR hvit",
    "Temperaturutløst sprinklerhode",
    "/9257423/"
  )]);

  assert.notEqual(ranked.recommendation, "recommended");
  assert.ok(ranked.matchWarnings?.some((warning) => warning.includes("öppen sprinkler")));
});

test("matches Norwegian compound sidewall wording to an HSW product", () => {
  const ranked = rankAhlsellCandidates({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      plassering: "Veggmontert, horisontalt montert sprinklerhode",
      "type sprinkler": "Konvensjonell sprinkler",
      følsomhetsgrad: "Standard-respons",
      utløsningstemperatur: "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  }, [
    candidate("hsw", "1/2\" V2709 sprinklerhode K80 HSW 68C SR", "", "/hsw/"),
    candidate("ssu", "1/2\" V2703 sprinklerhode K80 SSU 68C SR", "", "/ssu/")
  ]);

  assert.equal(ranked[0].articleNumber, "hsw");
  assert.equal(ranked[0].recommendation, "possible");
  assert.ok(ranked[0].matchWarnings?.some((warning) => warning.includes("täcknings-/applikationsklass")));
  assert.ok(ranked[1].matchWarnings?.some((warning) => warning.includes("monteringsriktning")));
});

test("uses UB1.3311 to rank sprinkler hoses and reject rigid pipes", () => {
  const ranked = rankAhlsellCandidates({
    category: "pipe",
    value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE",
    value_json: {
      nsCode: "UB1.33114699900A",
      attributes: { dimensjon: "DN25", materiale: "Stål - rustfritt" }
    }
  }, [
    candidate("hose", "VicFlex sprinklerslange DN25 braided", "Fleksibel sprinklerslange i rustfritt stål", "/hose/"),
    candidate("pipe", "Konstruksjonsrør 33.7 mm galvanisert", "Stålrör i längder", "/pipe/"),
    candidate("tee", "T-rør galvanisert 33.7 mm", "Rørdel", "/tee/")
  ]);

  assert.equal(ranked[0].articleNumber, "hose");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(ranked.slice(1).every((candidate) => candidate.recommendation === "unlikely"));
  assert.ok(ranked.slice(1).every((candidate) =>
    candidate.matchWarnings?.some((warning) => warning.includes("inte en flexibel sprinklerslang"))
  ));
});

test("prioritizes Series 705 for a supervised soft-closing DN100 butterfly valve", () => {
  const requirement = {
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
  };
  const ranked = rankAhlsellCandidates(requirement, [
    candidate("1466224", "Spjeldventil AVI 1485 m/spak, m/rillede tilkoblinger DN100", "", "/1466224/"),
    candidate("9255924", "Spjeldventil rillet, E125, Victaulic m/håndtak 114.3mm", "", "/9255924/"),
    candidate("9253207", "114.3mm spjeldventil sort V761 rillet PN20 - VKS", "", "/9253207/"),
    candidate("9253499", "Spjeldventil VIC 705, åpen overvåkning, Victaulic FireLock", "114.3mm spjeldventil 705 - Fire", "/9253499/")
  ]);

  assert.equal(ranked[0].articleNumber, "9253499");
  assert.equal(ranked[0].recommendation, "recommended");
  assert.ok(ranked[0].matchReasons?.some((reason) => reason.includes("övervakad i öppet")));
  assert.ok(ranked.slice(1).every((candidate) => candidate.recommendation !== "recommended"));
  assert.ok(ranked.slice(1).every((candidate) =>
    candidate.matchWarnings?.some((warning) => warning.includes("övervakning"))
  ));
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
