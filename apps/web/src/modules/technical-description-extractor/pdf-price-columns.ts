/** Separate financial cells while geometry still exists. No monetary-number
 * pattern is used to decide which text to remove. Coordinates use a downward
 * y axis (PDF coordinates are flipped, OCR coordinates are already downward). */
export const PRICE_COLUMN_VERSION = 1;
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type PositionedWord = { text: string; bbox: Box };
export type TableRule = Box;
type Role = "post" | "description" | "unit" | "quantity" | "price" | "sum";
type Word = PositionedWord & { id: number };
type Header = Word & { role: Role };
export type PriceTable = {
  bounds: Box;
  columns: Array<{ role: Role; left: number; right: number }>;
  evidence: "rules" | "aligned-rows" | "continued-rules";
};
export type PriceColumnAudit = {
  version: typeof PRICE_COLUMN_VERSION;
  status: "not-detected" | "separated" | "review";
  tables: PriceTable[];
  excludedCells: Array<PositionedWord & { column: "price" | "sum"; table: number }>;
  issues: string[];
};
const labels: Record<Role, string[]> = {
  post: ["postnr", "postnummer", "pos", "posnr"],
  description: ["beskrivelse", "beskrivning", "tekst", "text", "specifikation", "spesifikasjon", "ns3420kode/spesifikasjon"],
  unit: ["enh", "enhet", "enhed", "eining"],
  quantity: ["mengde", "mengd", "mängd", "antall", "antal"],
  price: ["pris", "enhetspris", "enhedspris", "àpris", "ápris", "apris"],
  sum: ["sum", "summa", "beløp", "belop", "belopp"],
};
const labelKey = (text: string) => text.toLocaleLowerCase().replace(/[\s.:\-–]/g, "");
const financial = (role: Role): role is "price" | "sum" => role === "price" || role === "sum";
const centerY = (word: PositionedWord) => (word.bbox.y0 + word.bbox.y1) / 2;
const height = (word: PositionedWord) => Math.max(1, word.bbox.y1 - word.bbox.y0);
const inside = (word: PositionedWord, left: number, right: number, tolerance = 1) =>
  word.bbox.x0 >= left - tolerance && word.bbox.x1 <= right + tolerance;

function rowsOf(words: Word[]) {
  const rows: Word[][] = [];
  for (const word of [...words].sort((a,b) => centerY(a)-centerY(b) || a.bbox.x0-b.bbox.x0)) {
    const row = rows.at(-1);
    if (row && Math.abs(centerY(row[0])-centerY(word)) <= Math.max(3, Math.min(height(row[0]),height(word)) * .55)) row.push(word);
    else rows.push([word]);
  }
  return rows.map(row => row.sort((a,b) => a.bbox.x0-b.bbox.x0));
}

function headersOf(row: Word[]): Header[] {
  const found: Header[] = [];
  for (let i=0; i<row.length; i++) {
    let text = "";
    for (let j=i; j<Math.min(row.length,i+5); j++) {
      if (j>i && row[j].bbox.x0-row[j-1].bbox.x1 > height(row[i]) * .7) break;
      text += row[j].text;
      const role = (Object.keys(labels) as Role[]).find(role => labels[role].includes(labelKey(text)));
      if (role) {
        found.push({ ...row[i], text, bbox: { ...row[i].bbox, x1: row[j].bbox.x1 }, role });
        i=j; break;
      }
    }
  }
  return found;
}

function mergedVerticalRules(rules: readonly TableRule[]) {
  const merged: TableRule[] = [];
  for (const rule of [...rules].filter(r => r.x1-r.x0 <= 2 && r.y1-r.y0 >= 8)
    .sort((a,b) => a.x0-b.x0 || a.y0-b.y0)) {
    const prior = merged.find(r => Math.abs(r.x0-rule.x0) <= 1.5 && rule.y0 <= r.y1+2 && rule.y1 >= r.y0-2);
    if (prior) { prior.y0=Math.min(prior.y0,rule.y0); prior.y1=Math.max(prior.y1,rule.y1); }
    else merged.push({...rule});
  }
  return merged;
}

