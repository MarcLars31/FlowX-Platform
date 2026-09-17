import assert from "node:assert/strict";
import test from "node:test";
import { complementMldlCandidates, findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { ahlsellMldlCandidate, ahlsellMldlProduct } from "./ahlsell-mldl-catalog";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { ahlsellCatalogStatusFromPayload } from "./ahlsell-match-groups";

test("uses a positioned comment's article as a search hint without copying its dimensions into the specification", () => {
  const guide = buildAhlsellRequirementGuide({ category: "pipe", value_text: "DN80", value_json: { unit: "m", attributes: {
    dimensjon: "DN80", "pdf-kommentar": "1118636 DN100 er bare et eksempel."
  } } });
  assert.equal(guide.searchQueries[0], "1118636");
  assert.ok(guide.searchQueries.slice(1).every(query => !/DN100|eksempel/.test(query)));
});

test("complementary PN and material evidence clears only missing product-data warnings", () => {
  const req = { category: "valve", value_text: "Kuleventil DN25", value_json: { attributes: { trykk: "PN16", materiale: "Messing" } } };
  const local = rankAhlsellCandidates(req, [{ ...candidate("9999901", "Kuleventil DN25"), source: "structured_database" }]);
  assert.ok(local[0].matchWarnings?.some(warning => /tryckklass saknas|material behöver verifieras/.test(warning)));
  const result = complementMldlCandidates(req, local, [{ ...candidate("9999901", "Kuleventil DN25 PN10/16 Messing") }]);
  assert.deepEqual(result[0].matchWarnings, []);
  assert.equal(result[0].recommendation, "recommended");
});

const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
  sprinkleranlegg: "Våtanlegg", "type sprinkler": "Spraysprinkler", plassering: "Hengende synlig i tak",
  følsomhetsgrad: "Kvikk respons", utløsningstemperatur: "68 °C", "k-faktor": "80",
  "gjengedimensjon (dn)": "15", overflatebehandling: "Messing", trykk: "12 bar", beskyttelse: "Nei"
} } };
const candidate = (article = "9999991", name = '1/2" sprinklerhode K80 SSP 68C QR mess'): AhlsellPublicCandidate => ({
  articleNumber: article, productName: name, manufacturer: "Victaulic", specifications: [], source: "catalog_search",
  productUrl: `https://www.ahlsell.no/products/sprinkler/${article}/`
});
const card = (article: string, name = "Sprinklerhoder - Ned") => ({
  name, mostRelevantVariantId: article, firstVariationPageUrl: candidate(article).productUrl, brand: "Victaulic"
});
const html = (article: string, subtitle: string) => `<h1 data-test="product-name">Sprinklerhoder</h1><div>${subtitle}</div><span class="text-card-item-number"><span>${article}</span></span>`;

const wetAlarmRequirement = {
  category: "valve", value_text: "KONTROLLVENTILSETT FOR SPRINKLERANLEGG",
  value_json: { nsCode: "UE2.211A", postNumber: "33.3.2", quantity: 1, unit: "stk", attributes: {
    "type kontrollventilsett": "Våt alarmventil", "dimensjon (dn)": "65", trykk: "12 bar",
    "type tilkobling": "Rille eller flens"
  }, technicalSpecification: "Ventilen skal leveres med retardasjonskammer for trykkutgjevning" }
};

