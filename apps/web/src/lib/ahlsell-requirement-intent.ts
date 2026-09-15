import { ns3420ProductFamily } from "./ns3420-product-classification";

export type AhlsellProductIntent = "wet_alarm_valve" | "dry_alarm_valve" | "manometer" | "pressure_switch"
  | "flow_switch" | "ball_valve" | "butterfly_valve" | "shutoff_valve" | "check_valve"
  | "pressure_reducing_valve" | "pipe" | "coupling" | "flanged_bend" | "bend" | "tee"
  | "reducer" | "cap" | "branch" | "flange_adapter" | "pump" | "strainer" | "support"
  | "test_drain" | "flushing_connection" | "sprinkler_head" | "sprinkler_guard" | "sprinkler_hose" | "sprinkler_cabinet"
  | "water_meter" | "sensor_pocket" | "foam_extinguisher" | "portable_fire_extinguisher"
  | "custom_fabrication" | "generic";

/** The row's product and attributes govern retrieval, before included parts. */
export function ahlsellRequirementIntent(requirement: Record<string, unknown>): AhlsellProductIntent {
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const description = String(requirement.value_text ?? requirement.display_name ?? "");
  const source = normalize(`${description} ${Object.entries(attributes)
    .filter(([key]) => !/^(?:kapittel|kapittelpost|generelle krav|pdf-kommentar|dokumentasjon|tilleggsutstyr)$/i.test(key))
    .map(([key, item]) => `${key} ${item}`).join(" ")}`);
  const detail = normalize(`${value.technicalSpecification ?? ""} ${value.sourceText ?? ""} ${requirement.source_excerpt ?? ""}`);
  const has = (pattern: RegExp) => pattern.test(source);
  const category = String(requirement.category ?? "");

  if (has(/\b(handslokker|handslukker|handslokkeapparat|brannslokker|brannslukker)\b/)) {
    return has(/\b(skum|foam)\b/) ? "foam_extinguisher" : "portable_fire_extinguisher";
  }
  if (has(/\b(beskyttelsesgit(?:ter|re)|skyddskorg|sprinklerkorg|sprinklergitter)\b/)) return "sprinkler_guard";
  if (has(/\b(sprinklerskap|reservesprinklerhoder)\b/) || (/\bskap med reservesprinklerhoder\b/.test(detail) && /^sprinkleranlegg$/i.test(description))) return "sprinkler_cabinet";
  if (has(/\b(vannmaler|vannkapasitetsmaler|water meter)\b/)) return "water_meter";
  if (has(/\b(folerlomme|sensorlomme|thermowell)\b/) || (has(/\bseparat tilkobling av utstyr\b/) && /\b(folerlomme|trykkgiver|trykkvakt)\b/.test(detail))) return "sensor_pocket";
  if (has(/\b(sprinklerslange|sprinkler slange|fleksibelslange|flexislange|flexible sprinkler hose|braided hose|vicflex|dryflex)\b|\bbrannslokking\s+slange\b/)) return "sprinkler_hose";
  if (has(/\b(pumpe innendors|sprinklerpumpe|lensepumpe|type pumpe|pumpedrift)\b/)) return "pump";
  if (has(/\b(partikkelutskiller|grovfilter|y filter|sil netting|type partikkelutskiller)\b/)) return "strainer";
  if (has(/\b(torr.*(?:alarmventil|sprinklersentral)|dry (?:alarm )?valve|d769n)\b/)) return "dry_alarm_valve";
  if (has(/\b(vat alarmventil|wet alarm valve|kontrollventilsett)\b/)) return "wet_alarm_valve";
  if (has(/\b(trykkreduksjonsventil|pressure reducing valve|reduksjonsventil)\b/)) return "pressure_reducing_valve";
  if (has(/\b(tilbakeslagsventil|backventil|check valve)\b/)) return "check_valve";
  if (has(/\b(dreiespjeldventil|spjeldventil|butterfly valve)\b/)) return "butterfly_valve";
  if (has(/\b(kuleventil|ball valve)\b/)) return "ball_valve";
  if (has(/\b(stengeventil|sluseventil|gate valve|sprinklerventil)\b/)) return "shutoff_valve";
  if (has(/\b(trykkvakt|trykkbryter|pressostat|pressure switch)\b/)) return "pressure_switch";
  if (has(/\b(stromningsvakt|flow switch)\b/)) return "flow_switch";
  if (has(/\b(maleinstrument|manometer|analog.*trykk|absolutt trykk.*direkte|maling av absolutt trykk|direkte maling|avlesning analog)\b/)) return "manometer";
  if (/\btilkoblingspunkter for spyling\b/.test(detail)) return "flushing_connection";
  if (has(/\b(testarrangement|test og drener|testventil)\b/)) return "test_drain";
  if (category === "valve") return "shutoff_valve";
  if (has(/\b(overgang fra pe til stal|flens pa pe rille|flensadapter|flenseadapter)\b/)) return "flange_adapter";
  if (has(/\b(blindflens|endelokk|endebunn|plugg)\b/)) return "cap";
  if (has(/\b(anboringsklammer|anborring|avstikk|utlopskupling)\b/)) return "branch";
  if (has(/\b(dimensjonsovergang|reduksjonskupling|reduksjon|reducer)\b/)) return "reducer";
  if (has(/\b(t ror|t klave|tee)\b/)) return "tee";
  if (has(/\bbend\b/) && has(/\b(flens|flanged)\b/)) return "flanged_bend";
  if (has(/\b(bend|rorboy|elbow)\b/)) return "bend";
  if (has(/\b(kupling|rillekobling|hurtigrillekobling|coupling)\b/)) return "coupling";
  if (has(/\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/)) return "custom_fabrication";
  if (category === "sprinkler_head" || has(/\bsprinkler head\b|\bk faktor\b|\butlosningstemperatur\b/)) return "sprinkler_head";
  const codeFamily = ns3420ProductFamily(String(value.nsCode ?? requirement.requirement_key ?? ""), description);
  if (codeFamily) return codeFamily;
  if (category === "pipe" || (value.unit === "m" && !has(/\b(oppheng|isolasjon|kanal|kabel|groft)\b/))) return "pipe";
  if (category === "support" || has(/\b(oppheng|rorstotte|support|rorbarer|klammer)\b/)) return "support";
  if (category === "fitting") return "coupling";
  return "generic";
}

export function catalogTypesForIntent(intent: AhlsellProductIntent): readonly string[] | null {
  const types: Partial<Record<AhlsellProductIntent, string[]>> = {
    wet_alarm_valve: ["alarm_valve_station"], dry_alarm_valve: ["alarm_valve_station"],
    sprinkler_guard: ["sprinkler_accessory"], sprinkler_cabinet: ["sprinkler_accessory"],
    cap: ["end_cap"], branch: ["branch_outlet"], flanged_bend: ["bend"],
    reducer: ["reducer", "reducer_coupling"], tee: ["tee", "sprinkler_tee"],
    shutoff_valve: ["butterfly_valve", "ball_valve", "gate_valve"], support: ["support_bracket"],
    test_drain: ["test_drain"], sensor_pocket: ["sensor_pocket"], water_meter: ["water_meter"],
    flushing_connection: ["butterfly_valve", "ball_valve", "valve"],
    manometer: ["manometer"], pump: ["pump"], strainer: ["strainer"]
  };
  return intent === "generic" || intent === "custom_fabrication" ? null : types[intent] ?? [intent];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function normalize(value: string) {
  return value.toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
