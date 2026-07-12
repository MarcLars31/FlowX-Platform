export type JsonRecord = Record<string, unknown>;

export type NormalizedProduct = {
  sourceRow: string;
  manufacturer: string;
  product_no?: string;
  product_name?: string;
  category?: string;
  sub_category?: string;
  k_value_raw?: string;
  rti?: string;
  datasheet_url?: string;
  response_type?: string;
  orientation?: string;
  approvals?: string;
  temperature_ratings?: JsonRecord[];
  color?: string;
  raw_json: JsonRecord;
};

export type NormalizationError = {
  row: string;
  message: string;
};

export type NormalizationResult = {
  sourceItems: number;
  products: NormalizedProduct[];
  errors: NormalizationError[];
};

const manufacturerKeys = [
  "Leverant\u00f8r",
  "Leverantor",
  "Leverant\u00f6r",
  "Leverant\u00c3\u00b8r",
  "manufacturer"
];

const subCategoryKeys = [
  "Utf\u00f8relse",
  "Utforelse",
  "Utf\u00f6relse",
  "Utf\u00c3\u00b8relse",
  "sub_category",
  "subCategory"
];

export function parseJsonImportText(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid JSON. Import file must contain JSON.");
  }
}

export function normalizeProductImport(json: unknown): NormalizationResult {
  const root = isJsonRecord(json) ? json : undefined;
  const items = root && Array.isArray(root.products)
    ? root.products
    : Array.isArray(json)
      ? json
      : [json];
  const documentInfo =
    root && Array.isArray(root.products) && isJsonRecord(root.documentInfo)
      ? root.documentInfo
      : undefined;
  const result: NormalizationResult = {
    sourceItems: items.length,
    products: [],
    errors: []
  };

  items.forEach((item, itemIndex) => {
    const itemRow = String(itemIndex + 1);

    if (!isJsonRecord(item)) {
      result.errors.push({
        row: itemRow,
        message: "Item is not a JSON object."
      });
      return;
    }

    const data = isJsonRecord(item.data) ? item.data : item;
    const sprinklerModels = Array.isArray(data.sprinklerModels)
      ? data.sprinklerModels
      : [];

    if (sprinklerModels.length > 0) {
      sprinklerModels.forEach((model, modelIndex) => {
        const modelRow = `${itemRow}.${modelIndex + 1}`;

        if (!isJsonRecord(model)) {
          result.errors.push({
            row: modelRow,
            message: "sprinklerModels item is not a JSON object."
          });
          return;
        }

        result.products.push(
          mapStandardizedModel(item, data, model, modelRow, documentInfo)
        );
      });
      return;
    }

    result.products.push(mapSingleProduct(item, data, itemRow, documentInfo));
  });

  return result;
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapStandardizedModel(
  item: JsonRecord,
  data: JsonRecord,
  model: JsonRecord,
  sourceRow: string,
  documentInfo?: JsonRecord
): NormalizedProduct {
  return {
    sourceRow,
    manufacturer:
      readText(data, manufacturerKeys) ??
      readText(documentInfo, manufacturerKeys) ??
      "Unknown",
    product_no: readText(model, ["sin", "SIN", "product_no"]),
    product_name:
      readText(model, ["name", "productName", "product_name"]) ??
      readText(data, ["productName", "productSeries", "productDescription"]),
    category: readText(data, ["Type", "category", "sprinklerType"]),
    sub_category:
      readText(model, ["escutcheonType", "sub_category", "subCategory"]) ??
      readText(data, subCategoryKeys),
    k_value_raw: readKFactor(data),
    rti: readText(model, ["RTI", "rti"]) ?? readText(data, ["RTI", "rti"]),
    datasheet_url:
      readText(data, ["Datablad", "datasheet_url", "datasheetUrl", "source_url"]) ??
      readText(item, ["source_url", "sourceUrl"]),
    response_type: readText(model, ["responseType", "sprinklerResponse"]),
    orientation: readText(model, ["orientation"]),
    approvals: readApprovals(data),
    temperature_ratings:
      readTemperatureRatings(model) ?? readTemperatureRatings(data),
    color: readColor(model) ?? readColor(data),
    raw_json: {
      source: item,
      sprinklerModel: model
    }
  };
}

function mapSingleProduct(
  item: JsonRecord,
  data: JsonRecord,
  sourceRow: string,
  documentInfo?: JsonRecord
): NormalizedProduct {
  return {
    sourceRow,
    manufacturer:
      readText(data, manufacturerKeys) ??
      readText(documentInfo, manufacturerKeys) ??
      "Unknown",
    product_no: readText(data, ["SIN", "sin", "product_no", "productNo"]),
    product_name: readText(data, [
      "productName",
      "product_name",
      "productSeries",
      "productDescription",
      "name"
    ]),
    category: readText(data, ["Type", "category", "sprinklerType"]),
    sub_category: readText(data, subCategoryKeys),
    k_value_raw: readText(data, ["K-Verdi", "k_value_raw", "kValue"]) ?? readKFactor(data),
    rti: readText(data, ["RTI", "rti"]),
    datasheet_url: readText(data, [
      "Datablad",
      "datasheet_url",
      "datasheetUrl",
      "source_url"
    ]),
    response_type: readText(data, ["responseType", "sprinklerResponse"]),
    orientation: readText(data, ["orientation"]),
    approvals: readApprovals(data),
    temperature_ratings: readTemperatureRatings(data),
    color: readColor(data),
    raw_json: item
  };
}

function readText(record: JsonRecord | undefined, keys: string[]) {
  if (!record) return undefined;

  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;

    const text = String(value).trim();
    if (text.length > 0) return text;
  }

  return undefined;
}

