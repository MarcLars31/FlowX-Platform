"use client";

import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { projectRequirementQuantity } from "@/lib/project-requirement-quantity";
import type { ProductPostSelectionGroup } from "@/lib/product-post-selection";

export function ProductPostRequirements({ group, activeRequirementId, disabled, onSelect }: {
  group: ProductPostSelectionGroup;
  activeRequirementId: string;
  disabled: boolean;
  onSelect: (id: string) => boolean;
}) {
  return <div className="border border-neutral-300 bg-white text-sm font-normal text-neutral-950">
    <div className="border-b border-neutral-200 p-3"><h3>Hovedpost {group.postNumber}</h3><p className="mt-1 whitespace-pre-wrap">{group.description}</p></div>
    <div className="product-requirement-table-scroll">
      <table aria-label={`Underposter til ${group.postNumber}`}>
        <thead><tr className="border-b border-neutral-200"><th className="p-3 font-normal">Velg</th><th className="p-3 font-normal">Postnummer</th><th className="p-3 font-normal">Beskrivelse</th><th className="p-3 font-normal">Enh.</th><th className="p-3 font-normal">Antall</th></tr></thead>
        <tbody>{group.requirements.map(row => {
          const details = projectRequirementDetails(row), quantity = projectRequirementQuantity(row.value_json);
          const active = row.id === activeRequirementId;
          return <tr key={row.id} aria-selected={active} className={active ? "border-b border-neutral-200 bg-neutral-100" : "border-b border-neutral-200"}>
            <td className="p-3"><input type="checkbox" checked={active} disabled={disabled} aria-label={`Velg post ${details.postNumber ?? row.id}`} onChange={() => onSelect(row.id)} /></td>
            <td className="p-3"><button type="button" className="text-left underline underline-offset-2" disabled={disabled} onClick={() => onSelect(row.id)}>{details.postNumber ?? "—"}</button></td>
            <td className="p-3">{String(row.value_text ?? row.display_name ?? "Produktpost")}</td>
            <td className="p-3">{details.pdfColumnValues?.unit ?? (quantity.unit === "?" ? "" : quantity.unit)}</td>
            <td className="p-3">{quantity.quantity === null ? (quantity.unit === "RS" ? "RS" : "") : new Intl.NumberFormat("nb-NO").format(quantity.quantity)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
