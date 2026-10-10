import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Search } from "lucide-react";
import { PublicSprsokCatalog } from "@/components/PublicSprsokCatalog";
import { getPublicSprsokCatalog } from "@/lib/public-sprsok.server";
import styles from "./sprsok.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sprsok – Sprinklersøk hos Scipx",
  description: "Sprsok har flyttet til Scipx. Søk etter sprinklere, filtrer på leverandør, type, utførelse, K-verdi og RTI, og finn datablad uten innlogging.",
  alternates: { canonical: "https://www.scipx.ai/sprsok" }
};

export default async function SprsokPage() {
  const products = await getPublicSprsokCatalog().catch(() => null);

  return (
    <div className={styles.page}>
      <a href="#sprsok-search" className={styles.skip}>Gå til produktsøk</a>
      <header className={styles.header}>
        <Link href="/sprsok" className={styles.brand} aria-label="Scipx Sprsok">scipx<span>Sprsok</span></Link>
        <Link href="/" className={styles.login}>Logg inn i Scipx <ArrowRight size={15} aria-hidden="true" /></Link>
      </header>
      <main className={styles.main}>
        <div className={styles.notice}><span aria-hidden="true">↗</span><p><strong>Sprsok har flyttet til Scipx.</strong> Her finner du sprinklerkatalogen fra Sprsok, uten innlogging.</p></div>
        <div className={styles.intro}>
          <div><p className={styles.eyebrow}>SPRSOK · PRODUKTKATALOG</p><h1>Finn riktig sprinkler.</h1><p>Søk på SIN eller leverandør. Bruk filtrene for å finne utførelsen du leter etter.</p></div>
          {products && <div className={styles.count}><strong>{products.length.toLocaleString("nb-NO")}</strong><span>produktvarianter</span></div>}
        </div>
        {products ? (
          <Suspense fallback={<p role="status">Laster produktsøk…</p>}><PublicSprsokCatalog products={products} /></Suspense>
        ) : (
          <section id="sprsok-search" className={styles.unavailable} role="alert"><Search aria-hidden="true" /><h2>Katalogen er midlertidig utilgjengelig</h2><p>Vi fikk ikke hentet produktene. Prøv igjen om litt.</p><a href="/sprsok" className="portal-button">Prøv igjen</a></section>
        )}
        <footer className={styles.footer}><span>Sprsok er en del av Scipx.</span><span>Produktopplysninger og datablad fra Sprsok-katalogen.</span></footer>
      </main>
    </div>
  );
}
