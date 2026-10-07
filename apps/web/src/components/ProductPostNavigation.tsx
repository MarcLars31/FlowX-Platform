"use client";

import { Check, ChevronRight } from "lucide-react";
import { productChapterHeading } from "@/lib/product-post-groups";
import type { ProductPostNavigationGroup } from "@/lib/product-post-tree";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { productRequirementResolution } from "@/lib/product-requirement-resolution";

type Row = Record<string, unknown> & { id: string };

export function ProductPostNavigation({ groups, activeRequirementId, handledIds, disabled, onSelect }: {
  groups: ProductPostNavigationGroup<Row>[];
  activeRequirementId?: string;
  handledIds: ReadonlySet<string>;
  disabled: boolean;
  onSelect: (id: string) => boolean;
}) {
  return (
    <nav id="product-post-list" aria-label="Postliste" className="product-post-list">
      <header className="product-post-list-heading">
        <div><h2>Poster</h2><p>Velg en post for å åpne postkortet.</p></div>
        <span>{groups.reduce((total, group) => total + group.requirements.length, 0)} poster</span>
      </header>
      <div className="product-post-list-columns" aria-hidden="true"><span>Postnummer</span><span>Beskrivelse</span><span>Status</span><span /></div>
      {groups.map((group, index) => {
        const heading = productChapterHeading(group.title);
        const label = heading.chapter === "—" ? group.title : heading.chapter;
        const handled = group.requirements.filter(row => handledIds.has(row.id)).length;
        return <section key={group.key} aria-labelledby={`product-post-group-heading-${index}`} className="product-post-list-group">
          <header className="product-post-list-group-heading">
            <h3 id={`product-post-group-heading-${index}`}><strong>{label}</strong>{heading.description && <span>{heading.description}</span>}</h3>
            <span>{handled}/{group.requirements.length} håndtert</span>
          </header>
          <ol>
            {group.requirements.map(requirement => {
              const details = projectRequirementDetails(requirement);
              const handled = handledIds.has(requirement.id);
              const resolution = productRequirementResolution(requirement);
              return <li key={requirement.id}>
                <button id={`product-post-row-${requirement.id}`} type="button" className="product-post-list-row"
                  aria-current={activeRequirementId === requirement.id ? "true" : undefined}
                  aria-controls="product-post-detail" disabled={disabled} onClick={() => onSelect(requirement.id)}>
                  <strong className="product-post-list-number">{details.postNumber ?? "Uten postnummer"}</strong>
                  <span className="product-post-list-description">{String(requirement.value_text ?? "Teknisk produktkrav")}</span>
                  <span className="product-post-list-status" data-handled={handled}>{handled && <Check aria-hidden="true" />}{resolution?.label ?? (handled ? "Produktvalg lagret" : "Åpen")}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>;
            })}
          </ol>
        </section>;
      })}
    </nav>
  );
}
