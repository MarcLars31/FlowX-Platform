import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractTechnicalDescriptionPages } from "./pdf";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { priceColumnsFromPdfItems, separatePriceColumns, type PositionedWord, type TableRule } from "./pdf-price-columns";
import { separateOcrPriceText } from "./pdf-ocr-columns";
import { mergeClientOcrPages, parseClientOcrPages, ClientOcrPayloadError } from "@/lib/technical-description-ocr-payload";
import { layoutTextFromOcrBlocks } from "./pdf-layout";
import { sitePostTableFromPdfItems } from "./pdf-post-table";
import { pdfPostMeasurementCells } from "./pdf-post-measurements";
import { extractTechnicalSpecificationFromPages } from "../pdf-extractor/extractor";

const word=(text:string,x:number,y:number,width=text.length*4):PositionedWord=>({text,bbox:{x0:x,x1:x+width,y0:y,y1:y+10}});
const headers=(y=40,offset=0,price="Pris",sum="Sum")=>[
  word("Postnr",40+offset,y),word("Beskrivelse",120+offset,y),word("Enh.",350+offset,y,20),
  word("Mengde",390+offset,y,30),word(price,450+offset,y,40),word(sum,520+offset,y,35)];
const grid=(top=35,bottom=230,offset=0):TableRule[]=>[30,95,340,380,435,510,580]
  .map(x=>({x0:x+offset,x1:x+offset,y0:top,y1:bottom}));
const row=(y=70,price="00,00",sum="13 750,25",offset=0)=>[
  word("22.25.2",40+offset,y),word("HALVHARDT BELEGG",110+offset,y),word("m2",350+offset,y),
  word("2300,00",390+offset,y,35),word(price,450+offset,y,45),word(sum,520+offset,y,55)];
const kept=(words:PositionedWord[],ids:number[])=>ids.map(i=>words[i].text).join("\n");

test("uses verified cell positions for all values, preserving mixed-row requirements and technical numbers",()=>{
  for (const price of ["00,00","0,00","000","999,95","-125,50","1 200 000","NOK 75","inkludert"]) {
    const input=[...headers(),...row(70,price),word("100,00 m",110,100),word("0,5 bar",110,120),word("68 °C",110,140),word("0,00",110,160)];
    const result=separatePriceColumns(input,grid());
    assert.equal(result.audit.status,"separated");
    assert.deepEqual(result.audit.excludedCells.map(c=>c.text),[price,"13 750,25"]);
    const text=kept(input,result.kept);
    for (const value of ["22.25.2","HALVHARDT BELEGG","2300,00","m2","100,00 m","0,5 bar","68 °C","0,00"]) assert.ok(text.includes(value),value);
  }
});

test("recognizes all requested financial headers and adjacent fragments",()=>{
  for (const price of ["Pris","Enhetspris","À-pris"]) for (const sum of ["Sum","Summa","Beløp"]) {
    const input=[...headers(40,0,price,sum),...row()];
    assert.equal(separatePriceColumns(input,grid()).audit.excludedCells.length,2,price+sum);
  }
  const input=[...headers().filter(w=>w.text!=="Pris"),word("À-",450,40,8),word("pris",458,40,16),...row()];
  assert.equal(separatePriceColumns(input,grid()).audit.excludedCells.length,2);
});

test("header words alone never authorize stripping prices or ordinary right-side prose",()=>{
  const input=[...headers(),word("Krav 68 °C og 0,5 bar",455,90,120),word("00,00",520,120)];
  const result=separatePriceColumns(input);
  assert.deepEqual(result.kept,input.map((_,i)=>i));
  assert.equal(result.audit.status,"review");
  const prose=[word("Pris",450,40),word("100,00 m",450,60),word("68 °C",450,80)];
  assert.deepEqual(separatePriceColumns(prose).kept,[0,1,2]);
});

