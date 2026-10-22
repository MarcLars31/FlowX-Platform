import "server-only";
import { callSupabaseRpc } from "./supabase-rest";
import { deleteAdminStorageObjects } from "./supabase-admin-storage";

type Cleanup = {id:string;lease_id:string;organization_id:string;project_id:string;storage_bucket:string;storage_path:string};
/** Only jobs committed by the project lifecycle trigger may delete originals. */
export async function cleanupProjectSourcePdfs(projectId: string | null = null) {
  try {
    const jobs = await callSupabaseRpc<Cleanup[]>("claim_project_pdf_cleanup",{requested_project_id:projectId});
    for (const job of jobs) {
      let successful=false;
      try {
        const prefix=`${job.organization_id}/${job.project_id}/`;
        if (!["project-files","pdf-import-cache"].includes(job.storage_bucket) || !job.storage_path.startsWith(prefix) || job.storage_path.split("/").includes("..")) throw new Error("Invalid cleanup scope");
        await deleteAdminStorageObjects(job.storage_bucket,[job.storage_path]);
        successful=true;
      } catch { console.warn("project_pdf_cleanup_retry",{jobId:job.id}); }
      await callSupabaseRpc("finish_project_pdf_cleanup",{requested_id:job.id,requested_lease:job.lease_id,successful});
    }
  } catch { console.warn("project_pdf_cleanup_pending"); }
}
