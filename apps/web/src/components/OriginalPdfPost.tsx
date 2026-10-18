"use client";

import {useEffect,useRef,useState,type ReactNode} from "react";
import type {PDFDocumentProxy,RenderTask} from "pdfjs-dist";
import {acquireOriginalPdf} from "@/lib/browser-original-pdf";
import {originalPdfPostRegions} from "@/lib/pdf-post-original-regions";

export function OriginalPdfPost({href,postNumber,sourcePage,pages,fallback}:{href:string;postNumber:string|null;sourcePage:number;pages:number[];fallback:ReactNode}) {
  const [loaded,setLoaded]=useState<{href:string;pdf?:PDFDocumentProxy;failed?:boolean}>();
  const [zoom,setZoom]=useState(1);
  useEffect(()=>{
    let active=true;
    const lease=acquireOriginalPdf(href);
    void lease.promise.then(pdf=>{if(active)setLoaded({href,pdf});},()=>{if(active)setLoaded({href,failed:true});});
    return ()=>{active=false;lease.release();};
  },[href]);
  const state=loaded?.href===href?loaded:undefined;
  return <div className="original-pdf-post font-normal">
    {state?.failed ? <>
      <p role="alert" className="px-3 py-2 text-sm">Original-PDF:n kunde inte visas. Den sparade kravtexten visas nedan.</p>
      {fallback}
    </> : <>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2 text-xs">
        <span>Original-PDF</span>
        <div className="flex items-center gap-2" aria-label="PDF-zoom">
          <button type="button" aria-label="Zooma ut PDF" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.25))} className="rounded border px-2 py-1 disabled:opacity-40">−</button>
          <span>{Math.round(zoom*100)} %</span>
          <button type="button" aria-label="Zooma in PDF" disabled={zoom>=2} onClick={()=>setZoom(value=>Math.min(2,value+.25))} className="rounded border px-2 py-1 disabled:opacity-40">+</button>
        </div>
      </div>
      {!state?.pdf ? <p role="status" className="px-3 py-4">Läser original-PDF…</p> : pages.map(pageNumber=>
        <OriginalPdfPage key={`${postNumber}:${pageNumber}`} pdf={state.pdf!} href={href} pageNumber={pageNumber} postNumber={postNumber} continuation={pageNumber!==sourcePage} zoom={zoom} />)}
      <details className="border-t border-neutral-200 px-3 py-2 text-sm">
        <summary className="cursor-pointer">Visa sparad kravtext</summary>
        <p className="my-2 text-xs text-neutral-600">Textutdrag för läsning och kopiering. Originalets layout visas ovan.</p>
        {fallback}
      </details>
    </>}
  </div>;
}

function OriginalPdfPage({pdf,href,pageNumber,postNumber,continuation,zoom}:{pdf:PDFDocumentProxy;href:string;pageNumber:number;postNumber:string|null;continuation:boolean;zoom:number}) {
  const container=useRef<HTMLDivElement>(null), canvases=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(0),[visible,setVisible]=useState(false);
  const [status,setStatus]=useState<{key:string;wholePage?:boolean;failed?:boolean}>();
  const renderKey=`${pageNumber}:${width}:${zoom}`;
  useEffect(()=>{
    const element=container.current;if(!element)return;
    const resize=new ResizeObserver(entries=>setWidth(Math.round(entries[0].contentRect.width)));
    resize.observe(element);
    const intersection=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);intersection.disconnect();}},{rootMargin:"600px"});
    intersection.observe(element);
    return ()=>{resize.disconnect();intersection.disconnect();};
  },[]);
  useEffect(()=>{
    if(!visible||!width)return;
    let cancelled=false,task:RenderTask|undefined;
    void (async()=>{
      try{
        const page=await pdf.getPage(pageNumber);
        const content=await page.getTextContent().catch(()=>({items:[]}));
        if(cancelled)return;
        const selected=originalPdfPostRegions(content.items,postNumber,continuation,page.view[3],page.view[1],page.rotate);
        const base=page.getViewport({scale:1}),cssWidth=width*zoom;
        const scale=Math.min(cssWidth/base.width*Math.min(window.devicePixelRatio||1,2),Math.sqrt(8_000_000/(base.width*base.height)));
        const viewport=page.getViewport({scale});
        const fragment=document.createDocumentFragment();
        for(const region of selected.regions){
          const rect=viewport.convertToViewportRectangle([page.view[0],region.bottom,page.view[2],region.top]);
          const left=Math.floor(Math.min(rect[0],rect[2])),top=Math.floor(Math.min(rect[1],rect[3]));
          const canvas=document.createElement("canvas");
          canvas.width=Math.ceil(Math.abs(rect[2]-rect[0]));canvas.height=Math.ceil(Math.abs(rect[3]-rect[1]));
          canvas.style.width=`${cssWidth}px`;canvas.style.height=`${canvas.height/canvas.width*cssWidth}px`;canvas.style.display="block";
          canvas.setAttribute("role","img");canvas.setAttribute("aria-label",`Original-PDF, sida ${pageNumber}${region.kind==="header"?", kolumnrubriker":postNumber?`, post ${postNumber}`:""}`);
          const context=canvas.getContext("2d");if(!context)throw Error("Canvas unavailable");
          task=page.render({canvas,canvasContext:context,viewport,transform:[1,0,0,1,-left,-top],background:"white"});
          await task.promise;if(cancelled)return;
          fragment.appendChild(canvas);
        }
        if(cancelled)return;
        canvases.current?.replaceChildren(fragment);
        setStatus({key:renderKey,wholePage:selected.wholePage});
      }catch{if(!cancelled)setStatus({key:renderKey,failed:true});}
    })();
    return ()=>{cancelled=true;task?.cancel();};
  },[pdf,pageNumber,postNumber,continuation,width,visible,zoom,renderKey]);
  const ready=status?.key===renderKey;
  return <figure className="m-0 border-b border-neutral-200" ref={container}>
    <figcaption className="px-3 py-2 text-xs text-neutral-600">
      <a href={`${href.split("#")[0]}#page=${pageNumber}`} target="_blank" rel="noopener noreferrer" className="underline">Sida {pageNumber}</a>
      {ready&&status.wholePage&&" · Hela originalsidan visas eftersom postens gränser inte kunde avgränsas säkert."}
    </figcaption>
    {ready&&status.failed ? <p role="alert" className="px-3 py-3 text-sm">Sidan kunde inte visas. Öppna originalsidan eller visa den sparade kravtexten nedan.</p>
      : !ready && <p role="status" className="px-3 py-3 text-sm">{visible?"Visar originalsidan…":"Originalsidan laddas när du bläddrar hit."}</p>}
    <div className="overflow-x-auto bg-white" aria-busy={!ready}><div ref={canvases} /></div>
  </figure>;
}
