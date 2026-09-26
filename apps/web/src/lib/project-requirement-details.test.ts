import assert from "node:assert/strict";
import test from "node:test";
import { enrichProjectRequirements } from "./project-requirement-enrichment";
import {
  postNumberFromSource,
  projectRequirementSystemLabel,
  projectRequirementDetails
} from "./project-requirement-details";

test("reopening a project preserves source comments recovered from continuation pages", () => {
  const pages = [
    { pageNumber: 1, method: "text", confidence: .98,
      text: "Kapittel: 33 Brannslokking\n33.332.1 UE2.11112312\nSPRINKLER\nAntall stk 12\nMateriale: Messing\nSum:",
      annotations: [{ id: "first", postNumber: "33.332.1", text: "Kontroller utførelse.", subtype: "Text" }] },
    { pageNumber: 2, method: "text", confidence: .98,
      text: "Kapittel: 33 Brannslokking\nPostnr. NS-kode Mengde Sum\nRosetter skal inngå.\nSum:",
      annotations: [{ id: "continued", continuesPreviousPost: true, text: "Bekreft overflate med byggherre.", subtype: "Text" }] }
  ];
  const [row] = enrichProjectRequirements([{
    id: "post", source_technical_description_document_id: "document", source_page: 1,
    value_text: "SPRINKLER", value_json: { postNumber: "33.332.1", attributes: { "pdf-kommentar": "Kontroller utførelse." } }
  }], [{ id: "document", source_pages: pages }]);
  const details = projectRequirementDetails(row);
  const comment = details.attributes.find(([key]) => key === "pdf-kommentar")?.[1];
  assert.equal(comment, "Kontroller utførelse.\n\nBekreft overflate med byggherre.");
  assert.match(details.sourceExcerpt!, /Rosetter skal inngå/);
});

test("reads a split NS 3420 post number from an existing source excerpt", () => {
  assert.equal(
    postNumberFromSource(
      "1403.33.332.\n1.12\nRillerør Bend DN40\nstk 43 0,00 0,00"
    ),
    "1403.33.332.1.12"
  );
});

test("shows portable foam extinguishers as foam extinguishers", () => {
  assert.equal(projectRequirementSystemLabel("foam-extinguisher"), "Skumsläckare");
  assert.equal(projectRequirementSystemLabel("sprinkler"), "Sprinkler");
});

test("repairs the inherited sprinkler system in already saved foam-extinguisher rows", () => {
  const details = projectRequirementDetails({
    id: "requirement-1",
    value_text: "HANDSLOKKER",
    value_json: {
      description: "HANDSLOKKER",
      category: "other",
      system: "sprinkler",
      attributes: {
        slokkemiddel: "Skum",
        "mengde slokkemedium": "6 liter"
      }
    }
  });

  assert.equal(details.system, "foam-extinguisher");
  assert.equal(projectRequirementSystemLabel(details.system!), "Skumsläckare");
});

test("returns every stored specification without the former eight-item limit", () => {
  const attributes = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`spec_${index + 1}`, `värde ${index + 1}`])
  );
  const details = projectRequirementDetails({
    value_json: {
      postNumber: "1403.33.332.23.1",
      attributes: { ...attributes, kapittelpost: "3325 Utstyr" }
    },
    source_page: 32,
    source_excerpt: "original"
  });

  assert.equal(details.postNumber, "1403.33.332.23.1");
  assert.equal(details.chapterPost, "3325 Utstyr");
  assert.equal(details.attributes.length, 12);
  assert.equal(details.sourcePage, 32);
});

test("shows the raw PDF K-factor when legacy OCR normalization stored a decimal", () => {
  const details = projectRequirementDetails({
    value_json: {
      attributes: { "k-faktor": "114.5" },
      technicalSpecification: "SPRINKLER\nK-faktor: 1145"
    }
  });

  assert.deepEqual(
    details.attributes.find(([key]) => key === "k-faktor"),
    ["k-faktor", "1145"]
  );
});

