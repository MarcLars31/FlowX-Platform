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

  const mappingMemoryBatches = await Promise.all(
    chunkValues([...fingerprints], 50).map((fingerprintBatch) =>
      selectUserRows<DistributorProductMemoryRow>(
        "distributor_product_memories",
        {
          organization_id: `eq.${organizationId}`,
          distributor_name: "eq.Ahlsell",
          requirement_fingerprint: `in.(${fingerprintBatch.join(",")})`,
          deleted_at: "is.null",
          order: "usage_count.desc,last_used_at.desc",
          limit: "1000"
        }
      )
    )
  );
  const mappingMemories = mappingMemoryBatches.flat();
  const relevantMemories = mappingMemories.filter((memory) =>
    fingerprints.has(memory.requirement_fingerprint)
  );
  if (relevantMemories.length === 0) {
    return { mappingMemories: [], mappingAccessories: [] };
  }

  const accessoryBatches = await Promise.all(
    chunkValues(relevantMemories.map((memory) => memory.id), 100).map((memoryIdBatch) =>
      selectUserRows<DistributorProductAccessoryRow>(
        "distributor_product_memory_accessories",
        {
          organization_id: `eq.${organizationId}`,
          memory_id: `in.(${memoryIdBatch.join(",")})`,
          order: "usage_count.desc,product_name.asc",
          limit: "1000"
        }
      )
    )
  );
  const mappingAccessories = accessoryBatches.flat();

  return { mappingMemories: relevantMemories, mappingAccessories };
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
