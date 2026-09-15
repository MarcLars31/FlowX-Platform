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
  entryMethod: "catalog" | "manual";
  productName: string;
  productSubtitle: string;
  productNumber: string;
  manufacturerArticleNumber: string;
  manufacturerName: string;
  deliveryTimeDays: number | null;
  unitPrice: number | null;
  currency: string;
  notes: string;
  accessories: DistributorAccessoryInput[];
};

export type ManualDistributorProductInput = {
  productNumber: string;
  manufacturerArticleNumber: string;
  manufacturerName: string;
  deliveryTimeDays: number;
  unitPrice: number;
  currency: string;
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
  if (value.entryMethod !== "catalog" && value.entryMethod !== "manual") {
    return { error: "Ogiltigt sätt att lägga till produkten." };
  }
  const entryMethod = value.entryMethod;
  const productNumber = text(value.productNumber, 120);
  const productName = resolveDistributorProductName({
    productName: value.productName,
    productNumber
  });
  const productSubtitle = text(value.productSubtitle, 500);
  const manufacturerArticleNumber = text(value.manufacturerArticleNumber, 120);
  const manufacturerName = text(value.manufacturerName, 200);
  const deliveryTimeDays = optionalNonNegativeInteger(value.deliveryTimeDays, 3650);
  if (deliveryTimeDays === undefined) {
    return { error: "Leveranstiden måste anges som ett helt antal dagar." };
  }
  const unitPrice = optionalNonNegativeDecimal(value.unitPrice, 1_000_000_000_000);
  if (unitPrice === undefined) {
    return { error: "Priset måste vara ett giltigt positivt belopp." };
  }
  const rawCurrency = text(value.currency, 10);
  const currency = currencyCode(rawCurrency);
  if (rawCurrency && !currency) return { error: "Valutan måste anges med en giltig kod, till exempel NOK." };
  const notes = text(value.notes, 2000);
  if (!isUuid(requirementId)) return { error: "Ogiltigt krav-id." };
  if (value.userApproved !== true) {
    return { error: "Produkten måste godkännas uttryckligen av användaren." };
  }
  if (!productNumber) return { error: "NRF-nummer krävs." };
  if (entryMethod === "manual") {
    if (!manufacturerArticleNumber) return { error: "Artikelnummer krävs för en manuellt tillagd produkt." };
    if (!manufacturerName) return { error: "Tillverkare krävs för en manuellt tillagd produkt." };
    if (deliveryTimeDays === null) return { error: "Leveranstid krävs för en manuellt tillagd produkt." };
    if (unitPrice === null) return { error: "Pris krävs för en manuellt tillagd produkt." };
    if (unitPrice <= 0) return { error: "Priset måste vara större än noll." };
    if (!currency) return { error: "Valuta krävs för en manuellt tillagd produkt." };
  }
  if (value.accessories != null && !Array.isArray(value.accessories)) {
    return { error: "Tillbehör måste vara en lista." };
  }
  const accessoryValues = Array.isArray(value.accessories) ? value.accessories : [];
  if (accessoryValues.length > 20) return { error: "Högst 20 tillbehör kan sparas." };

  const accessories: DistributorAccessoryInput[] = [];
  const accessoryIdentities = new Set<string>();
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
    const productNumber = text(accessory.productNumber, 120);
    const normalizedProductNumber = normalizedIdentity(productNumber, true);
    const identity = normalizedProductNumber
      ? `nrf:${normalizedProductNumber}`
      : `name:${normalizedIdentity(name)}`;
    if (accessoryIdentities.has(identity)) {
      return { error: `Tillbehöret ${name} är redan tillagt.` };
    }
    accessoryIdentities.add(identity);
    accessories.push({
      name,
      productNumber,
      quantity: rawQuantity,
      unit: text(accessory.unit, 30) || "st",
      notes: text(accessory.notes, 500)
    });
  }

  return {
    data: {
      requirementId,
      userApproved: true,
      entryMethod,
      productName,
      productSubtitle,
      productNumber,
      manufacturerArticleNumber,
      manufacturerName,
      deliveryTimeDays,
      unitPrice,
      currency,
      notes,
      accessories
    }
  };
}

export function validateManualDistributorProduct(
  value: unknown,
  fallbackCurrency = "NOK"
): { data: ManualDistributorProductInput } | { error: string } {
  if (!isRecord(value)) return { error: "Produktuppgifterna saknas." };
  const productNumber = text(value.productNumber, 120);
  const manufacturerArticleNumber = text(value.manufacturerArticleNumber, 120);
  const manufacturerName = text(value.manufacturerName, 200);
  if (!productNumber) return { error: "Fyll i NRF-nummer." };
  if (!manufacturerArticleNumber) return { error: "Fyll i artikelnummer." };
  if (!manufacturerName) return { error: "Fyll i tillverkare." };
  if (value.deliveryTimeDays === "" || value.deliveryTimeDays == null) {
    return { error: "Fyll i leveranstid i dagar." };
  }
  const deliveryTimeDays = optionalNonNegativeInteger(value.deliveryTimeDays, 3650);
  if (deliveryTimeDays === undefined || deliveryTimeDays === null) {
    return { error: "Leveranstiden måste anges som ett helt antal dagar." };
  }
  if (value.unitPrice === "" || value.unitPrice == null) {
    return { error: "Fyll i pris." };
  }
  const unitPrice = optionalNonNegativeDecimal(value.unitPrice, 1_000_000_000_000);
  if (unitPrice === undefined || unitPrice === null || unitPrice <= 0) {
    return { error: "Priset måste vara ett giltigt positivt belopp." };
  }

  return {
    data: {
      productNumber,
      manufacturerArticleNumber,
      manufacturerName,
      deliveryTimeDays,
      unitPrice,
      currency: currencyCode(value.currency) || currencyCode(fallbackCurrency) || "NOK"
    }
  };
}

export function resolveDistributorProductName({ productName, requirementName, productNumber }: {
  productName?: unknown;
  requirementName?: unknown;
  productNumber: unknown;
}) {
  const selectedName = text(productName, 240);
  if (selectedName) return selectedName;
  const nrfNumber = text(productNumber, 120);
  if (nrfNumber) return `NRF ${nrfNumber}`;
  return text(requirementName, 240);
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalNonNegativeInteger(value: unknown, maximum: number) {
  if (value === "" || value == null) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) return undefined;
  return parsed;
}

function optionalNonNegativeDecimal(value: unknown, maximum: number) {
  if (value === "" || value == null) return null;
  const normalized = typeof value === "number"
    ? value
    : Number(String(value).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > maximum) return undefined;
  return Math.round(normalized * 100) / 100;
}

function currencyCode(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "";
}

function normalizedIdentity(value: string, removeNrfPrefix = false) {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("sv-SE").replace(/[^\p{L}\p{N}]/gu, "");
  return removeNrfPrefix ? normalized.replace(/^nrf/, "") : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
