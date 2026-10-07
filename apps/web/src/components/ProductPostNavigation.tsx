"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { productChapterHeading } from "@/lib/product-post-groups";
import { groupProductRequirementsByPdfChapter } from "@/lib/product-post-groups";
import { chapterAssignmentTarget, projectAssignmentIndex, type AssignmentTarget } from "@/lib/project-work-assignment";
import type { ProjectDeliveryResource } from "@/lib/project-delivery-resource";
import { PostAssignmentPicker } from "./PostAssignmentPicker";
import type { ProductPostNavigationGroup } from "@/lib/product-post-tree";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { productRequirementResolution } from "@/lib/product-requirement-resolution";

type Row = Record<string, unknown> & { id: string };

export function ProductPostNavigation({ groups, requirements, projectId, resource, expandedKeys, onToggle, activeRequirementId, handledIds, disabled, onSelect }: {
  groups: ProductPostNavigationGroup<Row>[];
  requirements: Row[];
  projectId: string;
  resource: ProjectDeliveryResource;
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  activeRequirementId?: string;
  handledIds: ReadonlySet<string>;
  disabled: boolean;
  onSelect: (id: string) => boolean;
}) {
  const { data, error, refreshing } = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  const [editing, setEditing] = useState<AssignmentTarget | null>(null);
  useEffect(() => { if (!resource.getSnapshot().data) void resource.refresh(); }, [resource]);
  const assignmentByRow = useMemo(() => projectAssignmentIndex(requirements, data?.packages ?? []), [requirements, data]);
  const fullGroups = useMemo(() => new Map(groupProductRequirementsByPdfChapter(requirements).map(group => [group.key, group])), [requirements]);
  const currentAssignment = (target: AssignmentTarget) => data?.packages.find(item => item.scope_type === target.type && (item.scope_value === target.value
    || target.type === "pdf_chapter" && [...fullGroups.values()].some(group => group.requirements.some(row => row.id === target.value) && group.requirements.some(row => row.id === item.scope_value))));
  const owner = (id: string) => data?.members.find(member => member.user_id === id)?.label ?? "Tidligere deltaker";
  function assignmentControl(target: AssignmentTarget, inherited?: ReturnType<typeof currentAssignment>) {
    const current = currentAssignment(target);
    const assignment = current ?? inherited;
    return <div className="post-assignment-control">
      {data?.manager ? <button type="button" disabled={disabled || refreshing || Boolean(error)} aria-label={`Tildel ansvar: ${target.label}`}
        onClick={() => setEditing(editing?.value === target.value && editing.type === target.type ? null : target)}>
        <UserRound aria-hidden="true" /><span>{assignment ? owner(assignment.assigned_to) : "Tildel ansvar"}{!current && inherited && <small>Fra kapittel / gruppe</small>}</span>
      </button> : <span>{assignment ? owner(assignment.assigned_to) : data ? "Ikke tildelt" : "Laster ansvar…"}</span>}
    </div>;
  }
  function editor(target: AssignmentTarget, inherited?: ReturnType<typeof currentAssignment>) {
    return data?.manager && editing?.type === target.type && editing.value === target.value
      ? <PostAssignmentPicker key={`${target.type}:${target.value}`} projectId={projectId} target={target} current={currentAssignment(target)}
        inherited={inherited} data={data} resource={resource} onClose={() => setEditing(null)} /> : null;
  }
  return (
    <nav id="product-post-list" aria-label="Postliste" className="product-post-list">
      <header className="product-post-list-heading">
        <div><h2>Poster</h2><p>Åpne et kapittel, og velg en post for å åpne postkortet.</p></div>
        <span>{groups.reduce((total, group) => total + group.requirements.length, 0)} poster</span>
      </header>
      {error && <p role="alert" className="post-assignment-error">Ansvar kunne ikke hentes. <button type="button" disabled={refreshing} onClick={() => void resource.refresh()}>Prøv igjen</button></p>}
      <div className="product-post-list-columns" aria-hidden="true"><span>Postnummer</span><span>Beskrivelse</span><span>Status</span><span>Ansvarlig</span></div>
      {groups.map((group, index) => {
        const heading = productChapterHeading(group.title);
        const label = heading.chapter === "—" ? group.title : heading.chapter;
        const handled = group.requirements.filter(row => handledIds.has(row.id)).length;
        const expanded = expandedKeys.has(group.key);
        const target = chapterAssignmentTarget(fullGroups.get(group.key) ?? group);
        return <section key={group.key} aria-labelledby={`product-post-group-heading-${index}`} className="product-post-list-group">
          <header className="product-post-list-group-heading">
            <h3 id={`product-post-group-heading-${index}`}><button type="button" aria-expanded={expanded} aria-controls={`product-post-group-${index}`}
              onClick={() => onToggle(group.key)} disabled={disabled}>
              {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              <span><strong>{label}</strong>{heading.description && <span>{heading.description}</span>}</span>
              <small>{handled}/{group.requirements.length} håndtert</small>
            </button></h3>
            {assignmentControl(target)}
          </header>
          {editor(target)}
          <ol id={`product-post-group-${index}`} hidden={!expanded}>
            {expanded && group.requirements.map(requirement => {
              const details = projectRequirementDetails(requirement);
              const handled = handledIds.has(requirement.id);
              const resolution = productRequirementResolution(requirement);
              const target: AssignmentTarget = { type: "post", value: requirement.id, label: details.postNumber ?? String(requirement.value_text ?? "Post uten nummer") };
              const assignment = assignmentByRow.get(requirement.id);
              return <li key={requirement.id}>
                <div className="product-post-assigned-row">
                <button id={`product-post-row-${requirement.id}`} type="button" className="product-post-list-row"
                  aria-current={activeRequirementId === requirement.id ? "true" : undefined}
                  aria-controls="product-post-detail" disabled={disabled} onClick={() => onSelect(requirement.id)}>
                  <strong className="product-post-list-number">{details.postNumber ?? "Uten postnummer"}</strong>
                  <span className="product-post-list-description">{String(requirement.value_text ?? "Teknisk produktkrav")}</span>
                  <span className="product-post-list-status" data-handled={handled}>{handled && <Check aria-hidden="true" />}{resolution?.label ?? (handled ? "Produktvalg lagret" : "Åpen")}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
                {assignmentControl(target, assignment)}
                </div>
                {editor(target, assignment)}
              </li>;
            })}
          </ol>
        </section>;
      })}
    </nav>
  );
}