test("enriches an existing requirement with its inherited main-post specifications", () => {
  const documentId = "00000000-0000-4000-8000-000000000001";
  const [requirement] = enrichProjectRequirements(
    [{
      id: "requirement-1",
      requirement_key: "pipe",
      value_text: "Rillede rør for sprinkleranl. Pulverlakkert DN100",
      value_json: {
        quantity: 29.16,
        unit: "m",
        attributes: { dimension: "DN100" }
      },
      source_page: 10,
      source_excerpt:
        "1403.33.332.\n1.1\nRillede rør for sprinkleranl. Pulverlakkert DN100\nm 29,16 0,00 0,00",
      source_technical_description_document_id: documentId
    }],
    [{
      id: documentId,
      file_name: "teknisk-beskrivning.pdf",
      source_pages: [
        {
          pageNumber: 9,
          method: "text",
          confidence: 0.98,
          text: [
            "1403.33.332.",
            "1",
            "UB1.31114921934A",
            "INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
            "Materiale: Stål – malingsbehandlet",
            "Trykk: 12 bar",
            "Dimensjon: iht. underposter",
            "Andre krav:",
            "Sum denne side:"
          ].join("\n")
        },
        {
          pageNumber: 10,
          method: "text",
          confidence: 0.98,
          text: [
            "1403.33.332.",
            "1.1",
            "Rillede rør for sprinkleranl. Pulverlakkert DN100",
            "m 29,16 0,00 0,00"
          ].join("\n")
        }
      ]
    }]
  );

  const value = requirement.value_json as Record<string, unknown>;
  const attributes = value.attributes as Record<string, unknown>;
  assert.equal(value.postNumber, "1403.33.332.1.1");
  assert.equal(value.parentPostNumber, "1403.33.332.1");
  assert.equal(value.nsCode, "UB1.31114921934A");
  assert.equal(attributes.materiale, "Stål – malingsbehandlet");
  assert.equal(attributes.trykk, "12 bar");
  assert.equal(attributes.dimensjon, "DN100");
});

test("carries extraction review flags into enriched project requirements", () => {
  const documentId = "00000000-0000-4000-8000-000000000002";
  const sourceText = [
    "33.500.1 UE2.11121532",
    "SPRINKLER",
    "Antall stk 1",
    "K-faktor: 560"
  ].join("\n");
  const [requirement] = enrichProjectRequirements([{
    id: "requirement-warning",
    value_text: "SPRINKLER",
    value_json: { postNumber: "33.500.1", attributes: {} },
    source_page: 1,
    source_excerpt: sourceText,
    source_technical_description_document_id: documentId
  }], [{
    id: documentId,
    file_name: "sprinkler.pdf",
    source_pages: [{
      pageNumber: 1,
      method: "ocr",
      confidence: 0.9,
      text: sourceText
    }]
  }]);
  const value = requirement.value_json as Record<string, unknown>;

  assert.deepEqual(value.reviewFlags, ["ocr-source", "implausible-k-factor"]);
  assert.equal((value.attributes as Record<string, unknown>)["k-faktor"], "560");
});

const cableLadderPost = [
  "1401.40.411.", "38", "WC2.522A", "KABELSTIGE",
  "Lengde m 501,10 0,00 0,00", "Materiale: Stål – galvanisert",
  "Lokalisering: I henhold til plantegninger", "Dimensjonerende last: 150 kg/m",
  "Bredde: 600 mm", "Konsolltype: Tak- og veggkonsoll",
  "Avstand mellom konsoller: I henhold til leverandørs", "anvisning.",
  "Montasje: Monteres i tak eller langs vegg. Metallisk", "skilleplate mellom elkraft og ekom.",
  "Andre krav:", "a) Omfang og prisgrunnlag",
  "Omfatter også krav gitt i tekniske bestemmelser, post", "1401.40.411.1",
  "b) Materialer", "Korrosjonsklasse C4."
].join("\n");

