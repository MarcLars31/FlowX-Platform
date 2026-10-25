"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { HierarchySelection, HierarchySnapshot } from "@/lib/project-management-hierarchy";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50";
export function HierarchyAssignmentDialog({data,selection,busy,error,close,save}: {
  data: HierarchySnapshot; selection: HierarchySelection; busy:boolean; error:string; close:()=>void; save:(body:unknown)=>Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;element?.showModal();return ()=>element?.close();},[]);
  const first=data.posts.find(post=>selection.ids.includes(post.id) || selection.type==='main_post' && selection.ids.includes(post.mainPost?.id ?? ''));
  const existing=data.assignments.find(w=>w.scope_type===selection.type && selection.ids.includes(w.scope_value));
  const current=data.assignments.find(w=>w.id===first?.assignmentId);
  const [mode,setMode]=useState('explicit'),[department,setDepartment]=useState(existing?.department_id ?? current?.department_id ?? ''),[person,setPerson]=useState('');
  const available=data.departments.filter(d=>d.supervisorId && (data.manager || d.supervisorId===data.userId));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=new FormData(event.currentTarget);
    await save({action:'assign',changes:[...new Set(selection.ids)].map(scope_value=>{
      const prior=data.assignments.find(w=>w.scope_type===selection.type && w.scope_value===scope_value);
      return {scope_type:selection.type,scope_value,revision:prior?.revision ?? -1,
        assignment_mode:mode==='deadline'?'explicit':mode,operation:mode==='deadline'?'deadline':'assign',
        department_id:['inherit','unassigned'].includes(mode)?null:department,assigned_to:person,
        ...(data.manager?{due_date:selection.type==='pdf_chapter'?form.get('deadline') || null:prior?.due_date ?? null}:{})};
    })});
  }
  return <dialog ref={dialog} aria-label={selection.label} onCancel={event=>{event.preventDefault();if(!busy)close();}} className="w-[min(760px,calc(100vw-3rem))] max-w-none rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
    <div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-xl font-semibold">{selection.label}</h2><button autoFocus disabled={busy} className={button} onClick={close}>Lukk</button></div>
    <form className="space-y-4" onSubmit={submit}>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <p className="text-sm text-slate-600">{selection.type==='post'?'Valgte produktposter får et eget unntak. Arvet ansvar følger hovedposten og deretter kapittelet.':'Tildelingen arves av underliggende poster. Egne unntak på hovedposter og produktposter beholdes.'}</p>
      {data.manager && <label className="block text-sm">Handling<select className={`${field} mt-1`} value={mode} onChange={event=>setMode(event.target.value)}>
        <option value="explicit">Tildel til avdeling</option><option value="unassigned">Ikke tildelt – stopp arv</option><option value="inherit">Gå tilbake til arvet ansvar</option>
        {existing && selection.type==='pdf_chapter' && existing.assignment_mode!=='unassigned' && existing.assignment_mode!=='inherit' && <option value="deadline">Endre bare fristen, behold ansvarlig</option>}
      </select></label>}
      {!['inherit','unassigned'].includes(mode) && <>
        <label className="block text-sm">Avdeling<select required disabled={mode==='deadline'} className={`${field} mt-1`} value={department} onChange={event=>{setDepartment(event.target.value);setPerson('');}}><option value="">Velg avdeling</option>{available.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        {data.manager?<p className="text-sm">Arbeidsleder: {data.members.find(m=>m.id===available.find(d=>d.id===department)?.supervisorId)?.name ?? 'Ikke tildelt'}</p>:<label className="block text-sm">Medarbeider<select required className={`${field} mt-1`} value={person} onChange={event=>setPerson(event.target.value)}><option value="">Velg medarbeider</option>{data.members.filter(m=>m.departmentId===department).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        {data.manager && selection.type==='pdf_chapter' && <label className="block text-sm">Kapittelets frist<input className={`${field} mt-1`} type="date" name="deadline" defaultValue={existing?.due_date ?? ''}/></label>}
      </>}
      {mode==='unassigned' && <p className="text-sm">Postene forblir uten avdeling selv om overordnet ansvar endres. Underliggende egne unntak beholdes.</p>}
      {mode==='inherit' && <p className="text-sm">Eget ansvar fjernes. Nærmeste tildelte hovedpost eller kapittel bestemmer ansvaret. Underliggende egne unntak beholdes.</p>}
      <button className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">{busy?'Lagrer …':'Lagre tildeling'}</button>
    </form>
  </dialog>;
}
