import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/supabase-auth";
import { isPlatformAdmin } from "@/lib/platform-role";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (!isPlatformAdmin(user)) {
    redirect("/dashboard");
  }

  return <AppShell>{children}</AppShell>;
}
