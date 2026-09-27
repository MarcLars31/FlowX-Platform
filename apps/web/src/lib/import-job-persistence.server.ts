import "server-only";
import * as user from "./supabase-user-rest";
import { getSupabaseConfig } from "./supabase-rest";
import { buildSupabaseHeaders } from "./supabase-headers";
import { collectAllRows, collectAllRowsById } from "./paginated-rows";

const tables = new Set(["projects", "project_modules", "technical_description_documents", "project_documents", "project_requirements",
  "extraction_runs", "document_pages", "technical_description_material_lines", "technical_description_rule_hints", "requirement_sets", "requirement_candidates"]);

/** Only instantiated after the claimed job's current authorization is checked.
 * Every service write is confined to that job's organization/project. No RPCs,
 * arbitrary tables, user credentials or caller-provided storage paths. */
export function importJobPersistence(scope: { organization_id: string; project_id: string }, deadline: number): typeof user {
  const config = getSupabaseConfig();
  function assertBudget() { if (Date.now() >= deadline) throw new Error("IMPORT_TIME_BUDGET"); }
  function assertTable(table: string) { assertBudget(); if (!tables.has(table)) throw new Error("IMPORT_TABLE_SCOPE"); }
  function filters(table: string, params: Record<string, string>) {
    assertTable(table);
    if (params.organization_id !== `eq.${scope.organization_id}`) throw new Error("IMPORT_ORGANIZATION_SCOPE");
    if (table === "projects") {
      if (params.id !== `eq.${scope.project_id}`) throw new Error("IMPORT_PROJECT_SCOPE");
    } else if (!["technical_description_material_lines", "technical_description_rule_hints"].includes(table)
      && params.project_id !== `eq.${scope.project_id}`) throw new Error("IMPORT_PROJECT_SCOPE");
    return params;
  }
  function payload(table: string, row: Record<string, unknown>) {
    assertTable(table);
    if (row.organization_id !== scope.organization_id) throw new Error("IMPORT_ORGANIZATION_SCOPE");
    if (!["technical_description_material_lines", "technical_description_rule_hints"].includes(table)
      && row.project_id !== scope.project_id) throw new Error("IMPORT_PROJECT_SCOPE");
  }
  function patch(row: Record<string, unknown>) {
    if (["id", "organization_id", "project_id"].some(key => key in row)) {
      if (row.organization_id !== undefined && row.organization_id !== scope.organization_id) throw new Error("IMPORT_ORGANIZATION_SCOPE");
      if (row.project_id !== undefined && row.project_id !== scope.project_id) throw new Error("IMPORT_PROJECT_SCOPE");
      if (row.id !== undefined) throw new Error("IMPORT_ID_IMMUTABLE");
    }
  }
  async function rest<T>(table: string, params: Record<string, string>, method: string, body?: unknown, prefer = "return=representation"): Promise<T[]> {
    assertTable(table);
    const url = new URL(`/rest/v1/${table}`, config.url);
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
    const response = await fetch(url, { method, headers: { ...buildSupabaseHeaders(config.key), "Content-Type": "application/json", Prefer: prefer },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(Math.min(20_000, Math.max(1, deadline-Date.now()))), cache: "no-store" });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new user.UserSupabaseError("Import persistence failed", response.status, error.code); }
    return (response.status === 204 || prefer.startsWith("return=minimal")) ? [] : await response.json();
  }
  const select: typeof user.selectUserRows = (table, params = {}) => rest(table, filters(table, params), "GET");
  return { ...user, selectUserRows: select,
    selectAllUserRows: (table, params, options = {}) => options.pagination === "id"
      ? collectAllRowsById(({limit,afterId}) => select(table,{...params,limit:String(limit),...(afterId ? {id:`gt.${afterId}`} : {})}),options)
      : collectAllRows(({limit,offset}) => select(table,{...params,limit:String(limit),offset:String(offset)}),options),
    insertUserRowReturning: async (table, row) => { payload(table,row); const [saved] = await rest(table,{},"POST",row); if (!saved) throw new Error("IMPORT_INSERT_EMPTY"); return saved as never; },
    insertUserRows: async (table, rows, options = {}) => {
      for (const row of rows) payload(table,row);
      if (rows.length) await rest(table, options.ignoreIdConflicts ? { on_conflict: "id" } : {}, "POST", rows,
        options.ignoreIdConflicts ? "return=minimal,resolution=ignore-duplicates" : "return=minimal");
    },
    updateUserRowsReturning: async (table, params, row) => {
      patch(row);
      const [saved] = await rest(table,filters(table,params),"PATCH",row); if (!saved) throw new Error("IMPORT_UPDATE_EMPTY"); return saved as never;
    },
    callUserRpc: async () => { throw new Error("IMPORT_RPC_NOT_ALLOWED"); },
    deleteUserRows: async () => { throw new Error("IMPORT_DELETE_NOT_ALLOWED"); },
    deleteUserRowsReturning: async () => { throw new Error("IMPORT_DELETE_NOT_ALLOWED"); },
    uploadUserStorageObject: async (bucket,path,body,contentType,options) => {
      assertBudget();
      if (bucket !== "project-files" || !path.startsWith(`${scope.organization_id}/${scope.project_id}/technical-description/`) || path.includes("..")) throw new Error("IMPORT_STORAGE_SCOPE");
      const url = new URL(`/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,config.url);
      const response = await fetch(url,{method:"POST",headers:{...buildSupabaseHeaders(config.key),"Content-Type":contentType,"x-upsert":String(options?.upsert ?? false)},
        body: Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : body),signal:AbortSignal.timeout(30_000)});
      if (!response.ok) throw new Error("IMPORT_STORAGE_WRITE");
    }
  };
}
