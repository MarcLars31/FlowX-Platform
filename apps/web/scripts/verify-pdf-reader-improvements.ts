/** Local corpus comparison; never contacts the database or mutates source PDFs. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile,writeFile,unlink,mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractTechnicalDescriptionPages,extractTechnicalDescriptionFromPages } from "../src/modules/technical-description-extractor";
import type { TechnicalDescriptionMaterialLine } from "../src/modules/technical-description-extractor";
const baselinePath=path.resolve("src/modules/technical-description-extractor/.pdf-reader-baseline.ts");
const names=process.argv.slice(2);
if(!names.length)throw new Error("Supply the local PDF paths to verify.");
const view=(lines:TechnicalDescriptionMaterialLine[])=>lines.map(({postNumber,parentPostNumber,postScope,nsCode,description,quantity,unit,attributes,sourceText,technicalSpecification,sourcePage,sourcePages,sourceChapter})=>
 ({postNumber,parentPostNumber,postScope,nsCode,description,quantity,unit,attributes,sourceText,technicalSpecification,sourcePage,sourcePages,sourceChapter}));
async function main(){
 const report:unknown[]=[];
 await writeFile(baselinePath,execFileSync("git",["show","b685d84:apps/web/src/modules/technical-description-extractor/extractor.ts"]));
 try {
  const baseline=await import(pathToFileURL(baselinePath).href);
  for(const name of names){
   const start=performance.now();const input=await readFile(name);
   const pages=name.endsWith(".json") ? JSON.parse(input.toString("utf8")).pages : await extractTechnicalDescriptionPages(input);
   const before=baseline.extractTechnicalDescriptionFromPages(structuredClone(pages));
   const after=extractTechnicalDescriptionFromPages(structuredClone(pages));
   assert.deepEqual(view(after.materialLines),view(before.materialLines),`Source data regression: ${name}`);
   const row={file:path.basename(name),pages:pages.length,posts:after.materialLines.length,
    quantityWarningsBefore:before.pageChecks?.filter((page:{unresolvedQuantityRows:number})=>page.unresolvedQuantityRows>0).length,
    quantityWarningsAfter:after.pageChecks?.filter(page=>page.unresolvedQuantityRows>0).length,
    milliseconds:Math.round(performance.now()-start)};
   report.push(row);console.log(JSON.stringify(row));
  }
  await mkdir("../../tmp/pdf-reader-review",{recursive:true});
  await writeFile(`../../tmp/pdf-reader-review/${names.every(name=>name.endsWith(".json")) ? "ocr-corpus-results" : "corpus-results"}.json`,JSON.stringify(report,null,2));
 } finally {await unlink(baselinePath);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
