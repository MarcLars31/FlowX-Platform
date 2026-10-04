"use client";

import { Check, SquareMinus, SquarePlus } from "lucide-react";

import { productChapterHeading, type ProductChapterGroup } from "@/lib/product-post-groups";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { productRequirementResolution } from "@/lib/product-requirement-resolution";

type Row = Record<string, unknown> & { id: string };

export function ProductPostNavigation({ groups, activeRequirementId, expanded, handledIds, disabled, onToggle, onSelect }: {
  groups: ProductChapterGroup<Row>[];
  activeRequirementId?: string;
  expanded: ReadonlySet<string>;
  handledIds: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="product-post-sidebar" aria-label="Hovedposter og underposter">
      <div className="product-post-sidebar-heading">
        <h2>Hovedposter</h2><span>{groups.length}</span>
      </div>
      <nav aria-label="Velg post" className="product-post-groups">
        {groups.map((group, index) => {
          const open = expanded.has(group.key);
          const handled = group.requirements.filter(row => handledIds.has(row.id)).length;
          const regionId = `product-post-group-${index}`;
          const heading = productChapterHeading(group.title);
          const label = heading.chapter === "—" ? group.title : heading.chapter;

          return (
            <div key={group.key} className="product-post-group">
              <button type="button" className="product-post-group-toggle" aria-expanded={open} aria-controls={regionId}
                onClick={() => onToggle(group.key)}>
                {open ? <SquareMinus aria-hidden="true" /> : <SquarePlus aria-hidden="true" />}
                <span className="min-w-0"><strong>{label}</strong><small title={heading.description}>{heading.description}</small></span>
                <span className="product-post-count" aria-label={`${handled} av ${group.requirements.length} poster håndtert`}>{handled}/{group.requirements.length}</span>
              </button>
              <div id={regionId} hidden={!open} className="product-post-children">
                {group.requirements.map(requirement => {
                  const details = projectRequirementDetails(requirement);
                  const handled = handledIds.has(requirement.id);
                  const resolution = productRequirementResolution(requirement);
                  return (
                    <button key={requirement.id} type="button" className="product-post-link"
                      aria-current={activeRequirementId === requirement.id ? "true" : undefined}
                      title={String(requirement.value_text ?? "Teknisk produktkrav")} aria-controls="product-post-detail" disabled={disabled}
                      onClick={() => onSelect(requirement.id)}>
                      <span className="min-w-0">
                        <strong>{details.postNumber ?? "Uten postnummer"}</strong>
                        <small>{String(requirement.value_text ?? "Teknisk produktkrav")}</small>
                        {resolution && <small>{resolution.label}</small>}
                      </span>
                      {handled && <span className="product-post-check"><Check aria-hidden="true" /><span className="sr-only">{resolution ? "Håndtert" : "Produktvalg lagret"}</span></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
