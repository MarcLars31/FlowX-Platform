import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function ImportsLayout({children}:{children:React.ReactNode}) {
  return <AuthenticatedAppShell anyPermissions={["technical_description.view"]}>{children}</AuthenticatedAppShell>;
}
