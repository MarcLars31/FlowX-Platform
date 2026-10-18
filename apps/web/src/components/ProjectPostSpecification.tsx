import {PdfSourceDocument} from "./PdfRequirementSource";
import {OriginalPdfPost} from "./OriginalPdfPost";
import {projectRequirementSourceSections} from "@/lib/project-requirement-source";
import {projectRequirementPageLabel,type ProjectRequirementDetail} from "@/lib/project-requirement-details";
import {originalPdfSourcePages} from "@/lib/pdf-post-original-regions";
import type {ProjectRequirementQuantity} from "@/lib/project-requirement-quantity";

/** The original PDF supplies all typography, spacing and columns. Extracted
 * text is an explicitly labelled fallback, never a reconstructed PDF layout. */
export function ProjectPostSpecification({id,details:sourceDetails,description,quantity,sourcePdfHref,sourcePdfFileName,pdfArticleNumber}: {
  id:string;details:ProjectRequirementDetail;description:string;quantity:ProjectRequirementQuantity;quantityText?:string;
  sourcePdfHref?:string|null;sourcePdfFileName?:string|null;pdfArticleNumber?:string|null;informationOnly?:boolean;
}) {
  const current=projectRequirementSourceSections(sourceDetails.sourceExcerpt??"",sourceDetails.postNumber).find(section=>section.relation==="current");
  const details=current?{...sourceDetails,sourceExcerpt:current.text}:sourceDetails;
  const pages=originalPdfSourcePages(details.sourcePage,details.sourcePages??[...(details.sourceExcerpt??"").matchAll(/^FORTSETTELSE SIDE (\d+)$/gm)].map(match=>Number(match[1])));
  const body=details.sourceExcerpt||[details.nsCode,description,...details.attributes.filter(([key])=>key!=="pdf-kommentar").map(([key,value])=>`${key}: ${value}`)].filter(Boolean).join("\n");
  const savedText=<div className="p-3 font-normal">
    <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm font-normal leading-normal">{body}</pre>
    {details.sourceLayout==="six-column"&&<div className="mt-3 flex gap-6 text-sm">
      <span>Enh.: {details.pdfColumnValues?.unit??(quantity.unit==="?"?"":quantity.unit)}</span>
      <span>Antall: {details.pdfColumnValues?.quantity??quantity.quantity??""}</span>
    </div>}
  </div>;
  return <div className="border border-neutral-300 bg-white text-sm font-normal text-neutral-950">
    <div className="border-b border-neutral-200 px-3 pt-3">
      <h3 id={`pdf-specification-${id}`} className="mb-2 break-words text-sm font-normal">
        {sourcePdfHref?<a href={sourcePdfHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{details.postNumber?`PDF-post ${details.postNumber}`:`PDF · sida ${details.sourcePage??"—"}`}</a>
          :details.postNumber?`PDF-post ${details.postNumber}`:`PDF · sida ${details.sourcePage??"—"}`}
      </h3>
      <PdfSourceDocument fileName={sourcePdfFileName??null} page={details.sourcePage} href={sourcePdfHref??null} pageLabel={projectRequirementPageLabel(details)} />
    </div>
    {Boolean(details.sourceWarnings?.length)&&<div role="status" className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
      <p>Kontroller PDF-posten</p><ul className="list-disc pl-5">{details.sourceWarnings!.map(warning=><li key={warning}>{warning}</li>)}</ul>
    </div>}
    {Boolean(details.sourceReimportReadings?.length)&&<details className="border-b border-amber-300 bg-amber-50 px-3 py-2">
      <summary className="cursor-pointer">Ny PDF-läsning att granska</summary>
      <p className="my-2">Läsningen skiljer sig från den sparade texten. Jämför med original-PDF:n innan kraven ändras.</p>
      {details.sourceReimportReadings!.map((reading,index)=><pre key={index} className="my-2 whitespace-pre-wrap break-words border-t border-amber-200 pt-2 font-sans font-normal">{reading}</pre>)}
    </details>}
    {sourcePdfHref&&details.sourcePage&&pages.length?<OriginalPdfPost key={`${id}:${sourcePdfHref}`} href={sourcePdfHref} postNumber={details.postNumber} sourcePage={details.sourcePage} pages={pages} fallback={savedText}/>
      :<><p className="px-3 pt-3 text-xs text-neutral-600">Textutdrag · originalets layout är inte tillgänglig.</p>{savedText}</>}
    {details.attributes.filter(([key])=>key==="pdf-kommentar").map(([key,value])=><div key={key} className="border-t border-neutral-200 p-3"><p>PDF-kommentar</p><p className="whitespace-pre-wrap">{value}</p></div>)}
    {pdfArticleNumber&&<p className="border-t border-neutral-200 px-3 py-2 text-xs">NRF-nummer i PDF: {pdfArticleNumber}</p>}
  </div>;
}
