"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";

export function OrganizationTrashActions({
  projectId,
  projectName,
  canRestore,
  canPermanentlyDelete
}: {
  projectId: string;
  projectName: string;
  canRestore: boolean;
  canPermanentlyDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"restore" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy("restore");
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/restore`, {
      method: "POST"
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; detail?: string }
      | null;
    if (!response.ok) {
      setError(result?.detail ?? result?.error ?? "Projektet kunde inte återställas.");
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function permanentlyDelete() {
    const confirmation = window.prompt(
      `Skriv projektets namn för att permanent radera det:\n${projectName}`
    );
    if (confirmation === null) return;

    setBusy("delete");
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/permanent`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation })
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; detail?: string }
      | null;
    if (!response.ok) {
      setError(result?.detail ?? result?.error ?? "Projektet kunde inte raderas.");
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canRestore && (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void restore()}
          >
            {busy === "restore" ? "Återställer…" : "Återställ"}
          </Button>
        )}
        {canPermanentlyDelete && (
          <Button
            variant="danger"
            disabled={busy !== null}
            onClick={() => void permanentlyDelete()}
          >
            {busy === "delete" ? "Raderar…" : "Radera permanent"}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
