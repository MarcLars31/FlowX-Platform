"use client";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";

type Entry = { users: number; task?: PDFDocumentLoadingTask; promise: Promise<PDFDocumentProxy>; timer?: ReturnType<typeof setTimeout> };
const documents = new Map<string,Entry>();

/** Reuse the private PDF while navigating posts. Release idle documents after
 * 30 seconds; data is kept only in this tab's memory, never browser storage. */
export function acquireOriginalPdf(href: string) {
  const url = new URL(href,window.location.href);url.hash="";
  if (url.origin !== window.location.origin) throw new Error("PDF-källan måste tillhöra projektet.");
  const key=url.href;
  let entry=documents.get(key);
  if (!entry) {
    const created: Entry = { users:0, promise:Promise.resolve(null as unknown as PDFDocumentProxy) };
    created.promise=(async()=>{
      const pdfjs=await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc=new URL("/ocr/pdf.worker.min.mjs",window.location.origin).href;
      created.task=pdfjs.getDocument({url:key,withCredentials:true,isEvalSupported:false,
        cMapUrl:"/pdf-assets/cmaps/",cMapPacked:true,standardFontDataUrl:"/pdf-assets/standard_fonts/",wasmUrl:"/pdf-assets/wasm/"});
      return created.task.promise;
    })().catch(async error=>{
      if(documents.get(key)===created)documents.delete(key);
      await created.task?.destroy();throw error;
    });
    entry=created;documents.set(key,entry);
  }
  clearTimeout(entry.timer);entry.users++;
  const held=entry;let released=false;
  return {promise:entry.promise,release(){
    if(released)return;released=true;held.users--;
    if(held.users===0)held.timer=setTimeout(()=>{
      if(held.users || documents.get(key)!==held)return;
      documents.delete(key);void held.promise.then(pdf=>pdf.destroy()).catch(()=>{});
    },30_000);
  }};
}
