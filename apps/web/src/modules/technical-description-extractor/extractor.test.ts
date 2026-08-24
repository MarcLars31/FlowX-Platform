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

test("keeps visually aligned Ahlsell article numbers, posts and quantities together", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 3,
    method: "text",
    confidence: 0.98,
    text: [
      "Kapittel: 30 VVS - 33 Brannslokking - 332 Installasjon med sprinkler - 3325 Utstyr",
      "K-30 Brannslokkingsanlegg",
      "Postnr. NS-kode/Firmakode/Spesifikasjon Enhet Mengde",
      "2 UC1.51124A",
      "INNENDØRS STENGEVENTIL",
      "Ventiltype: Dreiespjeldventil",
      "2.1 Dimensjon: DN65 VIC 705, overvåket åpen 9253497 stk 2 0 0",
      "2.2 Dimensjon: DN100 VIC 705, overvåket åpen 9253499 stk 2 0 0",
      "2.3 Dimensjon: DN150 VIC 705, overvåket åpen 9253502 stk 2 0 0"
    ].join("\n")
  }]);

  assert.deepEqual(result.materialLines.map((line) => ({
    postNumber: line.postNumber,
    quantity: line.quantity,
    unit: line.unit,
    category: line.category,
    description: line.description
  })), [
    { postNumber: "2.1", quantity: 2, unit: "st", category: "valve", description: "Dimensjon: DN65 VIC 705, overvåket åpen 9253497" },
    { postNumber: "2.2", quantity: 2, unit: "st", category: "valve", description: "Dimensjon: DN100 VIC 705, overvåket åpen 9253499" },
    { postNumber: "2.3", quantity: 2, unit: "st", category: "valve", description: "Dimensjon: DN150 VIC 705, overvåket åpen 9253502" }
  ]);
  assert.equal(result.materialLines[0].attributes.dimensjon, "DN65");
  assert.equal(result.materialLines[0].attributes.kapittelpost, "3325 Utstyr");
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

test("reads project identity from an Ahlsell request cover sheet", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 1,
    method: "text",
    confidence: 0.98,
    text: [
      "Prosjekt prisforespørsel leverandører - Ahlsell Vest.",
      "Anlegg : A113849 26052 Askøy kommune - ombygging omsorgsplasser",
      "Anleggsadresse/sted: Kleppestø"
    ].join("\n")
  }]);

  assert.equal(
    result.project.name,
    "A113849 26052 Askøy kommune - ombygging omsorgsplasser"
  );
  assert.equal(result.project.projectNumber, "A113849");
  assert.equal(result.materialLines.length, 0);
});

test("extracts scanned NS 3420 pipe rows with delimiters and OCR lm units", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 2,
    method: "ocr",
    confidence: 0.93,
    text: [
      "Kapittel: 33 Brannslokking",
      "33.332.2 | UB1.31114499934A",
      "INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
      "Materiale: Stål – varmforsinket",
      "Trykk: PN16",
      "33.332.2.1| Dimensjon: DN100",
      "Lengde Im 45,00",
      "33.332.2.2| Dimensjon: DN80",
      "Lengde Im 35,00",
      "Sum denne side:"
    ].join("\n")
  }]);

  assert.deepEqual(result.materialLines.map((line) => ({
    postNumber: line.postNumber,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    category: line.category,
    dimension: line.attributes.dimensjon
  })), [
    {
      postNumber: "33.332.2.1",
      description: "Dimensjon: DN100",
      quantity: 45,
      unit: "m",
      category: "pipe",
      dimension: "DN100"
    },
    {
      postNumber: "33.332.2.2",
      description: "Dimensjon: DN80",
      quantity: 35,
      unit: "m",
      category: "pipe",
      dimension: "DN80"
    }
  ]);
});

test("recovers missing OCR post numbers from the next numbered row", () => {
  const result = extractTechnicalDescriptionFromPages([
    {
      pageNumber: 4,
      method: "ocr",
      confidence: 0.9,
      text: [
        "Kapittel: 33 Brannslokking",
        "UE2.11111312",
        "SPRINKLER",
        "Antall stk 5",
        "K-faktor: 160",
        "UE2.11111112",
        "SPRINKLER",
        "Antall stk 95",
        "K-faktor: 80"
      ].join("\n")
    },
    {
      pageNumber: 5,
      method: "ocr",
      confidence: 0.9,
      text: [
        "Kapittel: 33 Brannslokking",
        "33.332.4.3| UE2.11111512",
        "SPRINKLER",
        "Antall stk 3"
      ].join("\n")
    }
  ]);

  assert.deepEqual(
    result.materialLines.map((line) => line.postNumber),
    ["33.332.4.1", "33.332.4.2", "33.332.4.3"]
  );
  assert.equal(
    result.materialLines.slice(0, 2).every((line) =>
      line.reviewFlags.includes("inferred-post-number")
    ),
    true
  );
});

