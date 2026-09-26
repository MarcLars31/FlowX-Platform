export type SprinklerCoverageClass =
  | "standard"
  | "extended"
  | "extended_light_hazard"
  | "extended_ordinary_hazard"
  | "residential"
  | "storage"
  | "directional_open_spray"
  | "window"
  | "institutional"
  | "institutional_extended"
  | "corridor_extended";

export type SprinklerMountCapability = "surface" | "recessed" | "concealed";

/**
 * Catalogues do not always use the same rounded SI K-factor. For example,
 * K115 and K115.5 describe the same nominal family. This tolerance is only
 * used for SI-sized sprinkler values; it never changes DN or other criteria.
 */
export function sprinklerKFactorMatches(required: number, candidate: number) {
  if (Math.abs(required - candidate) < 0.11) return true;
  return required >= 50 && candidate >= 50 && Math.abs(required - candidate) <= 1.1;
}

export function sprinklerCoverageFromText(value: string): SprinklerCoverageClass | null {
  const normalized = normalize(value);
  const extended = /\b(extended coverage|utvidet dekning(?:sareal)?|utokat tackningsomrade)\b/.test(normalized);
  if (/\b(institusjonssprinkler|institutionssprinkler|institutional|vandalsikr[ae]|vandal resistant)\b/.test(normalized)) {
    return extended ? "institutional_extended" : "institutional";
  }
  if (/\b(korridorsprinkler|corridor sprinkler)\b/.test(normalized)) return "corridor_extended";
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler)\b/.test(normalized)) return "window";
  if (/\b(directional open spray|open spray nozzle|apen sprededyse|sprededyse)\b/.test(normalized)) return "directional_open_spray";
  if (/\b(storage|lager|esfr)\b/.test(normalized)) return "storage";
  if (/\b(residential|boende|boligsprinkler|bolig sprinkler)\b/.test(normalized)) return "residential";
  if (/\b(extended coverage ordinary hazard|utvidet dekning ordinaer|ecoh)\b/.test(normalized)) return "extended_ordinary_hazard";
  if (/\b(extended coverage light hazard|utvidet dekning lett|eclh|qrec|ec hsw|ext cov light)\b/.test(normalized)) return "extended_light_hazard";
  if (extended) return "extended";
  if (/\b(konvensjonell|konventionell|conventional|spraysprinkler|standard spray(?:sprinkler)?|standard sprinkler|standard coverage)\b/.test(normalized)) return "standard";
  return null;
}

export function sprinklerCoverageMatches(
  required: SprinklerCoverageClass,
  candidate: SprinklerCoverageClass | null
) {
  if (required === "extended") {
    return candidate === "extended"
      || candidate === "extended_light_hazard"
      || candidate === "extended_ordinary_hazard";
  }
  return candidate === required;
}

export function sprinklerMountCapabilities(value: string): Set<SprinklerMountCapability> {
  const normalized = normalize(value);
  const capabilities = new Set<SprinklerMountCapability>();
  if (/\b(concealed|skjult|dold)\b/.test(normalized)) capabilities.add("concealed");
  if (/\b(recessed|innfelt|infalld)\b/.test(normalized) || /\bv2762\b/.test(normalized)) {
    capabilities.add("recessed");
  }
  if (/\b(konvensjonell|konventionell|conventional|konv|surface)\b/.test(normalized) || /\bv2726\b/.test(normalized)) {
    capabilities.add("surface");
  }
  return capabilities;
}

export function sprinklerSystemRestriction(value: string): "wet_only" | "dry_only" | null {
  const normalized = normalize(value);
  if (/\b(wet system only|wet pipe only|kun vatanlegg|bare vatanlegg)\b/.test(normalized)) return "wet_only";
  if (/\b(dry system only|dry pipe only|kun torranlegg|bare torranlegg)\b/.test(normalized)) return "dry_only";
  return null;
}

export function sprinklerNeedsHydraulicReview(value: string) {
  const normalized = normalize(value);
  return sprinklerCoverageFromText(normalized) !== null
      && sprinklerCoverageFromText(normalized) !== "standard"
    || /\b(min(?:imum)? pressure|minste trykk|minimumstrykk|design density|hydraulic calculation|hydraulisk beregning)\b/.test(normalized);
}

