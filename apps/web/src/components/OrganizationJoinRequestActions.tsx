"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";

export function OrganizationJoinRequestActions({
  requestId
}: {
  requestId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<"approved" | "rejected" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function review(decision: "approved" | "rejected") {
    setSaving(decision);
    setMessage(null);
    const response = await fetch("/api/organizations/join-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, decision })
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; detail?: string }
      | null;

    if (!response.ok) {
      setMessage(result?.detail ?? result?.error ?? "Ändringen kunde inte sparas.");
      setSaving(null);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        className="min-h-9 px-3 py-1.5 text-xs"
        disabled={saving !== null}
        onClick={() => void review("approved")}
      >
        {saving === "approved" ? "Sparar…" : "Godkänn"}
      </Button>
      <Button
        type="button"
        variant="danger"
        className="min-h-9 px-3 py-1.5 text-xs"
        disabled={saving !== null}
        onClick={() => void review("rejected")}
      >
        {saving === "rejected" ? "Sparar…" : "Avslå"}
      </Button>
      {message && <p className="basis-full text-xs text-rose-600">{message}</p>}
    </div>
  );
}