test("unknown or blank intervening columns cannot be swallowed by a neighbouring Sum column",()=>{
  for(const unknown of [word("Kontroll",450,40,40),null]) {
    const input=[...headers().filter(w=>w.text!=="Pris"),...(unknown?[unknown]:[]),...row(70,"0,5 bar")];
    const result=separatePriceColumns(input,grid());
    assert.equal(result.audit.status,"review");
    assert.deepEqual(result.kept,input.map((_,i)=>i));
  }
});

test("aligned OCR cells require a real unit/amount row and retain unverifiable continuation prose",()=>{
  const input=[...headers(),...row(),word("Krav: 68 °C",450,110,100)];
  const result=separatePriceColumns(input);
  assert.equal(result.audit.excludedCells.length,2);
  assert.equal(result.audit.status,"review");
  assert.ok(kept(input,result.kept).includes("Krav: 68 °C"));
});

test("blank amount cells do not absorb prices; zero quantities and raised square units remain",()=>{
  for (const amount of ["", "0", "100,00"]) {
    const input=[...headers(),...row().filter(w=>w.text!=="2300,00" && w.text!=="m2"),
      word("m",350,70,5),{text:"2",bbox:{x0:356,x1:360,y0:68,y1:75}},...(amount?[word(amount,390,70,35)]:[])];
    const result=separatePriceColumns(input,grid());
    assert.equal(result.audit.excludedCells.length,2);
    assert.deepEqual(result.kept.map(i=>input[i]).filter(w=>w.bbox.x0===390 && w.bbox.y0===70).map(w=>w.text),amount?[amount]:[]);
    assert.ok(kept(input,result.kept).includes("m\n2"));
  }
});

test("bounds are local to each table and stop before full-width text",()=>{
  const input=[...headers(),...row(),word("100,00 m",450,250),word("0,5 bar",520,270),
    ...headers(300,60),...row(330,"888,88","999,99",60),word("68 °C",520,500)];
  const result=separatePriceColumns(input,[...grid(),...grid(295,450,60)]);
  assert.equal(result.audit.tables.length,2);
  assert.equal(result.audit.excludedCells.length,4);
  for(const value of ["100,00 m","0,5 bar","68 °C"]) assert.ok(kept(input,result.kept).includes(value));
});

test("headerless continuation requires the same physical grid; unrelated next pages retain text",()=>{
  const prior=separatePriceColumns([...headers(),...row()],grid()).audit.tables;
  const input=row(60);
  const continued=separatePriceColumns(input,grid(20,200),prior);
  assert.equal(continued.audit.tables[0]?.evidence,"continued-rules");
  assert.equal(continued.audit.excludedCells.length,2);
  const prose=[word("100,00 m",450,60),word("68 °C",520,90)];
  assert.deepEqual(separatePriceColumns(prose,[],prior).kept,[0,1]);
  assert.deepEqual(separatePriceColumns(input,grid(20,200,30),prior).kept,input.map((_,i)=>i));
});

test("merged OCR boxes and ambiguous boundaries remain whole and require review",()=>{
  const input=[...headers(),...row().filter(w=>w.text!=="2300,00" && w.text!=="00,00"),word("2300,00 00,00",390,70,105)];
  const result=separatePriceColumns(input,grid());
  assert.ok(kept(input,result.kept).includes("2300,00 00,00"));
  assert.equal(result.audit.status,"review");
  assert.ok(result.audit.issues.includes("cell-crosses-column-boundary"));
});

test("small padded header overlap requires independent data gutters; missing OCR headings are flagged",()=>{
  const input=[...headers().map(w=>w.text==="Enh."?{...w,bbox:{...w.bbox,x1:391}}:w),...row()];
  const separated=separatePriceColumns(input);
  assert.equal(separated.audit.excludedCells.length,2);
  const missing=[...row(70),...row(100)];
  const keptResult=separatePriceColumns(missing);
  assert.equal(keptResult.audit.status,"review");
  assert.deepEqual(keptResult.kept,missing.map((_,i)=>i));
});