function ruledTable(headers: Header[], rules: TableRule[], limit: number): PriceTable | undefined {
  const top = Math.min(...headers.map(h=>h.bbox.y0));
  const bottom = Math.max(...headers.map(h=>h.bbox.y1));
  const vertical = rules.filter(r => r.y0 <= top+2 && r.y1 >= bottom+height(headers[0]));
  const boundaries: TableRule[] = [];
  const first = headers[0], last = headers.at(-1)!;
  const left = vertical.filter(r=>r.x0 < first.bbox.x0).at(-1);
  const right = vertical.find(r=>r.x0 > last.bbox.x1);
  if (!left || !right) return;
  boundaries.push(left);
  for (let i=1;i<headers.length;i++) {
    const between = vertical.filter(r => r.x0 > headers[i-1].bbox.x1 && r.x0 < headers[i].bbox.x0);
    // Multiple unlabelled columns make the interpretation ambiguous.
    if (between.length !== 1) return;
    boundaries.push(between[0]);
  }
  boundaries.push(right);
  return { bounds: {x0:left.x0,x1:right.x0,y0:bottom+1,y1:Math.min(limit,...boundaries.map(r=>r.y1))},
    columns: headers.map((h,i)=>({role:h.role,left:boundaries[i].x0,right:boundaries[i+1].x0})), evidence:"rules" };
}

function quantityRow(row: Word[], columns: PriceTable["columns"]) {
  const unit = columns.find(c=>c.role==="unit"), quantity = columns.find(c=>c.role==="quantity");
  if (!unit || !quantity) return false;
  const unitWords = row.filter(w=>inside(w,unit.left,unit.right));
  const unitText = unitWords.map(w=>w.text).join("").replace(/[.\s]/g,"");
  // Combined OCR boxes are not split into guessed character positions.
  return /^(?:RS|stk|st|pcs?|m|lm|m[23²³]|kg|l|liter|sett|par|time|timer)$/i.test(unitText)
    && (row.some(w=>inside(w,quantity.left,quantity.right)) || /^RS$/i.test(unitText));
}

function alignedTable(headers: Header[], body: Word[][]): { table: PriceTable; rows: Word[][] } | undefined {
  const unit = headers.find(h=>h.role==="unit"), quantity = headers.find(h=>h.role==="quantity");
  if (!unit || !quantity) return;
  const size = height(unit);
  const columns = headers.map((h,i)=>({role:h.role,
    left: i ? (headers[i-1].bbox.x1+h.bbox.x0)/2 : h.bbox.x0-size,
    right: i+1<headers.length ? (h.bbox.x1+headers[i+1].bbox.x0)/2 : h.bbox.x1+size*4 }));
  // A description header is often centered far to the right of its body.
  const description = columns.find(c=>c.role==="description");
  if (description) description.left = columns[0].role==="post" ? headers[0].bbox.x1+size*.2 : headers[0].bbox.x0-size;
  const samples = body.filter(row => quantityRow(row,columns)
    && columns.filter(c=>financial(c.role)).some(c=>row.some(w=>inside(w,c.left,c.right)))
    && row.some(w=>w.bbox.x1 < unit.bbox.x0-size*.5));
  if (!samples.length) return;
  // Validate actual whitespace between data columns, rather than trusting
  // header centers. At least one explicit unit + amount + description row is
  // required; a heading by itself can never authorize filtering.
  const observed=columns.map(c=>samples.flatMap(row=>row.filter(w=>
    (w.bbox.x0+w.bbox.x1)/2>=c.left && (w.bbox.x0+w.bbox.x1)/2<c.right)));
  for (let i=1;i<columns.length;i++) {
    if (columns[i].role==="description") continue;
    const leftWords=observed[i-1];
    const rightWords=observed[i];
    // OCR header boxes can overlap slightly due to padding. In that case the
    // independent data-cell gutter must prove the boundary instead.
    const padded=headers[i-1].bbox.x1>headers[i].bbox.x0 && leftWords.length && rightWords.length;
    const leftEdge=Math.max(...leftWords.map(w=>w.bbox.x1),...(padded?[]:[headers[i-1].bbox.x1]));
    const rightEdge=Math.min(...rightWords.map(w=>w.bbox.x0),...(padded?[]:[headers[i].bbox.x0]));
    if (rightEdge-leftEdge < size*.3) return;
    columns[i-1].right=columns[i].left=(leftEdge+rightEdge)/2;
  }
  const right = Math.max(headers.at(-1)!.bbox.x1,...samples.flatMap(row=>row.map(w=>w.bbox.x1)))+size*.5;
  columns.at(-1)!.right=right;
  return {table:{bounds:{x0:columns[0].left,x1:right,y0:Math.max(...headers.map(h=>h.bbox.y1))+1,
    y1:Math.max(...samples.flatMap(row=>row.map(w=>w.bbox.y1)))+size*.5},columns,evidence:"aligned-rows"},rows:samples};
}

