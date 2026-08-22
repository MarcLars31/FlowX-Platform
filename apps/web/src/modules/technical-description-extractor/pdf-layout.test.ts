import assert from "node:assert/strict";
import test from "node:test";
import { layoutTextFromPdfItems, shouldPreferPdfLayoutText } from "./pdf-layout";

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

function item(str: string, x: number, y: number, width: number) {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}