test("joins specifications that continue on the immediately following page", () => {
  const result = extractTechnicalDescriptionFromPages([
    {
      pageNumber: 10,
      method: "ocr",
      confidence: 0.92,
      text: [
        "Kapittel: 33 Brannslokking",
        "33.332.11 | UC1.5119918A",
        "INNENDØRS STENGEVENTIL",
        "Antall stk 1",
        "Ventiltype: Dreiespjeldventil"
      ].join("\n")
    },
    {
      pageNumber: 11,
      method: "ocr",
      confidence: 0.92,
      text: [
        "Kapittel: 33 Brannslokking",
        "Trykk: PN16",
        "Dimensjon, tilkoblinger: DN100",
        "33.332.12 | UC4.77999951",
        "INNENDØRS SPESIALVENTIL",
        "Antall stk 5"
      ].join("\n")
    }
  ]);

  assert.equal(result.materialLines[0].attributes.trykk, "PN16");
  assert.equal(result.materialLines[0].attributes["dimensjon, tilkoblinger"], "DN100");
  assert.match(result.materialLines[0].technicalSpecification ?? "", /FORTSETTELSE SIDE 11/);
});

test("keeps embedded bend angles out of the quantity field", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 11,
    method: "text",
    confidence: 0.98,
    text: [
      "Kapittel: 33 Brannslokking",
      "33.332.13 | UB1.31114423932A",
      "INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
      "RS",
      "Sprinklerrør legges om med 4 stk 90 gr. bend og inntil 2 m rør."
    ].join("\n")
  }]);

  assert.notEqual(result.materialLines[0]?.quantity, 90);
});

test("classifies a hand extinguisher separately from sprinkler heads", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 3,
    method: "text",
    confidence: 0.98,
    text: [
      "Kapittel: 33 Brannslokking",
      "33.500.6 | UE6.1913",
      "HANDSLOKKER",
      "Antall stk 2",
      "Slokkemiddel: Skum"
    ].join("\n")
  }]);

  assert.equal(result.materialLines[0].category, "other");
  assert.equal(result.materialLines[0].system, "foam-extinguisher");
});

test("reconnects visually wrapped post columns without shifting descriptions", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 13,
    method: "text",
    confidence: 0.98,
    text: [
      "Prosjekt: 100870 Vedlikeholdsbygg Side 1403-13",
      "Kapittel: 33 Brannslokking",
      "1403.33.332. UB1.31113324334",
      "2 INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
      "Materiale: PP-R",
      "Dimensjon: Iht. underposter",
      "1403.33.332. Red pipe sprinkler(Gjennomføring) DN40",
      "2.1 Antall m 0,81 0,00 0,00",
      "1403.33.332. Red pipe sprinkler(Gjennomføring) DN32",
      "2.2 Antall m 1,70 0,00 0,00",
      "Sum denne side:"
    ].join("\n")
  }]);

  assert.deepEqual(result.materialLines.map((line) => ({
    postNumber: line.postNumber,
    parentPostNumber: line.parentPostNumber,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    category: line.category
  })), [
    {
      postNumber: "1403.33.332.2.1",
      parentPostNumber: "1403.33.332.2",
      description: "Red pipe sprinkler(Gjennomføring) DN40",
      quantity: 0.81,
      unit: "m",
      category: "pipe"
    },
    {
      postNumber: "1403.33.332.2.2",
      parentPostNumber: "1403.33.332.2",
      description: "Red pipe sprinkler(Gjennomføring) DN32",
      quantity: 1.7,
      unit: "m",
      category: "pipe"
    }
  ]);
});

test("reconnects wrapped GAB post suffixes printed below quantified rows", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 4,
    method: "text",
    confidence: 0.98,
    text: [
      "Prosjekt: Bybanen Haukeland Side 30-4",
      "Kapittel: 30 VVS - 33 Brannslokking - 332 Installasjon med sprinkler",
      "0.33.332.3 UB1.1294300934A",
      "322.1 INNENDØRS VANNLEDNING - RØR",
      "Materiale: Stål",
      "0.33.332.3 DN25 m 274 0 0",
      "322.1.1",
      "0.33.332.3 DN32 m 65 0 0",
      "322.1.2",
      "Sum denne side:"
    ].join("\n")
  }]);

  assert.deepEqual(result.materialLines.map((line) => ({
    postNumber: line.postNumber,
    parentPostNumber: line.parentPostNumber,
    description: line.description,
    quantity: line.quantity,
    category: line.category
  })), [
    {
      postNumber: "0.33.332.3 322.1.1",
      parentPostNumber: "0.33.332.3 322.1",
      description: "DN25",
      quantity: 274,
      category: "pipe"
    },
    {
      postNumber: "0.33.332.3 322.1.2",
      parentPostNumber: "0.33.332.3 322.1",
      description: "DN32",
      quantity: 65,
      category: "pipe"
    }
  ]);
});

