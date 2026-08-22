import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import type { TechnicalDescriptionPage } from "./types";

const fixturePages: TechnicalDescriptionPage[] = [
  {
    pageNumber: 1,
    method: "ocr",
    confidence: 0.92,
    text: [
      "Prosjekt: C.2.3 Teknisk beskrivelse - Oppgradering SOP - Røranlegg Side 33-6",
      "Kapittel: 33 Brannslokking",
      "UE2.11111112A",
      "SPRINKLER",
      "Antall stk 20",
      "Sprinkleranlegg: Våtanlegg",
      "Type sprinkler: Konvensjonell sprinkler",
      "Plassering: Stående",
      "K-faktor: 80",
      "Trykk: Min PN 16",
      "Gjengedimensjon (DN): DN 15",
      "Hoder som er til overs benyttes som reservehoder.",
      "Sprinklersystemet skal utføres i overensstemmelse med NS-EN 12845."
    ].join("\n")
  },
  {
    pageNumber: 2,
    method: "ocr",
    confidence: 0.92,
    text: [
      "33.335.2 | UE2.11111212A",
      "SPRINKLER",
      "Antall stk 20",
      "Sprinkleranlegg: Våtanlegg",
      "Plassering: Hengende i tak",
      "33.335.3 | UE2.11111112A",
      "SPRINKLER",
      "Sprinkleranlegg: Våtanlegg",
      "Plassering: Stående",
      "Demontering av eksisterende hoder"
    ].join("\n")
  }
];

test("extracts technical-description material lines and rule hints", () => {
  const result = extractTechnicalDescriptionFromPages(fixturePages, {
    fileName: "Sprinkler.pdf"
  });

  assert.equal(result.document.extractionMethod, "ocr");
  assert.equal(result.project.projectNumber, "C.2.3");
  assert.equal(result.project.chapter, "33 Brannslokking");
  assert.deepEqual(result.standards, ["NS-EN-12845"]);
  assert.equal(result.materialLines.length, 3);
  assert.deepEqual(
    result.materialLines.map((line) => ({
      postNumber: line.postNumber,
      quantity: line.quantity,
      operation: line.operation
    })),
    [
      { postNumber: "33.335.1", quantity: 20, operation: "install" },
      { postNumber: "33.335.2", quantity: 20, operation: "install" },
      { postNumber: "33.335.3", quantity: undefined, operation: "remove" }
    ]
  );
  assert.equal(result.materialLines[0].category, "sprinkler_head");
  assert.equal(result.materialLines[0].attributes["k-faktor"], "80");
  assert.equal(result.ruleHints[0]?.key, "sprinkler_head_reserve");
  assert.equal(
    result.warnings.some((warning) => warning.code === "INFERRED_POST_NUMBER"),
    true
  );
});

test("classifies a sprinkler capacity meter as control equipment, not a sprinkler head", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 1,
    method: "text",
    confidence: 0.98,
    text: [
      "120000.30.332.4.1",
      "33_Kapasitetsmåler sprinkler DN80",
      "stk 1 0,00 0,00"
    ].join("\n")
  }]);

  assert.equal(result.materialLines.length, 1);
  assert.equal(result.materialLines[0].category, "control");
});

