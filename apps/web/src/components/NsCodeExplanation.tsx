import { ns3420CodeInfo } from "@/lib/ns3420-code-catalog";

export function NsCodeTableValue({ code }: { code: string | null }) {
  const info = ns3420CodeInfo(code);
  if (!info) return <span title="NS-kod saknas">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`${info.code} – ${info.label}`}>
      <span className="font-semibold">{info.code}</span>
      <span className={info.kind === "reference" ? "font-normal text-ink-600" : "font-normal text-amber-800"}>
        · {info.label}
      </span>
    </span>
  );
}

export function NsCodeSpecification({ code }: { code: string }) {
  const info = ns3420CodeInfo(code);
  if (!info) return null;
  return (
    <div className="border-b border-ink-100 px-4 py-3 sm:border-r">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">NS-kod och betydelse</dt>
      <dd className="mt-1 space-y-1 text-sm leading-6 text-ink-900">
        <p className="break-words font-semibold">{info.code}</p>
        <p>{info.label}</p>
        {info.additionalRequirements && (
          <p className="text-xs leading-5 text-ink-600">A = andra krav eller anpassningar. Läs tilläggen i PDF-posten.</p>
        )}
        {info.kind === "reference" ? (
          <details className="text-xs leading-5 text-ink-600">
            <summary className="cursor-pointer font-semibold text-flow-800">Om kodförklaringen</summary>
            <p className="mt-1">Rubrik i referensunderlaget: {info.heading}</p>
            <p className="mt-1">Scipx kodregister visar kodens rubrik från granskade tekniska underlag. Det är inte en fullständig tolkning av kodens siffror. Postens tekniska krav visas separat.</p>
          </details>
        ) : info.kind === "project" ? (
          <p className="text-xs leading-5 text-ink-600">Koden börjar med %. Betydelsen hör till projektets egen beskrivning och är inte registrerad som en NS 3420-betydelse.</p>
        ) : (
          <p className="text-xs leading-5 text-ink-600">Den här koden finns inte i Scipx kodregister ännu. Läs postens beskrivning i PDF-filen.</p>
        )}
      </dd>
    </div>
  );
}
