"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export default function LoginPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-ink-950 text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-[46vh] flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen lg:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-400 text-sm font-black text-ink-950">
              FX
            </div>
            <div>
              <p className="text-lg font-semibold tracking-normal">FlowX</p>
              <p className="text-xs uppercase tracking-[0.18em] text-ink-300">
                Platform
              </p>
            </div>
          </div>

          <div className="max-w-xl py-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-flow-100">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Prototype workspace
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl">
              The Operating System for Mechanical Contractors
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-ink-300">
              FlowX brings project intake, engineering decisions, supplier data,
              material lists and AI explanations into one controlled workspace.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-ink-400 sm:grid-cols-3">
            <span>Verified workflow</span>
            <span>Supplier-ready output</span>
            <span>Nordic compliance focus</span>
          </div>
        </section>

        <section className="flex items-center px-6 pb-10 sm:px-10 lg:py-12">
          <div className="w-full rounded-lg border border-ink-200 bg-white p-6 text-ink-900 shadow-soft sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
                Demo login
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal">
                Welcome to FlowX
              </h2>
            </div>

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                router.push("/admin");
              }}
            >
              <Input
                id="email"
                label="Email"
                type="email"
                defaultValue="marcus@demovvs.no"
                autoComplete="email"
              />
              <Input
                id="password"
                label="Password"
                type="password"
                defaultValue="prototype"
                autoComplete="current-password"
              />
              <Button type="submit" className="w-full justify-center">
                Login
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
