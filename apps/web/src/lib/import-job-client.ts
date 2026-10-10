export type ImportJobStatus = { id:string; project_id:string; upload_id:string; file_name:string; status:string; phase:string; result?:Record<string,unknown>|null; error_code?:string|null };
export async function waitForImportJob(response: Response, fetcher: typeof fetch, report?: (label:string)=>void,
  pause: (delayMs: number) => Promise<void> = delayMs => new Promise(resolve=>setTimeout(resolve,delayMs))) {
  if (response.status !== 202) return response;
  const {jobId} = await response.json() as {jobId:string};
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Importsvaret saknar jobb-id.");
  let delayMs = 2000, waitedMs = 0, previousPhase = "";
  const deadline = Date.now() + 600_000;
  while (waitedMs < 600_000 && Date.now() < deadline) {
    await pause(delayMs);
    waitedMs += delayMs;
    const status = await fetcher(`/api/technical-descriptions/jobs?id=${encodeURIComponent(jobId)}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)}).catch(()=>{throw new Error("Importen fortsätter men anslutningen bröts. Öppna Importstatus för att följa den.");});
    if (!status.ok) throw new Error("Importen är startad men status kunde inte hämtas. Du kan följa den under Importstatus.");
    const {jobs} = await status.json() as {jobs:ImportJobStatus[]};
    const job=jobs[0];
    if (!job) throw new Error("Importstatus saknas.");
    if (job.status==="completed") return Response.json({...job.result,jobId,projectId:job.project_id},{status:201});
    if (job.status==="awaiting_ocr") return Response.json({...job.result,jobId},{status:422});
    if (job.status==="failed") return Response.json({error:"Importen kunde inte slutföras. Öppna Importstatus för att försöka igen.",jobId},{status:503});
    const phase = `${job.status}:${job.phase}`;
    delayMs = phase === previousPhase ? Math.min(8000, delayMs * 2) : 2000;
    previousPhase = phase;
    report?.(job.status==="queued" ? "Importen står i kö. Du kan lämna sidan." : "Importen bearbetas. Du kan lämna sidan.");
  }
  throw new Error("Importen fortsätter i bakgrunden. Följ den under Importstatus.");
}
