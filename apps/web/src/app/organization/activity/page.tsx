import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  actor_type: string;
  actor_user_id: string | null;
  created_at: string;
};

export default async function ActivityPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const events = await selectUserRows<AuditRow>("audit_logs", {
    select:
      "id,action,entity_type,actor_type,actor_user_id,created_at",
    organization_id: `eq.${context.organization.id}`,
    order: "created_at.desc",
    limit: "100"
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Säkerhet och spårbarhet
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">
          Aktivitetslogg
        </h1>
      </header>
      <section className="divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white shadow-sm">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-ink-950">{event.action}</p>
              <p className="text-sm text-ink-500">
                {event.entity_type} · {event.actor_type}
              </p>
            </div>
            <time className="text-sm text-ink-500">
              {new Intl.DateTimeFormat("sv-SE", {
                dateStyle: "medium",
                timeStyle: "short"
              }).format(new Date(event.created_at))}
            </time>
          </div>
        ))}
        {events.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-500">
            Inga logghändelser ännu.
          </p>
        )}
      </section>
    </div>
  );
}
