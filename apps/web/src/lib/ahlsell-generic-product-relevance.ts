import { mainProductText } from "./ahlsell-requirement-context";
import { requirementHeading } from "./requirement-discipline";

const QUALIFIER = /^(?:elektrisk|elektriske|elektronisk|innendors|utendors|innvendig|utvendig|komplett|teknisk|produkt|ukjent|antall|lengde|areal|volum|type|prefabrikkert|galvanisert|rustfritt|stal|plast|aluminium)$/;
const stem = (word: string) => word.length > 5 ? word.replace(/(?:ene|er|ar)$/, "") : word;

/** An unknown product family needs a positive identity match. Generic words,
 * numbers and incidental mentions in a supplier description cannot supply it. */
export function genericProductIdentity(requirement: Record<string, unknown>) {
  const heading = requirementHeading(requirement).replace(/^%\S+\s*[-–—]?\s*/, "");
  return mainProductText(heading).split(" ").find(word => /^[a-z]{4,}$/.test(word) && !QUALIFIER.test(word)) ?? null;
}

export function hasGenericProductIdentity(identity: string | null, productName: string) {
  if (!identity) return false;
  return mainProductText(productName).split(" ").some(word => stem(word) === stem(identity)
    || identity === "kabel" && /kabel$/.test(word));
}
