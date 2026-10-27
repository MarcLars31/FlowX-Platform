import { PdfInheritedRequirements, PdfSourceDocument } from "./PdfRequirementSource";
import { projectRequirementSourceSections } from "@/lib/project-requirement-source";
import { projectRequirementPageLabel, type ProjectRequirementDetail } from "@/lib/project-requirement-details";
import { formatProjectQuantity, type ProjectRequirementQuantity } from "@/lib/project-requirement-quantity";
import type { ReactNode } from "react";
import { pdfPostDisplayText } from "@/lib/pdf-post-display-text";

/** One saved product post. Related requirements and uncertain source readings
 * remain accessible separately; the original PDF opens outside the card.
 * The heading/detail split puts common text first without repeating it among
 * the selectable underposts. Standalone callers keep the complete default view. */
export function ProjectPostSpecification({ id, details, description, quantity, sourcePdfHref, sourcePdfFileName, pdfArticleNumber, relatedPosts, section = "all", currentPostIsHeading = false }: {
  id: string;
  details: ProjectRequirementDetail;
  description: string;
  quantity: ProjectRequirementQuantity;
  sourcePdfHref?: string | null;
  sourcePdfFileName?: string | null;
  pdfArticleNumber?: string | null;
  relatedPosts?: ReactNode;
  section?: "all" | "heading" | "detail" | "quantity";
  currentPostIsHeading?: boolean;
}) {
  // The product selection card shows the saved amount, without OCR prose or
  // extraction warnings. Full source views keep their existing detail below.
  if (section === "quantity") return <div className="rounded-lg border border-neutral-200 bg-white p-4">
    <p aria-label="Mengde fra PDF" className="text-2xl font-semibold">{formatProjectQuantity(quantity)}</p>
    <div className="mt-3 text-xs text-neutral-600"><PdfSourceDocument fileName={sourcePdfFileName ?? null}
      page={details.sourcePage} href={sourcePdfHref ?? null} pageLabel={projectRequirementPageLabel(details)} /></div>
    {sourcePdfHref && <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm underline">Vis original-PDF</a>}
  </div>;
  const sections = projectRequirementSourceSections(details.sourceExcerpt ?? "", details.postNumber);
  const own = sections.filter(section => section.relation === "current" || (!section.postNumber && sections.length === 1));
  const ownText = own.map(section => section.text).join("\n\n");
  const fallback = [details.nsCode, description, ...details.attributes
    .filter(([key]) => key !== "pdf-kommentar").map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join("\n");
  const inherited = [details.inheritedSpecification, ...sections.filter(section => section.relation === "inherited")
    .map(section => `${section.postNumber}\n${section.text}`)].filter(Boolean).join("\n\nUNDERPOST\n");
  const uncertain = [...new Set([...(details.sourceUnassignedReadings ?? []), ...sections
    .filter(section => section.relation === "context" && !own.includes(section))
    .map(section => [section.postNumber, section.text].filter(Boolean).join("\n"))])];
  const body = ownText || (uncertain.length ? "Se bevart kildetekst med usikker postgrense nedenfor." : fallback);
  const warnings = [...new Set([...(details.sourceWarnings ?? []), ...(uncertain.length
    ? ["Postgrensen er usikker. Kontroller den bevarte kildeteksten mot original-PDF-en."] : [])])];
  const headingOnly = section === "heading";
  const compact = section === "detail" && currentPostIsHeading;
  if (headingOnly && !currentPostIsHeading) {
    if (!inherited.trim()) return null;
    return <div className="border border-neutral-300 bg-white text-sm font-normal text-neutral-950">
      <PdfInheritedRequirements specification={inherited} postNumber={details.postNumber} alwaysVisible />
    </div>;
  }

  return <div className="border border-neutral-300 bg-white text-sm font-normal text-neutral-950">
    <header className="border-b border-neutral-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 id={`pdf-specification-${id}`} className="break-words text-sm font-normal">
          {details.postNumber ? `PDF-post ${details.postNumber}` : `PDF · side ${details.sourcePage ?? "—"}`}
        </h3>
        {sourcePdfHref && <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer"
          className="rounded border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Vis original-PDF</a>}
      </div>
      <PdfSourceDocument fileName={sourcePdfFileName ?? null} page={details.sourcePage} href={sourcePdfHref ?? null} pageLabel={projectRequirementPageLabel(details)} />
    </header>
    {!compact && warnings.length > 0 && <div role="status" className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
      <p>Kontroller PDF-posten</p><ul className="list-disc pl-5">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </div>}
    {!headingOnly && relatedPosts && <>{section === "all" && <PdfInheritedRequirements specification={inherited} postNumber={details.postNumber} defaultOpen />}{relatedPosts}</>}
    <div aria-label="Produktpost" className="p-3">
      <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm font-normal leading-relaxed">{pdfPostDisplayText(compact ? [details.nsCode, description].filter(Boolean).join("\n") : body)}</pre>
      {/* Verified description text excludes the physical quantity cells. Legacy
          text displays its quantity row without price/sum; never add a second copy or
          delete a matching amount that may describe something else. */}
      {(compact || details.sourceLayout === "six-column" || !ownText) && <div className="mt-4 flex flex-wrap gap-6 border-t border-neutral-200 pt-3 text-sm">
        <span>Enh.: {details.pdfColumnValues?.unit ?? (quantity.unit === "?" ? "" : quantity.unit)}</span>
        <span>Antall: {details.pdfColumnValues?.quantity ?? quantity.quantity ?? ""}</span>
      </div>}
    </div>
    {section !== "detail" && !relatedPosts && <PdfInheritedRequirements specification={inherited} postNumber={details.postNumber} alwaysVisible={headingOnly} />}
    {!compact && uncertain.length > 0 && <details className="border-t border-amber-300 bg-amber-50 p-3">
      <summary className="cursor-pointer">Kildetekst med usikker postgrense</summary>
      {uncertain.map((reading, index) => <pre key={index} className="mt-3 whitespace-pre-wrap break-words font-sans font-normal">{pdfPostDisplayText(reading)}</pre>)}
    </details>}
    {!compact && Boolean(details.sourceReimportReadings?.length) && <details className="border-t border-amber-300 bg-amber-50 p-3">
      <summary className="cursor-pointer">Ny PDF-läsning att granska</summary>
      <p className="my-2">Läsningen skiljer sig från den sparade texten. Jämför med original-PDF:n innan kraven ändras.</p>
      {details.sourceReimportReadings!.map((reading, index) => <pre key={index} className="my-2 whitespace-pre-wrap break-words border-t border-amber-200 pt-2 font-sans font-normal">{pdfPostDisplayText(reading)}</pre>)}
    </details>}
    {!compact && details.attributes.filter(([key]) => key === "pdf-kommentar").map(([key, value]) => <div key={key} className="border-t border-neutral-200 p-3">
      <p>PDF-kommentar</p><p className="whitespace-pre-wrap">{value}</p>
    </div>)}
    {!compact && pdfArticleNumber && <p className="border-t border-neutral-200 px-3 py-2 text-xs">NRF-nummer i PDF: {pdfArticleNumber}</p>}
  </div>;
}
