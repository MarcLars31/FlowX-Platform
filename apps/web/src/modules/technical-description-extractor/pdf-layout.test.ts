import assert from "node:assert/strict";
import test from "node:test";
import {
  isBetterOcrText,
  needsStructuredOcrRecovery,
  layoutTextFromOcrBlocks,
  layoutTextFromPdfItems,
  shouldPreferOcrLayoutText,
  shouldPreferPdfLayoutText
} from "./pdf-layout";

test("OCR quality counts aligned quantity rows, not separate vertical words", () => {
  const plain = "33.332.11 UE2.11112512\nAntall\nstk\n6";
  const aligned = "33.332.11 UE2.11112512\nAntall stk 6";
  assert.equal(shouldPreferOcrLayoutText(plain, aligned), true);
  assert.equal(isBetterOcrText(aligned, plain), true);
  assert.equal(needsStructuredOcrRecovery(plain), true);
  assert.equal(needsStructuredOcrRecovery(aligned), false);
  assert.equal(isBetterOcrText("33.332.11 UE2.11112512\nAntall stk", aligned), false);
});

test("prefers table coordinates when OCR detached the entire post-number column", () => {
  const plain = "Multiconsult\n22.06.2026\nPostnr NS-kode Enh. Mengde\n30.332.22\n30.332.23\nUE2.11122319\nSPRINKLER\nAntall\nUE2.11199219A\nSPRINKLER\nAntall\nstk\nstk";
  const layout = "Multiconsult 22.06.2026\nPostnr NS-kode Enh. Mengde\n30.332.22 UE2.11122319\nSPRINKLER\nAntall stk\n30.332.23 UE2.11199219A\nSPRINKLER\nAntall stk";
  assert.equal(shouldPreferOcrLayoutText(plain, layout), true);
});

test("a recovered quantity must not replace another post or most of the specification", () => {
  const current = "33.332.1 UE2.11112312\nAntall stk\n33.332.2 UE2.11112312\nAntall stk";
  assert.equal(isBetterOcrText("33.332.1 UE2.11112312\nAntall stk 2", current), false);
  assert.equal(isBetterOcrText("33.332.1 UE2.11112312\nAntall stk 2", "33.332.1 UE2.11112312\nAntall stk\n" + "Alle festemidler skal inngå. ".repeat(30)), false);
});

test("rebuilds PDF table rows by visual coordinates", () => {
  const items = [
    item("9253499", 360, 680, 45),
    item("2.1", 30, 700, 16),
    item("DN65 VIC 705", 100, 700, 100),
    item("9253497", 360, 700, 45),
    item("stk", 450, 700, 15),
    item("2", 490, 700, 5),
    item("2.2", 30, 680, 16),
    item("DN100 VIC 705", 100, 680, 105),
    item("stk", 450, 680, 15),
    item("2", 490, 680, 5)
  ];

  const result = layoutTextFromPdfItems(items);
  assert.match(result.split("\n")[0], /^2\.1\s+DN65 VIC 705\s+9253497\s+stk\s+2$/);
  assert.match(result.split("\n")[1], /^2\.2\s+DN100 VIC 705\s+9253499\s+stk\s+2$/);
});

test("only prefers coordinate layout for recognizable technical tables", () => {
  const layout = [
    "Prosjekt Bakerhuset K-30 Brannslokkingsanlegg Postnr. NS-kode Enhet Mengde",
    "2.1 Dimensjon DN65 VIC 705 9253497 stk 2 0 0"
  ].join("\n");
  assert.equal(shouldPreferPdfLayoutText("Postnr. Mengde", layout), true);
  assert.equal(shouldPreferPdfLayoutText("Vanlig brødtext", "En vanlig tekst utan tabell"), false);
});

test("joins OCR words from separate table columns into one material row", () => {
  const blocks = [
    ocrBlock([
      ocrWord("33.332.11", 70, 700, 145, 720),
      ocrWord("UC1.5119918A", 180, 700, 290, 720)
    ]),
    ocrBlock([
      ocrWord("Antall", 180, 760, 235, 780),
      ocrWord("stk", 630, 762, 655, 782),
      ocrWord("1", 730, 762, 740, 782)
    ])
  ];

  const result = layoutTextFromOcrBlocks(blocks);
  assert.match(result, /^33\.332\.11\s+UC1\.5119918A/m);
  assert.match(result, /^Antall\s+stk\s+1$/m);
  assert.equal(
    shouldPreferOcrLayoutText("UC1.5119918A\nAntall stk", result),
    true
  );
});

function item(str: string, x: number, y: number, width: number) {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}

function ocrBlock(words: ReturnType<typeof ocrWord>[]) {
  return { paragraphs: [{ lines: [{ words }] }] };
}

function ocrWord(text: string, x0: number, y0: number, x1: number, y1: number) {
  return { text, bbox: { x0, y0, x1, y1 } };
}
