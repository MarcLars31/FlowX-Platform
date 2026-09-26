import type { AhlsellProductIntent } from "./ahlsell-requirement-intent";
import type { AssemblyComponent, ProductAssemblyPlan } from "./product-assembly-plan";
import { sprinklerInstallationRequirements } from "./sprinkler-technical-rules";
import { normalizeTechnicalText } from "./ahlsell-requirement-context";

/** Only parts required by this post become shopping steps. Adjacent, separately
 * quantified posts must not be purchased again as accessories. */
export function sprinklerAssemblyPlan(requirement: Record<string, unknown>, intent: AhlsellProductIntent): ProductAssemblyPlan | null {
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const own = `${requirement.value_text ?? requirement.display_name ?? ""} ${value.sourceText ?? ""}`;
  const source = `${own} ${value.technicalSpecification ?? ""} ${requirement.source_excerpt ?? ""}`;
  const components: AssemblyComponent[] = [];
  if (intent === "sprinkler_head") {
    const installation = sprinklerInstallationRequirements(attributes, source);
    for (const part of installation.accessories) {
      if (["not_required", "not_applicable"].includes(part.status)) continue;
      const cover = part.kind === "cover";
      components.push({ id: cover ? "escutcheon" : "protection", kind: cover ? "escutcheon" : "guard",
        label: cover ? "Rosett / täckbricka" : "Sprinklerskydd", optional: part.status === "optional", conditional: part.status === "review",
        searchTerm: cover ? installation.mount === "concealed" ? "Dekkplate sprinkler" : "Rosett sprinkler" : "Sprinklergitter",
        requirement: `${part.label}: ${part.value}. ${part.status === "review" ? "Kontrollera först om montagevillkoret gäller. " : ""}Kontrollera exakt sprinklerutförande, tillverkarens kompatibilitet, ytfinish och om delen redan ingår i huvudproduktens leverans.`
      });
    }
    if (/inkludert\s+sprinklerslange|inkl\.?\s+sprinklerslange|sprinklerslange\s+(?:komplett|komplet)\s+med\s+feste/i.test(source)) components.push({
      id: "sprinkler-hose", kind: "sprinkler_hose", label: "Sprinklerslang med infästning", optional: false,
      searchTerm: "Sprinklerslange med feste", quantityNeedsReview: true,
      requirement: "Slang och infästning ingår i postens leveransomfattning. Kontrollera längd, anslutningar, godkännande och kompatibilitet med exakt vald sprinkler och taksystem. Kontrollera om infästningen ingår i slangpaketet."
    });
    return { kind: "sprinkler", mainLabel: "Sprinklerhuvud", components,
      guidance: "Välj först sprinklerhuvudet utifrån K-faktor, gängdimension, respons, temperatur och montage. Tillbehören måste passa exakt vald modell." };
  }
  if (intent === "sprinkler_hose") {
    const mountingText = [source, ...Object.entries(attributes).map(([key, item]) => `${key}: ${item}`)].join("\n");
    if (requiresHoseSupport(mountingText)) components.push({
      id: "hose-support", kind: "support", label: "Infästning för sprinklerslang", optional: false,
      searchTerm: "Feste sprinklerslange", quantityNeedsReview: true,
      requirement: "Kontrollera infästningens kompatibilitet med vald slang och taksystem, antal och om den redan ingår i slangens leverans."
    });
    return { kind: "sprinkler", mainLabel: "Sprinklerslang", components };
  }
  if (["butterfly_valve", "shutoff_valve", "check_valve", "ball_valve"].includes(intent)) {
    if (/\bmotflenser\b/i.test(source)) components.push({ id: "counter-flanges", kind: "flange", label: "Motflänsar", optional: false,
      searchTerm: "Motflens", quantityNeedsReview: true, requirement: "Motflänsar enligt PDF-posten. Kontrollera DN, tryckklass, flänsstandard och leveransomfattning mot exakt vald ventil." });
    if (/\bbolter\b/i.test(source) && /\bpakninger\b/i.test(source)) components.push({ id: "flange-fasteners", kind: "fastener", label: "Bultar och packningar", optional: false,
      searchTerm: "Boltesett pakning flens", quantityNeedsReview: true, requirement: "Kontrollera antal, dimensioner, material och packning mot exakt vald ventil, fläns och medium. Kontrollera vad som redan ingår." });
    if (components.length) return { kind: "sprinkler", mainLabel: "Ventil med anslutningsdelar", components };
  }
  if (intent === "wet_alarm_valve" || intent === "dry_alarm_valve") {
    if (/retarda(?:sjons|tions?)kamm(?:er|are)|retard(?:ing)? chamber/i.test(source)) components.push({
      id: "retard-chamber", kind: "retard_chamber", label: "Retardationskammare", optional: false, searchTerm: "Retardasjonskammer",
      quantityNeedsReview: true,
      requirement: "Retardationskammare för tryckutjämning enligt PDF-posten. Kontrollera om den ingår i ventilsetet och att kammaren samt anslutningarna är godkända för exakt vald ventilmodell."
    });
    return { kind: "sprinkler", mainLabel: intent === "wet_alarm_valve" ? "Komplett vått alarmventilset" : "Komplett torrt alarmventilset", components,
      guidance: "Kontrollera komplett ventilset, dimension, arbetstryck och anslutning. Alarmgivare och avstängningsventiler med egna PDF-postnummer väljs på sina respektive poster." };
  }
  if (intent === "alarm_device") {
    if (/(?:extra|ekstra)\s+alarmgiv/i.test(own)) components.push({ id: "extra-alarm", kind: "alarm_device", label: "Extra alarmgivare", optional: false,
      searchTerm: "Alarmpressostat sprinkler", quantityNeedsReview: true,
      requirement: "Extra alarmgivare enligt PDF-posten. Kontrollera om den redan ingår i setet, antal per set, kontakter och kompatibilitet med alarmventilsetet på huvudposten."
    });
    return { kind: "sprinkler", mainLabel: "Komplett alarmgivarset", components,
      guidance: "Kontrollera setets leveransomfattning och likvärdighet med PDF-referensen. En enskild pressostat räcker inte som underlag för ett komplett set." };
  }
  const simple: Partial<Record<AhlsellProductIntent, [string, string]>> = {
    pressure_switch: ["Tryckbrytare", "Kontrollera inställningsområde, larmgränser, kontakter, anslutning och arbetstryck. PDF-posten namnger inga separata tillbehör; komplettera endast enligt vald produkts installationsunderlag."],
    shutoff_valve: ["Avstängningsventil", "Kontrollera dimension, anslutning och kravet på övervakning. Eventuella montage- och anslutningsdelar bestäms av den valda ventilen och rörsystemet."],
    flow_meter: ["Kapacitetsmätare", "Kontrollera hela mätområdet, dimension, sprinklergodkännande och anslutningar. Avstängningsventiler som mängdas på egna PDF-poster ska inte läggas till igen här."]
  };
  const info = simple[intent];
  return info ? { kind: "sprinkler", mainLabel: info[0], guidance: info[1], components } : null;
}

function requiresHoseSupport(text: string) {
  // Mounting requirements can be extracted as fields or remain in the PDF prose.
  // They apply to every selected main product, including web-only NRFs.
  return text.split(/[.;]+/).some(clause => {
    const normalized = normalizeTechnicalText(clause);
    const parts = /\b(?:festemateriell|festemateriale|festeanordning(?:en|er|ene)?|tilhorende feste|festes? i (?:system)?himling)\b/g;
    return [...normalized.matchAll(parts)].some(match => {
      const before = normalized.slice(0, match.index);
      const after = normalized.slice(match.index + match[0].length);
      return !/\b(?:uten|utan|without|ikke|inte|not)\s*$/.test(before)
        && !/^\s+(?:(?:skal|ma|er|ar|inngar|ingar)\s+)?(?:ikke|inte|nei|nej|not)\b/.test(after);
    });
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
