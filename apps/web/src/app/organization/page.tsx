import { Badge } from "@/components/Badge";
import { OrganizationInviteForm } from "@/components/OrganizationInviteForm";
import { OrganizationJoinRequestActions } from "@/components/OrganizationJoinRequestActions";
import { OrganizationMemberActions } from "@/components/OrganizationMemberActions";
import { OrganizationTeamManagement } from "@/components/OrganizationTeamManagement";
import { getOrganizationContext } from "@/lib/organization-context";
import { isOrganizationRoleSlug } from "@/lib/organization-rbac";
import { selectUserRows } from "@/lib/supabase-user-rest";

type MemberRow = {
  id: string;
  user_id: string;
  role_id: string;
  status: string;
  joined_at: string | null;
  last_active_at: string | null;
};
type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};
type RoleRow = { id: string; name: string; slug: string };
type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};
type TeamMemberRow = {
  team_id: string;
  organization_member_id: string;
};
type SeatRow = { seat_type: string; seat_limit: number };
type SubscriptionRow = { plan_key: string; status: string };
type InvitationRow = {
  id: string;
  email: string;
  role_id: string;
  status: string;
  expires_at: string;
};
type JoinRequestRow = {
  id: string;
  organization_id: string;
  user_id: string;
  requester_email: string | null;
  requester_display_name: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

export default async function OrganizationPage() {
  const context = await getOrganizationContext();
  if (!context) return null;
  const organizationId = context.organization.id;

  const [members, roles, teams, seats, subscriptions, invitations, joinRequests] =
    await Promise.all([
    context.permissions.includes("member.view")
      ? selectUserRows<MemberRow>("organization_members", {
          select:
            "id,user_id,role_id,status,joined_at,last_active_at,created_at",
          organization_id: `eq.${organizationId}`,
          order: "created_at.asc"
        })
      : Promise.resolve([]),
    selectUserRows<RoleRow>("roles", {
      select: "id,name,slug",
      or: `(organization_id.is.null,organization_id.eq.${organizationId})`
    }),
      context.permissions.includes("team.view")
      ? selectUserRows<TeamRow>("teams", {
          select: "id,name,description,status",
          organization_id: `eq.${organizationId}`,
          order: "name.asc"
        })
      : Promise.resolve([]),
    context.permissions.includes("subscription.view")
      ? selectUserRows<SeatRow>("organization_seat_limits", {
          select: "seat_type,seat_limit",
          organization_id: `eq.${organizationId}`
        })
      : Promise.resolve([]),
    context.permissions.includes("subscription.view")
      ? selectUserRows<SubscriptionRow>("organization_subscriptions", {
          select: "plan_key,status",
          organization_id: `eq.${organizationId}`,
          limit: "1"
        })
      : Promise.resolve([]),
    context.permissions.includes("member.view")
      ? selectUserRows<InvitationRow>("organization_invitations", {
          select: "id,email,role_id,status,expires_at",
          organization_id: `eq.${organizationId}`,
          order: "created_at.desc"
        })
      : Promise.resolve([]),
    context.permissions.includes("member.view")
      ? selectUserRows<JoinRequestRow>("organization_join_requests", {
          select:
            "id,organization_id,user_id,requester_email,requester_display_name,message,status,created_at",
          organization_id: `eq.${organizationId}`,
          status: "eq.pending",
          order: "created_at.asc"
        })
      : Promise.resolve([])
  ]);
  const profiles = members.length
    ? await selectUserRows<ProfileRow>("profiles", {
        select: "id,display_name,email",
        id: `in.(${members.map((member) => member.user_id).join(",")})`
      })
    : [];
  const teamMembers = teams.length
    ? await selectUserRows<TeamMemberRow>("team_members", {
        select: "team_id,organization_member_id",
        team_id: `in.(${teams.map((team) => team.id).join(",")})`
      })
    : [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const roleById = new Map(roles.map((role) => [role.id, role]));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Organisationsadministration
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">
          {context.organization.name}
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Medlemmar, team och licensöversikt visas enligt dina behörigheter.
        </p>
      </header>

      {subscriptions[0] && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Abonnemang" value={subscriptions[0].plan_key} />
          <Summary label="Status" value={subscriptions[0].status} />
          {seats.map((seat) => (
            <Summary
              key={seat.seat_type}
              label={seat.seat_type}
              value={`${seat.seat_limit} platser`}
            />
          ))}
        </section>
      )}

      {context.permissions.includes("member.invite") && (
        <section id="invitations" className="space-y-3">
          <div>
            <h2 className="font-semibold text-ink-950">Bjud in användare</h2>
            <p className="mt-1 text-sm text-ink-600">
              Organisation och roll valideras på servern. Seat limits kan inte
              kringgås från klienten.
            </p>
          </div>
          <OrganizationInviteForm
            canAssignAdmins={
              context.membership.role_slug === "organization_owner"
            }
          />
          {invitations.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-1 border-b border-ink-100 px-5 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-950">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-ink-500">
                      {roleById.get(invitation.role_id)?.name ?? "Okänd roll"}
                    </p>
                  </div>
                  <Badge tone={invitation.status === "pending" ? "amber" : "slate"}>
                    {invitation.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {context.permissions.includes("member.view") && (
        <section
          id="join-requests"
          className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm"
        >
          <div className="border-b border-ink-200 px-5 py-4">
            <h2 className="font-semibold text-ink-950">Anslutningsbegäranden</h2>
            <p className="mt-1 text-sm text-ink-600">
              Nya användare får ingen projektåtkomst förrän en administratör har godkänt dem.
            </p>
          </div>
          {joinRequests.length === 0 ? (
            <p className="px-5 py-5 text-sm text-ink-500">
              Det finns inga väntande anslutningsbegäranden.
            </p>
          ) : (
            <div className="divide-y divide-ink-100">
              {joinRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink-950">
                      {request.requester_display_name ?? "Namnlös användare"}
                    </p>
                    <p className="text-sm text-ink-600">
                      {request.requester_email ?? "E-post saknas"}
                    </p>
                    {request.message && (
                      <p className="mt-2 max-w-2xl text-sm text-ink-500">
                        “{request.message}”
                      </p>
                    )}
                    <p className="mt-2 text-xs text-ink-400">
                      Skickad {new Intl.DateTimeFormat("sv-SE").format(new Date(request.created_at))}
                    </p>
                  </div>
                  {context.permissions.includes("member.invite") ? (
                    <OrganizationJoinRequestActions requestId={request.id} />
                  ) : (
                    <Badge tone="amber">Väntar på godkännande</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {context.permissions.includes("member.view") && (
        <section
          id="members"
          className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm"
        >
          <div className="border-b border-ink-200 px-5 py-4">
            <h2 className="font-semibold text-ink-950">Användare</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200 text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-5 py-3">Namn</th>
                  <th className="px-5 py-3">E-post</th>
                  <th className="px-5 py-3">Roll</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Senast aktiv</th>
                  <th className="px-5 py-3">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {members.map((member) => {
                  const profile = profileById.get(member.user_id);
                  return (
                    <tr key={member.id}>
                      <td className="px-5 py-4 font-medium text-ink-950">
                        {profile?.display_name ?? "Namnlös användare"}
                      </td>
                      <td className="px-5 py-4 text-ink-600">
                        {profile?.email ?? "—"}
                      </td>
                      <td className="px-5 py-4 text-ink-600">
                        {roleById.get(member.role_id)?.name ?? "Okänd roll"}
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={member.status === "active" ? "green" : "amber"}>
                          {member.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-ink-500">
                        {member.last_active_at
                          ? new Intl.DateTimeFormat("sv-SE").format(
                              new Date(member.last_active_at)
                            )
                          : "—"}
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const roleSlug = roleById.get(member.role_id)?.slug;
                          if (!roleSlug || !isOrganizationRoleSlug(roleSlug)) {
                            return <span className="text-xs text-ink-400">—</span>;
                          }
                          return (
                            <OrganizationMemberActions
                              memberId={member.id}
                              currentRole={roleSlug}
                              currentStatus={member.status}
                              canChangeRole={context.permissions.includes(
                                "member.change_role"
                              )}
                              canChangeStatus={context.permissions.includes(
                                "member.disable"
                              )}
                              canAssignPrivilegedRoles={
                                context.membership.role_slug ===
                                "organization_owner"
                              }
                              disabled={
                                member.user_id === context.membership.user_id
                              }
                            />
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {context.permissions.includes("team.view") && (
        <section
          id="teams"
          className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold text-ink-950">Team</h2>
          <div className="mt-4">
            <OrganizationTeamManagement
              teams={teams.map((team) => ({
                ...team,
                members: teamMembers
                  .filter((member) => member.team_id === team.id)
                  .map((member) => {
                    const profile = profileById.get(
                      members.find(
                        (candidate) => candidate.id === member.organization_member_id
                      )?.user_id ?? ""
                    );
                    return {
                      organizationMemberId: member.organization_member_id,
                      label:
                        profile?.display_name ??
                        profile?.email ??
                        "Namnlös användare"
                    };
                  })
              }))}
              memberOptions={members.map((member) => {
                const profile = profileById.get(member.user_id);
                return {
                  organizationMemberId: member.id,
                  label:
                    profile?.display_name ?? profile?.email ?? "Namnlös användare"
                };
              })}
              canCreate={context.permissions.includes("team.create")}
              canUpdate={context.permissions.includes("team.update")}
              canDelete={context.permissions.includes("team.delete")}
              canManageMembers={context.permissions.includes("team.manage_members")}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase text-ink-500">{label}</p>
      <p className="mt-2 font-semibold text-ink-950">{value}</p>
    </div>
  );
}
