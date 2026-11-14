# Valve insulation search

Release: `scipx-product-rules-2026-10-16.1`.

The Framo subposts 03.30.326.1.1 (DN10–DN50) and 03.30.326.1.2 (DN65–DN125) name prefabricated valve bags/cuffs with quick opening and closing. Previously their dimension prefix caused the parent heading, “ISOLERING AV RØRLEDNINGSDELER”, to replace the explicit product name in retrieval. The supplier's “Isolasjonspute” naming was also missing from identity matching.

An explicit product name after a dimension now takes precedence over a broader parent name. Saved own product types still take precedence. Bare dimensions, medium qualifiers and “komplett med deler” continue to use their existing parent/assembly context; numeric brand/model names are not treated as dimensions. Relevant parent material and thickness requirements remain available, while a conflicting inherited product type is suppressed for a named child.

Valve bags/cuffs search as valve insulation cushions and valve bags. Candidate identity requires the insulation itself and a valve application. Bare valves, pipe sections, pump/flange insulation, firestop cuffs and adhesives do not qualify. A DN range guides catalogue variant selection and ranking; it is not converted into a single DN or two required connections. Out-of-range variants fail, and in-range candidates remain for review of actual size, valve fit, material, thickness and closure.

Six regression tests cover both project ranges, own-name and saved-field precedence, aliases, exclusion of unrelated products, range assessment and variant selection. The project-data audit checks all 389 rows, including 213 product subposts and 1,665 saved own fields. Live catalogue verification and production UI evidence are retained locally with the release.

No database migration or change to project quantities or saved product selections is required.
