type Word = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type QuantityOcrRegion = {
  left: number; top: number; width: number; height: number; centerY: number;
};

function wordsFromBlocks(blocks: readonly unknown[] | null | undefined): Word[] {
  return (blocks ?? []).flatMap(block => {
    const value = block as { paragraphs?: { lines?: { words?: Word[] }[] }[] } | null;
    return (value?.paragraphs ?? []).flatMap(p => (p.lines ?? []).flatMap(l => l.words ?? []));
  }).filter(word => typeof word.text === "string" && word.bbox
    && Object.values(word.bbox).every(Number.isFinite));
}

/** Crop only the unit/quantity columns, never price, dimensions or prose. */
export function quantityOcrRegions(blocks: readonly unknown[] | null, width: number, height: number): QuantityOcrRegion[] {
  const words = wordsFromBlocks(blocks);
  const center = (w: Word) => (w.bbox.y0 + w.bbox.y1) / 2;
  const regions: QuantityOcrRegion[] = [];
  for (const unit of words.filter(w => /^(?:enh[.,]?|enhet)$/i.test(w.text.trim()))) {
    const lineHeight = unit.bbox.y1 - unit.bbox.y0;
    const sameRow = words.filter(w => Math.abs(center(w) - center(unit)) < lineHeight);
    const amount = sameRow.find(w => /^mengde$/i.test(w.text.trim()) && w.bbox.x0 > unit.bbox.x1);
    const price = sameRow.filter(w => /^(?:pris|enhetspris|sum)$/i.test(w.text.trim())
      && w.bbox.x0 > (amount?.bbox.x1 ?? width)).sort((a, b) => a.bbox.x0 - b.bbox.x0)[0];
    if (!amount || !price) continue;
    const left = Math.max(0, Math.floor(unit.bbox.x0 - lineHeight * .55));
    const right = Math.min(width, Math.floor(price.bbox.x0 - lineHeight));
    for (const label of words.filter(w => /^(?:antall|lengde|areal|volum|vekt|masse)$/i.test(w.text.trim())
      && w.bbox.y0 > unit.bbox.y1 && w.bbox.x1 < left)) {
      const labelHeight = label.bbox.y1 - label.bbox.y0;
      const row = words.filter(w => w.bbox.x0 >= left && w.bbox.x0 < right
        && Math.abs(center(w) - center(label)) <= Math.max(3, labelHeight * .55))
        .sort((a, b) => a.bbox.x0 - b.bbox.x0).map(w => w.text).join(" ");
      if (parseQuantityOcrText(row)) continue;
      const top = Math.max(0, Math.floor(label.bbox.y0 - labelHeight * .4));
      const bottom = Math.min(height, Math.ceil(label.bbox.y1 + labelHeight * .4));
      if (right > left && bottom > top && !regions.some(r => Math.abs(r.centerY - center(label)) < labelHeight)) {
        regions.push({ left, top, width: right - left, height: bottom - top, centerY: center(label) });
      }
    }
  }
  return regions;
}

export function parseQuantityOcrText(text: string): string | null {
  const clean = text.replace(/[|\[\]]/g, " ").replace(/\s+/g, " ").trim();
  const match = clean.match(/^(stk|st|pcs?|m|lm|[i1]m|meter|løpemeter|m2|m²|m3|m³|kg|l)\.?\s+(\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)$/i);
  return match ? `${match[1]} ${match[2]}` : null;
}

/** A table rule spans the cell height; character strokes do not. */
export function removeQuantityCellRules(pixels: Uint8ClampedArray, width: number, height: number, padding = 10) {
  const columns: number[] = [];
  for (let x = padding; x < width - padding; x++) {
    let dark = 0;
    for (let y = padding; y < height - padding; y++) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] > 128 && pixels[offset] < 150 && pixels[offset + 1] < 150 && pixels[offset + 2] < 150) dark++;
    }
    if (dark > (height - 2 * padding) * .8) columns.push(x);
  }
  for (const x of columns) for (let y = padding; y < height - padding; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      const offset = (y * width + x + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = pixels[offset + 3] = 255;
    }
  }
}

/** Keep the page's original words and place only verified cell readings back on their row. */
export function mergeQuantityOcrReadings(blocks: readonly unknown[] | null, readings: Array<{ region: QuantityOcrRegion; text: string }>) {
  let words = wordsFromBlocks(blocks);
  for (const { region, text } of readings) {
    const quantity = parseQuantityOcrText(text);
    if (!quantity) continue;
    words = words.filter(word => {
      const x = (word.bbox.x0 + word.bbox.x1) / 2, y = (word.bbox.y0 + word.bbox.y1) / 2;
      return x < region.left || x > region.left + region.width || y < region.top || y > region.top + region.height;
    });
    words.push({ text: quantity, bbox: { x0: region.left, x1: region.left + region.width,
      y0: region.centerY - 5, y1: region.centerY + 5 } });
  }
  return [{ paragraphs: [{ lines: [{ words }] }] }];
}
