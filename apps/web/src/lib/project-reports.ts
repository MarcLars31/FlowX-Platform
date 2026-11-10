import { actionableManagementSnapshot, managementChapters, type HierarchySnapshot } from './project-management-hierarchy';
import { osloDate, workReviewLabels, type WorkReviewState } from './project-management';

export const reportTitles = { status: 'Prosjektstatus', actions: 'Frister og tiltak', reviews: 'Granskningsprotokoll' } as const;
export type ReportKind = keyof typeof reportTitles;
export type ReportFilters = { kind: ReportKind; chapter: string; department: string; person: string; status: string; from: string; to: string };
export const defaultReportFilters: ReportFilters = { kind: 'status', chapter: 'all', department: 'all', person: 'all', status: 'all', from: '', to: '' };
export const reportStatuses = { all: 'Alle statuser', open: 'Ikke ferdige', done: 'Ferdige', in_progress: 'Pågår', ready: 'Klar til granskning', approved: 'Godkjent', returned: 'Sendt tilbake', completed: 'Ferdig uten granskning', late: 'Over fristen', help: 'Trenger hjelp', unassigned: 'Uten person' };
export type ReportEvent = { id: string; requirementId: string; state: WorkReviewState; actor: string; note: string; createdAt: string };
export type ReportHelp = { id: string; requirementId: string; description: string; createdAt: string };
export type ReportSource = { snapshot: HierarchySnapshot; reviews: ReportEvent[]; help: ReportHelp[]; generatedAt: string };
export type ReportPost = { id: string; number: string; title: string; chapterKey: string; chapter: string; departmentId: string; department: string; personId: string; person: string; deadline: string; state: WorkReviewState; status: string; done: boolean; lateDays: number; openHelp: number; help: string[]; actions: string[] };
export type ReportSummary = { total: number; done: number; ready: number; approved: number; returned: number; late: number; unassigned: number; help: number };
export type ReportGroup = ReportSummary & { key: string; label: string };
export type ReportOption = { id: string; label: string };
export type ProjectReport = {
  projectId: string; projectName: string; organizationName: string; generatedAt: string; today: string; title: string; filters: ReportFilters;
  scope: string; reviewRequired: boolean; reviewer: string; selectedFilters: string[]; visibleTotal: number;
  summary: ReportSummary; rows: ReportPost[]; events: (ReportEvent & { post: ReportPost })[];
  groups: { chapters: ReportGroup[]; departments: ReportGroup[]; people: ReportGroup[] };
  options: { chapters: ReportOption[]; departments: ReportOption[]; people: ReportOption[] };
};
export type ReportResponse = { report: ProjectReport; version: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const result = { ...defaultReportFilters };
  for (const key of Object.keys(result) as (keyof ReportFilters)[]) {
    if (params.getAll(key).length > 1) throw new Error('Velg ett filter per felt.');
    const value = params.get(key); if (value !== null) Object.assign(result, { [key]: value });
  }
  if (!Object.hasOwn(reportTitles,result.kind) || !Object.hasOwn(reportStatuses,result.status)
    || result.chapter.length > 3000 || !result.chapter
    || [result.person,result.department].some(value => !['all','none'].includes(value) && !uuid.test(value))
    || [result.from,result.to].some(value => value !== '' && !validDate(value))
    || result.from && result.to && result.from > result.to) throw new Error('Kontroller rapporttype, filtre og datointervall.');
  return result;
}
export function reportQuery(filters: ReportFilters) { return new URLSearchParams(filters).toString(); }
export function reportTimestamp(value: string) {
  return new Intl.DateTimeFormat('nb-NO',{timeZone:'Europe/Oslo',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
}
export function eventLabel(state: WorkReviewState) {
  return state === 'in_progress' ? 'Gjenåpnet' : state === 'completed' ? 'Ferdigmeldt uten granskning' : workReviewLabels[state];
}
export function summarizePosts(rows: ReportPost[]): ReportSummary {
  return { total: rows.length, done: rows.filter(p=>p.done).length, ready: rows.filter(p=>p.state==='ready').length,
    approved: rows.filter(p=>p.state==='approved').length, returned: rows.filter(p=>p.state==='returned').length,
    late: rows.filter(p=>p.lateDays>0).length, unassigned: rows.filter(p=>p.personId==='none').length,
    help: rows.filter(p=>p.openHelp>0).length };
}
function grouped(rows: ReportPost[], key: 'chapterKey'|'departmentId'|'personId', label: 'chapter'|'department'|'person'): ReportGroup[] {
  const buckets = new Map<string,ReportPost[]>();
  for (const row of rows) { const group=buckets.get(row[key]) ?? []; group.push(row); buckets.set(row[key],group); }
  return [...buckets].map(([id,posts])=>({ key:id,label:posts[0][label],...summarizePosts(posts) }));
}
function statusMatches(row: ReportPost, status: string) {
  return status==='all' || status===row.state || status==='done' && row.done || status==='open' && !row.done
    || status==='late' && row.lateDays>0 || status==='help' && row.openHelp>0 || status==='unassigned' && row.personId==='none';
}
function within(value: string, filters: ReportFilters) { return (!filters.from || value!=='' && value>=filters.from) && (!filters.to || value!=='' && value<=filters.to); }
export function buildProjectReport(source: ReportSource, filters: ReportFilters, organizationName: string): ProjectReport {
  const data=actionableManagementSnapshot(source.snapshot), today=osloDate(new Date(source.generatedAt));
  const packages=new Map(data.assignments.map(w=>[w.id,w])), names=new Map([...data.members,...data.assignees ?? []].map(m=>[m.id,m.name]));
  const departments=new Map(data.departments.map(d=>[d.id,d.name])), help=new Map<string,string[]>();
  for (const h of source.help) { const list=help.get(h.requirementId) ?? []; list.push(h.description); help.set(h.requirementId,list); }
  const all: ReportPost[]=[];
  for (const chapter of managementChapters(data)) for (const post of chapter.posts) {
    const work=packages.get(post.assignmentId ?? ''), state=post.reviewState ?? (post.done?'completed':'in_progress');
    const lateDays=!post.done && post.dueDate && post.dueDate<today ? Math.round((Date.parse(today)-Date.parse(post.dueDate))/86400000) : 0;
    const actions: string[]=[];
    if (!post.done) {
      if (!work?.assigned_to) actions.push('Fordel til en ansvarlig');
      if (post.openHelp) actions.push(`Løs ${post.openHelp} åpne hjelpebehov`);
      if (state==='returned') actions.push('Rett opp og lever inn på nytt');
      if (state==='ready') actions.push('Gjennomfør granskning');
      if (lateDays>0) actions.push('Følg opp overskredet frist');
      else if (post.dueDate===today) actions.push('Frist i dag');
      else if (post.dueDate && Date.parse(post.dueDate)-Date.parse(today)<=7*86400000) actions.push('Frist innen 7 dager');
      if (!post.dueDate) actions.push('Avklar frist');
      if (!actions.length) actions.push('Følg opp planlagt arbeid');
    }
    all.push({id:post.id,number:post.number ?? '',title:post.title,chapterKey:chapter.key,chapter:chapter.title,
      departmentId:work?.department_id ?? 'none',department:work?.department_id ? departments.get(work.department_id) ?? 'Tidligere avdeling' : 'Ingen avdeling',
      personId:work?.assigned_to ?? 'none',person:work?.assigned_to ? names.get(work.assigned_to) ?? 'Tidligere ansvarlig' : 'Uten person',
      deadline:post.dueDate ?? '',state,status:state==='completed'?'Ferdig uten granskning':workReviewLabels[state],done:post.done,lateDays,openHelp:post.openHelp,help:help.get(post.id) ?? [],actions});
  }
  const option = (key:'chapterKey'|'departmentId'|'personId',label:'chapter'|'department'|'person') => [...new Map(all.map(row=>[row[key],{id:row[key],label:row[label]}])).values()];
  const options={chapters:option('chapterKey','chapter'),departments:option('departmentId','department'),people:option('personId','person')};
  let rows=all.filter(row=>(filters.chapter==='all'||row.chapterKey===filters.chapter) && (filters.department==='all'||row.departmentId===filters.department)
    && (filters.person==='all'||row.personId===filters.person) && statusMatches(row,filters.status));
  if (filters.kind!=='reviews') rows=rows.filter(row=>within(row.deadline,filters));
  if (filters.kind==='actions') rows=rows.filter(row=>!row.done).sort((a,b)=>b.lateDays-a.lateDays || Number(b.openHelp>0)-Number(a.openHelp>0) || (a.deadline||'9999').localeCompare(b.deadline||'9999') || a.number.localeCompare(b.number,'nb',{numeric:true}) || a.id.localeCompare(b.id));
  const byId=new Map(rows.map(row=>[row.id,row]));
  const events=source.reviews.filter(event=>byId.has(event.requirementId) && within(osloDate(new Date(event.createdAt)),filters))
    .map(event=>({...event,post:byId.get(event.requirementId)!})).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
  if (filters.kind==='reviews') { const ids=new Set(events.map(e=>e.requirementId)); rows=rows.filter(row=>ids.has(row.id)); }
  const selectedFilters:string[]=[];
  for (const [key,items,label] of [['chapter',options.chapters,'Kapittel'],['department',options.departments,'Avdeling'],['person',options.people,'Person']] as const) {
    if (filters[key]!=='all') selectedFilters.push(`${label}: ${items.find(item=>item.id===filters[key])?.label ?? 'Valgt verdi (ingen synlige poster)'}`);
  }
  if (filters.status!=='all') selectedFilters.push(`Nåværende status: ${reportStatuses[filters.status as keyof typeof reportStatuses]}`);
  if (filters.from||filters.to) selectedFilters.push(`${filters.kind==='reviews'?'Hendelsesdato':'Postfrist'}: ${filters.from||'ingen start'} – ${filters.to||'ingen slutt'}`);
  return {projectId:data.projectId,projectName:data.name,organizationName,generatedAt:source.generatedAt,today,title:reportTitles[filters.kind],filters,selectedFilters,
    scope:data.manager||data.reviewer?'Alle tilgjengelige poster i prosjektet':'Begrenset til postene du har tilgang til',reviewRequired:Boolean(data.settings?.review_required),reviewer:data.reviewerName ?? 'Ingen valgt',
    visibleTotal:all.length,rows,events,summary:summarizePosts(rows),options,
    groups:{chapters:grouped(rows,'chapterKey','chapter'),departments:grouped(rows,'departmentId','department'),people:grouped(rows,'personId','person')}};
}
export type ReportTable = { title: string; columns: string[]; widths: number[]; rows: (string|number)[][] };
export function reportTables(report: ProjectReport): ReportTable[] {
  if (report.filters.kind==='reviews') return [{title:'Granskningshistorikk',columns:['Tid (Oslo)','Post','Kapittel','Nåværende ansvarlig / avdeling','Hendelse','Utført av','Kommentar'],widths:[16,28,26,30,25,25,60],rows:report.events.map(e=>[reportTimestamp(e.createdAt),`${e.post.number}\n${e.post.title}`,e.post.chapter,`${e.post.person}\n${e.post.department}`,eventLabel(e.state),e.actor,e.note||'-'])}];
  const details:ReportTable={title:report.filters.kind==='actions'?'Frister og tiltak':'Poster',columns:['Post','Kapittel','Avdeling','Ansvarlig','Frist','Nåværende status','Dager over frist','Tiltak / åpne hjelpebehov'],widths:[28,25,22,24,16,24,13,55],rows:report.rows.map(p=>[`${p.number}\n${p.title}`,p.chapter,p.department,p.person,p.deadline||'Ingen frist',p.status,p.lateDays,[...p.actions,...p.help.map(h=>`Hjelp: ${h}`)].join('\n')||'-'])};
  if (report.filters.kind==='actions') return [details];
  return [...(['chapters','departments','people'] as const).map(key=>({title:{chapters:'Per kapittel',departments:'Per avdeling',people:'Per person'}[key],columns:['Gruppe','Poster','Ferdige','Til granskning','Godkjent','Sendt tilbake','Over frist','Uten person','Trenger hjelp'],widths:[48,12,12,17,12,17,13,15,17],rows:report.groups[key].map(g=>[g.label,g.total,g.done,g.ready,g.approved,g.returned,g.late,g.unassigned,g.help])})),details];
}
