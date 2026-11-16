"use client";

import { Button } from "./Button";

export function OverviewLoadError() {
  return <section className="space-y-4 border border-ink-200 bg-white p-6" role="alert">
    <h1 className="text-lg font-semibold">Översikten kunde inte laddas</h1>
    <p className="text-sm text-ink-600">Försök ladda sidan igen.</p>
    <Button variant="secondary" onClick={() => window.location.reload()}>Försök igen</Button>
  </section>;
}
