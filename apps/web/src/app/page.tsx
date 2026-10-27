import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getPostLoginDestination } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";
import { headers } from "next/headers";
import { localPlatformEnabled } from "@/lib/local-platform";
import { LocalPlatformEntry } from "@/components/LocalPlatformEntry";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getPostLoginDestination(user));
  }

  if (localPlatformEnabled(process.env, (await headers()).get("host"))) {
    return <LocalPlatformEntry />;
  }
  return <LoginForm />;
}
