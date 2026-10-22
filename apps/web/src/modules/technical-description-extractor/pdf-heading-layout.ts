import { POST_HEADING_VERSION, type HeadingLayout, type HeadingLine } from "./post-heading";
import type { PositionedWord, PriceTable } from "./pdf-price-columns";
import { pdfPostColumnBounds } from "./post-inventory";

type Fragment = HeadingLine;
function collect(input: Fragment[], tables: readonly PriceTable[]): HeadingLayout {
  const fragments=input.filter(item=>!tables.some(table=>item.y>=table.bounds.y0 && item.y+item.height<=table.bounds.y1
    && table.columns.some(column=>["unit","quantity","price","sum"].includes(column.role)
      && item.x>=column.left && item.x+item.width<=column.right)));
  const rows: Fragment[][]=[];
  for(const item of fragments.sort((a,b)=>a.y-b.y || a.x-b.x)) {
    const row=rows.find(row=>Math.abs(row[0].y-item.y)<Math.min(row[0].height,item.height)*.4);
    if(row) row.push(item); else rows.push([item]);
  }
  return {version:POST_HEADING_VERSION,lines:rows.map(row=>{
    row.sort((a,b)=>a.x-b.x);
    // Use the longest text fragment's font; a left-column post number may
    // use a different face from the heading in the description column.
    const dominant=[...row].sort((a,b)=>b.text.length-a.text.length)[0];
    return {text:row.map(item=>item.text).join(" "),x:dominant.x,y:row[0].y,
      width:Math.max(...row.map(item=>item.x+item.width))-row[0].x,height:dominant.height,font:dominant.font};
  })};
}

export function pdfHeadingLayout(items: readonly unknown[], tables: readonly PriceTable[]=[]): HeadingLayout {
  return collect(items.flatMap(value=>{
    if(!value || typeof value!=="object") return [];
    const item=value as {str?:string;transform?:number[];height?:number;width?:number;fontName?:string};
    if(!item.str?.trim() || !item.transform || item.transform.length<6) return [];
    const height=item.height || Math.hypot(item.transform[2],item.transform[3]);
    return [{text:item.str.trim(),x:item.transform[4],y:-item.transform[5],width:item.width??0,height,font:item.fontName?.replace(/^g_d\d+_/,"")}];
  }),tables);
}
export function ocrHeadingLayout(words: readonly PositionedWord[], tables: readonly PriceTable[]=[]): HeadingLayout {
  return collect(words.map(word=>({text:word.text,x:word.bbox.x0,y:word.bbox.y0,
    width:word.bbox.x1-word.bbox.x0,height:word.bbox.y1-word.bbox.y0})),tables);
}

export function pdfPostHeadingSources(items: readonly unknown[], tables: readonly PriceTable[]) {
  const bounds=pdfPostColumnBounds(items);
  if(!bounds) return undefined;
  return bounds.posts.flatMap(post=>{
    const table=tables.find(table=>-post.top>=table.bounds.y0-20 && -post.top<=table.bounds.y1);
    const column=table?.columns.find(column=>column.role==="description");
    if(!table || !column) return [];
    let overlaps=false;
    const selected=items.filter(raw=>{
      const item=raw as {str?:string;transform?:number[];width?:number};
      if(!item?.str?.trim() || !item.transform) return false;
      const [x,y]=item.transform.slice(4);
      if(y<=post.top && y>post.bottom && -y>=table.bounds.y0 && -y<=table.bounds.y1
        && x<column.right && x+(item.width??0)>column.left && (x<column.left || x+(item.width??0)>column.right)) overlaps=true;
      return y<=post.top && y>post.bottom && -y>=table.bounds.y0 && -y<=table.bounds.y1
        && x>=column.left && x+(item.width??0)<=column.right;
    });
    if(overlaps || !selected.length) return [];
    const layout=pdfHeadingLayout(selected);
    return [{postNumber:post.postNumber,text:layout.lines.map(line=>line.text).join("\n"),layout}];
  });
}
