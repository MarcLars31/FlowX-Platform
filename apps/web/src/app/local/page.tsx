import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LocalDesignWorkspace } from "@/components/LocalDesignWorkspace";
import { localDesignEnabled } from "@/lib/local-design";

export const dynamic = "force-dynamic";
export const metadata = { title: "ScipX – lokalt designläge", robots: { index: false, follow: false } };

export default async function LocalDesignPage() {
  if (!localDesignEnabled(process.env, (await headers()).get("host"))) notFound();
  return <AppShell navigation={[{ name: "Lokalt projekt", href: "/local", icon: "projects" }]}
    organizationName="Lokal testmiljö" userName="Designläge" roleLabel="Utan databas" showAccountMenu={false}>
    <LocalDesignWorkspace />
  </AppShell>;
}
