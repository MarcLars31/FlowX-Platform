import "server-only";
import { cleanupImportCheckpoints } from "./import-checkpoint.server";
import { cleanupProjectSourcePdfs } from "./project-pdf-cleanup.server";
import { cleanupTemporaryPdfUploads } from "./temporary-pdf-cleanup.server";
import { runImportWorker } from "./import-worker.server";
import { runProductDocumentWorker } from "./product-document-worker.server";
export async function runBackgroundMaintenance() {
  const jobs = [cleanupProjectSourcePdfs, cleanupImportCheckpoints, cleanupTemporaryPdfUploads, runImportWorker, runImportWorker, runProductDocumentWorker];
  const results = await Promise.allSettled(jobs.map(job => job()));
  results.forEach((result,index) => { if(result.status === "rejected") console.error("background_task_failed",{task:jobs[index].name,name:result.reason instanceof Error ? result.reason.name : "Error"}); });
}
