import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as persistence from "../src/lib/supabase-user-rest";
import { processTechnicalDescription } from "../src/lib/technical-description-processor";
import { requirementSnapshot } from "../src/lib/requirement-snapshot";
import { compactProjectRequirement } from "../src/lib/project-overview";
import { buildAhlsellRequirementGuide } from "../src/lib/ahlsell-public-match";
import { buildProjectMaterialRows, createProjectMaterialListWorkbook } from "../src/lib/project-material-list-export";
import { waitForImportJob } from "../src/lib/import-job-client";
import ExcelJS from "exceljs";

type Row = Record<string, unknown> & {id: string};

// Real PDF parsing, persistence planning and Excel generation. Only transport
// to the database/Storage is replaced, so no production data is touched.
test("interrupted PDF persistence resumes without duplicates and preserves chapters, metres and page continuations through Excel", async () => {
  const projectId = randomUUID(), organizationId = randomUUID(), userId = randomUUID();
  const rows: Record<string, Row[]> = {
    projects: [{id: projectId, organization_id: organizationId, name: "Local recovery test"}],
    project_modules: [{id: randomUUID(), project_id: projectId, organization_id: organizationId, module_code: "sprinkler", status: "active"}]
  };
  let interrupted = false;
  const changes: string[] = [];
  const find = (table: string, filters: Record<string,string> = {}) => (rows[table] ?? []).filter(row =>
    Object.entries(filters).every(([key, value]) => {
      if (["select","order","limit","offset"].includes(key)) return true;
      if (value === "is.null") return row[key] == null;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      throw new Error(`Unexpected filter ${key}`);
    }));
  const select = async (table: string, filters?: Record<string,string>) => structuredClone(find(table, filters));
  const insert = (table: string, body: Record<string,unknown>) => {
    const row = {...body,id:String(body.id ?? randomUUID())};
    const items = rows[table] ??= [];
    if (!items.some(item => item.id === row.id)) items.push(row);
    changes.push(`insert:${table}`);
    return structuredClone(row);
  };
  const db = {
    ...persistence,
    selectUserRows: select, selectAllUserRows: select,
    insertUserRowReturning: async (table: string, row: Record<string,unknown>) => insert(table,row),
    insertUserRows: async (table: string, values: Record<string,unknown>[]) => {
      if (table === "project_requirements" && !interrupted) {
        insert(table,values[0]); interrupted = true;
        throw new Error("Simulated connection lost after partial batch commit");
      }
      values.forEach(row=>insert(table,row));
    },
    updateUserRowsReturning: async (table: string, filters: Record<string,string>, body: Record<string,unknown>) => {
      const [row] = find(table,filters); assert.ok(row,`Missing update target ${table}`);
      Object.assign(row,body); changes.push(`update:${table}:${body.status ?? body.processing_status ?? ""}`);
      return structuredClone(row);
    },
    uploadUserStorageObject: async () => undefined,
    callUserRpc: async () => { throw new Error("No admin or project creation fallback allowed"); }
  } as unknown as typeof persistence;
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of [
    ["1401 AB - 40.411 Kabelstiger", "Postnr NS-kode/Spesifikasjon Enh. Mengde Pris Sum",
      "1401.40.411.35 WC2.511115", "VEGGKANAL - LENGDE", "Lengde m 71,75", "Materiale: Aluminium", "Andre krav:", "a) Omfang og prisgrunnlag", "Komplett kanal med lokk."],
    ["1401 AB - 40.411 Kabelstiger", "Postnr NS-kode/Spesifikasjon Enh. Mengde Pris Sum",
      "b) Materialer", "Korrosjonsklasse C4.", "1401.40.411.36 WC2.522A", "KABELSTIGE", "Lengde m 501,10", "Materiale: Stal - galvanisert", "Bredde: 600 mm", "Andre krav: Nei"]
  ]) {
    const page=pdf.addPage([595,842]); lines.forEach((line,i)=>page.drawText(line,{x:45,y:800-i*24,size:11,font}));
  }
  const file = new File([Buffer.from(await pdf.save())],"recovery.pdf",{type:"application/pdf"});
  const request = () => { const data = new FormData(); data.set("file",file); data.set("projectId",projectId); data.set("responseMode","summary"); return new Request("http://localhost/import",{method:"POST",body:data}); };
  const auth = {user:{id:userId},context:{organization:{id:organizationId,name:"Local"},permissions:["project.requirement.create" as const]}};
  const first = await processTechnicalDescription(request(),auth,db);
  assert.equal(first.status,500);
  assert.equal(rows.project_requirements.length,1);
  assert.ok(!changes.some(change=>/update:extraction_runs:(completed|requires_review)/.test(change)));
  assert.ok(!changes.some(change=>/update:project_documents:(completed|requires_review)/.test(change)));
  const second = await processTechnicalDescription(request(),auth,db);
  assert.equal(second.status,201, JSON.stringify(await second.clone().json()));
  assert.equal(rows.project_requirements.length,2);
  assert.equal(new Set(rows.project_requirements.map(row=>row.id)).size,2);
  assert.equal(rows.project_documents.length,1); assert.equal(rows.extraction_runs.length,1);
  assert.equal(rows.document_pages.length,2);
  const requirements = rows.project_requirements.map(requirementSnapshot);
  const card = requirements.find(row=>(row.value_json as Record<string,unknown>).postNumber === "1401.40.411.35")!;
  assert.ok(card);
  const value = card.value_json as Record<string,unknown>;
  assert.equal(value.quantity,71.75); assert.equal(value.unit,"m"); assert.equal(value.extractionVersion,1);
  assert.match(String(value.sourceText), /Korrosjonsklasse C4/);
  assert.match(JSON.stringify(value.sourceChapter), /40.411/);
  const overview = compactProjectRequirement(card);
  assert.match(JSON.stringify(overview), /40.411/);
  assert.doesNotMatch(JSON.stringify(overview), /Korrosjonsklasse C4/);
  assert.match(buildAhlsellRequirementGuide(card).searchQuery, /veggkanal/i);
  // A selected article is read through the same saved requirement snapshot.
  const assignments = [{id:randomUUID(),requirement_id:card.id,status:"selected",selected_at:new Date().toISOString(),product_snapshot:{
    source:"distributor_manual",approvedByUser:true,approvalStatus:"user_approved",name:"Veggkanal aluminium",productNumber:"1234567",distributor:"Ahlsell"
  }}];
  const materialRows = buildProjectMaterialRows({requirements: requirements as Parameters<typeof buildProjectMaterialRows>[0]["requirements"],assignments});
  assert.equal(materialRows.find(row=>row.postNumber === "1401.40.411.35")?.quantity,71.75);
  const buffer = await createProjectMaterialListWorkbook({organizationName:"Local", project:{id:projectId,name:"Local recovery test",project_number:null,customer_name:null,end_customer:null,standard:null,system_type:null,supplier:"Ahlsell",status:"analysis"},rows:materialRows});
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never);
  assert.ok(workbook.worksheets.length>0);
  const content = JSON.stringify(workbook.worksheets.map(sheet=>sheet.getSheetValues()));
  assert.match(content,/1401\.40\.411\.35/); assert.match(content,/1234567/); assert.match(content,/71\.75/);
  const third = await processTechnicalDescription(request(),auth,db);
  assert.equal(third.status,200); assert.equal(rows.project_requirements.length,2);
});

test("import polling reports persisted completion and preserves retry status when the browser loses contact", async () => {
  const jobId=randomUUID();
  const accepted = () => Response.json({jobId},{status:202});
  let poll=0;
  const completed = await waitForImportJob(accepted(), (async () => Response.json({jobs:[{
    id:jobId,project_id:randomUUID(),status:++poll===1 ? "running" : "completed",result:{persistedRequirementCount:2}
  }]})) as typeof fetch,undefined,async()=>{});
  assert.equal(completed.status,201); assert.equal((await completed.json()).persistedRequirementCount,2);
  await assert.rejects(waitForImportJob(accepted(),(async()=>{throw new TypeError("Network lost");}) as typeof fetch,undefined,async()=>{}),/Importstatus|import/i);
});