test("extracts NS 3420 table quantities and pipe lengths", () => {
  const pages: TechnicalDescriptionPage[] = [
    {
      pageNumber: 9,
      method: "text",
      confidence: 0.98,
      text: [
        "1403.33.332.",
        "1",
        "UB1.31114921934A",
        "INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
        "Slokkeanlegg/-medium: Sprinkler",
        "Materiale: Stål – malingsbehandlet",
        "Plassering: Under dekke",
        "Montasje: Vertikalt og Horisontalt",
        "Skjøt: Rilleskjøt",
        "Trykk: 12 bar",
        "Materialkvalitet: Pulverlakkerte sorte stålrør og deler inkl.",
        "oppheng. Leveres i RAL3001.",
        "Dimensjon: iht. underposter",
        "Andre krav:",
        "Skal følge NFPA 13:2025.",
        "Sum denne side:"
      ].join("\n")
    },
    {
      pageNumber: 10,
      method: "text",
      confidence: 0.98,
      text: [
        "Prosjekt: 100870, entreprise E04 Vedlikeholdsbygg Side 1403-10",
        "1403.33.332.",
        "1.1",
        "Rillede rør for sprinkleranl. Pulverlakkert DN100",
        "m 29,16 0,00 0,00",
        "1403.33.332.",
        "1.2",
        "Rillerør Bend DN100",
        "stk 10 0,00 0,00",
        "1403.33.332.",
        "7.1",
        "%SMA.067 - Stengeventil med gir, overvåket DN65 - Stengeventil A10 stk 1 0,00 0,00",
        "1403.33.332.",
        "9.1",
        "%XHZ.006 - Påveggs roterende akustisk/ optisk",
        "alarmapparat stk 2 0,00 0,00"
      ].join("\n")
    },
    {
      pageNumber: 13,
      method: "text",
      confidence: 0.98,
      text: [
        "1403.33.332.",
        "2.1",
        "Red pipe sprinkler(Gjennomføring) DN40",
        "Antall m 0,81 0,00 0,00",
        "1403.33.332.",
        "23.1",
        "%UZA.403 - Tørr Sprinkler nedadrettet, QR, K=80, 68°C",
        "(Våtanlegg) stk 3 0,00 0,00",
        "1403.33.332.",
        "24",
        "UL2.1999A",
        "MERKING AV INNENDØRS RØRLEDNING",
        "Antall stk 10 0,00 0,00",
        "Lokalisering: Rørnett"
      ].join("\n")
    }
  ];

  const result = extractTechnicalDescriptionFromPages(pages, {
    fileName: "1403 AB - 33 Rev03.pdf"
  });

  assert.equal(result.project.projectNumber, "100870");
  assert.equal(result.materialLines.length, 7);
  assert.deepEqual(
    result.materialLines.map((line) => ({
      postNumber: line.postNumber,
      quantity: line.quantity,
      unit: line.unit,
      category: line.category
    })),
    [
      { postNumber: "1403.33.332.1.1", quantity: 29.16, unit: "m", category: "pipe" },
      { postNumber: "1403.33.332.1.2", quantity: 10, unit: "st", category: "fitting" },
      { postNumber: "1403.33.332.7.1", quantity: 1, unit: "st", category: "valve" },
      { postNumber: "1403.33.332.9.1", quantity: 2, unit: "st", category: "control" },
      { postNumber: "1403.33.332.2.1", quantity: 0.81, unit: "m", category: "pipe" },
      { postNumber: "1403.33.332.23.1", quantity: 3, unit: "st", category: "sprinkler_head" },
      { postNumber: "1403.33.332.24", quantity: 10, unit: "st", category: "pipe" }
    ]
  );
  assert.equal(result.materialLines[0].parentPostNumber, "1403.33.332.1");
  assert.equal(result.materialLines[0].nsCode, "UB1.31114921934A");
  assert.equal(result.materialLines[0].attributes.dimensjon, "DN100");
  assert.equal(result.materialLines[0].attributes.trykk, "12 bar");
  assert.equal(
    result.materialLines[0].attributes.materialkvalitet,
    "Pulverlakkerte sorte stålrør og deler inkl. oppheng. Leveres i RAL3001."
  );
  assert.deepEqual(result.materialLines[0].standardRefs, ["NFPA-13:2025"]);
  assert.match(
    result.materialLines[0].technicalSpecification ?? "",
    /Materiale: Stål – malingsbehandlet[\s\S]*UNDERPOST[\s\S]*Rillede rør/
  );
  assert.equal(result.materialLines[5].attributes["k-faktor"], "80");
  assert.equal(
    result.materialLines[5].attributes["utløsningstemperatur"],
    "68 °C"
  );
  assert.equal(
    result.warnings.some((warning) => warning.code === "MISSING_QUANTITY"),
    false
  );
});

