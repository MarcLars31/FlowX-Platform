export type DistributorAccessoryInput = {
  name: string;
  productNumber: string;
  quantity: number;
  unit: string;
  notes: string;
};

export type DistributorProductMappingInput = {
  requirementId: string;
  userApproved: true;
  productName: string;
  productNumber: string;
  manufacturerName: string;
  notes: string;
  accessories: DistributorAccessoryInput[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateDistributorProductMapping(
  value: unknown
): { data: DistributorProductMappingInput } | { error: string } {
  if (!isRecord(value)) return { error: "Produktvalet saknas." };
  const requirementId = text(value.requirementId, 36);
  const productName = text(value.productName, 240);
  const productNumber = text(value.productNumber, 120);
  const manufacturerName = text(value.manufacturerName, 200);
  const notes = text(value.notes, 2000);
  if (!isUuid(requirementId)) return { error: "Ogiltigt krav-id." };
  if (value.userApproved !== true) {
    return { error: "Produkten måste godkännas uttryckligen av användaren." };
  }
  if (!productName) return { error: "Produktnamn krävs." };
  if (!productNumber) return { error: "Ahlsells artikelnummer krävs." };
  if (value.accessories != null && !Array.isArray(value.accessories)) {
    return { error: "Tillbehör måste vara en lista." };
  }
  const accessoryValues = Array.isArray(value.accessories) ? value.accessories : [];
  if (accessoryValues.length > 20) return { error: "Högst 20 tillbehör kan sparas." };

  const accessories: DistributorAccessoryInput[] = [];
  for (const accessory of accessoryValues) {
    if (!isRecord(accessory)) return { error: "Ett tillbehör har ogiltigt format." };
    const name = text(accessory.name, 240);
    if (!name) continue;
    const rawQuantity =
      typeof accessory.quantity === "number"
        ? accessory.quantity
        : Number(accessory.quantity ?? 1);
    if (!Number.isFinite(rawQuantity) || rawQuantity <= 0 || rawQuantity > 100000) {
      return { error: `Ogiltig mängd för tillbehöret ${name}.` };
    }
    accessories.push({
      name,
      productNumber: text(accessory.productNumber, 120),
      quantity: rawQuantity,
      unit: text(accessory.unit, 30) || "st",
      notes: text(accessory.notes, 500)
    });
  }

  return {
    data: {
      requirementId,
      userApproved: true,
      productName,
      productNumber,
      manufacturerName,
      notes,
      accessories
    }
  };
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