export function sprinklerRequiresAccessoryReview(
  attributes: Record<string, unknown> | ReadonlyMap<string, unknown>,
  freeText = ""
) {
  const interpretation = sprinklerInstallationRequirements(attributes, freeText);
  if (interpretation.accessories.some((entry) => entry.status === "required" || entry.status === "review")) return true;
  const positive = /\b(?:med|inkludert|inkluderer|krever|required|with)\s+(?:en\s+)?(dekkskive|pyntering|rosett|escutcheon|cover plate|coverplate|beskyttelsesgitter|gitter|vannskjerm|watershield|water shield|guard)\b/g;
  return freeText.split(/[\r\n.;]+|\b(?:men|but)\b/i).some((clause) => {
    const normalized = normalize(clause);
    return [...normalized.matchAll(positive)].some((match) => {
      const before = normalized.slice(0, match.index);
      const after = normalized.slice(match.index + match[0].length);
      if (/\b(?:ikke|inte|not|uten|utan|without|valgfritt|valfritt|optional)\s*$/.test(before)) return false;
      if (/^\s+(?:(?:er|ar|is)\s+)?(?:valgfritt|valfritt|optional)\b/.test(after)) return false;
      return !(interpretation.exposed && COVER_ATTRIBUTE.test(match[1])
        && CONDITIONAL_RECESS.test(`${before.slice(-70)} ${match[0]} ${after.slice(0, 70)}`));
    });
  });
}

export type SprinklerAccessoryRequirement = {
  label: string;
  value: string;
  kind: "cover" | "protection";
  status: "required" | "optional" | "not_required" | "not_applicable" | "review";
};

/** These reminders are represented by the accessory requirement, not product deviations. */
export function isSprinklerAccessoryReviewWarning(message: string) {
  return /^(?:Specifikationen kräver ett tillbehör eller skydd som måste kontrolleras mot sprinklerhuvudets exakta utförande\.|Täckbricka, skydd eller annat tillbehör måste kompatibilitetskontrolleras mot exakt sprinklerutförande\.|Tillbehör eller skydd måste kompatibilitetskontrolleras mot exakt sprinklerutförande\.)$/.test(message)
    || message.includes("Kravet gäller vid infällt montage, men det är inte klarlagt om villkoret gäller.");
}

export function sprinklerAccessoryNotices(
  attributes: Record<string, unknown> | ReadonlyMap<string, unknown>,
  freeText = ""
) {
  const installation = sprinklerInstallationRequirements(attributes, freeText);
  const notices = installation.accessories.flatMap((entry) => {
    if (entry.status !== "required" && entry.status !== "review") return [];
    const name = /^(?:ja|yes|true|required)$/i.test(entry.value)
      ? entry.kind === "cover" ? "Täckbricka/rosett" : "Skydd"
      : entry.value.replace(/\bdobbel\b/gi, "Dubbel").replace(/[.\s]+$/, "");
    const conditional = entry.kind === "cover" && CONDITIONAL_RECESS.test(normalize(`${entry.label} ${entry.value}`));
    return [`${name}${conditional ? " (vid infällt montage)" : ""}`];
  });
  if (!notices.length && sprinklerRequiresAccessoryReview(attributes, freeText)) {
    notices.push("Tillbehör enligt PDF-posten");
  }
  return [...new Set(notices)];
}

const COVER_ATTRIBUTE = /\b(dekkskive|pyntering|rosett|escutcheon|cover plate|coverplate|dekkplate|tackbricka|tacklock)\b/;
const PROTECTION_ATTRIBUTE = /\b(beskyttelse|beskyttelsesgitter|gitter|skydd|skyddskorg|vannskjerm|watershield|water shield|guard)\b/;
const CONDITIONAL_RECESS = /\b(?:ved|vid|vid eventuell|ved eventuell|if|when|for)\s+(?:innfelling|innfelt(?:\s+montasje)?|infallning|infallt(?:\s+montage)?|infalld|recessed(?:\s+mounting)?|recessing)\b/;

/** Interpret relationships between existing PDF fields without changing source
 * values. A conditional accessory never establishes the mounting condition. */
