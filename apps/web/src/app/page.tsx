import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getPostLoginDestination } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getPostLoginDestination(user));
  }

  return <LoginForm />;
}
