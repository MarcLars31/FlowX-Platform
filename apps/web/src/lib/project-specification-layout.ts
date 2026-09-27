import { isAdditionalRequirementAttribute, specificationLabel, type ProjectRequirementDetail } from "./project-requirement-details";

/** JSON object key order is not preserved by storage; use the PDF's labels. */
export function orderedSpecificationAttributes(details: ProjectRequirementDetail) {
  const source = details.sourceExcerpt ?? "";
  const labels = [...source.matchAll(/^([^:\n]{1,100}):[ \t]*/gm)].map(match => ({
    label: match[1].trim(), index: match.index, key: normalizeLabel(match[1])
  }));
  return details.attributes.filter(([key]) => !isAdditionalRequirementAttribute(key)).map(([key, value]) => {
    const sourceLabel = labels.find(label => label.key === normalizeLabel(key));
    return { key, value, label: sourceLabel?.label ?? specificationLabel(key), position: sourceLabel?.index ?? Infinity };
  }).sort((left, right) => left.position - right.position);
}

function normalizeLabel(label: string) {
  return label.trim().toLocaleLowerCase().replace(/[_\s–—-]+/g, " ");
}
