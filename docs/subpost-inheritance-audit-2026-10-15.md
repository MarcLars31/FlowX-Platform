# Subpost inheritance and precedence audit

Release: `scipx-product-rules-2026-10-15.5`.

Dimension-only subposts previously lost useful product context for insulation, meters and some valves. Equivalent own fields could also fail to suppress parent fields when their labels differed. The search projection now resolves equivalent technical properties before inheritance, retains the relevant parent product identity for dimension variants, and uses the same resolved values for search and technical evaluation.

Precedence is saved own fields (including corrections and explicit free choice), then explicit own source fields/title values, then relevant immediate product-parent fields. Own dimensions suppress inherited dimensions; own material suppresses an inherited material grade. Ambiguous own dimensions remain unresolved for review instead of falling back to a parent scalar. Included accessory dimensions do not replace the primary product's dimension. Chapter headings, siblings and unrelated product parents do not supply technical requirements.

Insulation now retains its insulation identity and its own thickness, two-way valve variants retain the valve identity, and pipe stiffness SN8 is not converted to pressure class PN8. The four Bluepipe equipment-connection subposts retain their proven common product parent.

Validation used a read-only snapshot of all 389 saved rows in the Framo project, including 213 product subposts. Assertions checked 1,665 saved own fields, preservation of quantities and original input, semantic suppression of overridden parent properties, and idempotent search projection. Relevant inheritance applied to 203 subposts. The remaining ten had unrelated or insufficiently specified product parents and intentionally did not inherit product fields.

Added 22 regression tests for aliases, saved corrections, explicit free choice, source-only fields, title values, ambiguous dimensions, different materials, insulation, valve variants, unrelated parents, equipment-connection siblings and SN8. All 1,086 tests, TypeScript, ESLint, the production dependency audit and the production build passed. Production UI verification is recorded separately in the local release evidence; no project records or product selections were changed for this audit.