export function sprinklerInstallationRequirements(
  attributes: Record<string, unknown> | ReadonlyMap<string, unknown>,
  freeText = ""
) {
  const entries = (attributes instanceof Map ? [...attributes.entries()] : Object.entries(attributes))
    .map(([label, value]) => ({ label, key: normalize(label), value: scalarText(value).trim() }));
  const context = entries.filter(({ key }) => /\b(plassering|placering|orientation|montasje|montering|mounting|lokalisering|location|lokalisasjon)\b/.test(key));
  const contextText = normalize(context.length ? context.map(({ value }) => value).join(". ") : mountingSourceText(freeText));
  const recessed = positiveMountMention(contextText, /\b(innfelt|infalld|infallt|recessed)\b/g);
  const concealed = positiveMountMention(contextText, /\b(skjult|concealed|dold)\b/g);
  const exposed = positiveMountMention(contextText, /\b(?:uten|utan|without)\s+(?:(?:system|nedhangt|suspended|ett|a)\s+)?(?:himling|undertak|ceiling)\b|\b(?:over|ovenfor|ovanfor|above)\s+(?:(?:system|nedhangt|suspended|the|ett|a)\s+)?(?:systemhimling|himling|undertak|ceiling)\b/g)
    || /\b(?:ikke|inte|ej|not)\s+(?:innfelt|infalld|infallt|recessed)\b/.test(contextText);
  const conflict = exposed && (recessed || concealed);
  const mount = conflict ? null : concealed ? "concealed" as const : recessed ? "recessed" as const : null;
  const notes: string[] = [];
  const warnings: string[] = [];
  if (conflict) warnings.push("Montageuppgifterna anger både infällt/dolt montage och placering utan eller ovanför undertak. Kontrollera vilka krav som gäller för posten.");
  const accessories: SprinklerAccessoryRequirement[] = entries.flatMap(({ label, key, value }) => {
    const cover = COVER_ATTRIBUTE.test(key);
    if (!cover && !PROTECTION_ATTRIBUTE.test(key)) return [];
    let status: SprinklerAccessoryRequirement["status"];
    if (sprinklerAccessoryValueIsNotRequired(value)) status = "not_required";
    else if (sprinklerAccessoryValueIsOptional(value)) {
      status = "optional";
      notes.push(`${label}: ${value}. Uppgiften är valfri och skapar inget obligatoriskt tillbehörskrav.`);
    } else if (cover && CONDITIONAL_RECESS.test(normalize(`${label} ${value}`))) {
      if (conflict || (!mount && !exposed)) {
        status = "review";
        warnings.push(`${label}: ${value}. Kravet gäller vid infällt montage, men det är inte klarlagt om villkoret gäller. Kontrollera placering och lokalisering.`);
      } else if (exposed) {
        status = "not_applicable";
        notes.push(`${label}: ${value}. Villkoret för infällt montage gäller inte vid den angivna placeringen utan eller ovanför undertak. Ingen täckbricka krävs av detta fält.`);
      } else {
        status = "required";
        notes.push(`${label}: ${value}. Infällt/dolt montage anges, så det villkorade tillbehörskravet gäller.`);
      }
    } else status = "required";
    return [{ label, value, kind: cover ? "cover" as const : "protection" as const, status }];
  });
  return { mount, exposed: exposed && !conflict, conflict, accessories, notes, warnings };
}

export function sprinklerAccessoryValueIsOptional(value: string) {
  return /^(valgfritt|valgfri|valfritt|valfri|optional|frivillig|frivilligt)$/.test(normalize(value));
}

function positiveMountMention(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].some((match) =>
    !/\b(?:ikke|inte|ej|not|uten|utan|without|ved|vid|if|when|for)\s*$/.test(text.slice(0, match.index))
  );
}

function mountingSourceText(value: string) {
  // Keep prose descriptions, but remove accessory field labels and their
  // conditions so '(ved innfelling)' cannot become an explicit mounting fact.
  return value.split(/\r?\n/).filter((line) => {
    const label = line.split(":")[0];
    return !line.includes(":") || (!COVER_ATTRIBUTE.test(normalize(label)) && !PROTECTION_ATTRIBUTE.test(normalize(label)));
  }).join(" ").replace(/\([^)]*\)/g, " ");
}

export function sprinklerAccessoryValueIsNotRequired(rawText: string) {
  const value = normalize(rawText);
  // Read OCR variants before normalization removes the vertical bar in |.R.
  return !value || /^(nei|nej|no|false|ingen|none|i r|ir|ikke aktuelt|ikke relevant|inte aktuellt|ej relevant|icke relevant|not applicable|not required|n a)$/.test(value)
    || /^[il1|]\s*\.?\s*r\s*\.?$/i.test(rawText.trim());
}

export function sprinklerExplicitlyExcludesCoverPlate(value: string | null | undefined) {
  const normalized = normalize(value ?? "");
  return /^(nei|no|false|ingen|ikke aktuelt|ikke relevant|ej relevant|icke relevant|not applicable|not required|none)$/.test(normalized);
}

export function sprinklerResponse(attributeValue: string | null, sourceText: string) {
  const attribute = normalize(attributeValue ?? "");
  const source = normalize(sourceText);
  const explicitQuick = /\b(?:qr|(?:kvikk|hurtig|snabb)\s*respons|quick(?:\s*response)?|(?:respons|response|folsomhetsgrad)\s*(?:quick|kvikk|hurtig|snabb))\b/;
  const explicitStandard = /\b(?:sr|(?:standard|normal)\s*(?:respons|response)|(?:respons|response|folsomhetsgrad)\s*(?:standard|normal))\b/;
  const attributeQuick = explicitQuick.test(attribute) || /\b(?:kvikk|hurtig|quick|snabb|qr)\b/.test(attribute);
  const attributeStandard = explicitStandard.test(attribute) || /\b(?:standard|normal|sr)\b/.test(attribute);
  const sourceQuick = explicitQuick.test(source);
  const sourceStandard = explicitStandard.test(source);
  const conflict = (attributeQuick || sourceQuick) && (attributeStandard || sourceStandard);
  if (conflict) return { response: null as "quick" | "standard" | null, conflict: true };
  if (attributeQuick || sourceQuick) return { response: "quick" as const, conflict: false };
  if (attributeStandard || sourceStandard) return { response: "standard" as const, conflict: false };
  return { response: null as "quick" | "standard" | null, conflict: false };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scalarText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(scalarText).filter(Boolean).join(" ");
  return "";
}
