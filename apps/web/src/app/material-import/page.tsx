import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";
import { MaterialExcelImport } from "@/components/MaterialExcelImport";

export const metadata = { title: "Excel till NRF | ScipX" };

export default function MaterialImportPage() {
  return <AuthenticatedAppShell anyPermissions={["project.product_suggestion.view"]}>
    <MaterialExcelImport />
  </AuthenticatedAppShell>;
}