function readKFactor(record: JsonRecord) {
  const kFactor = record.kFactor;

  if (Array.isArray(kFactor)) {
    const values = kFactor
      .map((entry) => (isJsonRecord(entry) ? formatKFactorValue(entry) : undefined))
      .filter((value): value is string => Boolean(value));

    return values.length > 0 ? values.join(" / ") : undefined;
  }

  if (!isJsonRecord(kFactor)) return undefined;

  const values = [
    readText(kFactor, ["imperial", "nominal"]),
    readText(kFactor, ["si", "metric"])
  ].filter(Boolean);

  if (values.length > 0) return values.join(" / ");

  return formatKFactorValue(kFactor);
}

function formatKFactorValue(kFactor: JsonRecord) {
  const rawValue = kFactor.value;
  if (rawValue === null || rawValue === undefined) return undefined;

  const units = readText(kFactor, ["units", "unit"]);
  const value = isSiKFactorUnit(units)
    ? scaleSiKFactor(rawValue)
    : String(rawValue).trim();

  return value ? [value, units].filter(Boolean).join(" ") : undefined;
}

function isSiKFactorUnit(units: string | undefined) {
  const normalizedUnits = units?.toLowerCase().replaceAll(" ", "") ?? "";

  return normalizedUnits.includes("lpm") || normalizedUnits.includes("l/min");
}

function scaleSiKFactor(value: unknown) {
  const text = String(value).trim();
  const numericValue = Number(text.replace(",", "."));

  if (!Number.isFinite(numericValue)) return text;

  return String(Number((numericValue * 10).toFixed(10)));
}

function readTemperatureRatings(record: JsonRecord) {
  const value = record.temperatureRatings ?? record.temperature_ratings;
  if (!Array.isArray(value)) return undefined;

  const ratings = value.filter(isJsonRecord);

  return ratings.length > 0 ? ratings : undefined;
}

function readColor(record: JsonRecord) {
  const colors = new Set<string>();
  const colorKeys = [
    "color",
    "colour",
    "colors",
    "colours",
    "bulbColor",
    "bulbColour",
    "frameColor",
    "frameColour",
    "finish",
    "finishColor",
    "coverPlateColor",
    "coverPlateColour"
  ];

  addColors(colors, record, colorKeys);

  if (isJsonRecord(record.physicalCharacteristics)) {
    addColors(colors, record.physicalCharacteristics, colorKeys);
  }

  readTemperatureRatings(record)?.forEach((rating) =>
    addColors(colors, rating, colorKeys)
  );

  return colors.size > 0 ? Array.from(colors).join(", ") : undefined;
}

function addColors(colors: Set<string>, record: JsonRecord, keys: string[]) {
  keys.forEach((key) => addColorValue(colors, record[key]));
}

function addColorValue(colors: Set<string>, value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((entry) => addColorValue(colors, entry));
    return;
  }

  if (isJsonRecord(value)) {
    addColorValue(colors, value.name ?? value.color ?? value.colour);
    return;
  }

  if (typeof value === "string") {
    value
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean)
      .forEach((color) => colors.add(color));
  }
}

function readApprovals(record: JsonRecord) {
  const approvals = new Set<string>();
  const certifications = record.certifications;

  if (typeof record.approvals === "string") {
    record.approvals
      .split(",")
      .map((approval) => approval.trim())
      .filter(Boolean)
      .forEach((approval) => approvals.add(approval));
  }

  if (Array.isArray(certifications)) {
    certifications.forEach((certification) =>
      addApproval(approvals, certification)
    );
  }

  if (Array.isArray(record.approvals)) {
    record.approvals.forEach((approval) => addApproval(approvals, approval));
  }

  if (isJsonRecord(record.approvals)) {
    Object.entries(record.approvals).forEach(([key, value]) => {
      if (value === true) approvals.add(formatApprovalKey(key));
      if (Array.isArray(value)) {
        value.forEach((approval) => addApproval(approvals, approval));
      }
    });
  }

  return approvals.size > 0 ? Array.from(approvals).join(", ") : undefined;
}

function addApproval(approvals: Set<string>, value: unknown) {
  if (isJsonRecord(value)) {
    const agency = readText(value, ["agency", "name"]);
    if (agency) approvals.add(agency);
    return;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (text) approvals.add(text);
  }
}

function formatApprovalKey(key: string) {
  const approvalNames: Record<string, string> = {
    ceMark: "CE",
    fmApproved: "FM",
    ulListed: "UL"
  };

  return approvalNames[key] ?? key;
}
