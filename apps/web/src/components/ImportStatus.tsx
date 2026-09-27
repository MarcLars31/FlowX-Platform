"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ImportJobStatus } from "@/lib/import-job-client";
const labels:Record<string,string>={queued:"I kö",running:"Bearbetas",awaiting_ocr:"Behöver textläsning",completed:"Klar",failed:"Kunde inte slutföras"};
export function ImportStatus() {
  const [jobs,setJobs]=useState<ImportJobStatus[]>([]);
  const [error,setError]=useState(""); const [busy,setBusy]=useState<string|null>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch("/api/technical-descriptions/jobs",{cache:"no-store",signal:signal??AbortSignal.timeout(20_000)});
    if(!response.ok)throw new Error("Importstatus kunde inte laddas.");
    const payload=await response.json();return payload.jobs as ImportJobStatus[];
  },[]);
  useEffect(()=>{
    let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;let controller:AbortController|undefined;
    async function poll(){
      let delay=30_000;
      try {
        if(document.visibilityState==="visible"){
          controller=new AbortController();
          const next=await load(AbortSignal.any([controller.signal,AbortSignal.timeout(20_000)]));
          if(!cancelled){setJobs(next);setError("");}
          if(next.some(job=>job.status==="queued"||job.status==="running"))delay=5000;
        }
      } catch(error){if(!cancelled)setError(error instanceof Error?error.message:"Importstatus kunde inte laddas.");}
      if(!cancelled)timer=setTimeout(()=>void poll(),delay);
    }
    void poll();return()=>{cancelled=true;clearTimeout(timer);controller?.abort();};
  },[load]);
  async function resume(job:ImportJobStatus) {
    setBusy(job.id);setError("");
    try {
      const form=new FormData();
      if(job.status==="failed") form.set("retryJobId",job.id);
      else {
        const response=await fetch(`/api/technical-descriptions/jobs/${job.id}/file`);
        if(!response.ok)throw new Error("PDF-filen kunde inte hämtas.");
        const file=new File([await response.blob()],job.file_name,{type:"application/pdf"});
        const {extractPdfPagesWithBrowserOcr}=await import("@/lib/browser-pdf-ocr");
        const pages=await extractPdfPagesWithBrowserOcr(file,job.result?.pageNumbers as number[],()=>undefined);
        form.set("uploadId",job.upload_id);form.set("fileName",job.file_name);form.set("projectId",job.project_id);form.set("ocrPages",JSON.stringify(pages));
      }
      const response=await fetch("/api/technical-descriptions/jobs",{method:"POST",body:form});
      if(!response.ok)throw new Error((await response.json()).error ?? "Importen kunde inte fortsätta.");
      setJobs(await load());
    } catch(error){setError(error instanceof Error?error.message:"Importen kunde inte fortsätta.");}
    finally{setBusy(null);}
  }
  return <section className="space-y-4 border border-neutral-300 bg-white p-5"><h1 className="text-xl font-semibold">Importstatus</h1>
    <p>Importer fortsätter i bakgrunden. Skannade sidor kan behöva läsas i webbläsaren.</p>
    {error&&<p role="alert">{error} <button type="button" onClick={()=>void load().then(jobs=>{setJobs(jobs);setError("");}).catch(error=>setError(error.message))}>Försök igen</button></p>}
    <table className="w-full text-left text-sm"><thead><tr><th className="p-2">PDF</th><th>Status</th><th>Åtgärd</th></tr></thead><tbody>
      {jobs.map(job=><tr key={job.id} className="border-t border-neutral-200"><td className="p-2">{job.file_name}</td><td>{labels[job.status]??job.status}</td><td>
        {job.status==="completed"?<Link prefetch={false} className="underline" href={`/projects/${job.project_id}?step=products`}>Öppna projekt</Link>:
          ["failed","awaiting_ocr"].includes(job.status)?<button type="button" disabled={busy!==null} className="border border-neutral-400 px-3 py-1" onClick={()=>void resume(job)}>{busy===job.id?"Bearbetar…":job.status==="failed"?"Försök igen":"Fortsätt textläsning"}</button>:"Du kan lämna sidan"}
      </td></tr>)}
    </tbody></table>{!jobs.length&&!error&&<p>Inga importer att visa.</p>}
  </section>;
}