test("digital separation keeps original text items and their stream order",()=>{
  const words=[...headers(),...row()];
  const items=words.map(w=>({str:w.text,width:w.bbox.x1-w.bbox.x0,height:10,
    transform:[10,0,0,10,w.bbox.x0,-w.bbox.y1],hasEOL:true}));
  const result=priceColumnsFromPdfItems(items,grid());
  assert.equal(result.audit.excludedCells.length,2);
  assert.equal(result.items[0],items[0]);
  assert.ok(result.items.includes(items[9]));
});

test("a verified Beløp-only table retains quantities and unrelated text outside its bounds",()=>{
  const words=[word("Sted: 22 Bygg",40,15),...headers().filter(w=>w.text!=="Pris").map(w=>w.text==="Postnr"?{...w,text:"Postnr:"}:w.text==="Sum"?{...w,text:"Beløp"}:w),
    ...row().filter(w=>w.text!=="00,00"),word("68 °C",600,70)];
  const items=words.map(w=>({str:w.text,width:w.bbox.x1-w.bbox.x0,height:10,transform:[10,0,0,10,w.bbox.x0,800-w.bbox.y1]}));
  const separated=priceColumnsFromPdfItems(items,grid().filter(r=>r.x0!==510).map(r=>({...r,y0:r.y0-800,y1:r.y1-800})));
  assert.equal(separated.audit.excludedCells.length,1);
  const table=sitePostTableFromPdfItems(separated.items,true,separated.audit.tables)!;
  assert.equal(table.posts[0].quantity?.quantity,2300);
  assert.equal(table.posts[0].quantity?.unit,"m2");
  assert.match(table.text,/68 °C/);
  assert.equal(pdfPostMeasurementCells(items,separated.audit.tables)?.find(c=>c.postNumber==="22.25.2")?.quantity,"2300,00");
});

test("OCR payload validates coordinates, separates cells on the server and preserves audit evidence",()=>{
  const words=[...headers(),...row(),word("Tekniske krav: 100,00 m, 0,5 bar, 68 °C",110,110,200)];
  const text=layoutTextFromOcrBlocks([{paragraphs:[{lines:[{words}]}]}]);
  const payload=parseClientOcrPages(JSON.stringify([{pageNumber:1,text,confidence:.95,words}]),1)!;
  const [page]=mergeClientOcrPages([{pageNumber:1,text:"",method:"text",confidence:0}],payload);
  assert.doesNotMatch(page.text,/00,00\t13 750,25/);
  assert.equal(page.priceColumns?.excludedCells.length,2);
  assert.match(page.text,/2300,00/);
  assert.match(page.text,/68 °C/);
  assert.throws(()=>parseClientOcrPages(JSON.stringify([{pageNumber:1,text,confidence:.95,words:[{text:"x",bbox:{x0:-1,y0:0,x1:1,y1:10}}]}]),1),ClientOcrPayloadError);
});

test("legacy OCR and incomplete coordinates preserve text and mark requirements for review",()=>{
  const text="Postnr Beskrivelse Enh. Mengde Pris Sum\n22.25.2 TH2.121\nHALVHARDT BELEGG PÅ GULV\nAreal m2 2300,00 00,00 99,99\nMateriale: Vinyl på rull";
  const [page]=mergeClientOcrPages([{pageNumber:1,text:"",method:"text",confidence:0}],[{pageNumber:1,text,confidence:.95}]);
  assert.equal(separateOcrPriceText(text).text,text);
  assert.match(page.text,/2300,00 00,00 99,99/);
  assert.equal(page.priceColumns?.status,"review");
  const result=extractTechnicalDescriptionFromPages([page]);
  assert.ok(result.warnings.some(w=>w.code==="PDF_PRICE_COLUMNS_UNVERIFIED"));
  assert.ok(result.materialLines.some(r=>r.reviewFlags.includes("unverified-price-columns")));
  const generic=extractTechnicalSpecificationFromPages([{pageNumber:1,text,priceColumns:page.priceColumns}]);
  assert.ok(generic.warnings.some(w=>w.code==="PDF_PRICE_COLUMNS_UNVERIFIED"));
  const words=[...headers(),...row()];
  const extra=words.map(w=>w.text).join(" ")+" Unpositioned requirement Ω";
  const uncertain=separateOcrPriceText(extra,words);
  assert.equal(uncertain.text,extra);
  assert.equal(uncertain.priceColumns.status,"review");
  assert.equal(uncertain.priceColumns.excludedCells.length,0);
});

