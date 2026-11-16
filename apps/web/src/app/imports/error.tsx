"use client";
import Link from "next/link";
export default function ImportError({reset}:{reset:()=>void}) {
  return <div role="alert" className="space-y-4 border bg-white p-5"><p>Importstatus kunde inte laddas. Påbörjade importer ligger kvar.</p>
    <button type="button" onClick={reset} className="border px-3 py-2">Försök igen</button>{" "}<Link href="/projects" prefetch={false}>Alla projekt</Link></div>;
}
