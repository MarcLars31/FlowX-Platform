'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { managementChapters, type HierarchySnapshot, type HierarchyPost } from '@/lib/project-management-hierarchy';
import { formatProjectQuantity, projectRequirementQuantity } from '@/lib/project-requirement-quantity';
import type { AssignmentTarget, DirectAssignmentChange } from '@/lib/direct-project-assignment';

const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50';
const primary = 'rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50';
const keyOf = (target: AssignmentTarget) => `${target.scope_type}:${target.scope_value}`;
type Selection = { targets: AssignmentTarget[]; title: string; count: number };
type Props = { data: HierarchySnapshot; busy: boolean; error: string; notice: string; canUndo: boolean;
  onAssign: (change: DirectAssignmentChange) => Promise<boolean>; onUndo: () => void;
  onFollowUp: () => void; onReload: () => void; onOpenPost: (id: string) => void };

export function SimpleProjectAssignmentBoard({ data, busy, error, notice, canUndo, onAssign, onUndo, onFollowUp, onReload, onOpenPost }: Props) {
  const chapters = useMemo(() => managementChapters(data), [data]);
  const [search, setSearch] = useState(''), [person, setPerson] = useState('all');
  const [selected, setSelected] = useState<AssignmentTarget[]>([]), [picker, setPicker] = useState<Selection | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const assignments = new Map(data.assignments.map(item => [item.id, item]));
  const names = new Map([...data.members, ...(data.assignees ?? [])].map(item => [item.id, item.name]));
  const owner = (post: HierarchyPost) => assignments.get(post.assignmentId ?? '')?.assigned_to ?? null;
  const assigned = data.posts.filter(post => owner(post)).length;
  const visible = chapters.map(chapter => ({ ...chapter, shown: chapter.posts.filter(post => {
    const match = `${chapter.title} ${post.number ?? ''} ${post.title}`.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'));
    return match && (person === 'all' || (person === 'none' ? !owner(post) : owner(post) === person));
  }) })).filter(chapter => chapter.shown.length);
  const selectedKeys = new Set(selected.map(keyOf));
  const selectedPosts = new Set<string>();
  for (const target of selected) {
    if (target.scope_type === 'post') selectedPosts.add(target.scope_value);
    else chapters.find(chapter => chapter.scope === target.scope_type && chapter.anchor === target.scope_value)?.posts.forEach(post => selectedPosts.add(post.id));
  }
  function toggle(target: AssignmentTarget) { setSelected(items => items.some(item => keyOf(item) === keyOf(target)) ? items.filter(item => keyOf(item) !== keyOf(target)) : [...items, target]); }
  function quantity(post: HierarchyPost) {
    const value = post.measurement ?? {}, columns = value.pdfColumnValues;
    const measurement = columns && typeof columns === 'object' && typeof (columns as Record<string, unknown>).quantity === 'string' && typeof (columns as Record<string, unknown>).unit === 'string' ? columns : value;
    const amount = projectRequirementQuantity(measurement);
    return amount.quantity === null ? amount.unit === 'RS' ? 'RS' : 'Mengde mangler' : formatProjectQuantity(amount);
  }
  return <section className="space-y-5 p-4 text-slate-900 lg:p-6" aria-label="Fordel arbeidet">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Prosjektstyring · {data.name}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Fordel arbeidet</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Tildel et helt kapittel eller en enkelt post. Velg ansvarlig, så lagres tildelingen med en gang.</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={onReload}>Oppdater</button><button className={button} disabled={busy} onClick={onFollowUp}>Oppfølging og frister</button></div></header>
    <div className="grid grid-cols-3 gap-3"><Stat label="Poster totalt" value={data.posts.length} /><Stat label="Tildelt" value={assigned} /><Stat label="Uten ansvarlig" value={data.posts.length-assigned} /></div>
    <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm leading-6 text-teal-950">Poster følger kapittelets ansvarlige. Poster med egen tildeling beholder denne når du endrer kapittelet.</div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button className="font-semibold underline" disabled={busy} onClick={onReload}>Oppdater visningen</button></p>}
    {(notice || canUndo) && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-50 px-4 py-3"><p role="status" className="text-sm text-teal-900">{notice}</p>{canUndo && <button className={button} disabled={busy} onClick={onUndo}>Angre siste tildeling</button>}</div>}
    <div className="flex flex-wrap gap-3"><label className="min-w-48 flex-1 text-xs font-medium text-slate-600">Søk i kapitler og poster<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Søk etter nummer eller tekst …" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="text-xs font-medium text-slate-600">Ansvarlig<select value={person} onChange={event => setPerson(event.target.value)} className="mt-1 block max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="all">Alle ansvarlige</option><option value="none">Uten ansvarlig</option>{[...names].map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
    {selected.length > 0 && <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-800 bg-teal-900 p-3 text-white shadow-lg"><p className="text-sm"><strong>{selectedPosts.size} poster</strong> i utvalget{selected.length > 500 && ' · Velg maks. 500 tildelinger om gangen'}</p><div className="flex gap-2"><button className="px-3 py-2 text-sm underline" disabled={busy} onClick={() => setSelected([])}>Fjern markering</button><button className={button} disabled={busy || selected.length > 500} onClick={() => setPicker({targets:selected,title:'Tildel valgte kapitler og poster',count:selectedPosts.size})}>Tildel valgte</button></div></div>}
    <div className="space-y-3">{visible.map((chapter,index) => {
      const target: AssignmentTarget = {scope_type:chapter.scope,scope_value:chapter.anchor};
      const open = expanded[chapter.key] ?? (index === 0 || Boolean(search));
      const work = chapter.assignment?.assignment_mode === 'inherit' ? undefined : chapter.assignment;
      const chapterOwner = work?.assigned_to ? names.get(work.assigned_to) ?? 'Tidligere ansvarlig' : 'Tildel';
      const overridden = chapter.posts.filter(post => { const item=assignments.get(post.assignmentId ?? ''); return item && item.id !== work?.id && ['post','main_post'].includes(item.scope_type); }).length;
      const countAssigned = chapter.posts.filter(post => owner(post)).length;
      return <article key={chapter.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 bg-slate-50/80 p-4">
          <input type="checkbox" className="size-4 accent-teal-800" checked={selectedKeys.has(keyOf(target))} disabled={busy || chapter.review && chapter.scope !== 'post'} onChange={() => toggle(target)} aria-label={`Velg hele ${chapter.title}, ${chapter.posts.length} poster`} />
          <button data-variant="ghost" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded(value => ({...value,[chapter.key]:!open}))} aria-expanded={open} aria-controls={`assignment-chapter-${chapter.anchor}`}><span aria-hidden="true" className="text-slate-500">{open ? '▾' : '▸'}</span><span className="min-w-0"><span className="block break-words text-sm font-semibold">{chapter.title}</span><span className="mt-1 block text-xs text-slate-500">{chapter.posts.length} poster · {countAssigned} tildelt{overridden > 0 && ` · ${overridden} med egen tildeling`}{chapter.shown.length !== chapter.posts.length && ` · ${chapter.shown.length} vist`}</span></span></button>
          <button data-variant={work?.assigned_to ? undefined : "primary"} className={work?.assigned_to ? `${button} !border-teal-200 !bg-teal-50 !text-teal-900` : primary} disabled={busy || chapter.review && chapter.scope !== 'post'} aria-label={`Tildel ${chapter.title}`} onClick={() => setPicker({targets:[target],title:chapter.title,count:chapter.posts.length})}>{chapterOwner} <span aria-hidden="true">⌄</span></button>
        </div>
        {open && <div id={`assignment-chapter-${chapter.anchor}`} className="divide-y divide-slate-100 border-t border-slate-200">{chapter.shown.map(post => {
          const item = assignments.get(post.assignmentId ?? ''), own = item?.scope_type === 'post' && item.assignment_mode !== 'inherit';
          const assignee = owner(post), postTarget: AssignmentTarget = {scope_type:'post',scope_value:post.id};
          return <div key={post.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:pl-10">
            <input className="size-4 accent-teal-800" type="checkbox" checked={selectedKeys.has(keyOf(postTarget))} disabled={busy} onChange={() => toggle(postTarget)} aria-label={`Velg post ${post.number ?? post.title}`} />
            <div className="min-w-0"><button data-appearance="text" className="text-left text-sm font-medium text-slate-900 hover:text-teal-800 hover:underline" onClick={() => onOpenPost(post.id)}><span className="mr-2 text-xs text-slate-500">{post.number}</span>{post.title || 'Post uten tittel'}</button><p className="mt-1 text-xs text-slate-500">{quantity(post)}{post.done && ' · Ferdig'}{post.openHelp > 0 && ` · ${post.openHelp} hjelpebehov`}{post.hierarchyReview && ' · Kontroller hovedpostkoblingen'}</p></div>
            <div className="col-start-2 min-w-0 sm:col-start-auto sm:text-right"><button className={`${button} max-w-full ${assignee ? '!border-teal-200 !bg-teal-50 !text-teal-900' : ''}`} disabled={busy} aria-label={`Tildel post ${post.number ?? post.title}`} onClick={() => setPicker({targets:[postTarget],title:`${post.number ?? 'Post'} · ${post.title}`,count:1})}>{assignee ? names.get(assignee) ?? 'Tidligere ansvarlig' : 'Tildel'} <span aria-hidden="true">⌄</span></button><p className="mt-1 text-[11px] text-slate-500">{own ? item?.assignment_mode === 'unassigned' ? 'Uten ansvarlig · eget unntak' : 'Egen tildeling' : item ? item.scope_type === 'main_post' ? 'Følger hovedposten' : 'Følger kapittelet' : 'Ingen ansvarlig ennå'}</p></div>
          </div>;
        })}</div>}
      </article>;
    })}</div>
    {!visible.length && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">{data.posts.length ? 'Ingen poster passer søket eller filteret.' : 'Ingen produktposter å tildele ennå. Last opp og behandle beskrivelsen først.'}</div>}
    {picker && <PersonPicker key={picker.targets.map(keyOf).join()} selection={picker} people={data.assignees ?? []} busy={busy} error={error} close={() => setPicker(null)} save={async change => { const ok=await onAssign(change); if(ok){setPicker(null);setSelected([]);} return ok; }} />}
  </section>;
}
function Stat({label,value}:{label:string;value:number}) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-2xl font-semibold tracking-tight text-teal-950">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>; }

function PersonPicker({selection,people,busy,error,close,save}:{selection:Selection;people:{id:string;name:string}[];busy:boolean;error:string;close:()=>void;save:(change:DirectAssignmentChange)=>Promise<boolean>}) {
  const ref=useRef<HTMLDialogElement>(null), [search,setSearch]=useState(''), [replace,setReplace]=useState(false);
  const chapter=selection.targets.some(target=>target.scope_type!=='post');
  useEffect(()=>{ const previous=document.activeElement, dialog=ref.current; dialog?.showModal(); dialog?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); return()=>{dialog?.close();if(previous instanceof HTMLElement)previous.focus();}; },[]);
  const choose=(assignee:string|null,mode:DirectAssignmentChange['mode'])=>void save({targets:selection.targets,assignee,mode,replaceOverrides:replace});
  return <dialog ref={ref} aria-labelledby="assignment-person-title" onCancel={event=>{event.preventDefault();if(!busy)close();}} className="max-h-[85dvh] w-[min(440px,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40">
    <div className="flex items-start justify-between gap-3"><div><h2 id="assignment-person-title" className="text-lg font-semibold">Velg ansvarlig</h2><p className="mt-1 break-words text-sm text-slate-600">{selection.title}</p><p className="mt-1 text-xs text-slate-500">{selection.count} {selection.count===1?'post':'poster'}{chapter?' i hele utvalget':''} · Lagres når du velger</p></div><button className={button} disabled={busy} onClick={close} aria-label="Lukk valg av ansvarlig">✕</button></div>
    {chapter && <label className="my-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)} disabled={busy} className="mt-1 accent-teal-800" /><span>Endre også poster med egen tildeling<span className="mt-1 block text-xs text-slate-500">Når avkrysset følger disse kapittelets nye ansvarlige.</span></span></label>}
    {error && <p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <label className="mt-4 block text-xs text-slate-600">Søk etter person<input autoFocus type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Navn …" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
    <div className="my-3 space-y-1">{people.filter(person=>person.name.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'))).map(person=><button key={person.id} data-variant="ghost" disabled={busy} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-teal-50 focus-visible:bg-teal-50 disabled:opacity-50" onClick={()=>choose(person.id,'explicit')}><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs text-teal-900">{person.name.slice(0,2).toLocaleUpperCase('nb')}</span><span className="break-words">{person.name}</span></button>)}
      {!people.length && <p className="py-3 text-sm text-slate-500">Ingen aktive brukere med redigeringstilgang er tilgjengelige i organisasjonen.</p>}
      {people.length>0 && !people.some(person=>person.name.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'))) && <p className="py-3 text-sm text-slate-500">Ingen personer passer søket.</p>}
    </div>
    <div className="space-y-1 border-t border-slate-200 pt-2"><button disabled={busy} className="w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50" onClick={()=>choose(null,'unassigned')}>Ingen ansvarlig<span className="mt-1 block text-xs text-slate-500">Fjern ansvarlig for utvalget.</span></button>{!chapter && <button disabled={busy} className="w-full rounded-lg px-3 py-3 text-left text-sm text-teal-800 hover:bg-teal-50 disabled:opacity-50" onClick={()=>choose(null,'inherit')}>Følg kapittelet<span className="mt-1 block text-xs text-slate-500">Fjern egen tildeling og følg hovedposten eller kapittelet.</span></button>}</div>
    {busy && <p role="status" className="mt-3 text-sm text-teal-800">Lagrer tildelingen …</p>}
  </dialog>;
}
