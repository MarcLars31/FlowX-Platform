"use client";

import { Check, Minus, AlertCircle } from "lucide-react";
import type { MainPostGroup } from "@/lib/project-post-hierarchy";
import type { ChapterSource } from "@/lib/project-chapter-workspace";
import type { ProductPostCardStatus } from "@/lib/product-post-card";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";

type Row = Record<string, unknown> & { id: string };
const labels: Record<ProductPostCardStatus, string> = { empty: "Mangler produkter", review: "Til gjennomgang", approved: "Godkjent", excluded: "Ikke i sortiment" };
export function ProductPostGroupPanel({ group, source, rows, statuses, activeId, seriesOpen, disabled, onSelect, onSearchSeries }: {
  group: MainPostGroup; source?: ChapterSource; rows: Row[]; statuses: ReadonlyMap<string, ProductPostCardStatus>;
  activeId: string; seriesOpen: boolean; disabled: boolean; onSelect: (id: string) => void; onSearchSeries: () => void;
}) {
  return <div className="product-main-post">
    <header><p>Hovedpost {group.number}</p><h3>{group.title}</h3></header>
    {source?.text && <section aria-label="Felles krav fra hovedposten" className="product-main-post-requirements"><h4>Felles krav</h4><p>{source.text}</p></section>}
    <div className="product-underpost-heading"><h4>Underposter <span>({rows.length})</span></h4>
      <button type="button" disabled={disabled} aria-pressed={seriesOpen} onClick={onSearchSeries}>Søk produktserie</button></div>
    <nav aria-label={`Underposter til ${group.number}`}><ol className="product-underpost-list">{rows.map(row => {
      const status = statuses.get(row.id) ?? "empty";
      return <li key={row.id} data-active={!seriesOpen && row.id === activeId}>
        <span className={`product-underpost-status product-underpost-status-${status}`} aria-hidden="true">
          {status === "approved" ? <Check /> : status === "review" ? <AlertCircle /> : <Minus />}
        </span>
        <button type="button" disabled={disabled} aria-current={!seriesOpen && row.id === activeId ? "true" : undefined} aria-controls="product-post-candidate-panel" onClick={() => onSelect(row.id)}>
          <span><strong>{projectRequirementDetails(row).postNumber ?? "Post uten nummer"}</strong> {String(row.value_text ?? row.display_name ?? "Produktpost")}</span>
          <small>{labels[status]} · {formatProjectQuantity(projectRequirementQuantity(row.value_json))}</small>
        </button>
      </li>;
    })}</ol></nav>
    <p className="product-underpost-legend">Rutene viser status. Åpne en underpost for å velge produkter og godkjenne.</p>
  </div>;
}
