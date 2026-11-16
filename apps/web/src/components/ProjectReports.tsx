'use client';

import Link from 'next/link';
import { useEffect,useState } from 'react';
import { defaultReportFilters,reportQuery,reportStatuses,reportTables,reportTimestamp,reportTitles,type ReportFilters,type ReportKind,type ReportResponse,type ReportTable } from '@/lib/project-reports';

const button='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const primary='rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50';
const field='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';

export function ProjectReports({projectId}:{projectId:string}) {
  const [filters,setFilters]=useState<ReportFilters>(defaultReportFilters),[refresh,setRefresh]=useState(0);
  const [loaded,setLoaded]=useState<{key:string;data?:ReportResponse;error?:string}>({key:''});
  const [downloading,setDownloading]=useState(''),[downloadError,setDownloadError]=useState(''),[downloadNotice,setDownloadNotice]=useState('');
  const query=reportQuery(filters),key=`${projectId}:${query}:${refresh}`,busy=loaded.key!==key;
  const data=loaded.data,report=data?.report;
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/projects/${projectId}/reports?${query}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error ?? 'Rapporten kunne ikke hentes.');return payload as ReportResponse;})
      .then(result=>{if(!controller.signal.aborted)setLoaded({key,data:result});})
      .catch(error=>{if(!controller.signal.aborted)setLoaded({key,error:error.message});});
    return ()=>controller.abort();
  },[projectId,query,key]);
  function change<K extends keyof ReportFilters>(name:K,value:ReportFilters[K]) {setFilters(current=>({...current,[name]:value}));setDownloadError('');setDownloadNotice('');}
  async function download(format:'pdf'|'xlsx') {
    if(!data||busy)return;setDownloading(format);setDownloadError('');setDownloadNotice('');
    try {
      const response=await fetch(`/api/projects/${projectId}/reports?${query}&format=${format}&version=${data.version}`,{cache:'no-store'});
      if(!response.ok){const error=await response.json();throw new Error(error.error ?? 'Eksporten kunne ikke opprettes.');}
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');
      anchor.href=url;anchor.download=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `scipx-rapport.${format}`;
      document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
      setDownloadNotice(`${format==='pdf'?'PDF':'Excel'} er lastet ned med det viste utvalget.`);
    }catch(error){setDownloadError(error instanceof Error?error.message:'Eksporten mislyktes.');}finally{setDownloading('');}
  }
  return <section className="mx-auto max-w-[1500px] space-y-6 text-slate-900" aria-label="Prosjektrapporter">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><Link href={`/projects/${projectId}/management`} className="text-sm text-teal-800 underline">Tilbake til kapitler og ansvar</Link><p className="mt-5 text-xs font-semibold uppercase tracking-wider text-teal-800">{report?.projectName ?? 'Prosjektstyring'}</p><h1 className="mt-2 text-3xl font-semibold">Rapporter</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Følg fremdrift, prioriter arbeidet og dokumenter granskningen. Forhåndsvis utvalget før du laster ned.</p></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||Boolean(downloading)} onClick={()=>{setRefresh(n=>n+1);setDownloadError('');setDownloadNotice('');}}>Oppdater rapport</button><button className={primary} disabled={busy||!report||Boolean(downloading)} onClick={()=>void download('pdf')}>{downloading==='pdf'?'Lager PDF …':'Last ned PDF'}</button><button className={button} disabled={busy||!report||Boolean(downloading)} onClick={()=>void download('xlsx')}>{downloading==='xlsx'?'Lager Excel …':'Last ned Excel'}</button></div>
    </header>
    <nav aria-label="Rapporttype" className="flex flex-wrap gap-2">{(Object.entries(reportTitles) as [ReportKind,string][]).map(([kind,title])=><button key={kind} aria-pressed={filters.kind===kind} className={filters.kind===kind?primary:button} disabled={Boolean(downloading)} onClick={()=>change('kind',kind)}>{title}</button>)}</nav>
    <fieldset className="rounded-xl border border-slate-200 bg-white p-5" disabled={Boolean(downloading)}><legend className="px-2 text-sm font-semibold">Avgrens rapporten</legend><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Kapittel<select className={field} value={filters.chapter} onChange={e=>change('chapter',e.target.value)}><option value="all">Alle kapitler</option>{report?.options.chapters.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="text-sm">Avdeling<select className={field} value={filters.department} onChange={e=>change('department',e.target.value)}><option value="all">Alle avdelinger</option>{report?.options.departments.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="text-sm">Ansvarlig person<select className={field} value={filters.person} onChange={e=>change('person',e.target.value)}><option value="all">Alle personer</option>{report?.options.people.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="text-sm">Nåværende status<select className={field} value={filters.status} onChange={e=>change('status',e.target.value)}>{Object.entries(reportStatuses).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-sm">{filters.kind==='reviews'?'Hendelser fra':'Postfrist fra'}<input type="date" className={field} value={filters.from} onChange={e=>change('from',e.target.value)}/></label>
      <label className="text-sm">{filters.kind==='reviews'?'Hendelser til':'Postfrist til'}<input type="date" className={field} value={filters.to} min={filters.from||undefined} onChange={e=>change('to',e.target.value)}/></label>
      <div className="flex items-end"><button className={button} onClick={()=>{setFilters({...defaultReportFilters,kind:filters.kind});setDownloadError('');setDownloadNotice('');}}>Nullstill filtre</button></div>
    </div><p className="mt-4 text-xs text-slate-500">{filters.kind==='reviews'?'Dato gjelder hendelsen. Person, avdeling og status gjelder nåværende fordeling.':'Dato gjelder den enkelte postens frist. Poster uten frist vises når datofeltene er tomme.'}</p></fieldset>
    {busy&&<p role="status" className="rounded-xl bg-slate-50 p-6 text-sm">Henter rapport …</p>}
    {!busy&&loaded.error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{loaded.error}</p>}
    {downloadError&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{downloadError}</p>}
    {downloadNotice&&<p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-900">{downloadNotice}</p>}
    {!busy&&report&&<>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600"><span>{report.scope} · {report.rows.length} av {report.visibleTotal} poster i utvalget</span><span>Hentet {reportTimestamp(report.generatedAt)} · Europe/Oslo</span></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[[report.summary.total,'Poster i utvalget'],[report.summary.done,'Ferdige'],[report.summary.ready,'Til granskning'],[report.summary.late,'Over fristen']].map(([value,label])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-3xl font-semibold">{value}</p><p className="mt-2 text-sm text-slate-600">{label}</p></div>)}</div>
      <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950"><strong>{report.title}.</strong> {filters.kind==='reviews'?`${report.events.length} hendelser i utvalget. Historikken inkluderer innlevering, godkjenning, tilbakeføring og gjenåpning. Et tidligere godkjenningsvedtak kan være tilbakekalt.`:filters.kind==='actions'?'Åpne poster sorteres med overskredne frister først. Hjelpebehov og foreslåtte tiltak vises ved hver post.':'Oversikt per kapittel, avdeling og person, med postene som ligger bak tallene. Antall poster angir ikke tidsbruk.'}<span className="mt-2 block text-xs">Arbeidsgranskning og teknisk produktkontroll er separate vurderinger. Alle tabellene i rapporten følger med i PDF og Excel.</span></div>
      <div className="space-y-5">{reportTables(report).map(table=><ReportPreview key={`${query}:${table.title}`} table={table}/>)}</div>
    </>}
  </section>;
}
function ReportPreview({table}:{table:ReportTable}) {
  const [page,setPage]=useState(0),pageSize=40,pages=Math.max(1,Math.ceil(table.rows.length/pageSize));
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-semibold">{table.title}</h2><span className="text-xs text-slate-500">{table.rows.length} rader</span></header>
    {!table.rows.length?<p className="p-8 text-center text-sm text-slate-600">Ingen rader passer utvalget. Endre filtrene for å se flere.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{table.columns.map(col=><th key={col} scope="col" className="px-4 py-3 font-semibold">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{table.rows.slice(page*pageSize,(page+1)*pageSize).map((row,index)=><tr key={index} className="align-top even:bg-slate-50/60">{row.map((value,col)=><td key={col} className="max-w-md whitespace-pre-wrap break-words px-4 py-3">{value}</td>)}</tr>)}</tbody></table></div>}
    {pages>1&&<footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm"><span>Side {page+1} av {pages}. Eksporten inneholder alle {table.rows.length} rader.</span><div className="flex gap-2"><button className={button} disabled={page===0} onClick={()=>setPage(n=>n-1)}>Forrige</button><button className={button} disabled={page===pages-1} onClick={()=>setPage(n=>n+1)}>Neste</button></div></footer>}
  </section>;
}
