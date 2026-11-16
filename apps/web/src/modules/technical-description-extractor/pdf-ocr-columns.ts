import { layoutTextFromOcrBlocks } from "./pdf-layout";
import { ocrBlocksFromWords, separatePriceColumns, unpositionedPriceColumns, type PositionedWord } from "./pdf-price-columns";

/** Preserve the original reading when OCR positions do not account for all
 * recognized characters. A merged text box is never divided proportionally. */
export function separateOcrPriceText(text:string, words?:readonly PositionedWord[]) {
  if (!words?.length) return {text,priceColumns:unpositionedPriceColumns(text)};
  const separated=separatePriceColumns(words);
  const counts=new Map<string,number>();
  for (const char of words.map(w=>w.text).join("").normalize("NFKC").replace(/\s/g,"")) counts.set(char,(counts.get(char)??0)+1);
  let complete=true;
  for (const char of text.normalize("NFKC").replace(/\s/g,"")) {
    const left=counts.get(char)??0;
    if (!left) {complete=false;break;}
    counts.set(char,left-1);
  }
  if (!complete && separated.audit.tables.length) return {text,priceColumns:{...separated.audit,
    status:"review" as const,excludedCells:[],issues:[...separated.audit.issues,"incomplete-word-positions"]}};
  return {text:separated.audit.excludedCells.length
    ? layoutTextFromOcrBlocks(ocrBlocksFromWords(separated.kept.map(i=>words[i]))) : text,
  priceColumns:separated.audit, words:complete ? separated.kept.map(i=>words[i]) : undefined};
}