test("extracts GAB rows where quantity precedes a wrapped post number", () => {
  const pages: TechnicalDescriptionPage[] = [
    {
      pageNumber: 4,
      method: "text",
      confidence: 0.98,
      text: [
        "Prosjekt: Bybanen BTR.4_D34 Tekniske Installasjoner Haukeland Side 33-4",
        "Kapittel: 33 Brannslokking",
        "0.33.332.3",
        "322.1",
        "UB1.1194300932A",
        "INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
        "Slokkeanlegg/-medium: Sprinkler",
        "Materiale: Stål",
        "Trykk: 12 bar",
        "m 274 0 0 0.33.332.3",
        "322.1.1",
        "DN25",
        "m 65 0 0 0.33.332.3",
        "322.1.2",
        "DN32",
        "Sum denne side:"
      ].join("\n")
    }
  ];

  const result = extractTechnicalDescriptionFromPages(pages, {
    fileName: "ANBUDSBESKRIVELSE.pdf"
  });

  assert.deepEqual(
    result.materialLines.map((line) => ({
      postNumber: line.postNumber,
      parentPostNumber: line.parentPostNumber,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      nsCode: line.nsCode
    })),
    [
      {
        postNumber: "0.33.332.3 322.1.1",
        parentPostNumber: "0.33.332.3 322.1",
        description: "DN25",
        quantity: 274,
        unit: "m",
        nsCode: "UB1.1194300932A"
      },
      {
        postNumber: "0.33.332.3 322.1.2",
        parentPostNumber: "0.33.332.3 322.1",
        description: "DN32",
        quantity: 65,
        unit: "m",
        nsCode: "UB1.1194300932A"
      }
    ]
  );
  assert.equal(result.materialLines[0].attributes.trykk, "12 bar");
  assert.equal(result.warnings.length, 0);
});

test("keeps all quantified rows when full and split post formats are mixed", () => {
  const pages: TechnicalDescriptionPage[] = [
    {
      pageNumber: 28,
      method: "text",
      confidence: 0.98,
      text: [
        "Kapittel: 33 Brannslokking",
        "33.332.9 UE2.11112592",
        "SPRINKLER",
        "Sprinkleranlegg: Våtanlegg",
        "K-faktor: 80",
        "33.332.9.1 Sprinkler hvit inkl. rosett",
        "Antall stk 8",
        "33.332.9.2 Sprinkler sort inkl. rosett",
        "Antall stk 19",
        "33.332.11 UB1.33119925932",
        "INNENDØRS RØRLEDNING – BRANNSLOKKING – SLANGE",
        "Slokkeanlegg/-medium: Sprinkler",
        "33.332.11.",
        "1",
        "Sprinklerslange 1 x 1/2 x 1200 mm",
        "Antall stk 28",
        "Sum denne side:"
      ].join("\n")
    }
  ];

  const result = extractTechnicalDescriptionFromPages(pages, {
    fileName: "Equinor.pdf"
  });

  assert.deepEqual(
    result.materialLines.map((line) => ({
      postNumber: line.postNumber,
      quantity: line.quantity,
      unit: line.unit,
      category: line.category
    })),
    [
      { postNumber: "33.332.9.1", quantity: 8, unit: "st", category: "sprinkler_head" },
      { postNumber: "33.332.9.2", quantity: 19, unit: "st", category: "sprinkler_head" },
      { postNumber: "33.332.11.1", quantity: 28, unit: "st", category: "pipe" }
    ]
  );
  assert.equal(result.materialLines[0].attributes["k-faktor"], "80");
  assert.equal(result.warnings.length, 0);
});

test("joins project-prefixed post numbers split across lines", () => {
  const pages: TechnicalDescriptionPage[] = [
    {
      pageNumber: 14,
      method: "text",
      confidence: 0.98,
      text: [
        "Prosjekt: Fornebubanen Side 33-14",
        "Kapittel: 33 Brannslokking",
        "120000.30.",
        "331.2",
        "UB1.32114399932",
        "INNENDØRS RØRLEDNING – BRANNSLOKKING – RØR",
        "Slokkeanlegg/-medium: Sprinkler",
        "Materiale: Stål",
        "m 35,4 0 0 120000.30.",
        "331.2.1",
        "DN25 stålrør",
        "Sum denne side:"
      ].join("\n")
    }
  ];

  const result = extractTechnicalDescriptionFromPages(pages, {
    fileName: "Brann_120000_Base_K5B.pdf"
  });

  assert.equal(result.project.name, "Fornebubanen");
  assert.equal(result.materialLines.length, 1);
  assert.equal(result.materialLines[0].postNumber, "120000.30.331.2.1");
  assert.equal(result.materialLines[0].parentPostNumber, "120000.30.331.2");
  assert.equal(result.materialLines[0].quantity, 35.4);
  assert.equal(result.materialLines[0].unit, "m");
  assert.equal(result.warnings.length, 0);
});