export function separatePriceColumns(input: readonly PositionedWord[], rules: readonly TableRule[] = [], previous: readonly PriceTable[] = []) {
  const words: Word[] = input.map((w,id)=>({...w,id}));
  const rows = rowsOf(words);
  const vertical=mergedVerticalRules(rules);
  const audit: PriceColumnAudit = {version:PRICE_COLUMN_VERSION,status:"not-detected",tables:[],excludedCells:[],issues:[]};
  const excluded=new Set<number>();
  const candidates=rows.map((row,index)=>({headers:headersOf(row),index})).filter(c=>c.headers.some(h=>financial(h.role))
    && c.headers.some(h=>h.role==="description" || h.role==="quantity" || h.role==="unit" || h.role==="post"));
  const issue=(message:string)=>{if(!audit.issues.includes(message)) audit.issues.push(message);};
  function apply(table:PriceTable, eligibleRows:Word[][]) {
    const tableIndex=audit.tables.push(table)-1;
    for (const row of eligibleRows) {
      if (centerY(row[0])<table.bounds.y0 || centerY(row[0])>table.bounds.y1) continue;
      // Whole-row totals are already handled downstream; do not damage their
      // boundary labels by slicing a word from "Sum denne side".
      const rowText=row.map(w=>w.text).join(" ");
      if (/^(?:Sum (?:denne side|denna sida|Kapittel)|Akkumulert)/i.test(rowText)) continue;
      for (const word of row) {
        for (const column of table.columns.filter(c=>financial(c.role))) {
          const overlaps=word.bbox.x1>column.left+1 && word.bbox.x0<column.right-1;
          if (!overlaps) continue;
          if (!inside(word,column.left,column.right)) { issue("cell-crosses-column-boundary"); continue; }
          if (excluded.has(word.id)) continue;
          excluded.add(word.id);
          audit.excludedCells.push({text:word.text,bbox:word.bbox,column:column.role as "price"|"sum",table:tableIndex});
        }
      }
    }
  }
  for (let n=0;n<candidates.length;n++) {
    const candidate=candidates[n];
    const headers=candidate.headers;
    const roles=headers.map(h=>h.role);
    const hasDescription=roles.includes("description");
    const unknownHeader=rows[candidate.index].some(w=>w.bbox.x0>=headers[0].bbox.x0 && w.bbox.x1<=headers.at(-1)!.bbox.x1
      && !/^[|¦]+$/.test(w.text) && !headers.some(h=>inside(w,h.bbox.x0,h.bbox.x1)));
    const ordered=headers.every((h,i)=>!i || h.bbox.x0>headers[i-1].bbox.x1-Math.min(height(h),height(headers[i-1]))*.2)
      && roles.lastIndexOf("description")<roles.findIndex(financial)
      && new Set(roles).size===roles.length;
    if (unknownHeader || !hasDescription || !ordered || (!roles.includes("post") && !(roles.includes("quantity") && roles.includes("unit")))) {
      issue("unverified-financial-header"); continue;
    }
    const limit=candidates[n+1] ? rows[candidates[n+1].index][0].bbox.y0 : Infinity;
    const body=rows.slice(candidate.index+1,candidates[n+1]?.index).filter(row=>centerY(row[0])<limit);
    const ruled=ruledTable(headers,vertical,limit);
    if (ruled) { apply(ruled,body); continue; }
    if (vertical.filter(r=>r.y0<=Math.min(...headers.map(h=>h.bbox.y0))+2
      && r.y1>=Math.max(...headers.map(h=>h.bbox.y1))+height(headers[0])
      && r.x0>headers[0].bbox.x1 && r.x0<headers.at(-1)!.bbox.x0).length>=2) {
      issue("unlabelled-or-incomplete-grid"); continue;
    }
    const aligned=alignedTable(headers,body);
    if (!aligned) { issue("unverified-table-boundaries"); continue; }
    // Without drawn borders only structurally verified rows are safe. Keep
    // prose and other cells on continuation lines instead of cropping a strip.
    apply(aligned.table,aligned.rows);
    const chosen=new Set(aligned.rows.flat());
    if (body.some(row=>row.some(w=>!chosen.has(w) && aligned.table.columns.some(c=>financial(c.role)
      && w.bbox.x1>c.left && w.bbox.x0<c.right)) && !/^(?:Sum|Akkumulert)\b/i.test(row.map(w=>w.text).join(" ")))) issue("unverified-cells-outside-data-rows");
  }
  // Reuse only adjacent-page column identities when this page independently
  // contains the same physical grid and actual data rows. Never inherit a
  // right-side cutoff onto an unrelated or borderless page.
  if (!candidates.length) for (const prior of previous.filter(t=>t.evidence!=="aligned-rows")) {
    const edges=[...prior.columns.map(c=>c.left),prior.columns.at(-1)!.right];
    const matched=edges.map(x=>vertical.filter(r=>Math.abs(r.x0-x)<2).sort((a,b)=>(b.y1-b.y0)-(a.y1-a.y0))[0]);
    if (matched.some(r=>!r)) continue;
    const top=Math.max(...matched.map(r=>r.y0)), bottom=Math.min(...matched.map(r=>r.y1));
    const body=rows.filter(row=>centerY(row[0])>top && centerY(row[0])<bottom);
    if (bottom-top<30 || !body.some(row=>quantityRow(row,prior.columns))) continue;
    apply({...prior,bounds:{...prior.bounds,y0:top,y1:bottom},evidence:"continued-rules"},body);
  }
  if (!candidates.length && !audit.tables.length) {
    const tableRows=rows.filter(row=>row.some((w,index)=>{
      if (!/^(?:stk|st|m|lm|m[23²³]|kg|l|RS)\.?$/i.test(w.text) || index===0) return false;
      const following=row.slice(index+1);
      return following.length>=3 && following.every((cell,i)=>cell.bbox.x0-(i?following[i-1]:w).bbox.x1>height(w)*.7);
    }));
    if (tableRows.length>=2) issue("table-without-verifiable-headers");
  }
  audit.status=audit.issues.length ? "review" : audit.tables.length ? "separated" : "not-detected";
  return { kept:words.filter(w=>!excluded.has(w.id)).map(w=>w.id), audit };
}

