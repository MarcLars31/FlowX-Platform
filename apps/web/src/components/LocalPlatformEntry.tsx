"use client";

import { useEffect, useState } from "react";

/** The server renders this only for the isolated local platform. The existing
 * same-origin session endpoint still creates a normal customer session. */
export function LocalPlatformEntry() {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function open() {
      try {
        const response = await fetch("/api/local/session", {
          method: "POST",
          body: new URLSearchParams({ view: "customer" }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Local session unavailable");
        if (active) window.location.replace("/dashboard");
      } catch {
        if (active) setError(true);
      }
    }
    void open();
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-8">
    <section aria-live="polite" className="max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">{error ? "ScipX kunde inte öppnas" : "Öppnar ScipX…"}</h1>
      {error ? <>
        <p className="my-4 text-slate-600">Den lokala utvecklingsmiljön svarade inte. Försök igen.</p>
        <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Försök igen</button>
      </> : <p className="mt-3 text-slate-600">Kundvyn öppnas automatiskt.</p>}
    </section>
  </main>;
}
