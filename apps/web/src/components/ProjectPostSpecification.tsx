import { FileText } from "lucide-react";
import { projectRequirementSystemLabel, type ProjectRequirementDetail } from "@/lib/project-requirement-details";
import type { ProjectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { structuredPostBlocks, type SpecificationBlock } from "@/lib/structured-post-layout";
import { normalizeQuantityUnit } from "@/lib/quantity-value";

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
  const blocks = structuredPostBlocks(details, description);
  const showQuantity = quantity.unit === "RS" || quantity.quantity !== null || !["", "?"].includes(quantity.unit);
  if (showQuantity && !blocks.some(block => block.kind === "quantity")) {
    blocks.unshift({ kind: "quantity", text: quantityText || (quantity.unit === "RS" ? "Rund sum" : "Mengde") });
  }
  const hasHeading = description && !blocks.some(block => block.kind === "field" && description.toLocaleLowerCase().startsWith(`${block.label.toLocaleLowerCase()}:`));
  const amount = quantity.quantity === null ? "—" : new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 }).format(quantity.quantity);
  const comments = details.attributes.filter(([key]) => key === "pdf-kommentar");
  const hasMetadata = details.chapterPost || details.parentPostNumber || details.system || details.standardRefs.length || pdfArticleNumber || comments.length;
  return <div className="post-specification">
    <div className="post-specification-scroll" role="region" aria-label={`Strukturerte krav ${details.postNumber ?? "informasjon"}`} tabIndex={0}>
      <table className="post-specification-table">
        <caption className="sr-only" id={`pdf-specification-${id}`}>{informationOnly ? "Prosjektinformasjon" : "Krav fra PDF"} {details.postNumber}</caption>
        <colgroup><col className="post-specification-number" /><col /><col className="post-specification-unit" /><col className="post-specification-amount" /></colgroup>
        <thead><tr><th scope="col">Postnr.</th><th scope="col">NS 3420 kode/Spesifikasjon</th><th scope="col">Enh.</th><th scope="col">Mengde</th></tr></thead>
        <tbody>
          <tr>
            <th scope="rowgroup" rowSpan={blocks.length + 1} className="post-specification-post">{details.postNumber ?? "—"}</th>
            <td className="post-specification-title">{details.nsCode && <p>{details.nsCode}</p>}{hasHeading && <p>{description}</p>}</td>
            <td /><td />
          </tr>
          {blocks.map((block, index) => <tr key={index}>
            <td><SpecificationBlockContent block={block} /></td>
            <td className="post-specification-unit-value">{block.kind === "quantity" && sourceQuantityUnit(block.text, quantity.unit)}</td>
            <td className="post-specification-amount-value">{block.kind === "quantity" && amount}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="post-specification-source">
      {sourcePdfHref ? <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer"><FileText aria-hidden="true" />Åpne original PDF{details.sourcePage ? ` · side ${details.sourcePage}` : ""}</a> : details.sourcePage ? <span>Kilde: PDF · side {details.sourcePage}</span> : null}
      {hasMetadata ? <details><summary>Postopplysninger</summary><dl>
        {details.chapterPost && <Metadata label="Kapittelpost" value={details.chapterPost} />}
        {details.parentPostNumber && <Metadata label="Hovedpost" value={details.parentPostNumber} />}
        {details.system && <Metadata label="System" value={projectRequirementSystemLabel(details.system)} />}
        {details.standardRefs.length > 0 && <Metadata label="Standarder" value={details.standardRefs.join(", ")} />}
        {pdfArticleNumber && <Metadata label="NRF-nummer i PDF" value={pdfArticleNumber} />}
        {comments.map(([key, value]) => <Metadata key={key} label="PDF-kommentar" value={value} />)}
      </dl></details> : null}
    </div>
  </div>;
}

function SpecificationBlockContent({ block }: { block: SpecificationBlock }) {
  if (block.kind === "field") return <p className="post-specification-field"><span>{block.label}: </span>{block.text}</p>;
  if (block.kind === "quantity") return <p>{block.text.match(/^(?:Antall|Antal|Lengde|Areal|Volum|Vekt|Tid|Rund sum)\b/i)?.[0] ?? "Mengde"}</p>;
  return <p className={`post-specification-${block.kind}`}>{block.text}</p>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}: </dt><dd>{value}</dd></div>;
}

function sourceQuantityUnit(text: string, unit: string) {
  const sourceUnit = text.replace(/^(?:Antall|Antal|Lengde|Areal|Volum|Vekt|Tid|Rund sum)\s*:?\s*/i, "").split(/\s+/)[0];
  return sourceUnit && normalizeQuantityUnit(sourceUnit) === unit ? sourceUnit : unit === "?" ? "—" : unit;
}