const showerRequirement = {
  category: "control", value_text: "DUSJ MED BLANDEBATTERI",
  value_json: { nsCode: "UF8.21120A", postNumber: "31.4.3", quantity: 14, unit: "stk", attributes: {
    type: "Hånddusj montert på glidestang", dusjhode: "Med sparefunksjon", materiale: "Valgfritt",
    lokalisering: "Bad beboerrom", dusjbatteri: "Valgfritt", utforming: "Se tekst under.", slange: "Valgfritt",
    "avvik i plassering": "maks ±5 mm.", "avvik i vinkel": "maks ±1°.",
    "avstand mellom dusjstang og vegg": "iht. monteringsanvisning."
  }, technicalSpecification: "Komplett hånddusj med blandebatteri, vinkelformet støttehåndtak, dusjsett og dusjsete. "
    + "Trykkstyrt dusjarmatur med integrert temperatursperre. Dusjstang minimum 1000 mm vertikal og 400 mm horisontal lengde, "
    + "belastningstestet for minimum 500 kg. Dusjsete skal tåle minimum 500 kg, kunne høydejusteres og slås opp mot vegg." }
};
const showerWrongProducts = [
  ["9254797", '1/2" luft trim-sett 757 f/serie 768-769 -Fire'],
  ["9255764", "76.1mm Flow Switch VSR-2 m/30 sek forsinkelse VDS Fire"],
  ["9254852", "Akselerator D746 f/768/769 Lap dry -Fire"],
  ["9253499", "Spjeldventil VIC 705, åpen overvåkning, Victaulic FireLock"],
  ["9254844", "Sprinklerklokke. Vic D760, Victaulic, FireLock"],
  ["9255866", "Dreneringssett Vic 751, Victaulic Fire"],
  ["9256178", "Lavtrykksaktuator"],
  ["PRØVEJOURNAL2021", "Prøvejournal Sprinkler"]
].map(([article, name]) => ({
  ...(ahlsellMldlCandidate(article) ?? candidate(article, name)), productName: name,
  exactMatch: true, recommendation: "recommended" as const, matchScore: 100
}));

test("classifies shower post 31.4.3 independently of stale sprinkler categories and mounting tolerances", () => {
  for (const category of ["unknown", "control", "valve", "sprinkler_head"]) {
    const req = { ...showerRequirement, category };
    assert.equal(ahlsellRequirementIntent(req), "shower_set");
    assert.deepEqual(findMldlOnlyCandidates(req), []);
    const guide = buildAhlsellRequirementGuide(req);
    assert.deepEqual(guide.searchQueries, ["Dusjsett med blandebatteri", "Dusjbatteri hånddusj glidestang", "Dusjsett"]);
    assert.doesNotMatch(guide.criteria.join(" "), /sprinkler|HSW|DN\d|K\d|\d+°C/i);
  }
  assert.equal(ahlsellRequirementIntent({ category: "valve", value_text: "Kuleventil for dusj DN15" }), "ball_valve");
});

test("rejects all eight sprinkler suggestions for the shower, including inherited exact matches and merged sources", () => {
  const ranked = rankAhlsellCandidates(showerRequirement, showerWrongProducts);
  assert.equal(ranked.length, 8);
  for (const product of ranked) {
    assert.equal(ahlsellCandidateMatchState(product), "mismatch", product.articleNumber);
    assert.equal(product.exactMatch, false);
  }
  assert.deepEqual(complementMldlCandidates(showerRequirement, showerWrongProducts, showerWrongProducts), []);
});

test("does not show or fetch details for unrelated sprinkler results returned by a shower search", async () => {
  const queries: string[] = [];
  const result = await findAhlsellHybridCandidates(showerRequirement, async input => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/search");
    queries.push(url.searchParams.get("parameters.SearchPhrase")!);
    return Response.json({ productCount: 8, productCards: showerWrongProducts.map(product => card(product.articleNumber, product.productName)) });
  });
  assert.deepEqual(queries.sort(), ["Dusjsett med blandebatteri", "Dusjbatteri hånddusj glidestang", "Dusjsett"].sort());
  assert.equal(result.publicSearchStatus, "available");
  assert.equal(result.total, 0);
  assert.deepEqual(result.candidates, []);
});

test("retains relevant shower components for review without approving a whole accessible shower assembly", () => {
  const products = ["Dusjsett med hånddusj og glidestang", "Dusjbatteri med temperatursperre", "Dusjsete veggmontert"]
    .map((name, index) => ({ ...candidate(`test-shower-${index}`, name), exactMatch: true }));
  const combined = complementMldlCandidates(showerRequirement, [], products);
  assert.equal(combined.length, 3);
  for (const product of combined) {
    assert.equal(ahlsellCandidateMatchState(product), "review");
    assert.ok(product.matchWarnings?.some(warning => /leveransomfattning.*tilläggskraven/.test(warning)));
    assert.equal(product.exactMatch, false);
  }
});