export function priceColumnsFromPdfItems(input: readonly unknown[], rules: readonly TableRule[] = [], previous: readonly PriceTable[] = []) {
  const mapped: Array<{index:number;word:PositionedWord}> = [];
  input.forEach((value,index)=>{
    const item=value as {str?:unknown;transform?:unknown;width?:unknown;height?:unknown}|null;
    if (!item || typeof item.str!=="string" || !item.str.trim() || !Array.isArray(item.transform)) return;
    const [a,b,c,d,x,y]=item.transform.map(Number), width=Number(item.width), h=Math.abs(Number(item.height)||d||a);
    if (![a,b,c,d,x,y,width,h].every(Number.isFinite) || Math.abs(b)>.1 || Math.abs(c)>.1 || width<0) return;
    mapped.push({index,word:{text:item.str.trim(),bbox:{x0:x,x1:x+width,y0:-y-h,y1:-y}}});
  });
  const separated=separatePriceColumns(mapped.map(m=>m.word),rules,previous);
  if (separated.audit.status==="not-detected" && unpositionedPriceColumns(input.map(value=>String((value as {str?:unknown})?.str??"")).join("\n")).status==="review") {
    separated.audit.status="review";
    separated.audit.issues.push("unresolved-header-positions");
  }
  const kept=new Set(separated.kept);
  const removed=new Set(mapped.flatMap((m,i)=>kept.has(i)?[]:[m.index]));
  return {items:input.filter((_,i)=>!removed.has(i)),audit:separated.audit};
}

export function positionedWordsFromOcrBlocks(blocks: readonly unknown[] | null | undefined): PositionedWord[] {
  return (blocks??[]).flatMap(block=>{
    const b=block as {paragraphs?:Array<{lines?:Array<{words?:PositionedWord[]}>}>}|null;
    return (b?.paragraphs??[]).flatMap(p=>(p.lines??[]).flatMap(l=>l.words??[]));
  }).filter(w=>typeof w.text==="string" && w.text.trim() && w.bbox
    && [w.bbox.x0,w.bbox.y0,w.bbox.x1,w.bbox.y1].every(Number.isFinite)
    && w.bbox.x1>=w.bbox.x0 && w.bbox.y1>=w.bbox.y0)
    .map(w=>({text:w.text,bbox:{...w.bbox}}));
}

export function ocrBlocksFromWords(words: readonly PositionedWord[]) {
  return [{paragraphs:[{lines:[{words}]}]}];
}

/** Text-only legacy OCR is retained, with an explicit review signal. */
export function unpositionedPriceColumns(text:string):PriceColumnAudit {
  const lines=text.split(/\r?\n/);
  const financialLabel=/(?:^|\s)(?:Pris|Enhetspris|À-pris|Sum|Summa|Beløp)(?:[.:]|\s|$)/i;
  const context=(value:string)=>[/Postnr/i,/Beskrivelse|Beskrivning|Spesifikasjon/i,/Mengde|Mängd|Antall/i,/Enhet|Enh\./i].filter(r=>r.test(value)).length;
  const suspicious=lines.some(line=>financialLabel.test(line) && context(line)>=2)
    || (context(text)>=3 && lines.some(line=>/^(?:Pris|Enhetspris|À-pris|Sum|Summa|Beløp)[.:]?$/i.test(line.trim())));
  return {version:PRICE_COLUMN_VERSION,status:suspicious?"review":"not-detected",tables:[],excludedCells:[],
    issues:suspicious?["missing-word-positions"]:[]};
}
