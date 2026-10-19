import { projectRequirementSourceSections } from "@/lib/project-requirement-source";

export function PdfSourceDocument({ fileName, page, href, pageLabel }: {
  fileName: string | null;
  page: number | null;
  href: string | null;
  pageLabel?: string;
}) {
  return <p className=" text-xs text-neutral-600 [overflow-wrap:anywhere]">
    Kildedokument: {fileName && href
      ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{fileName}</a>
      : fileName ?? "Ikke oppgitt"}
    {page !== null && <span> · {pageLabel ?? `Side ${page}`}</span>}
  </p>;
}

export function PdfInheritedRequirements({ specification, postNumber, defaultOpen = false }: {
  specification: string;
  postNumber: string | null;
  defaultOpen?: boolean;
}) {
  const inherited = projectRequirementSourceSections(specification, postNumber)
    .filter(section => section.relation !== "current");
  const unique = inherited.filter((section, index) => inherited.findIndex(other => other.postNumber === section.postNumber && other.text === section.text) === index);
  if (inherited.length === 0) return null;

  return <details open={defaultOpen || undefined} aria-label="Felles krav" className="border-t border-neutral-200 p-3 text-sm [overflow-wrap:anywhere]">
    <summary className="cursor-pointer">Felles krav</summary>
    <dl className="mt-3 space-y-4">
      {unique.map((section, index) => <div key={index}>
        <dt className="font-normal text-neutral-600">{section.postNumber ? `Fra post ${section.postNumber}` : "Felles kildetekst"}</dt>
        <dd className="mt-1 whitespace-pre-wrap font-normal leading-relaxed text-neutral-900">{section.text}</dd>
      </div>)}
    </dl>
  </details>;
}
