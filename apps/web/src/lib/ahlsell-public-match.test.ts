import assert from "node:assert/strict";
import test from "node:test";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";

test("builds a verified but unapproved Ahlsell candidate from an exact PDF requirement", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        "orientation": "Pendent",
        "response": "Quick",
        "temperature": "68 C",
        "k factor": "80",
        "dimension": "15",
        "finish": "White"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 1);
  assert.equal(guide.directCandidates[0].articleNumber, "19045188");
  assert.equal(guide.directCandidates[0].source, "public_verified");
  assert.match(guide.searchQuery, /K80/);
  assert.ok(guide.searchQueries.some((query) => /QR/.test(query)));
  assert.ok(guide.searchQueries.some((query) => /Ned/.test(query)));
  assert.ok(guide.searchQueries.some((query) => /68/.test(query)));
  assert.match(guide.searchUrl, /parameters\.SearchPhrase=/);
});

test("uses an article number printed on the PDF row as the exact Ahlsell search", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "valve",
    value_text: "Dimensjon: DN65 VIC 705, overvåket åpen 9253497",
    value_json: {
      attributes: { dimensjon: "DN65" }
    }
  });

  assert.equal(guide.searchQuery, "9253497");
  assert.equal(guide.directCandidates.length, 1);
  assert.equal(guide.directCandidates[0].articleNumber, "9253497");
  assert.equal(guide.directCandidates[0].manufacturer, "Victaulic");
  assert.equal(guide.directCandidates[0].source, "pdf_reference");
  assert.equal(guide.criteria.includes("4°C"), false);
  assert.match(guide.directCandidates[0].productUrl, /^https:\/\/www\.ahlsell\.no\/search/);
  assert.match(decodeURIComponent(guide.directCandidates[0].productUrl), /SearchPhrase=9253497/);
});

test("treats infellt visible ceiling mounting as recessed pendent, not concealed", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        "plassering": "Innfelt, synlig montasje i tak",
        "type sprinkler": "Konvensjonell sprinkler",
        "følsomhetsgrad": "Kvikk respons",
        "utløsningstemperatur": "68 °C",
        "k-faktor": "80",
        "gjengedimensjon (dn)": "15",
        "dekkskive/pyntering (ved innfelling)": "Ja"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.criteria.includes("Pendent"));
  assert.ok(guide.criteria.includes("Recessed"));
  assert.ok(!guide.criteria.includes("Concealed"));
  assert.ok(guide.searchQueries.some((query) => /\bQR\b.*\bNed\b|\bNed\b.*\bQR\b/.test(query)));
  assert.ok(guide.searchQueries.every((query) => !/\bOpp\b/.test(query)));
  assert.ok(guide.recognitionNotes.some((note) => note.includes("pendentkrav")));
});

test("keeps a genuinely hidden sprinkler with cover plate classified as concealed", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "Sprinkler med skjult lokk",
    value_json: { attributes: {
      plassering: "Skjult i himling med flat cover plate",
      følsomhetsgrad: "Kvikk respons",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "15"
    } }
  });

  assert.ok(guide.criteria.includes("Pendent"));
  assert.ok(guide.criteria.includes("Concealed"));
  assert.ok(!guide.criteria.includes("Recessed"));
});

test("reports wet installation and dry sprinkler head as separate requirements", () => {
  const guide = buildAhlsellRequirementGuide({
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
  });

  assert.ok(guide.criteria.includes("Våtanlegg"));
  assert.ok(guide.criteria.includes("Tørrsprinkler"));
  assert.ok(guide.recognitionNotes.some((note) =>
    note.includes("anläggningstyp (Våtanlegg)") && note.includes("Tørrsprinkler")
  ));
  assert.ok(guide.searchQueries.some((query) => /Tørr/.test(query)));
});

test("does not turn a conventional head into a dry sprinkler because the installation is dry", () => {
  const guide = buildAhlsellRequirementGuide({
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
  });

  assert.ok(guide.criteria.includes("Tørranlegg"));
  assert.ok(guide.criteria.includes("Konventionell sprinkler"));
  assert.ok(!guide.criteria.includes("Tørrsprinkler"));
  assert.ok(guide.searchQueries.every((query) => !/Tørr/.test(query)));
});

test("keeps an open window sprinkler separate from thermally activated heads", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "VINDUSSPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Åpen vindussprinkler uten termisk element",
      plassering: "Sidewall",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  });

  assert.ok(guide.criteria.includes("Öppen sprinkler"));
  assert.ok(guide.recognitionNotes.some((note) => note.includes("öppen sprinkler")));
  assert.ok(guide.searchQueries.some((query) => /Åpen|Window/.test(query)));
  assert.ok(guide.searchQueries.every((query) => !/\bQR\b|\bSR\b/.test(query)));
  assert.ok(guide.warnings.every((warning) => !warning.includes("temperatur") && !warning.includes("huvudvärden")));
});

test("flags conventional K80 DN25 as a correction case instead of an exact family match", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Stående",
      følsomhetsgrad: "Standard-respons",
      utløsningstemperatur: "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN25"
    } }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.warnings.some((warning) => warning.includes("konventionell K80") && warning.includes("DN15")));
});

