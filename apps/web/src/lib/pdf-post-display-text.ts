/** Remove price/sum only from an explicit legacy measurement row for display.
 * Saved source and quantities are unchanged; prose and ambiguous numbers stay. */
export function pdfPostDisplayText(text: string) {
  const unit = "(?:stk|st|m|lm|m²|m³|m2|m3|kg|l|liter|time)\\.?";
  const amount = "\\d+(?:[ \\u00a0]\\d{3})*(?:[.,]\\d+)?";
  const price = "(?:0|\\d+(?:[ \\u00a0]\\d{3})*[.,]\\d{2})";
  const spaced = new RegExp(`^(\\s*(?:Antall|Antal|Lengde|Areal|Volum|Vekt|Tid)\\s+${unit}\\s+)(${amount})\\s+${price}\\s+${price}\\s*$`, "i");
  const tabbed = new RegExp(`^(\\s*(?:Antall|Antal|Lengde|Areal|Volum|Vekt|Tid)\\s+${unit})\\t([^\\t]*)\\t[^\\t]*\\t[^\\t]*\\s*$`, "i");
  return text.split("\n").map(line => {
    const cells = line.match(tabbed);
    if (cells && (!cells[2].trim() || new RegExp(`^${amount}$`).test(cells[2].trim()))) return `${cells[1]} ${cells[2].trim()}`.trimEnd();
    return line.replace(spaced, "$1$2");
  }).join("\n");
}
