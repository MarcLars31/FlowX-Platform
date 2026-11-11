import type { ProductSearchTrace } from "@/lib/product-search-trace";
import type { RequirementSource } from "@/lib/technical-evaluation-model";

export function requirementSourceLabel(source: RequirementSource) {
  const kind = source.kind === "project" ? "Prosjektkrav" : source.kind === "parent" ? "Hovedpost" : "Post";
  return `${kind}${source.postNumber ? ` ${source.postNumber}` : ""} · ${source.page ? `side ${source.page}` : "side ikke registrert"}`;
}

export function ProductSearchDetails({ trace }: { trace?: ProductSearchTrace }) {
  if (!trace) return null;
  const unresolved = trace.requirements.requirements.filter(item => item.issue);
  return <details className="my-2 min-w-0 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5">
    <summary className="cursor-pointer font-bold text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Vis brukte søkekriterier</summary>
    <div className="mt-3 space-y-4 break-words [overflow-wrap:anywhere]">
      <p><strong>Produktgrunnlag:</strong> {trace.heading || "Produktbeskrivelse mangler"}</p>
      <section aria-label="Utførte søk">
        <h5 className="font-bold">{trace.mode === "manual" ? "Ditt produktoppslag" : "Utførte leverandørsøk"}</h5>
        <p className="text-neutral-600">{trace.mode === "manual" ? "Søket brukte teksten eller lenken du oppga. Prosjektkravene brukes i den tekniske kontrollen etterpå." : "Dette er søkene som ble forsøkt for denne resultatlisten. Et fullført søk kan ha null treff."}</p>
        <ul className="mt-2 space-y-2">
          {trace.attempts.map((attempt, index) => <li key={`${attempt.kind}:${index}`}>
            <span className="block font-semibold">{attempt.query}</span>
            <span>{attempt.kind === "article" ? "Artikkeloppslag" : attempt.kind === "manual" ? "Manuelt oppslag" : "Katalogsøk"} · {attempt.status === "failed" ? "Kunne ikke fullføres" : "Fullført"}</span>
          </li>)}
        </ul>
        {!trace.attempts.length && <p>Ingen leverandørsøk er registrert for dette resultatet.</p>}
      </section>
      {trace.mode === "automatic" && <>
        {trace.criteria.length > 0 && <section aria-label="Tolkede søkekriterier">
          <h5 className="font-bold">Søkemotorens tolkede kriterier</h5>
          <ul className="mt-1 list-inside list-disc">{trace.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
        </section>}
        {trace.notes.length > 0 && <section aria-label="Søkemotorens tolkning"><h5 className="font-bold">Tolkning av underlaget</h5><ul className="list-inside list-disc">{trace.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></section>}
        <section aria-label="Teknisk søkegrunnlag">
          <h5 className="font-bold">Teknisk informasjon lest av søkemotoren</h5>
          <p className="text-neutral-600">Søkegrunnlaget brukes til å finne og rangere forslag. Ikke alle opplysninger sendes som søkeord eller brukes som et absolutt filter.</p>
          <dl className="mt-2 space-y-2">{trace.inputs.map((input, index) => <div key={index}>
            <dt className="font-semibold">{input.label}</dt><dd className="whitespace-pre-wrap">{input.value}</dd>
            <dd className="text-neutral-600">{requirementSourceLabel(input.source)}</dd>
          </div>)}</dl>
          {!trace.inputs.length && <p>Ingen strukturerte tekniske felt er registrert. Se produktgrunnlaget og søkeordene over.</p>}
        </section>
      </>}
      <section aria-label="Krav til teknisk kontroll">
        <h5 className="font-bold">Krav som brukes i den tekniske kontrollen ({trace.requirements.requirements.length})</h5>
        <p className="text-neutral-600">Åpne sammenligningen på produktet for resultat og produktkilder.</p>
        <ul className="mt-2 space-y-2">{trace.requirements.requirements.map(item => <li key={item.id}>
          <p className="whitespace-pre-wrap">{item.source.raw}</p>
          <p className="text-neutral-600">{requirementSourceLabel(item.source)} · {item.mandatory ? "Obligatorisk" : "Valgfritt"}</p>
          {item.issue && <p className="font-semibold">Må tolkes manuelt: {item.issue}</p>}
        </li>)}</ul>
        {!trace.requirements.requirements.length && <p>Ingen krav kunne identifiseres for automatisk kontroll.</p>}
        {unresolved.length > 0 && <p className="mt-2 font-semibold">{unresolved.length} krav kan ikke sammenlignes automatisk. De regnes ikke som oppfylt.</p>}
      </section>
      {trace.warnings.length > 0 && <section aria-label="Begrensninger i søket"><h5 className="font-bold">Begrensninger og kontrollbehov</h5><ul className="list-inside list-disc">{trace.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section>}
      <p className="text-neutral-500">Søkeresultat fra {trace.completedAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}. Kriteriene gjelder dette søket.</p>
    </div>
  </details>;
}
