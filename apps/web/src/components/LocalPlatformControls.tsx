export function LocalPlatformControls({ welcome = false }: { welcome?: boolean }) {
  return (
    <section aria-label="Lokal utvecklingsmiljö" className={welcome ? "mx-auto my-16 max-w-2xl rounded-xl border border-cyan-300 bg-white p-8 shadow-sm" : "flex flex-wrap items-center justify-between gap-3 border-b border-cyan-300 bg-cyan-50 px-5 py-2 text-sm text-slate-900"}>
      <div>
        {welcome ? <h1 className="text-2xl font-bold">ScipX utvecklingskopia</h1> : <strong>Utvecklingskopia · lokal testdata</strong>}
        <p className={welcome ? "my-4 leading-7 text-slate-600" : "text-xs text-slate-600"}>
          {welcome ? "Öppna hela plattformen med ett lokalt testkonto. Projekt, filer och ändringar sparas på den här datorn. Liveversionen påverkas inte." : "Ändringar sparas på den här datorn. E-post skickas inte."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action="/api/local/session" method="post"><input type="hidden" name="view" value="customer" /><button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700" type="submit">Kundvy</button></form>
        <form action="/api/local/session" method="post"><input type="hidden" name="view" value="admin" /><button className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-900 hover:bg-slate-100" type="submit">Administration</button></form>
      </div>
      {welcome && <p className="mt-5 text-sm text-slate-500">Kundvyn innehåller projekt, projektstyrning, historik, statistik, CRM, regler och organisationsinställningar. Administration öppnar produkt- och importverktygen. Externa e-post- och synktjänster är frånkopplade.</p>}
    </section>
  );
}
