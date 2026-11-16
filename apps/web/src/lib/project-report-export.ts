import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { reportTables, reportTimestamp, type ProjectReport } from './project-reports';

export const reportNotes = (report: ProjectReport) => [
  report.scope,
  `Filtre: ${report.selectedFilters.join(' · ') || 'Ingen – alle tilgjengelige poster'}`,
  `${report.rows.length} av ${report.visibleTotal} tilgjengelige poster i utvalget. Granskning ${report.reviewRequired ? 'på' : 'av'}. Gransker: ${report.reviewer}.`,
  report.filters.kind==='reviews' ? 'Historikk viser hendelser; et tidligere godkjenningsvedtak kan være tilbakekalt. Ansvar og avdeling viser dagens fordeling.' : 'Status og fordeling gjelder uttakstidspunktet. Antall poster er ikke et mål på tidsbruk.',
  'Arbeidsgranskning og teknisk produktkontroll er separate vurderinger.'
];
export function reportFilename(report: ProjectReport, extension: 'pdf'|'xlsx') {
  const name=report.projectName.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'prosjekt';
  return `scipx-${report.filters.kind}-${name}-${report.today}.${extension}`;
}
// Split long text instead of hiding it beyond Excel's maximum row height.
function textLines(value: string, width: number) {
  const lines:string[]=[];
  for (const paragraph of value.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    for (let index=0;index<paragraph.length;index+=width) lines.push(paragraph.slice(index,index+width));
  }
  return lines;
}
export async function createProjectReportWorkbook(report: ProjectReport) {
  const workbook=new ExcelJS.Workbook();
  workbook.creator='ScipX'; workbook.title=report.title; workbook.company=report.organizationName; workbook.created=new Date(report.generatedAt);
  const summary=workbook.addWorksheet('Oversikt',{views:[{showGridLines:false}]});
  summary.columns=[{width:31},{width:100}];
  const metadata:(string|number|null)[][]=[['ScipX',report.title],['Prosjekt',report.projectName],['Organisasjon',report.organizationName],['Uttakstidspunkt (Oslo)',reportTimestamp(report.generatedAt)],
    ...reportNotes(report).map((note,index)=>[index===0?'Tilgang / utvalg':null,note]),
    ['Poster i utvalget',report.summary.total],['Ferdige',report.summary.done],['Klar til granskning',report.summary.ready],['Godkjente',report.summary.approved],['Sendt tilbake',report.summary.returned],['Over fristen',report.summary.late],['Uten person',report.summary.unassigned],['Poster med hjelpebehov',report.summary.help],
    ...(report.filters.kind==='reviews'?[['Hendelser i perioden',report.events.length]]:[])];
  for (const values of metadata) {
    const row=summary.addRow(values); row.alignment={vertical:'top',wrapText:true}; row.font={name:'Calibri',size:11,color:{argb:'FF172F35'}};
    row.height=Math.max(24,Math.ceil(String(values[1]).length/90)*16+8); row.getCell(1).font={...row.font,bold:true};
  }
  summary.getRow(1).font={name:'Calibri',size:19,bold:true,color:{argb:'FFFFFFFF'}}; summary.getRow(1).height=36;
  summary.getRow(1).eachCell(cell=>cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF115E59'}});
  for (const table of reportTables(report)) {
    const sheet=workbook.addWorksheet(table.title,{views:[{state:'frozen',ySplit:4,showGridLines:false}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4'}});
    sheet.columns=table.widths.map(width=>({width}));
    sheet.mergeCells(1,1,1,table.columns.length); sheet.getCell(1,1).value=`${report.title} · ${report.projectName}`;
    sheet.getRow(1).font={name:'Calibri',size:16,bold:true,color:{argb:'FF115E59'}}; sheet.getRow(1).height=32;
    sheet.mergeCells(2,1,2,table.columns.length); sheet.getCell(2,1).value=`${reportTimestamp(report.generatedAt)} (Oslo) · Filtre og tilgang: se Oversikt`;
    sheet.mergeCells(3,1,3,table.columns.length); sheet.getCell(3,1).value='Lange tekster fortsetter på neste rad med samme postreferanse.';
    const header=sheet.getRow(4); header.values=table.columns; header.height=32;
    header.eachCell(cell=>{cell.font={name:'Calibri',bold:true,color:{argb:'FFFFFFFF'},size:11};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF115E59'}};cell.alignment={wrapText:true,vertical:'middle'};});
    for (const [index,values] of table.rows.entries()) {
      const parts=values.map((value,col)=>typeof value==='number' ? null : textLines(value,Math.max(8,Math.floor(table.widths[col]*0.85))));
      const pages=Math.max(1,...parts.map(lines=>Math.ceil((lines?.length ?? 0)/20)));
      for (let part=0;part<pages;part++) {
        const row=sheet.addRow(values.map((value,col)=>{
          const lines=parts[col]; return lines && lines.length>20 ? lines.slice(part*20,(part+1)*20).join('\n') : value;
        }));
        row.height=Math.max(28,Math.max(...parts.map(lines=>Math.min(20,Math.max(0,(lines?.length ?? 1)-(lines && lines.length>20?part*20:0)))))*14+10);
        row.eachCell(cell=>{cell.font={name:'Calibri',size:11,color:{argb:'FF1E293B'}};cell.alignment={wrapText:true,vertical:'top'};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF1F5F9':'FFFFFFFF'}};});
      }
    }
    if (!table.rows.length) sheet.addRow(['Ingen rader passer utvalget.']);
    sheet.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,sheet.rowCount),column:table.columns.length}};
    sheet.headerFooter.oddFooter='ScipX · Side &P av &N';
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function pdfText(text: string) {
  // Helvetica supports Scandinavian Latin text. Preserve other characters as
  // explicit code points instead of silently dropping them or failing exports.
  return [...text.normalize('NFC').replace(/[–—−]/g,'-').replace(/→/g,'->').replace(/[“”]/g,'"').replace(/[‘’]/g,"'")].map(char=>
    /[\x0A\x0D\x20-\x7E\xA0-\xFF\u20AC]/.test(char)?char:`[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`).join('');
}
function wrap(text: string,font: PDFFont,size:number,width:number) {
  const lines:string[]=[];
  for (const paragraph of pdfText(text).split(/\r?\n/)) {
    let line='';
    for (const word of paragraph.split(/\s+/)) {
      const candidate=line?`${line} ${word}`:word;
      if (font.widthOfTextAtSize(candidate,size)<=width) {line=candidate;continue;}
      if (line) lines.push(line); line='';
      for (const character of word) {
        if (font.widthOfTextAtSize(line+character,size)>width && line) {lines.push(line);line='';}
        line+=character;
      }
    }
    lines.push(line);
  }
  return lines.length?lines:[''];
}
export async function createProjectReportPdf(report: ProjectReport) {
  const document=await PDFDocument.create(); const font=await document.embedFont(StandardFonts.Helvetica),bold=await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(report.title); document.setAuthor('ScipX'); document.setCreationDate(new Date(report.generatedAt));
  const width=841.89,height=595.28,margin=32,bottom=40,usable=width-margin*2,ink=rgb(.1,.18,.21),teal=rgb(.06,.36,.34);
  let page!:PDFPage; let y=0;
  function newPage() {page=document.addPage([width,height]);y=height-margin;page.drawText('ScipX',{x:margin,y:y-17,font:bold,size:17,color:teal});page.drawText(report.title,{x:105,y:y-17,font:bold,size:14,color:ink});y-=36;}
  function paragraph(text:string,size=9,color=ink) {for(const line of wrap(text,font,size,usable)){if(y<bottom+size+4)newPage();page.drawText(line,{x:margin,y:y-size,font,size,color});y-=size+5;}y-=3;}
  newPage();paragraph(report.projectName,16);paragraph(`${report.organizationName} · Uttak ${reportTimestamp(report.generatedAt)} (Europe/Oslo)`);
  for(const note of reportNotes(report))paragraph(note,9);
  paragraph(`Poster: ${report.summary.total}    Ferdige: ${report.summary.done}    Til granskning: ${report.summary.ready}    Godkjente: ${report.summary.approved}    Sendt tilbake: ${report.summary.returned}`,10);
  paragraph(`Over frist: ${report.summary.late}    Uten person: ${report.summary.unassigned}    Poster med hjelpebehov: ${report.summary.help}`,10);
  if(report.filters.kind==='reviews')paragraph(`Hendelser i perioden: ${report.events.length}`,10);
  for(const table of reportTables(report)) {
    const sum=table.widths.reduce((a,b)=>a+b,0),widths=table.widths.map(n=>n/sum*usable),size=8,lineHeight=11;
    const headings=table.columns.map((value,i)=>wrap(value,bold,size,widths[i]-10));
    const headerHeight=Math.max(...headings.map(lines=>lines.length))*lineHeight+12;
    function header() {
      page.drawText(table.title,{x:margin,y:y-13,font:bold,size:12,color:teal});y-=23;
      page.drawRectangle({x:margin,y:y-headerHeight,width:usable,height:headerHeight,color:teal});
      let x=margin;headings.forEach((lines,i)=>{lines.forEach((line,j)=>page.drawText(line,{x:x+5,y:y-9-j*lineHeight,font:bold,size,color:rgb(1,1,1)}));x+=widths[i];});y-=headerHeight;
    }
    if(y<bottom+headerHeight+80)newPage();else y-=14;header();
    if(!table.rows.length)paragraph('Ingen rader passer utvalget.');
    for(const [index,values] of table.rows.entries()) {
      const cells=values.map((v,i)=>wrap(String(v),font,size,widths[i]-10));let offset=0;const max=Math.max(...cells.map(lines=>lines.length));
      while(offset<max) {
        if(y<bottom+lineHeight+12){newPage();header();}
        const take=Math.min(max-offset,Math.floor((y-bottom-10)/lineHeight)),rowHeight=take*lineHeight+10;
        page.drawRectangle({x:margin,y:y-rowHeight,width:usable,height:rowHeight,color:index%2?rgb(.94,.96,.97):rgb(.98,.99,.99)});
        let x=margin;cells.forEach((lines,i)=>{const start=offset>=lines.length?0:offset;lines.slice(start,start+take).forEach((line,j)=>page.drawText(line,{x:x+5,y:y-10-j*lineHeight,font,size,color:ink}));x+=widths[i];});y-=rowHeight;offset+=take;
      }
    }
  }
  const pages=document.getPages();pages.forEach((item,index)=>item.drawText(`ScipX | ${report.today} | Side ${index+1} av ${pages.length}`,{x:margin,y:20,font,size:8,color:ink}));
  return document.save();
}
