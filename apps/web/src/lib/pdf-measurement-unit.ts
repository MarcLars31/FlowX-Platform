/** Only use for a physically bounded unit cell, not unstructured text where
 * "m 2" may mean a quantity of two metres. */
export function normalizePdfUnitCell(unit: string) {
  return unit
    .replace(/^m[ \t\u00a0\u202f]*[2²](\.?)$/i, "m²$1")
    .replace(/^m[ \t\u00a0\u202f]*[3³](\.?)$/i, "m³$1");
}

/** The explicit area/volume label disambiguates a detached exponent. Preserve
 * tabs between cells, empty quantities, and ordinary length rows ("Lengde m 2"). */
export function normalizePdfMeasurementUnit(line: string) {
  return line
    .replace(/^(\s*Areal[ \t\u00a0\u202f]+)(m[ \u00a0\u202f]*[2²]\.?)(?=[ \t\u00a0\u202f]+[+-]?\d|[ \t\u00a0\u202f]*$)/i,
      (_, label: string, unit: string) => label + normalizePdfUnitCell(unit))
    .replace(/^(\s*Volum[ \t\u00a0\u202f]+)(m[ \u00a0\u202f]*[3³]\.?)(?=[ \t\u00a0\u202f]+[+-]?\d|[ \t\u00a0\u202f]*$)/i,
      (_, label: string, unit: string) => label + normalizePdfUnitCell(unit));
}
