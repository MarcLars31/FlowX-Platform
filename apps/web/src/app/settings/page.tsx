import { redirect } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { isPlatformAdmin } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const context = isPlatformAdmin(user)
    ? null
    : await getOrganizationContext();
  const userName =
    user.user_metadata?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Scipx-anv\u00e4ndare";

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          {"Konto"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
          {"Inst\u00e4llningar"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-600">
          {"Information om ditt personliga Scipx-konto och din aktiva arbetsyta."}
        </p>
      </header>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-950">{"Profil"}</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500">{"Namn"}</dt>
            <dd className="mt-1 font-medium text-ink-900">{userName}</dd>
          </div>
          <div>
            <dt className="text-ink-500">{"E-post"}</dt>
            <dd className="mt-1 font-medium text-ink-900">{user.email ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-ink-500">{"Arbetsyta"}</dt>
            <dd className="mt-1 font-medium text-ink-900">
              {context?.organization.name ?? "Scipx Platform"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">{"Kontotyp"}</dt>
            <dd className="mt-1 font-medium text-ink-900">
              {isPlatformAdmin(user) ? "Administrat\u00f6r" : "Kundkonto"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-950">{"S\u00e4kerhet"}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          {"Du kan logga ut fr\u00e5n kontomenyn uppe till h\u00f6ger. L\u00f6senords\u00e5terst\u00e4llning hanteras av Scipx-administrat\u00f6ren tills en sj\u00e4lvbetj\u00e4ningsfunktion har lagts till."}
        </p>
      </section>
    </div>
  );
}
