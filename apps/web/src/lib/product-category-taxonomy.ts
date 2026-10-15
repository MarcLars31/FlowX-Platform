export const PRODUCT_REQUIREMENT_CATEGORY_VERSION = 6;

export const PRODUCT_REQUIREMENT_CATEGORIES = [
  { id: "sprinkler_head", label: "Sprinklerhuvuden och galler", shortLabel: "Sprinklerhuvuden" },
  { id: "sprinkler_hose", label: "Sprinklerslangar", shortLabel: "Sprinklerslangar" },
  { id: "pipe", label: "Rör", shortLabel: "Rör" },
  { id: "fitting", label: "Rördelar och kopplingar", shortLabel: "Rördelar" },
  { id: "valve", label: "Ventiler", shortLabel: "Ventiler" },
  { id: "control", label: "Styrning och mätning", shortLabel: "Styrning" },
  { id: "support", label: "Upphängning och montage", shortLabel: "Upphängning" },
  { id: "sanitary", label: "Sanitetsprodukter", shortLabel: "Sanitet" },
  { id: "pump", label: "Pumpar", shortLabel: "Pumpar" },
  { id: "filter", label: "Filter och avskiljare", shortLabel: "Filter" },
  { id: "plumbing_other", label: "Övriga VVS-produkter", shortLabel: "Övrig VVS" },
  { id: "electrical_cable", label: "Kablar och ledningar", shortLabel: "Kablar" },
  { id: "cable_support", label: "Kabelstegar och kabelbärsystem", shortLabel: "Kabelbärsystem" },
  { id: "cable_trunking", label: "Vägg- och installationskanaler", shortLabel: "Kabelkanaler" },
  { id: "electrical_conduit", label: "Installationsrör för el", shortLabel: "Elrör" },
  { id: "electrical_infrastructure", label: "Kabelskydd och kabelbrunnar", shortLabel: "Kabelskydd" },
  { id: "electrical_connections", label: "Elanslutningar och installationspunkter", shortLabel: "Elanslutningar" },
  { id: "electrical_outlets", label: "Uttag, brytare och uttagsstavar", shortLabel: "Uttag och brytare" },
  { id: "electrical_distribution", label: "Elfördelning och kraftförsörjning", shortLabel: "Elfördelning" },
  { id: "electrical_lighting", label: "Belysning och nödbelysning", shortLabel: "Belysning" },
  { id: "electrical_earthing", label: "Jordning och åskskydd", shortLabel: "Jordning" },
  { id: "electrical_heating", label: "Elvärme", shortLabel: "Elvärme" },
  { id: "electrical_safety", label: "Larm, detektorer och säkerhet", shortLabel: "Larm och säkerhet" },
  { id: "automation", label: "Automation och givare", shortLabel: "Automation" },
  { id: "electrical_other", label: "Övrig el och tele", shortLabel: "Övrig el och tele" },
  { id: "ventilation_duct", label: "Ventilationskanaler och kanaldelar", shortLabel: "Ventilationskanaler" },
  { id: "ventilation_terminal", label: "Luftdon och ventilationsspjäll", shortLabel: "Luftdon och spjäll" },
  { id: "ventilation_equipment", label: "Ventilationsaggregat, fläktar och filter", shortLabel: "Ventilationsutrustning" },
  { id: "ventilation_other", label: "Övrig ventilation", shortLabel: "Övrig ventilation" },
  { id: "other", label: "Övriga produkter", shortLabel: "Övrigt" }
] as const;

export type ProductRequirementCategory = (typeof PRODUCT_REQUIREMENT_CATEGORIES)[number]["id"];
