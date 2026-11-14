import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { readPdfDocument } from "../src/modules/technical-description-extractor/pdf";

// Run from apps/web: node --import tsx scripts/export-pdf-structure.ts input.pdf output.json
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: export-pdf-structure.ts input.pdf output.json");
  if (resolve(input) === resolve(output)) throw new Error("Output must differ from the source PDF.");
  const structure = await readPdfDocument(await readFile(input), basename(input));
  await writeFile(output, JSON.stringify(structure, null, 2), { encoding: "utf8", flag: "wx" });
  console.log(`Saved ${structure.pageCount} pages with chapters and posts to ${output}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