test("automatically finds a shower outside MLDL using the PDF-derived broader search and reads its product page", async () => {
  const article = "6200001";
  assert.equal(ahlsellMldlProduct(article), null);
  assert.deepEqual(findMldlOnlyCandidates(showerRequirement), []);
  const queries: string[] = [];
  let productPageRead = false;
  const result = await findAhlsellHybridCandidates(showerRequirement, async input => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/products/")) {
      productPageRead = true;
      return new Response(html(article, "Dusjsett med sparefunksjon og glidestang").replace("Sprinklerhoder", "Dusjsett"), {
        headers: { "Content-Type": "text/html" }
      });
    }
    const query = url.searchParams.get("parameters.SearchPhrase")!;
    queries.push(query);
    return Response.json({ productCount: query === "Dusjsett" ? 1 : 0,
      productCards: query === "Dusjsett" ? [{ ...card(article, "Dusjsett med glidestang"), brand: "Test sanitærleverandør" }] : [] });
  });
  assert.equal(queries.length, 3);
  assert.ok(queries.includes("Dusjsett"));
  assert.equal(productPageRead, true);
  assert.equal(result.publicSearchStatus, "available");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].articleNumber, article);
  assert.deepEqual(result.candidates[0].evidenceSources, ["ahlsell_public"]);
  assert.equal(ahlsellCatalogStatusFromPayload(result), "found");
  assert.equal(result.candidates[0].exactMatch, false);
});

test("does not fill an unavailable DN65 wet alarm set with signage results", async () => {
  const queries: string[] = [];
  assert.deepEqual(findMldlOnlyCandidates(wetAlarmRequirement), []);
  const result = await findAhlsellHybridCandidates(wetAlarmRequirement, async input => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/search", "Signage must not consume product detail lookups");
    queries.push(url.searchParams.get("parameters.SearchPhrase")!);
    return Response.json({ productCount: 2, productCards: [
      { ...card("63819071", "Skiltpakke for sprinklersentral Systemtext"), brand: "Systemtext" },
      { ...card("test-sign", "Brannskilt Sprinklersentral"), brand: "Systemtext" }
    ] });
  });
  assert.deepEqual(queries.sort(), ["Alarmventil våt DN65", "Sprinklersentral våt 76.1mm"].sort());
  assert.equal(result.publicSearchStatus, "available");
  assert.deepEqual(result.candidates, []);
  assert.equal(result.total, 0);
});

test("rejects signs for wet and dry alarm sets even with inherited exact-match evidence", () => {
  const signs = ["Skiltpakke for sprinklersentral Systemtext", "Brannskilt Sprinklersentral", "Sprinklersentral"]
    .map((name, index) => ({ ...candidate(`sign-${index}`, name), exactMatch: true,
      description: "Etterlysende skilt for sprinklersentral", matchScore: 100, recommendation: "recommended" as const }));
  for (const type of ["Våt alarmventil", "Tørr alarmventil"]) {
    const req = { ...wetAlarmRequirement, value_json: { ...wetAlarmRequirement.value_json,
      attributes: { ...wetAlarmRequirement.value_json.attributes, "type kontrollventilsett": type } } };
    for (const sign of rankAhlsellCandidates(req, signs)) {
      assert.equal(ahlsellCandidateMatchState(sign), "mismatch");
      assert.equal(sign.exactMatch, false);
    }
    assert.deepEqual(complementMldlCandidates(req, signs, signs), []);
  }
});

test("retains an actual wet alarm set with included signs while requiring its retard chamber to be checked", () => {
  const valve = { ...candidate("test-wet-set", "Sprinklersentral våt DN65 med skilt"),
    description: "Komplett våt alarmventil med alarmfunksjon og skilt. Max arbeidstrykk 16 bar." };
  const [ranked] = rankAhlsellCandidates(wetAlarmRequirement, [valve]);
  assert.equal(ahlsellCandidateMatchState(ranked), "review");
  assert.ok(ranked.matchWarnings?.some(warning => /retardationskammare/.test(warning)));
  assert.ok(!ranked.matchWarnings?.some(warning => /skylt/.test(warning)));
  const result = complementMldlCandidates(wetAlarmRequirement, [], [valve]);
  assert.equal(result.length, 1);
  assert.equal(result[0].articleNumber, "test-wet-set");
});

