'use client';

import { useEffect, useRef, useState } from 'react';
import type { AssignmentTarget } from '@/lib/direct-project-assignment';
import type { HierarchySnapshot } from '@/lib/project-management-hierarchy';
import { eligiblePeople, type UnifiedAssignmentChange } from '@/lib/unified-project-assignment';

const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
export type AssignmentSelection = { targets: AssignmentTarget[]; title: string; count: number };

export function UnifiedAssignmentDialog({ data, selection, busy, error, close, save }: {
  data: HierarchySnapshot; selection: AssignmentSelection; busy: boolean; error: string;
  close: () => void; save: (change: UnifiedAssignmentChange) => Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const target = selection.targets[0];
  const own = selection.targets.length === 1 ? data.assignments.find(work => work.scope_type === target.scope_type && work.scope_value === target.scope_value) : undefined;
  const prior = own && own.assignment_mode !== 'inherit' ? own : selection.targets.length === 1 && target.scope_type === 'post'
    ? data.assignments.find(work => work.id === data.posts.find(post => post.id === target.scope_value)?.assignmentId) : undefined;
  const departments = data.departments.filter(team => team.supervisorId && (data.manager || team.supervisorId === data.userId));
  const [department, setDepartment] = useState(prior?.department_id ?? (data.manager ? '' : departments[0]?.id ?? ''));
  const [person, setPerson] = useState(prior?.assigned_to ?? '');
  const [mode, setMode] = useState<UnifiedAssignmentChange['mode']>('explicit');
  const [replaceOverrides, setReplaceOverrides] = useState(false);
  const [setDeadline, setUpdateDeadline] = useState(false), [deadline, setDeadlineValue] = useState(prior?.due_date ?? '');
  const [search, setSearch] = useState('');
  const people = eligiblePeople(data, department || null);
  const validPerson = !person || people.some(item => item.id === person);
  const canSave = mode !== 'explicit' || Boolean((department || person) && validPerson && (data.manager || person));
  const chaptersOnly = selection.targets.every(item => item.scope_type === 'pdf_chapter');
  useEffect(() => {
    const previous = document.activeElement, dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="unified-assignment-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }} className="max-h-[90dvh] w-[min(540px,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40">
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault();
      if (canSave) void save({ targets: selection.targets, mode, department: mode === 'explicit' ? department || null : null,
        assignee: mode === 'explicit' ? person || null : null, replaceOverrides,
        setDeadline: mode === 'explicit' && setDeadline, deadline: mode === 'explicit' && setDeadline ? deadline || null : null });
    }}>
      <header className="flex items-start justify-between gap-3"><div><h2 id="unified-assignment-title" className="text-xl font-semibold">Fordel ansvar</h2><p className="mt-1 text-sm text-slate-600">{selection.title}</p><p className="mt-1 text-xs text-slate-500">{selection.count} poster i hele utvalget</p></div><button type="button" className={button} disabled={busy} onClick={close}>Lukk</button></header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {data.manager && <label className="block text-sm font-medium">Handling<select className={field} value={mode} disabled={busy} onChange={event => setMode(event.target.value as UnifiedAssignmentChange['mode'])}><option value="explicit">Tildel avdeling og / eller person</option><option value="unassigned">Fjern ansvar – stopp arv</option>{!chaptersOnly && <option value="inherit">Følg overordnet ansvar</option>}</select></label>}
      {mode === 'explicit' ? <>
        <label className="block text-sm font-medium">Avdeling<select className={field} value={department} disabled={busy} onChange={event => { setDepartment(event.target.value); setPerson(''); }}><option value="" disabled={!data.manager}>Ingen avdeling – direkte til person</option>{departments.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        {!departments.length && data.manager && <p className="text-xs text-slate-600">Aktiver avdelinger under «Avdelinger og prosjektfrist» i denne visningen, eller tildel direkte til en person.</p>}
        <label className="block text-sm font-medium">Søk etter person<input className={field} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Navn …" /></label>
        <label className="block text-sm font-medium">Ansvarlig person<select className={field} value={person} disabled={busy} onChange={event => setPerson(event.target.value)}><option value="">{department && data.manager ? 'Ikke valgt – legg i avdelingens kø' : 'Velg person'}</option>{people.filter(item => item.id === person || item.name.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'))).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!validPerson && <p role="alert" className="text-sm text-red-700">Tidligere ansvarlig er ikke tilgjengelig. Velg en aktiv person.</p>}
        {department && !person && data.manager && <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-950">Avdelingen får ansvaret. Arbeidslederen kan fordele postene videre til personer.</p>}
        {data.manager && chaptersOnly && <div className="space-y-2"><label className="flex items-start gap-2 text-sm"><input className="mt-1 accent-teal-800" type="checkbox" checked={setDeadline} disabled={busy} onChange={event => setUpdateDeadline(event.target.checked)} />Endre kapittelfrist samtidig</label>{setDeadline && <label className="block text-sm">Kapittelfrist<input className={field} type="date" value={deadline} disabled={busy} onChange={event => setDeadlineValue(event.target.value)} /><span className="mt-1 block text-xs text-slate-600">Gjelder nye tildelinger. Allerede tildelte postfrister beholdes. Tomt felt bruker prosjektfristen.</span></label>}</div>}
      </> : <p className="rounded-lg bg-slate-50 p-3 text-sm">{mode === 'inherit' ? 'Egen tildeling fjernes. Posten følger nærmeste hovedpost eller kapittel.' : 'Utvalget blir uten avdeling og person, selv om overordnet ansvar endres.'}</p>}
      {data.manager && selection.targets.some(item => item.scope_type !== 'post') && <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" checked={replaceOverrides} disabled={busy} onChange={event => setReplaceOverrides(event.target.checked)} className="mt-1 accent-teal-800" /><span>Endre også poster med egen tildeling<span className="mt-1 block text-xs text-slate-600">Egne unntak beholdes når dette ikke er valgt.</span></span></label>}
      <footer className="flex justify-end gap-2 border-t pt-4"><button type="button" className={button} disabled={busy} onClick={close}>Avbryt</button><button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50" disabled={busy || !canSave}>{busy ? 'Lagrer …' : 'Lagre tildeling'}</button></footer>
    </form>
  </dialog>;
}
