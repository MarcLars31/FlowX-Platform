import { Badge } from "@/components/Badge";

export function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 94 ? "green" : score >= 90 ? "teal" : "amber";

  return <Badge tone={tone}>{score}%</Badge>;
}