test("searches the exact MLDL article, finds public-only articles, and ranks technical subtitles before display", async () => {
  const queries: string[] = [];
  const result = await findAhlsellHybridCandidates({ ...requirement, project_name: "PRIVATE_PROJECT", source_excerpt: "PRIVATE_PDF" }, async input => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/products/")) {
      const article = url.pathname.split("/").filter(Boolean).at(-1)!;
      return new Response(html(article, `1/2&quot; sprinklerhode K80 SSP 68C QR. mess`), { headers: { "Content-Type": "text/html" } });
    }
    const query = url.searchParams.get("parameters.SearchPhrase")!;
    queries.push(query);
    return Response.json({ productCount: 1, productCards: [card(query === "9257392" ? "9257392" : "9254111N5")] });
  });
  assert.equal(result.publicSearchStatus, "available");
  assert.ok(queries.includes("9257392"));
  assert.ok(queries.length <= 4);
  assert.ok(!queries.some(query => /PRIVATE_/.test(query)));
  assert.equal(ahlsellMldlProduct("9254111N5"), null);
  const extra = result.candidates.find(c => c.articleNumber === "9254111N5")!;
  assert.ok(extra);
  assert.ok(!extra.matchWarnings?.some(w => /K-faktorn saknas|Utlösningstemperaturen saknas/.test(w)));
  assert.match(extra.matchReasons?.join(" ") ?? "", /K80/);
  assert.match(extra.matchReasons?.join(" ") ?? "", /68 °C/);
  const overlap = result.candidates.filter(c => c.articleNumber === "9257392");
  assert.equal(overlap.length, 1);
  assert.ok(overlap[0].evidenceSources?.includes("mldl_database"));
  assert.ok(overlap[0].evidenceSources?.includes("ahlsell_public"));
  assert.ok(!overlap[0].matchWarnings?.some(w => /saknas|arbetstryck/.test(w)));
});

test("keeps all MLDL results if Ahlsell is unavailable and reports the outage", async () => {
  const result = await findAhlsellHybridCandidates(requirement, async () => { throw new Error("offline"); });
  assert.equal(result.publicSearchStatus, "unavailable");
  assert.deepEqual(result.candidates, findMldlOnlyCandidates(requirement));
});

test("a failed exact lookup does not discard successful public searches", async () => {
  const result = await findAhlsellHybridCandidates(requirement, async input => {
    const url = new URL(String(input));
    if (url.searchParams.get("parameters.SearchPhrase") === "9257392") throw new Error("one query failed");
    if (url.pathname.startsWith("/products/")) return new Response("Unavailable", { status: 503 });
    return Response.json({ productCount: 1, productCards: [card("9999991")] });
  });
  assert.equal(result.publicSearchStatus, "partial");
  assert.ok(result.candidates.some(c => c.articleNumber === "9999991"));
  assert.ok(result.candidates.some(c => c.articleNumber === "9257392"));
});

test("a complementary value clears the old missing warning without inventing a pressure approval", () => {
  const local = rankAhlsellCandidates(requirement, [{ ...candidate("9999991", '1/2" sprinklerhode K80 SSP QR mess'), source: "structured_database" }]);
  assert.ok(local[0].matchWarnings?.some(w => /Utlösningstemperaturen saknas/.test(w)));
  const [combined] = complementMldlCandidates(requirement, local, [candidate()]);
  assert.ok(!combined.matchWarnings?.some(w => /Utlösningstemperaturen saknas/.test(w)));
  assert.ok(combined.matchWarnings?.some(w => /arbetstryck behöver verifieras/.test(w)));
  assert.equal(combined.exactMatch, false);
});

test("a confirmed K-factor conflict in either source survives matching data in the other", () => {
  for (const wrongLocal of [true, false]) {
    const good = candidate();
    const wrong = candidate("9999991", '1/2" sprinklerhode K115 SSP 68C QR mess');
    const local = rankAhlsellCandidates(requirement, [{ ...(wrongLocal ? wrong : good), source: "structured_database" }]);
    const [combined] = complementMldlCandidates(requirement, local, [wrongLocal ? good : wrong]);
    assert.match(combined.matchWarnings?.join(" ") ?? "", /Fel K-faktor/);
    assert.equal(combined.exactMatch, false);
    assert.equal(combined.recommendation, "unlikely");
    assert.ok(combined.matchScore! <= 34);
  }
});

