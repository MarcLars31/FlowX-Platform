import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function ProductsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
