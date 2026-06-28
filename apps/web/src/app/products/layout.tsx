import { AppShell } from "@/components/AppShell";

export default function ProductsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
