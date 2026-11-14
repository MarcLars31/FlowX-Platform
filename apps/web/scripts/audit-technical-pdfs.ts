import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { openPdfTextDocument, closePdfTextDocument, plainTextFromPdfItems } from "../src/lib/pdf-runtime";
import { layoutTextFromPdfItems, shouldPreferPdfLayoutText } from "../src/modules/technical-description-extractor/pdf-layout";
import { extractTechnicalDescriptionFromPages, extractTechnicalDescriptionPages, pagesRequiringOcr } from "../src/modules/technical-description-extractor";

async function main() {
  const [sourceDir, outputDir] = process.argv.slice(2);
  if (!sourceDir || !outputDir) throw new Error("Usage: audit-technical-pdfs.ts <PDF directory> <output directory>");
  await fs.mkdir(outputDir, { recursive: true });
  const names = ["1403 AB - 33 Rev03.pdf", "Sprinkler.pdf", "Sprinkler_Vågå svømmehall.pdf", "Sprinkler2.pdf"];
  const summaries = [];
  for (const [index, name] of names.entries()) {
    const data = await fs.readFile(path.join(sourceDir, name));
    const start = performance.now();
    const pages = await extractTechnicalDescriptionPages(data);
    const result = extractTechnicalDescriptionFromPages(pages);
    const ms = Math.round(performance.now() - start);
    const document = await openPdfTextDocument(data);
    const comparisons = [];
    try {
      for (let n = 1; n <= document.numPages; n++) {
        const page = await document.getPage(n);
        const { items } = await page.getTextContent();
        const plain = plainTextFromPdfItems(items);
        const layout = layoutTextFromPdfItems(items);
        const annotations = await page.getAnnotations({ intent: "display" });
        comparisons.push({ page: n, plain, layout, layoutSelected: shouldPreferPdfLayoutText(plain, layout), annotations });
      }
    } finally { await closePdfTextDocument(document); }
    await fs.writeFile(path.join(outputDir, `${index + 1}-unpdf.json`), JSON.stringify({ name, pages, result, comparisons }, null, 2));
    summaries.push({ name, pages: pages.length, ocrPages: pagesRequiringOcr(pages), materialLines: result.materialLines.length, milliseconds: ms, layoutPages: comparisons.filter(p => p.layoutSelected).map(p => p.page) });
  }
  await fs.writeFile(path.join(outputDir, "unpdf-summary.json"), JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
