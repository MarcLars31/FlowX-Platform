# FlowX ER-diagram

Diagrammen visar kanoniska tabeller. Kompatibilitetsvyer är utelämnade för att
inte ge intrycket att samma information lagras två gånger.

## Tenant, användare och projekt

```mermaid
erDiagram
  auth_users ||--|| profiles : "har profil"
  organizations ||--o{ organization_members : "har medlemmar"
  roles ||--o{ organization_members : "tilldelas"
  roles ||--o{ role_permissions : "ger"
  permissions ||--o{ role_permissions : "ingår"
  organizations ||--o{ teams : "har team"
  teams ||--o{ team_members : "har"
  organizations ||--o{ projects : "äger"
  projects ||--o{ project_members : "ger åtkomst"
  projects ||--o{ project_systems : "har system"
  projects ||--o{ project_buildings : "har byggnader"
  project_buildings ||--o{ project_floors : "har våningar"
  project_floors ||--o{ project_zones : "har zoner"
  project_zones ||--o{ project_positions : "har positioner"
  project_systems ||--o{ project_system_zones : "betjänar"
  project_zones ||--o{ project_system_zones : "kopplas till"
  projects ||--o{ audit_logs : "spåras indirekt"
```

## Dokument och krav

```mermaid
erDiagram
  projects ||--o{ project_documents : "innehåller"
  project_documents ||--o{ document_pages : "har sidor"
  project_documents ||--o{ extraction_runs : "extraheras i"
  extraction_runs ||--o{ requirement_candidates : "föreslår"
  projects ||--o{ requirement_sets : "versionerar"
  requirement_sets ||--o{ project_requirements : "innehåller"
  requirement_candidates ||--o{ project_requirements : "kan bli"
  project_requirements ||--o{ requirement_evidence : "stöds av"
  project_requirements ||--o{ requirement_reviews : "granskas i"
  project_requirements ||--o{ project_requirement_conflicts : "kan ingå i"
  attribute_definitions ||--o{ project_requirements : "typbestämmer"
  unit_definitions ||--o{ project_requirements : "normaliserar"
  attribute_definitions ||--o{ attribute_synonyms : "har synonymer"
  unit_definitions ||--o{ unit_conversions : "konverteras från/till"
```

## Produkt, dokument, godkännande och regler

```mermaid
erDiagram
  data_sources ||--o{ data_sets : "publicerar"
  manufacturers ||--o{ product_families : "äger"
  categories ||--o{ product_families : "klassificerar"
  product_families ||--o{ products : "innehåller"
  products ||--o{ product_variants : "har"
  products ||--o{ product_attribute_values : "har värden"
  product_variants ||--o{ product_attribute_values : "har värden"
  attribute_definitions ||--o{ product_attribute_values : "definierar"
  products ||--o{ product_documents : "dokumenteras av"
  documents ||--o{ product_documents : "kopplas via"
  documents ||--o{ product_document_versions : "versioneras"
  products ||--o{ product_approvals : "godkänns genom"
  approvals ||--o{ product_approvals : "tilldelas"
  product_approvals ||--o{ approval_conditions : "begränsas av"
  rule_packages ||--o{ rule_package_versions : "versioneras"
  rule_package_versions ||--o{ rule_definitions : "innehåller"
  compatibility_rule_sets ||--o{ compatibility_rules : "innehåller"
  compatibility_rules ||--o{ compatibility_rule_conditions : "har villkor"
  product_compatibility_groups ||--o{ product_compatibility_group_members : "har medlemmar"
  data_sets ||--o{ products : "märker proveniens"
```

## Import och kommersiell data

```mermaid
erDiagram
  data_sources ||--o{ import_jobs : "startar"
  data_sets ||--o{ import_jobs : "produceras av"
  import_jobs ||--o{ import_job_rows : "har rader"
  import_jobs ||--o{ import_errors : "har fel"
  data_sources ||--o{ external_product_mappings : "mappar"
  data_sources ||--o{ external_attribute_mappings : "mappar"
  suppliers ||--o{ supplier_products : "säljer"
  products ||--o{ supplier_products : "mappas till"
  product_variants ||--o{ supplier_products : "mappas till"
  supplier_products ||--o{ supplier_offers : "har erbjudanden"
  supplier_offers ||--o{ offer_history : "historiseras"
  suppliers ||--o{ price_lists : "publicerar"
  price_lists ||--o{ price_list_items : "innehåller"
  supplier_products ||--o{ stock_levels : "lagerförs"
  supplier_products ||--o{ lead_times : "har ledtid"
```

## Teknisk grind, ranking och materiallista

```mermaid
flowchart LR
  R["Bekräftat kravset"] --> MR["Match run"]
  MR --> MC["Kandidat"]
  MC --> RE["Obligatoriska kravkontroller"]
  MC --> CE["Kompatibilitetskontroller"]
  RE --> TG{"Alla obligatoriska krav PASS?"}
  CE --> CG{"Kompatibilitet PASS / N/A?"}
  TG -- Nej eller okänt --> BLOCK["Blockerad / kräver granskning"]
  CG -- Nej eller okänt --> BLOCK
  TG -- Ja --> ELIGIBLE["Tekniskt möjlig"]
  CG -- Ja --> ELIGIBLE
  ELIGIBLE --> RANK["Kommersiell ranking"]
  RANK --> DECISION["Spårbart beslut"]
  DECISION --> BOM["Materiallista"]
  BOM --> EXPORT["Export"]
```

Databasconstraints stoppar en direkt genväg från kommersiell ranking till vald
produkt. Ett tekniskt `fail` eller `unknown` måste lösas i tekniska data eller
kravgranskningen, inte med pris, lager, leveranstid eller ett fritextundantag.
