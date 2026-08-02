import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Newspaper,
  PackageSearch,
  Sparkles
} from "lucide-react";
import { getOrganizationContext } from "@/lib/organization-context";

const news = [
  {
    category: "Scipx",
    title: "Säkrare samarbete med personliga konton",
    description:
      "Organisation, team och projektåtkomst är separerade för tydlig spårbarhet."
  },
  {
    category: "Branschnyhet",
    title: "Teknisk produktdata får en tydligare roll i projektflödet",
    description:
      "Samlad produktinformation minskar manuella överlämningar mellan roller."
  }
];

export default async function DashboardPage() {
  const context = await getOrganizationContext();
  if (!context) return null;
  const canSearchProducts =
    context.permissions.includes("product.search") ||
    context.permissions.includes("product.view");

  return (
    <div className="space-y-8">
      <header className="rounded-xl bg-ink-950 px-6 py-8 text-white shadow-sm sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-300">
          Välkommen till Scipx
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold">
          Produktkunskap och branschnyheter för {context.organization.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-300">
          Startsidan är gemensam för alla kundroller. Företagsspecifika
          arbetsytor visas endast i den behörighetsstyrda navigationen.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {canSearchProducts && (
          <Link
            href="/products"
            className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm transition hover:border-flow-300"
          >
            <PackageSearch className="h-6 w-6 text-flow-700" aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-ink-950">Produktdatabas</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Sök produkter, teknisk information och datablad.
            </p>
          </Link>
        )}
        <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <Building2 className="h-6 w-6 text-flow-700" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-ink-950">
            Företag och leverantörer
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            En plats för leverantörsnyheter, lanseringar och relevant
            marknadsföring.
          </p>
        </article>
        <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <Sparkles className="h-6 w-6 text-flow-700" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-ink-950">Nya produkter</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Nya och uppdaterade produkter från Scipx produktdatabas.
          </p>
        </article>
      </section>

      <section>
        <div className="flex items-center gap-3">
          <Newspaper className="h-5 w-5 text-flow-700" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-ink-950">Senaste nytt</h2>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {news.map((item) => (
            <article
              key={item.title}
              className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-flow-700">
                {item.category}
              </p>
              <h3 className="mt-2 font-semibold text-ink-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                {item.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-flow-700">
                Läs mer
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
