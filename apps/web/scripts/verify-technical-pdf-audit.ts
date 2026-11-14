import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createWorker, OEM } from "tesseract.js";
import { extractTechnicalDescriptionFromPages } from "../src/modules/technical-description-extractor/extractor";
import { isBetterOcrText, layoutTextFromOcrBlocks, shouldPreferOcrLayoutText } from "../src/modules/technical-description-extractor/pdf-layout";

async function main() {
  const dir = path.resolve(process.argv[2]);
  const worker = await createWorker("nor+eng", OEM.LSTM_ONLY, { langPath: path.resolve("public/ocr"), cachePath: dir, gzip: true });
  let retryText = "";
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(path.join(dir, "retry-sprinkler2-page10.png"), {}, { text: true, blocks: true });
    const layout = layoutTextFromOcrBlocks(data.blocks);
    retryText = shouldPreferOcrLayoutText(data.text, layout) ? layout : data.text.trim();
    await fs.writeFile(path.join(dir, "retry-sprinkler2-page10.ocr.json"), JSON.stringify({ text: data.text, blocks: data.blocks, preferredText: retryText }, null, 2));
  } finally { await worker.terminate(); }
  const summaries = [];
  for (const prefix of ["ocr-sprinkler", "ocr-vaga", "ocr-sprinkler2"]) {
    const { pages, result: before } = JSON.parse(await fs.readFile(path.join(dir, `${prefix}-before.json`), "utf8"));
    const withoutRetry = extractTechnicalDescriptionFromPages(pages);
    if (prefix === "ocr-sprinkler2") {
      const first = withoutRetry.materialLines.find(line => line.postNumber === "30.332.14")!;
      assert.equal(first.attributes["k-faktor"], "80");
      assert.equal(first.attributes.beskyttelse, "Nei");
      assert.equal(first.quantity, undefined);
      const page10 = pages.find((p: { pageNumber: number }) => p.pageNumber === 10);
      if (isBetterOcrText(retryText, page10.text)) page10.text = retryText;
    }
    const after = extractTechnicalDescriptionFromPages(pages);
    assert.deepEqual(after.materialLines.map(line => line.postNumber), before.materialLines.map((line: { postNumber: string }) => line.postNumber));
    const heads = after.materialLines.filter(line => line.category === "sprinkler_head");
    assert.ok(heads.every(line => line.attributes["utløsningstemperatur"]));
    if (prefix === "ocr-sprinkler2") {
      const first = after.materialLines.find(line => line.postNumber === "30.332.14")!;
      assert.equal(first.quantity, 39);
      assert.equal(first.attributes["k-faktor"], "80");
      assert.equal(first.attributes.beskyttelse, "Nei");
    }
    await fs.writeFile(path.join(dir, `${prefix}-after.json`), JSON.stringify(after, null, 2));
    summaries.push({ file: prefix, lines: after.materialLines.length, heads: heads.length, temperatureFieldsBefore: before.materialLines.filter((line: {category:string; attributes:Record<string,string>}) => line.category === "sprinkler_head" && line.attributes["utløsningstemperatur"]).length, temperatureFieldsAfter: heads.filter(line => line.attributes["utløsningstemperatur"]).length });
  }
  const beforeDigital = JSON.parse(await fs.readFile(path.join(dir, "before/1-unpdf.json"), "utf8"));
  const afterDigital = JSON.parse(await fs.readFile(path.join(dir, "after/1-unpdf.json"), "utf8"));
  assert.deepEqual(afterDigital.result.materialLines, beforeDigital.result.materialLines);
  const comments = afterDigital.pages.flatMap((p: {annotations?: unknown[]}) => p.annotations ?? []);
  const report = { summaries, digitalMaterialLines: afterDigital.result.materialLines.length, digitalComments: comments.length, digitalCommentPages: afterDigital.pages.filter((p: {annotations?: unknown[]}) => p.annotations?.length).length };
  await fs.writeFile(path.join(dir, "verified.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
