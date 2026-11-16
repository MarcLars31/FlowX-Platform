import { Suspense } from "react";
import type { Metadata } from "next";
import { MatchingRuleBrowser } from "@/components/MatchingRuleBrowser";

export const metadata: Metadata = { title: "Regler – Scipx", robots: { index: false, follow: false } };

export default function RulesPage() {
  return <Suspense fallback={<p>Läser regler…</p>}><MatchingRuleBrowser preview={process.env.NODE_ENV === "development" && process.env.SCIPX_RULES_PREVIEW === "1"} /></Suspense>;
}
