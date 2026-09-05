"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
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
    <main className="min-h-screen bg-[#020e20] text-white [background-image:linear-gradient(rgba(66,173,217,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(66,173,217,0.06)_1px,transparent_1px)] [background-size:32px_32px]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-[46vh] flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen lg:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-36 items-center justify-center rounded-lg bg-white px-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ahlsell-logo.svg" alt="Ahlsell" className="w-full" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-normal">Scipx-koncept</p>
              <p className="text-xs uppercase tracking-[0.18em] text-ink-300">
                Platform
              </p>
            </div>
          </div>

          <div className="max-w-xl py-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-flow-100">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Säker åtkomst
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-[-0.025em] text-white sm:text-5xl">
              Från PDF till
              <span className="block text-cyan-300">rätt Ahlsell-artikel</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-ink-300">
              Extrahera tekniska krav, registrera produkt och tillbehör och
              återanvänd distributörens godkända val i kommande projekt.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-ink-400 sm:grid-cols-3">
            <span>Kontrollerade arbetsflöden</span>
            <span>Manuella produktval</span>
            <span>Lärande historik</span>
          </div>
        </section>

        <section className="flex items-center px-6 pb-10 sm:px-10 lg:py-12">
          <div className="w-full rounded-lg border border-ink-200 bg-white p-6 text-ink-900 shadow-soft sm:p-8">
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
