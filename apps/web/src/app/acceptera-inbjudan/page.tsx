import { InvitationAcceptanceForm } from "@/components/InvitationAcceptanceForm";

export default async function AcceptInvitationPage({
  searchParams
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-ink-950 px-6 py-12 text-ink-900 sm:px-10">
      <div className="mx-auto max-w-xl rounded-lg border border-ink-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-400 text-sm font-black text-ink-950">
            SX
          </div>
          <div>
            <p className="text-lg font-semibold">Scipx</p>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Platform</p>
          </div>
        </div>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Företagsinbjudan
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">Aktivera ditt konto</h1>
        <p className="mt-3 text-sm leading-6 text-ink-600">
          Välj ett eget lösenord för att slutföra din åtkomst till företaget.
        </p>
        <div className="mt-8">
          <InvitationAcceptanceForm invitationId={params.invitation ?? ""} />
        </div>
      </div>
    </main>
  );
}
