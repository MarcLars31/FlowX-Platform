import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function ProductsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedAppShell anyPermissions={["product.search", "product.view"]}>
      {children}
    </AuthenticatedAppShell>
  );
}
