"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password")
        })
      });
      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.error ?? "Inloggningen misslyckades.");
      }

      router.replace(payload.redirectTo);
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Inloggningen misslyckades."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="portal-login">
      <div className="mx-auto w-full max-w-md">
        <section className="w-full">
          <div className="portal-login-window">
            <div className="portal-window-title">Scipx · Ahlsell</div>
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
                Säker inloggning
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal">
                Välkommen till konceptmiljön
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                Du skickas automatiskt till rätt vy för ditt konto.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <Input
                id="email"
                name="email"
                label="E-post"
                type="email"
                autoComplete="email"
                required
              />
              <Input
                id="password"
                name="password"
                label="Lösenord"
                type="password"
                autoComplete="current-password"
                required
              />
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}
              <Button
                type="submit"
                className="w-full justify-center"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Loggar in…" : "Logga in"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
