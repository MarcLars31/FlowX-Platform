"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { productChapterHeading } from "@/lib/product-post-groups";
import { groupProductRequirementsByPdfChapter } from "@/lib/product-post-groups";
import { chapterAssignmentTarget, projectAssignmentIndex, type AssignmentTarget } from "@/lib/project-work-assignment";
import type { ProjectDeliveryResource } from "@/lib/project-delivery-resource";
import { PostAssignmentPicker } from "./PostAssignmentPicker";
import { flattenProductPostTree, type ProductPostNavigationGroup, type ProductPostNode } from "@/lib/product-post-tree";
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
  function renderPost(node: ProductPostNode<Row>) {
    const requirement = node.requirement;
    const details = projectRequirementDetails(requirement);
    const handled = handledIds.has(requirement.id);
    const resolution = productRequirementResolution(requirement);
    const label = details.postNumber ?? String(requirement.value_text ?? "Post uten nummer");
    const target: AssignmentTarget = { type: "post", value: requirement.id, label };
    const assignment = assignmentByRow.get(requirement.id);
    const hasChildren = node.children.length > 0;
    const expanded = expandedKeys.has(node.key);
    const childrenId = `product-post-children-${requirement.id}`;
    const status = <span className="product-post-list-status" data-handled={handled}>
      {handled && <Check aria-hidden="true" />}{resolution?.label ?? (handled ? "Produktvalg lagret" : "Åpen")}
    </span>;
    return <li key={node.key}>
      <div className={`product-post-assigned-row${hasChildren ? " product-post-parent-row" : ""}`}>
        {hasChildren ? <div className="product-post-parent-controls">
          <button id={`product-post-row-${requirement.id}`} type="button" className="product-post-parent-toggle"
            aria-current={activeRequirementId === requirement.id ? "true" : undefined}
            aria-expanded={expanded} aria-controls={childrenId} disabled={disabled} onClick={() => onToggle(node.key)}>
            <strong className="product-post-list-number">
              {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              <span>{details.postNumber ?? "Uten postnummer"}</span>
            </strong>
            <span className="product-post-list-description">
              <span>{String(requirement.value_text ?? "Teknisk produktkrav")}</span>
              <small className="product-post-branch-label">Hovedpost · {flattenProductPostTree(node.children).length} underposter</small>
            </span>
          </button>
          {status}
          <button type="button" className="product-post-open-parent" aria-label={`Åpne hovedpost ${label}`}
            aria-controls="product-post-detail" disabled={disabled} onClick={() => onSelect(requirement.id)}>
            Åpne <ChevronRight aria-hidden="true" />
          </button>
        </div> : <button id={`product-post-row-${requirement.id}`} type="button" className="product-post-list-row"
          aria-current={activeRequirementId === requirement.id ? "true" : undefined}
          aria-controls="product-post-detail" disabled={disabled} onClick={() => onSelect(requirement.id)}>
          <strong className="product-post-list-number">{details.postNumber ?? "Uten postnummer"}</strong>
          <span className="product-post-list-description">{String(requirement.value_text ?? "Teknisk produktkrav")}</span>
          {status}
          <ChevronRight aria-hidden="true" />
        </button>}
        {assignmentControl(target, assignment)}
      </div>
      {editor(target, assignment)}
      {hasChildren && <ol id={childrenId} className="product-post-children" aria-label={`Underposter til ${label}`} hidden={!expanded}>
        {expanded && node.children.map(renderPost)}
      </ol>}
    </li>;
  }

  return (
    <nav id="product-post-list" aria-label="Postliste" className="product-post-list">
      <header className="product-post-list-heading">
        <div><h2>Poster</h2><p>Utvid et kapittel og en hovedpost for å se underpostene.</p></div>
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
            {expanded && group.posts.map(renderPost)}
          </ol>
        </section>;
      })}
    </nav>
  );
}
