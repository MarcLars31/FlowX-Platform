import { Badge } from "@/components/Badge";
import { DEMO_DATA_DISCLAIMER } from "@/lib/demo-data";

export function DemoBadge() {
  return (
    <Badge tone="amber" className="max-w-xl whitespace-normal text-left leading-5">
      {DEMO_DATA_DISCLAIMER}
    </Badge>
  );
}