test("blocks direct matching and warns about K115 combined with DN15", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        "plassering": "Stående",
        "følsomhetsgrad": "Standard-respons A",
        "utløsningstemperatur": "68 C",
        "k-faktor": "115",
        "gjengedimensjon (dn)": "15"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.warnings.some((warning) => warning.includes("K115") && warning.includes("DN15")));
});

test("uses the raw PDF K-factor and blocks automatic matches for legacy rows", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      technicalSpecification: "Type sprinkler: Tørrsprinkler\nK-faktor: 1145",
      attributes: {
        plassering: "Stående",
        "følsomhetsgrad": "Standard-respons",
        utløsningstemperatur: "68 C",
        "k-faktor": "114.5",
        "gjengedimensjon (dn)": "25"
      }
    }
  });

  assert.ok(guide.criteria.includes("K1145"));
  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.warnings.some((warning) =>
    warning.includes("K-faktor 1145") && warning.includes("över 400")
  ));
});

test("does not collapse a mixed upright and pendent PDF row into one article", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        "plassering": "Stående og hengende",
        "følsomhetsgrad": "Kvikk respons",
        "utløsningstemperatur": "68 C",
        "k-faktor": "80",
        "gjengedimensjon (dn)": "15"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.warnings.some((warning) => warning.includes("stående och hängande")));
});

test("creates an Ahlsell search for non-sprinkler-head material rows", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "pipe",
    value_text: "Rillede rør for sprinkleranl. Pulverlakkert DN100",
    value_json: { attributes: { dimensjon: "DN100", materiale: "Stål" } }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.equal(guide.searchQuery, "Rør sprinkler 114.3mm");
  assert.match(decodeURIComponent(guide.searchUrl), /114.3mm/);
});

test("searches a foam hand extinguisher as fire equipment instead of a sprinkler product", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "other",
    value_text: "HANDSLOKKER",
    value_json: {
      system: "sprinkler",
      attributes: {
        slokkemiddel: "Skum",
        "mengde slokkemedium": "6 liter"
      }
    }
  });

  assert.equal(guide.criteria[0], "Skumsläckare");
  assert.equal(guide.searchQuery, "Skumslukker 6 liter");
  assert.ok(guide.searchQueries.includes("Brannslukker skum"));
  assert.doesNotMatch(guide.searchQuery, /sprinkler/i);
});

test("keeps valve searches concise so Ahlsell can return relevant candidates", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "valve",
    value_text: "KONTROLLVENTILSETT FOR SPRINKLERANLEGG",
    value_json: { attributes: { dimensjon: "DN100" } }
  });

  assert.equal(guide.searchQuery, "Sprinklersentral");
  assert.doesNotMatch(guide.searchQuery, /KONTROLLVENTILSETT/);
});

test("detects conflicting standard and quick response wording", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      technicalSpecification: "Følsomhetsgrad: Standard-respons A. Lokalisering: K115 QR.",
      attributes: {
        plassering: "Hengende",
        "følsomhetsgrad": "Standard-respons A",
        "utløsningstemperatur": "182 C",
        "k-faktor": "115",
        "gjengedimensjon (dn)": "20"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.warnings.some((warning) => warning.includes("standard- och quick-respons")));
});

test("does not confuse a standard surface treatment with standard response", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      technicalSpecification: [
        "Følsomhetsgrad: Kvikk respons",
        "Overflatebehandling: Som standard for produkt"
      ].join("\n"),
      attributes: {
        plassering: "Stående",
        følsomhetsgrad: "Kvikk respons",
        utløsningstemperatur: "68 °C",
        "k-faktor": "80",
        "gjengedimensjon (dn)": "15",
        overflatebehandling: "Som standard for produkt"
      }
    }
  });

  assert.ok(guide.searchQueries.some((query) => /\bQR\b/.test(query)));
  assert.ok(guide.searchQueries.every((query) => !/\bSR\b/.test(query)));
  assert.ok(guide.warnings.every((warning) => !warning.includes("standard- och quick-respons")));
});

test("treats Norwegian K-80 notation as K80 and searches protection grids as accessories", () => {
  const sprinkler = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        plassering: "Hengende",
        "følsomhetsgrad": "Kvikk respons",
        "utløsningstemperatur": "68 C",
        "k-faktor": "K-80",
        "gjengedimensjon (dn)": "15",
        overflatebehandling: "Messing"
      }
    }
  });
  const guard = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "Beskyttelsesgitre for sprinklerhoder, hvitlakkert",
    value_json: { attributes: {} }
  });

  assert.ok(sprinkler.directCandidates.some((candidate) => candidate.source === "verified_database"));
  assert.ok(sprinkler.directCandidates.every((candidate) => candidate.exactMatch !== true));
  assert.match(sprinkler.searchQuery, /K80/);
  assert.match(sprinkler.searchUrl, /^https:\/\/www\.ahlsell\.no\/search/);
  assert.equal(guard.searchQuery, "Sprinklergitter");
  assert.deepEqual(guard.searchQueries, ["Sprinklergitter", "Gitter sprinklerhode"]);
  assert.equal(guard.warnings.length, 0);
});