test("a hybrid page retains the digital audit and flags uncertain text supplemented after OCR",()=>{
  const words=[...headers(),...row(),word("Materiale: Vinyl på rull",110,110,180)];
  const text=layoutTextFromOcrBlocks([{paragraphs:[{lines:[{words}]}]}]);
  const original="22.25.2 TH2.121\nHALVHARDT BELEGG\nKrav: Eget digitalt tillegg 100,00 m\nAreal m2 2300,00 00,00 13 750,25";
  const digitalAudit={version:1 as const,status:"review" as const,tables:[],excludedCells:[],issues:["unverified-table-boundaries"]};
  const [page]=mergeClientOcrPages([{pageNumber:1,text:original,method:"text",confidence:.55,ocrReason:"image-body",priceColumns:digitalAudit}],
    [{pageNumber:1,text,words,confidence:.95}]);
  assert.match(page.text,/Eget digitalt tillegg 100,00 m/);
  assert.equal(page.sourceTextMerge,true);
  assert.equal(page.priceColumns?.status,"review");
  assert.ok(page.priceColumns?.issues.includes("digital:unverified-table-boundaries"));
  assert.deepEqual(page.priceColumnReadings?.digital,digitalAudit);
  assert.equal(page.priceColumnReadings?.ocr.excludedCells.length,2);
});

test("real PDF drawing operators separate price cells before either post or chapter extraction",async()=>{
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  for (let n=0;n<3;n++) {
    const page=pdf.addPage([650,800]);
    const items=n===2 ? [word("Kravtext som använder hela sidans bredd",40,40),word("100,00 m",450,80),word("0,5 bar",450,100),word("68 °C",520,120)]
      : [...headers(),...(n===0?row(70,"75,25","173075,00"):[word("Fortsettelse av beskrivelsen",110,70),word("m",350,90),word("100,00",390,90),word("88,50",450,90),word("8850,00",520,90)]),
        word("Materiale: Vinyl på rull",110,120),word("Trykk: 0,5 bar",110,140),word("Temperatur: 68 °C",110,160)];
    for(const w of items)page.drawText(w.text,{font,size:10,x:w.bbox.x0,y:800-w.bbox.y1});
    if(n<2)for(const r of grid())page.drawLine({start:{x:r.x0,y:800-r.y0},end:{x:r.x1,y:800-r.y1},thickness:.5});
  }
  const pages=await extractTechnicalDescriptionPages(await pdf.save());
  assert.deepEqual(pages.map(p=>p.priceColumns?.excludedCells.length),[2,2,0]);
  assert.doesNotMatch(pages.map(p=>p.text).join("\n"),/75,25|173075,00|88,50|8850,00/);
  for (const value of ["22.25.2","2300,00","100,00 m","0,5 bar","68 °C"]) assert.ok(pages.some(p=>p.text.includes(value)),value);
  const result=extractTechnicalDescriptionFromPages(pages);
  assert.ok(result.materialLines.some(r=>r.postNumber==="22.25.2"));
  assert.doesNotMatch(JSON.stringify({rows:result.materialLines,structure:result.structure}),/173075,00|8850,00/);
});
