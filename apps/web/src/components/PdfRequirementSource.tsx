import { projectRequirementSourceSections } from "@/lib/project-requirement-source";

export function PdfSourceDocument({ fileName, page, href, pageLabel }: {
  fileName: string | null;
  page: number | null;
  href: string | null;
  pageLabel?: string;
}) {
  return <p className="px-2 pb-2 text-xs text-neutral-600 [overflow-wrap:anywhere]">
    Kildedokument: {fileName && href
      ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{fileName}</a>
      : fileName ?? "Ikke oppgitt"}
    {page !== null && <span> · {pageLabel ?? `Side ${page}`}</span>}
  </p>;
}

export function PdfInheritedRequirements({ specification, postNumber }: {
  specification: string;
  postNumber: string | null;
}) {
  const inherited = projectRequirementSourceSections(specification, postNumber)
    .filter(section => section.relation === "inherited");
  if (inherited.length === 0) return null;

  return <section aria-label="Arvede krav" className="space-y-2 border-t border-neutral-200 px-2 py-2 text-[11px] [overflow-wrap:anywhere]">
    <h4 className="font-semibold text-neutral-900">Arvede krav</h4>
    <dl className="space-y-2">
      {inherited.map((section, index) => <div key={index}>
        <dt className="font-semibold text-neutral-600">Fra post {section.postNumber}</dt>
        <dd className="whitespace-pre-wrap text-neutral-900">{section.text}</dd>
      </div>)}
    </dl>
  </section>;
}