test("uses the verified Victaulic database for a fully specified Norwegian sprinkler row", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "1/2 V2762 sprinklerhode K80 SSP 68C QR hvit",
    value_json: {
      attributes: {
        sprinkleranlegg: "Våtanlegg",
        "type sprinkler": "Konvensjonell sprinkler",
        plassering: "Hengende",
        "følsomhetsgrad": "Kvikk respons",
        "utløsningstemperatur": "68 C",
        "k-faktor": "K80",
        "gjengedimensjon (dn)": "DN15",
        overflatebehandling: "Hvit"
      }
    }
  });

  const candidate = guide.directCandidates.find((item) => item.articleNumber === "9257423");
  assert.equal(candidate?.source, "verified_database");
  assert.equal(candidate?.exactMatch, true);
  assert.equal(candidate?.manufacturer, "Victaulic");
});

test("translates procurement language into Ahlsell product terminology", () => {
  const manometer = buildAhlsellRequirementGuide({
    category: "control",
    value_text: "MÅLEINSTRUMENT",
    value_json: { attributes: { type: "Analog, absolutt trykk, direkte måling" } }
  });
  const pressureSwitch = buildAhlsellRequirementGuide({
    category: "control",
    value_text: "TRYKKVAKT",
    value_json: { attributes: { trykk: "Min. 12 bar" } }
  });
  const bend = buildAhlsellRequirementGuide({
    category: "fitting",
    value_text: "INNENDØRS VANNLEDNING - RØRDEL",
    value_json: { attributes: { type: "Bend med flens", dimensjon: "DN100", trykk: "PN16" } }
  });

  assert.equal(manometer.searchQuery, "Manometer sprinkler");
  assert.equal(pressureSwitch.searchQuery, "Pressostat");
  assert.equal(bend.searchQuery, "Flensebend DN100 PN16");
});

test("uses Ahlsell orientation and response abbreviations for Norwegian sprinkler heads", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      plassering: "Stående",
      "følsomhetsgrad": "Standard-respons",
      "utløsningstemperatur": "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "15"
    } }
  });

  assert.equal(guide.searchQuery, "Sprinklerhode K80");
  assert.ok(guide.searchQueries.includes("Sprinkler K80 SR Opp"));
  assert.ok(guide.searchQueries.includes("Sprinklerhode K80 SR 68"));
  assert.ok(guide.recognitionNotes.some((note) => note.includes("variantvärden")));
});

test("translates Norwegian wall-mounted wording to an HSW catalog search", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      plassering: "Montert på sidevegg, horisontalt",
      "type sprinkler": "Konvensjonell sprinkler",
      følsomhetsgrad: "Standard-respons",
      utløsningstemperatur: "68 C",
      "k-faktor": "80",
      "gjengedimensjon (dn)": "DN15"
    } }
  });

  assert.ok(guide.criteria.includes("HSW"));
  assert.ok(guide.searchQueries.some((query) => /\bHSW\b/.test(query)));
});

test("uses Ahlsell's Norwegian family terms and pipe outside diameters", () => {
  const pipe = buildAhlsellRequirementGuide({
    category: "unknown",
    value_text: "DN40",
    value_json: { unit: "m", attributes: { dimensjon: "DN40" } }
  });
  const bend = buildAhlsellRequirementGuide({
    category: "fitting",
    value_text: "DN80",
    value_json: { attributes: { rørdel: "Bend", skjøt: "Rilleskjøt", dimensjon: "DN80" } }
  });
  const coupling = buildAhlsellRequirementGuide({
    category: "fitting",
    value_text: "DN80",
    value_json: { attributes: { rørdel: "Kupling", dimensjon: "DN80" } }
  });

  assert.equal(pipe.searchQuery, "Rør sprinkler 48.3mm");
  assert.equal(bend.searchQuery, "Bend rillet 88.9mm");
  assert.equal(coupling.searchQuery, "Kupling sprinkler 88.9mm");
});

test("prioritizes the row's explicit outside diameter over dimensions in parent text", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "pipe",
    value_text: "Stålrør sprinkler Ytre diameter=42.4",
    value_json: {
      unit: "m",
      sourceText: "Stålrør sprinkler Ytre diameter=42.4",
      technicalSpecification: "Se underposter DN150 DN200",
      attributes: { materiale: "Stål" }
    }
  });

  assert.equal(guide.searchQuery, "Rør sprinkler 42.4mm");
  assert.doesNotMatch(guide.searchQuery, /DN150|168.3/);
});

test("uses fitting subtype and both dimensions for reductions", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "fitting",
    value_text: "DN50/80",
    value_json: { attributes: { rørdel: "Dimensjonsovergang", dimensjon: "DN50/80" } }
  });

  assert.equal(guide.searchQuery, "Reduksjon rillet 60.3mm 88.9mm");
});
