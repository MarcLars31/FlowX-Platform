import type { AhlsellProductIntent } from "./ahlsell-requirement-intent";
import type { AssemblyComponent, ProductAssemblyPlan } from "./product-assembly-plan";
import { sprinklerInstallationRequirements } from "./sprinkler-technical-rules";

/** Only parts required by this post become shopping steps. Adjacent, separately
 * quantified posts must not be purchased again as accessories. */
export function sprinklerAssemblyPlan(requirement: Record<string, unknown>, intent: AhlsellProductIntent): ProductAssemblyPlan | null {
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const own = `${requirement.value_text ?? requirement.display_name ?? ""} ${value.sourceText ?? ""}`;
  const source = `${own} ${value.technicalSpecification ?? ""} ${requirement.source_excerpt ?? ""}`;
  const components: AssemblyComponent[] = [];
  if (intent === "sprinkler_head") {
    const installation = sprinklerInstallationRequirements(attributes, own);
    for (const part of installation.accessories) {
      if (["not_required", "not_applicable"].includes(part.status)) continue;
      const cover = part.kind === "cover";
      components.push({ id: cover ? "escutcheon" : "protection", kind: cover ? "escutcheon" : "guard",
        label: cover ? "Rosett / täckbricka" : "Sprinklerskydd", optional: part.status === "optional", conditional: part.status === "review",
        searchTerm: cover ? installation.mount === "concealed" ? "Dekkplate sprinkler" : "Rosett sprinkler" : "Sprinklergitter",
        requirement: `${part.label}: ${part.value}. ${part.status === "review" ? "Kontrollera först om montagevillkoret gäller. " : ""}Kontrollera exakt sprinklerutförande, tillverkarens kompatibilitet, ytfinish och om delen redan ingår i huvudproduktens leverans.`
      });
    }
    return { kind: "sprinkler", mainLabel: "Sprinklerhuvud", components,
      guidance: "Välj först sprinklerhuvudet utifrån K-faktor, gängdimension, respons, temperatur och montage. Tillbehören måste passa exakt vald modell." };
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
