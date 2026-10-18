import "server-only";
import { createHash } from "node:crypto";
import { callSupabaseRpc, selectSupabaseRows, insertSupabaseRowReturning, updateSupabaseRowsReturning, getSupabaseConfig } from "./supabase-rest";
import { downloadAdminStorageObject, uploadAdminStorageObject, deleteAdminStorageObjects } from "./supabase-admin-storage";
import { buildSupabaseHeaders } from "./supabase-headers";
import { collectAllRows } from "./paginated-rows";
import type { TechnicalDescriptionPage } from "../modules/technical-description-extractor/types";
import type { ClientOcrPage } from "./technical-description-ocr-payload";

export const IMPORT_CACHE_BUCKET = "pdf-import-cache";
// Bump whenever digital extraction/layout/annotation semantics change.
export const PDF_TEXT_CACHE_VERSION = "pdf-text-v6";
const MAX_OBJECT_BYTES = 4_000_000;
export type Checkpoint = {id:string;job_id:string;kind:"text"|"ocr";source_sha256:string;cache_version:string;
  payload_sha256:string;storage_path:string;page_numbers:number[];ready:boolean};
export type CheckpointJob = {id:string;organization_id:string;project_id:string};
export const payloadHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function checkpointPrefix(job: CheckpointJob) {
  if (![job.id,job.organization_id,job.project_id].every(id => /^[a-f0-9-]{36}$/i.test(id))) throw new Error("IMPORT_CACHE_SCOPE");
  return `${job.organization_id}/${job.project_id}/${job.id}/`;
}
export async function checkpointRows(job: CheckpointJob, kind: "text"|"ocr", hash?: string) {
  checkpointPrefix(job);
  return collectAllRows(({limit,offset}) => selectSupabaseRows<Checkpoint>("technical_description_checkpoints",{
    job_id:`eq.${job.id}`,kind:`eq.${kind}`,ready:"eq.true",
    ...(hash ? {source_sha256:`eq.${hash}`,cache_version:`eq.${PDF_TEXT_CACHE_VERSION}`} : {}),
    select:"id,job_id,kind,source_sha256,cache_version,payload_sha256,storage_path,page_numbers,ready",order:"created_at.asc,id.asc",limit:String(limit),offset:String(offset)
  }));
}
export function decodeCheckpoint<T extends {pageNumber:number}>(job: CheckpointJob, row: Checkpoint, bytes: Uint8Array): T[] {
  if (row.job_id !== job.id || !row.storage_path.startsWith(checkpointPrefix(job)) || row.storage_path.includes("..")
    || payloadHash(bytes) !== row.payload_sha256) throw new Error("IMPORT_CACHE_INTEGRITY");
  const pages = JSON.parse(new TextDecoder().decode(bytes)) as T[];
  if (!Array.isArray(pages) || pages.length !== row.page_numbers.length
    || pages.some((page,index) => page.pageNumber !== row.page_numbers[index])) throw new Error("IMPORT_CACHE_PAGE_MISMATCH");
  return pages;
}
export async function readCheckpoints<T extends {pageNumber:number}>(job: CheckpointJob, kind:"text"|"ocr", hash?:string) {
  const pages = new Map<number,T>();
  for (const row of await checkpointRows(job,kind,hash)) {
    const bytes = await downloadAdminStorageObject(IMPORT_CACHE_BUCKET,row.storage_path,{maxBytes:MAX_OBJECT_BYTES});
    // First completed read wins if two browser sessions submitted overlapping pages.
    for (const page of decodeCheckpoint<T>(job,row,bytes)) if (!pages.has(page.pageNumber)) pages.set(page.pageNumber,page);
  }
  return [...pages.values()].sort((a,b)=>a.pageNumber-b.pageNumber);
}
export async function storeCheckpointObject(row: Checkpoint, bytes: Uint8Array) {
  if (bytes.length > MAX_OBJECT_BYTES || payloadHash(bytes) !== row.payload_sha256) throw new Error("IMPORT_CACHE_SIZE_OR_HASH");
  if (row.ready) return;
  try { await uploadAdminStorageObject(IMPORT_CACHE_BUCKET,row.storage_path,bytes,"application/json"); }
  catch (error) {
    // A crash may have committed Storage but not the ready marker. Verify its exact content.
    const existing = await downloadAdminStorageObject(IMPORT_CACHE_BUCKET,row.storage_path,{maxBytes:MAX_OBJECT_BYTES}).catch(()=>null);
    if (!existing || payloadHash(existing) !== row.payload_sha256) throw error;
  }
}
/** Oversized individual pages remain readable; caching must not reject an otherwise valid PDF. */
export function textCheckpointWriter(write: (pages: TechnicalDescriptionPage[]) => Promise<void>) {
  let pending: TechnicalDescriptionPage[]=[];
  const flush=async()=>{if(pending.length){await write(pending);pending=[];}};
  return {flush,async add(page: TechnicalDescriptionPage){
    const bytes=Buffer.byteLength(JSON.stringify([page]));
    if (bytes>3_500_000){await flush();return;}
    if(pending.length && (pending.length>=100 || Buffer.byteLength(JSON.stringify([...pending,page]))>3_500_000))await flush();
    pending.push(page);if(pending.length>=100)await flush();
  }};
}
export async function saveTextCheckpoint(job: CheckpointJob, hash: string, pages: TechnicalDescriptionPage[]) {
  const bytes=Buffer.from(JSON.stringify(pages)); const contentHash=payloadHash(bytes);
  if (!pages.length || pages.length>100 || bytes.length>MAX_OBJECT_BYTES) throw new Error("IMPORT_CACHE_BATCH_SIZE");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("IMPORT_CACHE_HASH");
  const scope={job_id:`eq.${job.id}`,kind:"eq.text",source_sha256:`eq.${hash}`,cache_version:`eq.${PDF_TEXT_CACHE_VERSION}`,payload_sha256:`eq.${contentHash}`};
  const [previous]=await selectSupabaseRows<Checkpoint>("technical_description_checkpoints",{...scope,select:"*",limit:"1"});
  const row=previous ?? await insertSupabaseRowReturning<Checkpoint>("technical_description_checkpoints",{
    job_id:job.id,kind:"text",source_sha256:hash,cache_version:PDF_TEXT_CACHE_VERSION,payload_sha256:contentHash,
    storage_path:`${checkpointPrefix(job)}text/${PDF_TEXT_CACHE_VERSION}/${hash}/${contentHash}.json`,page_numbers:pages.map(page=>page.pageNumber)
  });
  await storeCheckpointObject(row,bytes);
  if (!row.ready) await updateSupabaseRowsReturning("technical_description_checkpoints",{id:`eq.${row.id}`,job_id:`eq.${job.id}`,select:"id"},{ready:true});
}
export async function saveOcrCheckpoint(job: CheckpointJob, userId: string, pages: ClientOcrPage[]) {
  const bytes=Buffer.from(JSON.stringify(pages));
  const row=await callSupabaseRpc<Checkpoint>("reserve_pdf_ocr_checkpoint",{requested_job_id:job.id,requested_user_id:userId,
    requested_hash:payloadHash(bytes),requested_pages:pages.map(page=>page.pageNumber)});
  if (!row.storage_path.startsWith(checkpointPrefix(job))) throw new Error("IMPORT_CACHE_SCOPE");
  await storeCheckpointObject(row,bytes);
  return callSupabaseRpc<{jobId:string;status:string}>("finish_pdf_ocr_checkpoint",{requested_id:row.id,requested_user_id:userId});
}
export async function cleanupImportCheckpoints() {
  try {
    const rows=await callSupabaseRpc<Checkpoint[]>("pdf_import_checkpoints_to_clean",{});
    const config=getSupabaseConfig();
    const valid=rows.filter(row=>/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/(text|ocr)\//.test(row.storage_path) && !row.storage_path.includes(".."));
    if (!valid.length) return;
    await deleteAdminStorageObjects(IMPORT_CACHE_BUCKET,valid.map(row=>row.storage_path));
    const url=new URL("/rest/v1/technical_description_checkpoints",config.url);
    url.searchParams.set("id",`in.(${valid.map(row=>row.id).join(",")})`);
    const response=await fetch(url,{method:"DELETE",headers:buildSupabaseHeaders(config.key),signal:AbortSignal.timeout(20_000)});
    if(!response.ok) throw new Error("IMPORT_CACHE_CLEANUP");
  } catch {console.warn("import_cache_cleanup_pending");}
}
