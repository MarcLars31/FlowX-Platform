"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type TeamMember = {
  organizationMemberId: string;
  label: string;
};

type Team = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  members: TeamMember[];
};

export function OrganizationTeamManagement({
  teams,
  memberOptions,
  canCreate,
  canUpdate,
  canDelete,
  canManageMembers
}: {
  teams: Team[];
  memberOptions: TeamMember[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function request(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: Record<string, unknown>
  ) {
    setBusy(path);
    setMessage(null);
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; detail?: string }
      | null;
    if (!response.ok) {
      setMessage(result?.detail ?? result?.error ?? "Teamändringen kunde inte sparas.");
      setBusy(null);
      return false;
    }
    setBusy(null);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <form
          className="grid gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const saved = await request("/api/teams", "POST", {
              name: data.get("name"),
              description: data.get("description")
            });
            if (saved) form.reset();
          }}
        >
          <Input id="team-name" name="name" label="Nytt team" required />
          <Input id="team-description" name="description" label="Beskrivning" />
          <div className="flex items-end">
            <Button type="submit" disabled={busy !== null} className="w-full justify-center">
              Skapa team
            </Button>
          </div>
        </form>
      )}

      {teams.map((team) => (
        <div key={team.id} className="rounded-lg border border-ink-200 bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_auto] lg:items-end">
            <Input
              id={`team-name-${team.id}`}
              label="Namn"
              defaultValue={team.name}
              disabled={!canUpdate || busy !== null}
              onBlur={(event) => {
                if (event.target.value.trim() !== team.name && canUpdate) {
                  void request(`/api/teams/${team.id}`, "PATCH", {
                    name: event.target.value,
                    description: team.description,
                    status: team.status
                  });
                }
              }}
            />
            <Input
              id={`team-description-${team.id}`}
              label="Beskrivning"
              defaultValue={team.description ?? ""}
              disabled={!canUpdate || busy !== null}
              onBlur={(event) => {
                if (canUpdate && event.target.value !== (team.description ?? "")) {
                  void request(`/api/teams/${team.id}`, "PATCH", {
                    name: team.name,
                    description: event.target.value,
                    status: team.status
                  });
                }
              }}
            />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-700">Status</span>
              <select
                defaultValue={team.status}
                disabled={!canUpdate || busy !== null}
                className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm"
                onChange={(event) =>
                  void request(`/api/teams/${team.id}`, "PATCH", {
                    name: team.name,
                    description: team.description,
                    status: event.target.value
                  })
                }
              >
                <option value="active">Aktivt</option>
                <option value="inactive">Inaktivt</option>
              </select>
            </label>
            {canDelete && (
              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Radera teamet ${team.name}?`)) {
                    void request(`/api/teams/${team.id}`, "DELETE");
                  }
                }}
              >
                Radera
              </Button>
            )}
          </div>

          <div className="mt-4 border-t border-ink-100 pt-4">
            <p className="text-sm font-semibold text-ink-950">Teammedlemmar</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {team.members.map((member) => (
                <span
                  key={member.organizationMemberId}
                  className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-700"
                >
                  {member.label}
                  {canManageMembers && (
                    <button
                      type="button"
                      className="font-semibold text-rose-600 hover:text-rose-800"
                      aria-label={`Ta bort ${member.label} från teamet`}
                      onClick={() =>
                        void request(`/api/teams/${team.id}/members`, "DELETE", {
                          organizationMemberId: member.organizationMemberId
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!team.members.length && (
                <span className="text-sm text-ink-500">Inga medlemmar ännu.</span>
              )}
            </div>
            {canManageMembers && (
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  const organizationMemberId = data.get("organizationMemberId");
                  if (!organizationMemberId) return;
                  void request(`/api/teams/${team.id}/members`, "POST", {
                    organizationMemberId
                  }).then((saved) => saved && form.reset());
                }}
              >
                <select
                  name="organizationMemberId"
                  required
                  className="h-10 min-w-60 rounded-lg border border-ink-200 bg-white px-3 text-sm"
                >
                  <option value="">Lägg till medlem…</option>
                  {memberOptions
                    .filter(
                      (option) =>
                        !team.members.some(
                          (member) =>
                            member.organizationMemberId ===
                            option.organizationMemberId
                        )
                    )
                    .map((option) => (
                      <option
                        key={option.organizationMemberId}
                        value={option.organizationMemberId}
                      >
                        {option.label}
                      </option>
                    ))}
                </select>
                <Button type="submit" variant="secondary" disabled={busy !== null}>
                  Lägg till
                </Button>
              </form>
            )}
          </div>
        </div>
      ))}
      {message && <p className="text-sm text-rose-600">{message}</p>}
      {!teams.length && <p className="text-sm text-ink-600">Inga team har skapats.</p>}
    </div>
  );
}
