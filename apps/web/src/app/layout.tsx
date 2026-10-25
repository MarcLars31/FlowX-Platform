import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { localPlatformEnabled } from "@/lib/local-platform";
import { LocalPlatformControls } from "@/components/LocalPlatformControls";
import { getCurrentUser } from "@/lib/supabase-auth";

export const metadata: Metadata = {
  title: "ScipX – Produktvalsflöde",
  description:
    "Konceptflöde där tekniska beskrivningar kopplas till distributörsvalda produkter och tillbehör."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const local = process.env.SCIPX_LOCAL_PLATFORM === "1" && localPlatformEnabled(process.env, (await headers()).get("host"));
  const showLocalControls = local && Boolean(await getCurrentUser());
  return (
    <html lang="sv">
      <body>{showLocalControls && <LocalPlatformControls />}{children}</body>
    </html>
  );
}
