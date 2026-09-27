"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/Button";
import {
  buildDemoMaterialListCsv,
  type DemoMaterialExportRow
} from "@/lib/demo-data";

export function DemoMaterialListExportButton({
  rows
}: {
  rows: readonly DemoMaterialExportRow[];
}) {
  function download() {
    const blob = new Blob([buildDemoMaterialListCsv(rows)], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "flowx-demo-material-list.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" onClick={download}>
      <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
      Export CSV
    </Button>
  );
}
