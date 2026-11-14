import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createWorker, OEM } from "tesseract.js";
import { layoutTextFromOcrBlocks, shouldPreferOcrLayoutText } from "../src/modules/technical-description-extractor/pdf-layout";
import { extractTechnicalDescriptionFromPages } from "../src/modules/technical-description-extractor/extractor";

async function main() {
  const directory = path.resolve(process.argv[2]);
  const worker = await createWorker("nor+eng", OEM.LSTM_ONLY, { langPath: path.resolve("public/ocr"), cachePath: directory, gzip: true });
  try {
    const summaries = [];
    let index = 0;
    for (const prefix of ["ocr-sprinkler", "ocr-vaga", "ocr-sprinkler2"]) {
      const files = (await fs.readdir(directory)).filter(name => new RegExp(`^${prefix}-\\d+\\.png$`).test(name)).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
      const pages = [];
      for (const file of files) {
        if (index++ > 0) await worker.reinitialize("nor+eng", OEM.LSTM_ONLY);
        await worker.setParameters({ preserve_interword_spaces: "1" });
        const start = performance.now();
        const { data } = await worker.recognize(path.join(directory, file), {}, { text: true, blocks: true });
        const plain = data.text.trim();
        const layout = layoutTextFromOcrBlocks(data.blocks);
        const text = shouldPreferOcrLayoutText(plain, layout) ? layout : plain;
        const pageNumber = Number(file.match(/-(\d+)\.png$/)![1]);
        const milliseconds = Math.round(performance.now() - start);
        pages.push({ pageNumber, text, plain, layout, confidence: data.confidence / 100, method: "ocr" as const, milliseconds });
        await fs.writeFile(path.join(directory, `${file}.ocr.json`), JSON.stringify({ text: data.text, confidence: data.confidence, blocks: data.blocks }, null, 2));
        console.log(`${file}: ${text.length} chars, ${milliseconds} ms`);
      }
      const result = extractTechnicalDescriptionFromPages(pages);
      await fs.writeFile(path.join(directory, `${prefix}-before.json`), JSON.stringify({ pages, result }, null, 2));
      summaries.push({ name: prefix, pages: pages.length, milliseconds: pages.reduce((sum, p) => sum + p.milliseconds, 0), materialLines: result.materialLines.map(p => ({ post: p.postNumber, qty: p.quantity, page: p.sourcePage, category: p.category, attributes: p.attributes })) });
    }
    await fs.writeFile(path.join(directory, "ocr-summary-before.json"), JSON.stringify(summaries, null, 2));
  } finally { await worker.terminate(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
