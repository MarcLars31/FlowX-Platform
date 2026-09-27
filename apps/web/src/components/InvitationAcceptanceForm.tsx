"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export function InvitationAcceptanceForm({
  invitationId
}: {
  invitationId: string;
}) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const token = new URLSearchParams(hash).get("access_token");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const timer = window.setTimeout(() => setAccessToken(token), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/organizations/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId,
          accessToken,
          password: formData.get("password"),
          passwordConfirmation: formData.get("passwordConfirmation")
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!response.ok || !payload?.redirectTo) {
        throw new Error(payload?.error ?? "Inbjudan kunde inte aktiveras.");
      }

      router.replace(payload.redirectTo);
      router.refresh();
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Inbjudan kunde inte aktiveras."
      );
      setIsSubmitting(false);
    }
  }

  if (!invitationId) {
    return (
      <Message tone="error">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        Inbjudningslänken saknar ett giltigt invitations-ID.
      </Message>
    );
  }

  if (!accessToken) {
    return (
      <Message tone="error">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        Öppna länken från inbjudningsmejlet i samma webbläsare.
      </Message>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Input
        id="password"
        name="password"
        type="password"
        label="Nytt lösenord"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Input
        id="passwordConfirmation"
        name="passwordConfirmation"
        type="password"
        label="Bekräfta lösenord"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && (
        <Message tone="error">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
          {error}
        </Message>
      )}
      <Button type="submit" className="w-full justify-center" disabled={isSubmitting}>
        {isSubmitting ? "Aktiverar…" : "Aktivera konto"}
      </Button>
    </form>
  );
}

function Message({
  children,
  tone
}: {
  children: React.ReactNode;
  tone: "error" | "success";
}) {
  return (
    <div
      role="alert"
      className={
        tone === "error"
          ? "flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          : "flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
      }
    >
      {tone === "success" && <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
      {children}
    </div>
  );
}
