import "server-only";
import { selectUserRows } from "@/lib/supabase-user-rest";

export type DistributorProductMemoryRow = Record<string, unknown> & {
  id: string;
  organization_id: string;
  requirement_fingerprint: string;
  product_name: string;
  product_number: string;
  usage_count: number;
};

export type DistributorProductAccessoryRow = Record<string, unknown> & {
  id: string;
  memory_id: string;
  product_name: string;
  usage_count: number;
};

export async function loadDistributorProductMemory(
  organizationId: string,
  requirements: Array<Record<string, unknown>>
) {
  const fingerprints = new Set(
    requirements
      .map((requirement) => requirement.mapping_fingerprint)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  if (fingerprints.size === 0) {
    return { mappingMemories: [], mappingAccessories: [] };
  }

  const mappingMemories = await selectUserRows<DistributorProductMemoryRow>(
    "distributor_product_memories",
    {
      organization_id: `eq.${organizationId}`,
      distributor_name: "eq.Ahlsell",
      deleted_at: "is.null",
      order: "usage_count.desc,last_used_at.desc",
      limit: "500"
    }
  );
  const relevantMemories = mappingMemories.filter((memory) =>
    fingerprints.has(memory.requirement_fingerprint)
  );
  if (relevantMemories.length === 0) {
    return { mappingMemories: [], mappingAccessories: [] };
  }

  const mappingAccessories =
    await selectUserRows<DistributorProductAccessoryRow>(
      "distributor_product_memory_accessories",
      {
        organization_id: `eq.${organizationId}`,
        memory_id: `in.(${relevantMemories.map((memory) => memory.id).join(",")})`,
        order: "usage_count.desc,product_name.asc"
      }
    );

  return { mappingMemories: relevantMemories, mappingAccessories };
}