test("shows the complete lettered additional requirements in the cable-ladder PDF example", () => {
  const details = projectRequirementDetails({
    value_json: { technicalSpecification: cableLadderPost, attributes: { materiale: "Stål – galvanisert" } },
    source_excerpt: cableLadderPost
  });
  assert.equal(details.postNumber, "1401.40.411.38");
  assert.equal(details.additionalRequirements,
    "a) Omfang og prisgrunnlag\nOmfatter også krav gitt i tekniske bestemmelser, post\n1401.40.411.1\n\nb) Materialer\nKorrosjonsklasse C4.");
  assert.deepEqual(details.attributes, [["materiale", "Stål – galvanisert"]]);
});

test("keeps a, b and c across a PDF page break without taking text from the next post", () => {
  const [requirement] = enrichProjectRequirements([{
    id: "sprinkler", source_page: 1, source_technical_description_document_id: "document",
    value_text: "SPRINKLER", value_json: { postNumber: "33.332.1" }
  }], [{ id: "document", source_pages: [
    { pageNumber: 1, method: "text", confidence: .98,
      text: "Kapittel: 33 Brannslokking\n" + "33.332.1 UE2.11112312\nSPRINKLER\nAntall stk 12\nAndre krav:\na) Omfang og prisgrunnlag\nAlle deler inngår." + "\nSum:" },
    { pageNumber: 2, method: "text", confidence: .98,
      text: "Kapittel: 33 Brannslokking\nPostnr. NS-kode/Spesifikasjon Enhet Mengde Pris Sum\nb) Materialer\nKorrosjonsklasse C4.\nc) Utførelse\nAlle festedeler skal inkluderes.\n33.332.2 UE2.11112312\nSPRINKLER\nAntall stk 5\nMateriale: Aluminium\nSum:" }
  ] }]);
  const details = projectRequirementDetails(requirement);
  assert.match(details.additionalRequirements!, /a\) Omfang og prisgrunnlag/);
  assert.match(details.additionalRequirements!, /b\) Materialer\nKorrosjonsklasse C4\./);
  assert.match(details.additionalRequirements!, /c\) Utførelse\nAlle festedeler skal inkluderes\./);
  assert.doesNotMatch(details.additionalRequirements!, /Aluminium|33\.332\.2|Sum:/);
});

test("keeps inherited and own additional requirements separate from child specifications", () => {
  const own = "33.1.1 RØR\nDimensjon: DN25\nAndre krav:\nc) Utførelse\nFestes i tak.";
  const details = projectRequirementDetails({ value_json: {
    technicalSpecification: "33.1 RØR\nAndre krav:\na) Omfang og prisgrunnlag\nAlle deler inngår.\n\nUNDERPOST\n" + own,
    sourceText: own
  }, source_excerpt: own });
  assert.equal(details.additionalRequirements,
    "a) Omfang og prisgrunnlag\nAlle deler inngår.\n\nc) Utførelse\nFestes i tak.");
});

test("recovers additional requirements from legacy fields without repeating an extracted clause", () => {
  const complete = projectRequirementDetails({ value_json: {
    attributes: { "omfatter også": "Alle festedeler skal inkluderes." },
    technicalSpecification: "Andre krav:\nb) Materialer\nOmfatter også: Alle festedeler skal inkluderes."
  } });
  assert.equal(complete.additionalRequirements, "b) Materialer\nOmfatter også: Alle festedeler skal inkluderes.");
  const legacy = projectRequirementDetails({ value_json: { attributes: { "omfatter også": "Alle festedeler skal inkluderes." } } });
  assert.equal(legacy.additionalRequirements, "Alle festedeler skal inkluderes.");
  const ordinary = projectRequirementDetails({ source_excerpt: "Materiale: Messing\nMontasje: I tak" });
  assert.equal(ordinary.additionalRequirements, null);
});
