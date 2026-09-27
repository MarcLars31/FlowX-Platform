import { FileText } from "lucide-react";
import { projectRequirementSystemLabel, type ProjectRequirementDetail } from "@/lib/project-requirement-details";
import type { ProjectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { orderedSpecificationAttributes } from "@/lib/project-specification-layout";

export function ProjectPostSpecification({ id, details, description, quantity, quantityText, sourcePdfHref, pdfArticleNumber }: {
  id: string;
  details: ProjectRequirementDetail;
  description: string;
  quantity: ProjectRequirementQuantity;
  quantityText?: string;
  sourcePdfHref?: string | null;
  pdfArticleNumber?: string | null;
}) {
  const fields = orderedSpecificationAttributes(details);
  const rs = quantity.unit === "RS";
  const amountLabel = rs ? "Rund sum" : quantityText?.match(/^(Antall|Antal|Lengde|Areal|Volum|Vekt|Tid)\b/i)?.[1] ?? "Mängd";
  const showQuantity = rs || quantity.quantity !== null || !["", "?"].includes(quantity.unit);
  // An unnumbered fragment often starts directly with a field, not a heading.
  const hasHeading = description && !fields.some(field => description.toLocaleLowerCase().startsWith(`${field.label.toLocaleLowerCase()}:`));
  const postLabel = details.postNumber ? `PDF-post ${details.postNumber}` : `PDF · sida ${details.sourcePage ?? "—"}`;
  return <div className="border border-neutral-300 bg-white text-sm leading-6 text-neutral-950">
    <div className="grid sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <h3 id={`pdf-specification-${id}`} className="border-b border-neutral-300 px-3 py-3 font-bold sm:border-b-0 sm:border-r">
        {sourcePdfHref ? <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer"
          title={details.sourcePage ? `Öppna posten på sida ${details.sourcePage} i PDF` : "Öppna posten i PDF"}
          className="break-words underline decoration-neutral-400 underline-offset-4 hover:decoration-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
          {postLabel} <FileText className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
        </a> : postLabel}
      </h3>
      <div className="min-w-0 px-3 py-3">
        {details.nsCode && <p className="break-words font-bold">{details.nsCode}</p>}
        {hasHeading && <p className="break-words font-bold leading-5">{description}</p>}
        {showQuantity && <dl className="my-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4">
          <dt>{amountLabel}</dt>
          <dd><span className="sr-only">Enhet: </span>{quantity.unit === "?" ? "—" : quantity.unit}</dd>
          {!rs && <dd><span className="sr-only">Mängd: </span>{quantity.quantity === null ? "Saknas" : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 3 }).format(quantity.quantity)}</dd>}
        </dl>}
        <dl className="mt-2 space-y-1">
          {fields.map(field => <SpecificationField key={field.key} label={field.label} value={field.value} strong={/^materiale\b/i.test(field.label)} />)}
          {details.additionalRequirements && <SpecificationField label="Andra krav" value={details.additionalRequirements} block={details.additionalRequirements.includes("\n")} />}
        </dl>
        {(details.chapterPost || details.parentPostNumber || details.system || details.standardRefs.length > 0 || pdfArticleNumber) &&
          <dl className="mt-4 space-y-1 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
            {details.chapterPost && <SpecificationField label="Kapitelpost" value={details.chapterPost} />}
            {details.parentPostNumber && <SpecificationField label="Huvudpost" value={details.parentPostNumber} />}
            {details.system && <SpecificationField label="System" value={projectRequirementSystemLabel(details.system)} />}
            {details.standardRefs.length > 0 && <SpecificationField label="Standarder" value={details.standardRefs.join(", ")} />}
            {pdfArticleNumber && <SpecificationField label="NRF-nummer i PDF" value={pdfArticleNumber} />}
          </dl>}
      </div>
    </div>
  </div>;
}

function SpecificationField({ label, value, strong = false, block = false }: { label: string; value: string; strong?: boolean; block?: boolean }) {
  return <div className="break-words"><dt className={`${block ? "block" : "inline"} ${strong ? "font-bold" : "italic"}`}>{label}: </dt><dd className={`${block ? "block" : "inline"} whitespace-pre-wrap`}>{value}</dd></div>;
}
