import type { AhlsellRequirementGuide } from "./ahlsell-public-match";

/** Recognises the cabinet itself, without promoting its valves or spare parts. */
export function isManifoldCabinetProduct(name: string) {
  const text = name.toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const cabinet = /\b(?:fordelerskap|fordelingsskap|fordelarskap|manifold cabinet)\b/.exec(text);
  if (!cabinet) return false;
  if (/\b(?:sprinkler\w*|elektrisk|elcentral|sikringsskap|koblingsskap)\b/.test(text)) return false;
  if (/\b(?:gulvvarme|golvvarme|radiator)\b/.test(text) && !/\b(?:tappevann|tappvatten)\b/.test(text)) return false;
  // A door/frame supplied WITH a cabinet is valid. A door/frame FOR one is not.
  const component = /\b(?:\w*ventil|fordeler|fordelare|dor|dorr|ramme|ram|luke|skapmuffe|muffe|pakning|gjennomforing|holder|tilbehor|reservedel|avlopsbend|dreneringssett)\b/;
  if (component.test(text.slice(0, cabinet.index))) return false;
  const suffix = text.slice(cabinet.index + cabinet[0].length).trim();
  return !/^(?:dor|dorr|ramme|ram|luke|\w*ventil|tilbehor|reservedel|skapmuffe)\b/.test(suffix);
}

export const MANIFOLD_CABINET_REVIEW_WARNING = "Fördelarskåpets kompletta leverans behöver verifieras: tappvatten, antal kall- och varmvattenutgångar, fördelare, anslutningar, tryckklass, dränering och PDF-postens tilläggskrav. Ett skåp ensamt verifierar inte hela posten.";

export function manifoldCabinetRequirementGuide(
  attributes: Map<string, string>,
  dataWarnings: string[],
  searchBase: string
): AhlsellRequirementGuide {
  const searchQueries = ["Fordelerskap tappevann", "Fordelingsskap rør i rør", "Fordelerskap"];
  const searchUrl = new URL(searchBase);
  searchUrl.searchParams.set("parameters.SearchPhrase", searchQueries[0]);
  const labels: Record<string, string> = {
    "antall utganger": "Utgångar", "dimensjon skap": "Skåpstorlek",
    "dimensjon tilforsel": "Tillförseldimension enligt PDF", trykk: "Tryckklass", drenering: "Dränering"
  };
  return {
    searchQuery: searchQueries[0], searchQueries, searchUrl: searchUrl.toString(),
    criteria: ["Fördelarskåp för tappvatten", ...Object.entries(labels).flatMap(([key, label]) => {
      const value = attributes.get(key);
      return value ? [`${label}: ${value}`] : [];
    })],
    warnings: [MANIFOLD_CABINET_REVIEW_WARNING, ...dataWarnings],
    recognitionNotes: ["Scipx söker automatiskt efter fördelarskåp på Ahlsells webbplats. Ventiler och andra ingående delar hanteras som delar av den kompletta leveransen."],
    directCandidates: []
  };
}
