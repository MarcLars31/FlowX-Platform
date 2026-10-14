import { FileText } from "lucide-react";
import { projectInformationBody, projectInformationParagraphs, type ProjectRequirementDetail } from "@/lib/project-requirement-details";
import type { ProjectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { structuredPostBlocks } from "@/lib/structured-post-layout";
import { orderedSpecificationAttributes } from "@/lib/project-specification-layout";

export function ProjectPostSpecification({ id, details, description, quantity, quantityText, sourcePdfHref, pdfArticleNumber, informationOnly = false }: {
  id: string;
  details: ProjectRequirementDetail;
  description: string;
  quantity: ProjectRequirementQuantity;
  quantityText?: string;
  sourcePdfHref?: string | null;
  pdfArticleNumber?: string | null;
  informationOnly?: boolean;
}) {
  const fields = orderedSpecificationAttributes(details);
  const blocks = structuredPostBlocks(details, description).filter(block => block.kind !== "quantity");
  const rs = quantity.unit === "RS";
  const amountLabel = rs ? "Rund sum" : quantityText?.match(/^(Antall|Antal|Lengde|Areal|Volum|Vekt|Tid)\b/i)?.[1] ?? "Mängd";
  const showQuantity = rs || quantity.quantity !== null || !["", "?"].includes(quantity.unit);
  // An unnumbered fragment often starts directly with a field, not a heading.
  const hasHeading = description && !fields.some(field => description.toLocaleLowerCase().startsWith(`${field.label.toLocaleLowerCase()}:`));
  const postLabel = details.postNumber ? `PDF-post ${details.postNumber}` : `PDF · sida ${details.sourcePage ?? "—"}`;
  return <div className="border border-neutral-300 bg-white text-sm leading-6 text-neutral-950">
    <div className="grid sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <h3 id={`pdf-specification-${id}`} className="border-b border-neutral-300 px-3 py-3 font-[700] sm:border-b-0 sm:border-r">
        {sourcePdfHref ? <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer"
          title={details.sourcePage ? `Öppna posten på sida ${details.sourcePage} i PDF` : "Öppna posten i PDF"}
          className="break-words underline decoration-neutral-400 underline-offset-4 hover:decoration-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
          {postLabel} <FileText className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
        </a> : postLabel}
      </h3>
      <div className="min-w-0 px-3 py-3">
        {details.nsCode && <p className="break-words font-[700]">{details.nsCode}</p>}
        {hasHeading && <p className="break-words font-[700] leading-5">{description}</p>}
        {showQuantity && <dl className="my-2 flex flex-wrap items-baseline gap-x-2">
          <dt className="font-[700]">{amountLabel}:</dt>
          <dd>{!rs && <>{quantity.quantity === null ? "Saknas" : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 3 }).format(quantity.quantity)} </>}{quantity.unit === "?" ? "—" : quantity.unit}</dd>
        </dl>}
        {informationOnly && details.sourceExcerpt ? <>
          <div className="mt-4 space-y-3 break-words leading-6">{projectInformationParagraphs(projectInformationBody(details, description)).map((paragraph, index) =>
            <p key={index} className={paragraph.kind === "page" ? "border-t border-neutral-200 pt-3 text-xs text-neutral-600" : paragraph.kind === "heading" ? "font-[700]" : paragraph.kind === "bullet" ? "pl-4 -indent-4" : undefined}><SpecificationText value={paragraph.text} /></p>
          )}</div>
          {details.attributes.filter(([key]) => key === "pdf-kommentar").map(([key, value]) => <dl key={key} className="mt-4"><SpecificationField label="PDF-kommentar" value={value} block /></dl>)}
        </> : <div className="mt-2 space-y-1">
          {blocks.map((block, index) => block.kind === "field"
            ? <dl key={index}><SpecificationField label={block.label} value={block.text} emphasizeHeadings block={block.text.includes("\n")} /></dl>
            : <p key={index} className={block.kind === "page" ? "!mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-600" : block.kind === "heading" ? "!mt-3 font-[700]" : block.kind === "bullet" ? "pl-4 -indent-4" : "break-words"}><SpecificationText value={block.text} /></p>)}
          {details.attributes.filter(([key]) => key === "pdf-kommentar").map(([key, value]) => <dl key={key} className="mt-4"><SpecificationField label="PDF-kommentar" value={value} block /></dl>)}
        </div>}
        {details.inheritedSpecification && <details open className="mt-4 border-t border-neutral-300 pt-3">
          <summary className="cursor-pointer font-[700]">Krav fra hovedpost{details.parentPostNumber ? " " + details.parentPostNumber : "er"}</summary>
          <div className="mt-2 whitespace-pre-wrap break-words leading-6"><SpecificationText value={details.inheritedSpecification} /></div>
        </details>}
        {(details.standardRefs.length > 0 || pdfArticleNumber) &&
          <dl className="mt-4 space-y-1 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
            {details.standardRefs.length > 0 && <SpecificationField label="Standarder" value={details.standardRefs.join(", ")} />}
            {pdfArticleNumber && <SpecificationField label="NRF-nummer i PDF" value={pdfArticleNumber} />}
          </dl>}
      </div>
    </div>
  </div>;
}

function SpecificationField({ label, value, block = false, emphasizeHeadings = false }: { label: string; value: string; block?: boolean; emphasizeHeadings?: boolean }) {
  return <div className="break-words"><dt className={`${block ? "block" : "inline"} font-[700]`}>{label}: </dt><dd className={`${block ? "block" : "inline"} whitespace-pre-wrap`}>{emphasizeHeadings ? <SpecificationText value={value} /> : value}</dd></div>;
}

/** Emphasize section titles and short labels without changing extracted text. */
function SpecificationText({ value }: { value: string }) {
  return value.split(/(\r?\n)/).map((line, index) => {
    const sectionHeading = /^\s*(?:[a-z]\)\s+\S.*|[-–—•]\s+[\p{L}\p{N}][^.!?:\r\n]{0,70})\s*$/iu.test(line);
    if (sectionHeading) return <strong key={index}>{line}</strong>;
    const label = line.match(/^(\s*(?:[\p{L}\p{N}][^\s:]*[ \t]+){0,3}[\p{L}\p{N}][^\s:]*[ \t]*:)(?=[ \t]|$)/u);
    return label ? <span key={index}><strong>{label[1]}</strong>{line.slice(label[1].length)}</span> : line;
  });
}