test("inherits pipe context for dimension-only rows and reads a descriptive length", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 21,
    method: "text",
    confidence: 0.98,
    text: [
      "Prosjekt: Sprinkleranlegg Side 00033-5",
      "Kapittel: 00033 Brannslokking",
      "00033.331",
      ".1",
      "UB1.113613100A",
      "VANNLEDNING - KOMPLETT",
      "Materiale: Stål",
      "00033.331",
      ".1.1",
      "DN 25",
      "Lengde lm 240,00",
      "00033.331",
      ".3.1",
      "Løpemeter rør som skal demonteres lm 35,00",
      "Sum denne side:"
    ].join("\n")
  }]);

  assert.deepEqual(result.materialLines.map((line) => ({
    postNumber: line.postNumber,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    category: line.category,
    operation: line.operation
  })), [
    {
      postNumber: "00033.331.1.1",
      description: "DN 25",
      quantity: 240,
      unit: "m",
      category: "pipe",
      operation: "install"
    },
    {
      postNumber: "00033.331.3.1",
      description: "Løpemeter rør som skal demonteres",
      quantity: 35,
      unit: "m",
      category: "pipe",
      operation: "remove"
    }
  ]);
});

test("continues past chapter-only cover pages to find the project identity", () => {
  const result = extractTechnicalDescriptionFromPages([
    {
      pageNumber: 1,
      method: "text",
      confidence: 0.98,
      text: "Kapittel: 300 Generell del"
    },
    {
      pageNumber: 13,
      method: "text",
      confidence: 0.98,
      text: "Prosjekt: 000670 Protonseter, Helse Bergen. Entreprise K 301 Røranlegg Side 03-153"
    }
  ]);

  assert.equal(
    result.project.name,
    "000670 Protonseter, Helse Bergen. Entreprise K 301 Røranlegg"
  );
  assert.equal(result.project.projectNumber, "000670");
  assert.equal(result.project.chapter, "300 Generell del");
  assert.equal(result.project.sourcePage, 13);
});

test("classifies the product title before incidental component references", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 5,
    method: "text",
    confidence: 0.98,
    text: [
      "Kapittel: 33 Brannslokking",
      "3.3 XQ1.12123A",
      "MÅLEINSTRUMENT",
      "Antall stk 5",
      "Manometer med stengeventil monteres på rørledningsnett."
    ].join("\n")
  }]);

  assert.equal(result.materialLines[0].category, "control");
});

test("uses the main tender cover instead of project identities in appended reports", () => {
  const result = extractTechnicalDescriptionFromPages([
    {
      pageNumber: 1,
      method: "ocr",
      confidence: 0.91,
      text: "Sprinkelprosjekt\nInnspurten 15"
    },
    {
      pageNumber: 22,
      method: "text",
      confidence: 0.98,
      text: "SYSTEMBESKRIVELSE SPRINKLERANLEGG\nProsjekt: Helsfyr Atrium parkeringsanlegg.\nProsjekt nr: 80119"
    }
  ]);

  assert.deepEqual(result.project, {
    name: "Sprinkelprosjekt Innspurten 15",
    sourcePage: 1,
    confidence: 0.91
  });
});

test("reads standalone project and project-number fields from system descriptions", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 1,
    method: "text",
    confidence: 0.98,
    text: "SYSTEMBESKRIVELSE SPRINKLERANLEGG\nProsjekt: Helsfyr Atrium parkeringsanlegg.\nProsjekt nr: 80119"
  }]);

  assert.equal(result.project.name, "Helsfyr Atrium parkeringsanlegg.");
  assert.equal(result.project.projectNumber, "80119");
});

test("does not turn sprinkler drawings and hydraulic reports into material rows", () => {
  const result = extractTechnicalDescriptionFromPages([
    {
      pageNumber: 24,
      method: "text",
      confidence: 0.98,
      text: [
        "DN100 opp/ned for sammenkobling",
        "Tegningstittel: Plan 0",
        "Tegningsnummer: 33-1-00",
        "Tegningsstatus: Arbeidstegning",
        "Målestokk As indicated",
        "Format A0",
        "Disiplin RIRs"
      ].join("\n")
    },
    {
      pageNumber: 27,
      method: "text",
      confidence: 0.98,
      text: [
        "Sprinkler report",
        "Calculation date: 10.06.2026",
        "Property Value Unit",
        "KR016T: Langsømsveiset EN 10217-1 120"
      ].join("\n")
    }
  ]);

  assert.deepEqual(result.materialLines, []);
});

test("repairs OCR decimal loss in dry-sprinkler K-factors", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 3,
    method: "ocr",
    confidence: 0.9,
    text: [
      "Prosjekt: FB VEST DK JWC Kantine Side 33-6",
      "Kapittel: 33 Brannslokking",
      "33.500.5 UE2.11121532",
      "SPRINKLER",
      "Antall stk 17",
      "Type sprinkler: Tørrsprinkler",
      "K-faktor: 1145"
    ].join("\n")
  }]);

  assert.equal(result.materialLines[0].attributes["k-faktor"], "114.5");
});

test("canonicalizes compact and spaced NS standard references", () => {
  const result = extractTechnicalDescriptionFromPages([{
    pageNumber: 1,
    method: "text",
    confidence: 0.98,
    text: "Kontrakt etter NS8407 og NS 8407."
  }]);

  assert.deepEqual(result.standards, ["NS-8407"]);
});
