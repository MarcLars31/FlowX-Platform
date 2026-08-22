import assert from "node:assert/strict";
import test from "node:test";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";

test("builds a verified but unapproved Ahlsell candidate from an exact PDF requirement", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        "plassering": "Hengende",
        "følsomhetsgrad": "Kvikk respons",
        "utløsningstemperatur": "68 C",
        "k-faktor": "80",
        "gjengedimensjon (dn)": "15",
        "overflatebehandling": "Farge: Hvit"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 1);
  assert.equal(guide.directCandidates[0].articleNumber, "19045188");
  assert.equal(guide.directCandidates[0].source, "public_verified");
  assert.match(guide.searchQuery, /K80/);
  assert.match(guide.searchQuery, /DN15/);
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
  assert.match(decodeURIComponent(guide.directCandidates[0].productUrl), /SearchPhrase=9253497/);
});

test("does not suggest a visible sprinkler for a concealed ceiling requirement", () => {
  const guide = buildAhlsellRequirementGuide({
    category: "sprinkler_head",
    value_text: "Sprinkler hvit inkl. rosett",
    value_json: {
      attributes: {
        "plassering": "Innfelt, synlig montasje i tak",
        "følsomhetsgrad": "Kvikk respons",
        "utløsningstemperatur": "68 °C",
        "k-faktor": "80",
        "gjengedimensjon (dn)": "15"
      }
    }
  });

  assert.equal(guide.directCandidates.length, 0);
  assert.ok(guide.criteria.includes("Concealed"));
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
  assert.match(guide.searchQuery, /Rillede rør/);
  assert.match(guide.searchQuery, /Sprinklerrör/);
  assert.match(decodeURIComponent(guide.searchUrl), /DN100/);
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

  assert.equal(sprinkler.directCandidates[0]?.articleNumber, "19045185");
  assert.match(sprinkler.searchQuery, /K80/);
  assert.match(guard.searchQuery, /skyddskorg/);
  assert.equal(guard.warnings.length, 0);
});
