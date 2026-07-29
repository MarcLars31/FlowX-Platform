import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/supabase-auth";

export async function AuthenticatedAppShell({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  return <AppShell>{children}</AppShell>;
}
