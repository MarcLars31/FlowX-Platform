import type { openPdfTextDocument } from "@/lib/pdf-runtime";
import type { TableRule } from "./pdf-price-columns";

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof openPdfTextDocument>>["getPage"]>>;
type Matrix = number[];
const identity = [1,0,0,1,0,0];
const isMatrix=(value:unknown):value is Matrix=>Array.isArray(value) && value.length===6 && value.every(Number.isFinite);

/** Read drawn cell boundaries from PDF.js's cached display list. This neither
 * rasterizes the PDF nor applies document-wide column positions. */
export async function readPdfTableRules(page: PdfPage): Promise<TableRule[]> {
  const {OPS,Util,AnnotationMode}=await import("unpdf").then(m=>m.getResolvedPDFJS());
  const ops=await page.getOperatorList({annotationMode:AnnotationMode.DISABLE});
  const result:TableRule[]=[];
  let matrix:Matrix=[...identity];
  const stack:Matrix[]=[];
  const point=(x:number,y:number):[number,number]=>[matrix[0]*x+matrix[2]*y+matrix[4],-(matrix[1]*x+matrix[3]*y+matrix[5])];
  function line(from:[number,number],to:[number,number]) {
    const [x0,y0]=point(...from),[x1,y1]=point(...to);
    if (![x0,y0,x1,y1].every(Number.isFinite)) return;
    if ((Math.abs(x1-x0)<1.5 && Math.abs(y1-y0)>8) || (Math.abs(y1-y0)<1.5 && Math.abs(x1-x0)>8))
      result.push({x0:Math.min(x0,x1),x1:Math.max(x0,x1),y0:Math.min(y0,y1),y1:Math.max(y0,y1)});
  }
  for (let i=0;i<ops.fnArray.length;i++) {
    const op=ops.fnArray[i],args=ops.argsArray[i];
    if (op===OPS.save || op===OPS.paintFormXObjectBegin || op===OPS.beginGroup) {
      stack.push([...matrix]);
      const transform=op===OPS.paintFormXObjectBegin ? args?.[0] : op===OPS.beginGroup ? args?.[0]?.matrix : undefined;
      if (isMatrix(transform)) matrix=Util.transform(matrix,transform);
    } else if (op===OPS.restore || op===OPS.paintFormXObjectEnd || op===OPS.endGroup) matrix=stack.pop()??[...identity];
    else if (op===OPS.transform && isMatrix(args)) matrix=Util.transform(matrix,args);
    else if (op===OPS.constructPath) {
      const paint=args?.[0],bounds=args?.[2];
      // Clipping paths and glyph contours are not table rules.
      if ([OPS.fill,OPS.eoFill].includes(paint) && bounds?.length===4) {
        const [x0,y0]=point(bounds[0],bounds[1]),[x1,y1]=point(bounds[2],bounds[3]);
        if (Math.abs(x1-x0)<=2 && Math.abs(y1-y0)>8) result.push({x0:Math.min(x0,x1),x1:Math.max(x0,x1),y0:Math.min(y0,y1),y1:Math.max(y0,y1)});
        continue;
      }
      if (![OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(paint)) continue;
      const path=args?.[1]?.[0];
      if (!Array.isArray(path) && !ArrayBuffer.isView(path)) continue;
      const values=Array.from(path as ArrayLike<number>);
      let current:[number,number]|undefined,first:[number,number]|undefined;
      // unpdf's pinned PDF.js DrawOPS: move=0, line=1, cubic=2,
      // quadratic=3, close=4. Unsupported/curved segments add no rules.
      for (let j=0;j<values.length;) {
        const command=values[j++];
        if (command===0 || command===1) {
          const next:[number,number]=[values[j++],values[j++]];
          if (command===1 && current) line(current,next);
          if (command===0) first=next;
          current=next;
        } else if (command===4) { if(current && first) line(current,first); current=first; }
        else if (command===2) { j+=6; current=undefined; }
        else if (command===3) { j+=4; current=undefined; }
        else break;
      }
    }
  }
  return result;
}
