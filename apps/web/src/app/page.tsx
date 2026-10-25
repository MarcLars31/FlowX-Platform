import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getPostLoginDestination } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";
import { headers } from "next/headers";
import { localPlatformEnabled } from "@/lib/local-platform";
import { LocalPlatformControls } from "@/components/LocalPlatformControls";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getPostLoginDestination(user));
  }

  if (localPlatformEnabled(process.env, (await headers()).get("host"))) {
    return <main className="min-h-screen bg-slate-50 px-5 py-8"><LocalPlatformControls welcome /></main>;
  }
  return <LoginForm />;
}
