import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { buildProjectReport,defaultReportFilters,parseReportFilters,reportTables,type ReportSource } from './project-reports';
import { createProjectReportPdf,createProjectReportWorkbook } from './project-report-export';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function reportFixture():ReportSource {
  return {generatedAt:'2026-11-09T23:30:00.000Z',snapshot:{projectId:id(1),name:'Rapport ÅÄÖ',userId:id(2),manager:true,settings:{project_id:id(1),deadline:null,revision:0,review_required:true,allow_later_post_deadline:true,multiple_help_requests:true,assignment_email:'batch'},departments:[{id:id(3),name:'Sprinkler',supervisorId:id(2)}],members:[{id:id(4),name:'Åsa',departmentId:id(3)}],assignments:[{id:id(5),scope_type:'pdf_chapter',scope_value:id(10),department_id:id(3),assigned_to:id(4),due_date:'2026-11-09',revision:0}],posts:[
    {id:id(10),number:'33.1',title:'Sprinkler',chapter:'33 Brand',chapterKey:'chapter-a',assignmentId:id(5),dueDate:'2026-11-09',ownDeadline:null,deadlineRevision:0,canEdit:true,done:false,revision:1,openHelp:0,reviewState:'ready',sourceChapter:{title:'33 Brand'}},
    {id:id(11),number:'33.2',title:'Ventil',chapter:'33 Brand',chapterKey:'chapter-b',assignmentId:null,dueDate:'2026-11-08',ownDeadline:null,deadlineRevision:0,canEdit:true,done:true,revision:2,openHelp:0,reviewState:'approved',sourceChapter:{title:'33 Brand'}},
    {id:id(12),number:'34.1',title:'Rör',chapter:'34 VVS',chapterKey:'chapter-c',assignmentId:null,dueDate:null,ownDeadline:null,deadlineRevision:0,canEdit:true,done:false,revision:0,openHelp:1,reviewState:'returned',sourceChapter:{title:'34 VVS'}},
    {id:id(13),number:'34.2',title:'Koppling',chapter:'34 VVS',chapterKey:'chapter-c',assignmentId:id(5),dueDate:'2026-11-10',ownDeadline:null,deadlineRevision:0,canEdit:true,done:false,revision:0,openHelp:0,sourceChapter:{title:'34 VVS'}}]},
    help:[{id:id(30),requirementId:id(12),description:'Vilken dimension?',createdAt:'2026-11-09T12:00:00Z'}],reviews:[
      {id:id(20),requirementId:id(10),state:'ready',actor:'Åsa',note:'',createdAt:'2026-11-09T23:10:00Z'},
      {id:id(21),requirementId:id(11),state:'approved',actor:'Karin',note:'Granskad',createdAt:'2026-11-08T12:00:00Z'},
      {id:id(22),requirementId:id(12),state:'returned',actor:'Karin',note:'Kontrollera',createdAt:'2026-11-09T12:00:00Z'}]};
}
test('report filters reject invalid dates, duplicates and prototype values',()=>{
  for(const query of ['kind=__proto__','status=toString','from=2026-02-30','from=2026-11-11&to=2026-11-10','kind=status&kind=reviews','person=anything'])assert.throws(()=>parseReportFilters(new URLSearchParams(query)));
  assert.equal(parseReportFilters(new URLSearchParams('from=2028-02-29')).from,'2028-02-29');
});
test('status reconciles current work and uses Oslo calendar dates, preserving repeated chapter names',()=>{
  const report=buildProjectReport(reportFixture(),defaultReportFilters,'Org');
  assert.equal(report.today,'2026-11-10');
  assert.deepEqual(report.summary,{total:4,done:1,ready:1,approved:1,returned:1,late:1,unassigned:2,help:1});
  assert.equal(report.groups.chapters.length,3);
  assert.equal(report.groups.chapters.reduce((n,g)=>n+g.total,0),4);
  assert.equal(report.rows.find(p=>p.id===id(11))?.lateDays,0);
});
test('actions exclude completed work, prioritize lateness and retain missing dates and help',()=>{
  const report=buildProjectReport(reportFixture(),{...defaultReportFilters,kind:'actions'},'Org');
  assert.equal(report.rows.length,3);assert.equal(report.rows[0].id,id(10));
  const row=report.rows.find(p=>p.id===id(12))!;assert.ok(row.actions.includes('Avklar frist'));assert.deepEqual(row.help,['Vilken dimension?']);
  const dateReport=buildProjectReport(reportFixture(),{...defaultReportFilters,kind:'actions',from:'2026-11-10',to:'2026-11-10'},'Org');
  assert.deepEqual(dateReport.rows.map(p=>p.id),[id(13)]);
});
test('review date filters use event dates rather than due dates and only matching posts are included',()=>{
  const report=buildProjectReport(reportFixture(),{...defaultReportFilters,kind:'reviews',from:'2026-11-10',to:'2026-11-10'},'Org');
  assert.deepEqual(report.events.map(e=>e.id),[id(20)]);assert.equal(report.summary.total,1);
  const none=buildProjectReport(reportFixture(),{...defaultReportFilters,person:id(99)},'Org');assert.equal(none.summary.total,0);assert.equal(reportTables(none).at(-1)?.rows.length,0);
});
test('non-actionable headings and their histories never become report rows',()=>{
  const source=reportFixture();source.snapshot.posts[0].measurement={unit:'',quantity:null};
  const report=buildProjectReport(source,{...defaultReportFilters,kind:'reviews'},'Org');assert.ok(!report.events.some(e=>e.requirementId===id(10)));
});
test('Excel keeps literal user text and all history beyond 1000 rows, including long comments',async()=>{
  const source=reportFixture(),note='=HYPERLINK("https://example.test") '+ 'å'.repeat(3900)+' SLUT';
  source.reviews=Array.from({length:1005},(_,i)=>({...source.reviews[0],id:id(100+i),note:i===0?note:`Händelse ${i}`}));
  const report=buildProjectReport(source,{...defaultReportFilters,kind:'reviews'},'Org');
  const bytes=await createProjectReportWorkbook(report),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet=book.getWorksheet('Granskningshistorikk')!;assert.ok(sheet.rowCount>=1009);
  let text='';sheet.eachRow(row=>row.eachCell((cell,col)=>{assert.notEqual(cell.type,ExcelJS.ValueType.Formula);if(col===7)text+=String(cell.value).replaceAll('\n','');}));
  assert.ok(text.includes(note));assert.ok(text.includes('Händelse 1004'));
});
test('PDF paginates long words and comments without encoding errors',async()=>{
  const source=reportFixture();source.reviews[0].note='ÄÖÅ Ø æ 漢 '+ 'L'.repeat(4000);
  source.reviews=Array.from({length:50},(_,i)=>({...source.reviews[0],id:id(i+100)}));
  const bytes=await createProjectReportPdf(buildProjectReport(source,{...defaultReportFilters,kind:'reviews'},'Org'));
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>2);assert.equal(pdf.getTitle(),'Granskningsprotokoll');
});
