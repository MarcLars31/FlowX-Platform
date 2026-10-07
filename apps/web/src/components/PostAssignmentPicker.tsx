"use client";

import { useState, type FormEvent } from "react";
import type { ProjectDeliveryData, ProjectDeliveryResource, ProjectWorkPackage } from "@/lib/project-delivery-resource";
import type { AssignmentTarget } from "@/lib/project-work-assignment";

export function PostAssignmentPicker({ projectId, target, current, inherited, data, resource, onClose }: {
  projectId: string; target: AssignmentTarget; current?: ProjectWorkPackage; inherited?: ProjectWorkPackage;
  data: ProjectDeliveryData; resource: ProjectDeliveryResource; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = new FormData(event.currentTarget).get("person");
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/delivery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assignment", revision: current?.revision, payload: {
          id: current?.id, scope_type: target.type, scope_value: target.value, assigned_to: person,
          due_date: current?.due_date ?? null, note: current?.note ?? ""
        } })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunne ikke lagre ansvarlig.");
      await resource.refresh(true);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Kunne ikke lagre ansvarlig.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="post-assignment-picker" aria-label={`Tildel ansvar: ${target.label}`}>
    <strong>{target.label}</strong>
    <p>{target.type === "pdf_chapter" ? "Ansvarlig gjelder alle postene i dette kapittelet. Egen postansvarlig går foran." : "Egen ansvarlig for denne posten går foran kapittelansvaret."}</p>
    <label>Ansvarlig
      <select autoFocus name="person" required disabled={busy} defaultValue={current?.assigned_to ?? inherited?.assigned_to ?? ""}>
        <option value="">Velg person</option>
        {data.members.map(member => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}
      </select>
    </label>
    {error && <p role="alert">{error}</p>}
    <div><button type="submit" disabled={busy || !data.members.length}>{busy ? "Lagrer…" : "Lagre ansvarlig"}</button>
      <button type="button" disabled={busy} onClick={onClose}>Avbryt</button></div>
  </form>;
}
