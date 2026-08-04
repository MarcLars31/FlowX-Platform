"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/Button";

type AccessLevel = "own" | "team" | "organization" | "restricted";
type ProjectRole = "owner" | "editor" | "viewer";
type TeamOption = { id: string; name: string };
type MemberOption = { organizationMemberId: string; label: string };
type ProjectMember = { organizationMemberId: string; projectRole: ProjectRole; label: string };

export function ProjectAccessEditor({
  projectId,
  initialAccessLevel,
  initialTeamId,
  teams,
  memberOptions,
  initialMembers
}: {
  projectId: string;
  initialAccessLevel: AccessLevel;
  initialTeamId: string | null;
  teams: TeamOption[];
  memberOptions: MemberOption[];
  initialMembers: ProjectMember[];
}) {
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(initialAccessLevel);
  const [teamId, setTeamId] = useState<string>(initialTeamId ?? "");
  const [members, setMembers] = useState(initialMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(path: string, method: "PATCH" | "POST" | "DELETE", body?: Record<string, unknown>) {
    setBusy(path);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const result = (await response.json().catch(() => null)) as { error?: string; project?: { access_level: AccessLevel; team_id: string | null }; member?: { organization_member_id: string; project_role: ProjectRole } } | null;
      if (!response.ok) throw new Error(result?.error ?? "Ändringen kunde inte sparas.");
      return result;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ändringen kunde inte sparas.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveAccess() {
    const result = await request(`/api/projects/${projectId}/access`, "PATCH", {
      accessLevel,
      teamId: accessLevel === "team" ? teamId || null : null
    });
    if (result?.project) setMessage("Projektåtkomsten är sparad.");
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const organizationMemberId = String(form.get("organizationMemberId") ?? "");
    const projectRole = String(form.get("projectRole") ?? "viewer");
    if (!organizationMemberId) return;
    const result = await request(`/api/projects/${projectId}/members`, "POST", { organizationMemberId, projectRole });
    if (result?.member) {
      const option = memberOptions.find((candidate) => candidate.organizationMemberId === organizationMemberId);
      setMembers((current) => [...current, { organizationMemberId, projectRole: result.member?.project_role ?? "viewer", label: option?.label ?? "Namnlös användare" }]);
      event.currentTarget.reset();
      setMessage("Medlemmen är tillagd i projektet.");
    }
  }

  async function updateRole(member: ProjectMember, projectRole: "editor" | "viewer") {
    const result = await request(`/api/projects/${projectId}/members/${member.organizationMemberId}`, "PATCH", { projectRole });
    if (result?.member) {
      setMembers((current) => current.map((item) => item.organizationMemberId === member.organizationMemberId ? { ...item, projectRole } : item));
      setMessage("Projektrollen är uppdaterad.");
    }
  }

  async function removeMember(member: ProjectMember) {
    if (member.projectRole === "owner") return;
    const result = await request(`/api/projects/${projectId}/members`, "DELETE", { organizationMemberId: member.organizationMemberId });
    if (result) {
      setMembers((current) => current.filter((item) => item.organizationMemberId !== member.organizationMemberId));
      setMessage("Medlemmen är borttagen från projektet.");
    }
  }

  const availableMembers = memberOptions.filter((option) => !members.some((member) => member.organizationMemberId === option.organizationMemberId));
  return (
    <section className="space-y-5 rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-ink-950">Projektåtkomst</h2>
        <p className="mt-1 text-sm text-ink-600">Bestäm vilka som kan se projektet och hantera uttryckliga projektmedlemmar.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink-700">Åtkomstnivå</span>
          <select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as AccessLevel)} disabled={busy !== null} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm">
            <option value="own">Ägare och tilldelade</option>
            <option value="team">Team</option>
            <option value="organization">Hela organisationen</option>
            <option value="restricted">Endast projektmedlemmar</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink-700">Team</span>
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={accessLevel !== "team" || busy !== null} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm">
            <option value="">Välj team…</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <Button type="button" onClick={() => void saveAccess()} disabled={busy !== null || (accessLevel === "team" && !teamId)}>Spara åtkomst</Button>
      </div>

      <div className="border-t border-ink-100 pt-5">
        <h3 className="font-semibold text-ink-950">Projektmedlemmar</h3>
        <div className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200">
          {members.map((member) => (
            <div key={member.organizationMemberId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-medium text-ink-950">{member.label}</p><p className="text-xs text-ink-500">{member.projectRole === "owner" ? "Ägare" : member.projectRole === "editor" ? "Redaktör" : "Läsare"}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {member.projectRole !== "owner" && <select value={member.projectRole} onChange={(event) => void updateRole(member, event.target.value as "editor" | "viewer")} disabled={busy !== null} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm"><option value="editor">Redaktör</option><option value="viewer">Läsare</option></select>}
                {member.projectRole !== "owner" && <Button type="button" variant="ghost" onClick={() => void removeMember(member)} disabled={busy !== null}>Ta bort</Button>}
              </div>
            </div>
          ))}
          {!members.length && <p className="px-4 py-4 text-sm text-ink-500">Inga uttryckliga medlemmar ännu.</p>}
        </div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void addMember(event)}>
          <select name="organizationMemberId" required disabled={busy !== null || !availableMembers.length} className="h-10 min-w-60 rounded-lg border border-ink-200 bg-white px-3 text-sm"><option value="">Lägg till medlem…</option>{availableMembers.map((member) => <option key={member.organizationMemberId} value={member.organizationMemberId}>{member.label}</option>)}</select>
          <select name="projectRole" defaultValue="viewer" disabled={busy !== null || !availableMembers.length} className="h-10 rounded-lg border border-ink-200 bg-white px-3 text-sm"><option value="editor">Redaktör</option><option value="viewer">Läsare</option></select>
          <Button type="submit" variant="secondary" disabled={busy !== null || !availableMembers.length}>Lägg till</Button>
        </form>
      </div>
      {(message || error) && <p className={error ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>{error ?? message}</p>}
    </section>
  );
}