test("checks the underlying MLDL article even when it was absent from the initial shortlist", () => {
  const combined = complementMldlCandidates(requirement, [], [candidate("9257423")]);
  assert.ok(combined[0].evidenceSources?.includes("mldl_database"));
  assert.match(combined[0].matchWarnings?.join(" ") ?? "", /Färg eller ytfinish stämmer inte/);
  assert.equal(combined[0].recommendation, "unlikely");
});

test("does not merge an N5 article with a base NRF", () => {
  const local = rankAhlsellCandidates(requirement, [{ ...candidate(), source: "structured_database" }]);
  const combined = complementMldlCandidates(requirement, local, [candidate("9999991N5")]);
  assert.equal(combined.length, 2);
  assert.ok(!combined.find(c => c.articleNumber === "9999991N5")?.evidenceSources?.includes("mldl_database"));
});

test("a page with a different visible article cannot fill missing technical values", async () => {
  const result = await findAhlsellHybridCandidates(requirement, async input => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/products/")) return new Response(html("9999992", 'K80 68C QR'), { headers: { "Content-Type": "text/html" } });
    return Response.json({ productCount: 1, productCards: [card("9999991")] });
  });
  const wrongPage = result.candidates.find(c => c.articleNumber === "9999991")!;
  assert.match(wrongPage.matchWarnings?.join(" ") ?? "", /K-faktorn saknas/);
  assert.match(wrongPage.matchWarnings?.join(" ") ?? "", /Utlösningstemperaturen saknas/);
});

test("uses the real NRF and technical table from an N5 product page", async () => {
  const result = await findAhlsellHybridCandidates(requirement, async input => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/products/")) return new Response(html("9254111", '1/2&quot; V2726 Sprinklerhode K80 QR Messing Quick Re')
      + '<div data-test="information-table">Tekniske data<ul><li>Utløsningstemperatur: 68°C</li><li>Sprinklertype: Konv. SP/SSU</li></ul></div>', { headers: { "Content-Type": "text/html" } });
    return Response.json({ productCount: 1, productCards: [card("9254111N5")] });
  });
  assert.ok(!result.candidates.some(c => c.articleNumber === "9254111N5"));
  const actual = result.candidates.find(c => c.articleNumber === "9254111")!;
  assert.ok(actual);
  assert.ok(!actual.matchWarnings?.some(w => /K-faktorn saknas|Utlösningstemperaturen saknas/.test(w)));
});

test("deduplicates a database catalogue id only when its NRF alias was confirmed by the page", () => {
  const local = rankAhlsellCandidates(requirement, [{ ...candidate("9999991N5"), source: "structured_database" }]);
  const combined = complementMldlCandidates(requirement, local, [candidate()], new Map([["9999991", "9999991N5"]]));
  assert.equal(combined.length, 1);
  assert.equal(combined[0].articleNumber, "9999991");
  assert.ok(combined[0].evidenceSources?.includes("mldl_database"));
  assert.ok(combined[0].evidenceSources?.includes("ahlsell_public"));
});

test("conventional SP/SSU supports upright and pendent but does not imply recessed or sidewall mounting", () => {
  const dual = { ...candidate("9254111", "V2726 QR - Konvensjonell opp/ned"), description: '1/2" K80 68C QR mess', specifications: ["Sprinklertype: Konv. SP/SSU"] };
  for (const placement of ["Hengende synlig i tak", "Stående synlig i tak"]) {
    const req = { ...requirement, value_json: { attributes: { ...requirement.value_json.attributes, plassering: placement } } };
    const [result] = rankAhlsellCandidates(req, [dual]);
    assert.ok(!result.matchWarnings?.some(w => /monteringsriktning/i.test(w)));
  }
  const [recessed] = rankAhlsellCandidates({ ...requirement, value_json: { attributes: { ...requirement.value_json.attributes, plassering: "Hengende innfelt i himling" } } }, [dual]);
  assert.match(recessed.matchWarnings?.join(" ") ?? "", /utan dokumenterat infällt montage/);
  const [sidewall] = rankAhlsellCandidates({ ...requirement, value_json: { attributes: { ...requirement.value_json.attributes, plassering: "Sidewall veggmontert" } } }, [dual]);
  assert.match(sidewall.matchWarnings?.join(" ") ?? "", /monteringsriktning stämmer inte/);
});
