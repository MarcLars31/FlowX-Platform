# FlowX databasarkitektur

## Status

FAS 1 bygger vidare på FlowX befintliga PostgreSQL- och Supabase-modell. Den
skapar inte en parallell databas. Följande tabeller är fortsatt kanoniska:

- `organizations` för företag/tenants
- `organization_members` för företagsmedlemmar
- `projects` för projekt
- `products` för produktmodeller
- `product_variants` för beställningsbara tekniska varianter
- `suppliers` och `supplier_offers` för kommersiell information
- `match_runs` och `match_candidates` för produktmatchning
- `exports` för exporter

Kompatibilitetsvyer ger de begärda namnen `companies`, `company_members`,
`product_categories`, `matching_results` med flera. Vyerna använder
`security_invoker = true`; underliggande RLS gäller och information kopieras
inte.

## Migrationer i FAS 1

| Migration | Syfte |
| --- | --- |
| `20260701000000_baseline_legacy_product_schema.sql` | Återskapar den historiska produktbas som tidigare endast fanns i PDF Extractor. Innehåller inget seeddata. |
| `20260806100000_create_flowx_domain_architecture.sql` | Projektstruktur, kravstatus, enheter, produktfamiljer, dokumentversioner, godkännandevillkor och regelpaket. |
| `20260806110000_create_flowx_data_and_commercial_architecture.sql` | Proveniens, demodata, importer, externa mappningar, prislistor, lager, ledtid, beslut och revisionshistorik. |
| `20260806120000_enforce_flowx_security_and_technical_gate.sql` | RLS, rättigheter, scope-kontroller och den icke-förbikopplingsbara tekniska grinden. |
| `20260806130000_align_canonical_organization_roles.sql` | Kopplar de kanoniska rollerna till säkra inbjudnings-, rollbytes- och inaktiveringsflöden. |
| `20260806140000_harden_demo_data_safety.sql` | Hindrar demodata från att uppgraderas till verifierad kvalitet och validerar projektens demomarkering. |

Alla migrationsfiler körs i filnamnsordning. Verifieringsverktyget startar en
verklig tom PostgreSQL-motor, skapar Supabase-kompatibla `auth`- och
`storage`-objekt, kör hela kedjan och kör seedfilen två gånger:

```powershell
cd supabase
npm.cmd install
npm.cmd run verify:empty
```

Senast verifierat resultat: 31 migrationer, 159 publika tabeller/vyer och en
idempotent seedfil.

## Företag, användare och behörighet

| Tabeller | Syfte |
| --- | --- |
| `profiles` | Applikationsprofil. `auth.users` är auktoritativ för identitet och e-post. |
| `organizations` | Kanoniskt företag/tenant. UUID är tenantnyckel. |
| `organization_members` | Användare, roll och status i ett företag. |
| `organization_invitations`, `organization_join_requests` | Inbjudan respektive ansökan om medlemskap. |
| `roles`, `permissions`, `role_permissions` | Datadriven RBAC. |
| `organization_subscriptions`, `organization_seat_limits` | Abonnemang och platsgränser; betalning kan kopplas in senare. |
| `teams`, `team_members` | Team inom ett företag. |
| `audit_logs` | Append-only revisionslogg för tenantdata. |

Rollerna `company_admin`, `project_manager`, `engineer` och `viewer` finns som
systemroller och ärver de beprövade rättigheterna från
`organization_admin`, `full_user` respektive `read_only`. Inbjudnings- och
medlemsflödet använder de nya rollerna. De äldre rollerna behålls för befintliga
medlemskap under en bakåtkompatibel övergång.
`platform_admin` är skyddad: faktisk behörighet kommer endast från signerad
`auth.app_metadata.role`. En trigger förbjuder att rollen tilldelas som vanlig
organisationsroll.

## Projektmodell

| Tabeller | Syfte och viktig relation |
| --- | --- |
| `projects` | Projektrot med `organization_id`, livscykel och soft delete. |
| `project_settings`, `project_modules` | Konfiguration och aktiverade projektmoduler. |
| `project_members` | Explicit projektåtkomst med projektroll. |
| `project_systems` | Tekniska systeminstanser i projektet. |
| `project_buildings` | Byggnader i projektet. |
| `project_floors` | Tillhör exakt en byggnad. |
| `project_zones` | Tillhör exakt ett våningsplan. |
| `project_positions` | Märkta positioner i en zon. |
| `project_system_buildings`, `project_system_zones` | Kopplar ett system över flera byggnader eller zoner. |
| `project_system_types`, `project_standards`, `project_supplier_options` | Projektets systemtyper, standardval och leverantörspreferenser. |
| `project_versions` | Projektsnapshot och förändringshistorik. |

Hierarkin är `Project → Building → Floor → Zone → Position`. System är en
syskonstruktur under projektet och kopplas via relationstabeller. Det undviker
den felaktiga begränsningen att ett system endast skulle kunna tillhöra en
byggnad.

Alla nya hierarkitabeller använder sammansatta foreign keys med
`organization_id` och `project_id`. En rad kan därför inte kopplas till en
förälder från ett annat företag eller projekt, även om ett request-body-värde
manipuleras.

## Dokument, PDF och extraktion

| Tabeller | Syfte |
| --- | --- |
| `project_documents`, `document_pages`, `extraction_runs` | Projektfiler, sidtext/OCR och extraktionskörningar. |
| `technical_description_documents`, `technical_description_material_lines`, `technical_description_rule_hints` | Den separata extraktorn för tekniska beskrivningar. |
| `technical_descriptions`, `technical_description_versions` | Godkända versionsbundna tekniska beskrivningar. |
| `documents`, `product_document_versions`, `product_documents` | Global produktdokumentkatalog, filrevisioner och produktkoppling. |
| `product_document_pages`, `product_document_processing_attempts`, `product_document_error_codes` | Databladssidor, bearbetningsförsök och normaliserade fel. |
| `product_document_review_items`, `product_change_proposals`, `product_field_locks`, `product_field_provenance`, `product_field_change_history`, `product_ingestion_audit_events`, `product_extraction_field_rules` | Produktdatabladets gransknings-, lås-, proveniens- och ändringsflöde. |
| `extraction_jobs`, `extraction_raw_lines`, `product_datasheet_imports` | Legacy-kompatibel råextraktion från PDF Extractor. |

`project_documents` är projektunderlag. `documents` är produktdatablad. Dessa
områden ska inte blandas ihop.

## Kravmodell

| Tabeller | Syfte |
| --- | --- |
| `requirement_candidates` | Maskinextraherade kandidater som ännu inte är projekteringskrav. |
| `requirement_sets` | Versionsbundna grupper av projektkrav. |
| `project_requirements` | Normaliserade projektkrav. |
| `requirement_evidence` | Kanonisk käll- och evidenstabell. |
| `requirement_reviews` | Immutable historik över användarens status- eller värdeändringar. |
| `project_requirement_conflicts` | Konflikter mellan krav och föreslagna lösningar. |
| `attribute_definitions`, `attribute_synonyms` | Tekniska attribut och deras namnvarianter. |
| `unit_definitions`, `unit_conversions` | Normaliserade enheter och linjära konverteringar. |

Kravtypen är enum `requirement_kind`:

- `must`
- `conditional_must`
- `exclusion`
- `should`
- `preference`
- `informational`
- `unresolved`

Granskningsstatus är enum `requirement_review_status`:

- `user_confirmed`
- `user_modified`
- `extracted_unreviewed`
- `inferred_unreviewed`
- `conflicted`
- `rejected`
- `superseded`

Tidigare statusvärden migreras databevarande. Frontend-API:erna använder de nya
värdena.

## Produkt- och regelmodell

| Tabeller | Syfte |
| --- | --- |
| `manufacturers` | Tillverkare oberoende av extern leverantör. |
| `categories` | Hierarkiska produktkategorier. |
| `product_families` | Tillverkarens produktfamilj. |
| `products` | Gemensam produktmodell mellan familj och variant. |
| `product_variants` | Teknisk/beställningsbar variant. |
| `product_attribute_values` | Typade tekniska värden för produkt eller variant. |
| `product_images`, `product_synonyms`, `product_relationships` | Bilder, söknamn och produktrelationer. |
| `certifications`, `product_certifications`, `standards`, `product_standards` | Legacy-certifiering och standardkopplingar. |
| `approvals`, `product_approvals`, `approval_conditions` | Normaliserade godkännanden och strukturerade användningsvillkor. |
| `rule_packages`, `rule_package_versions`, `rule_definitions` | Versionerade regelpaket. |
| `compatibility_rule_sets`, `compatibility_rules`, `compatibility_rule_conditions` | Maskinläsbara kompatibilitetsregler. |
| `product_compatibility_groups`, `product_compatibility_group_members` | Produktgrupper som kan användas tillsammans. |
| `compatibility_evaluations` | Resultat av kompatibilitetskontroller. |
| `accessories`, `accessory_product_compatibility` | Legacy-tillbehör och koppling till produkt. |

Ett godkännandevillkor har typ, operator, exakt ett typat värde, valfri andra
gräns och normaliserad enhet. Dimension, tryck, temperatur, material,
systemtyp, användningsområde, installationsmetod, region och dokumentrevision
kan uttryckas utan att begravas i fri text.

## Leverantörer och kommersiell data

| Tabeller | Syfte |
| --- | --- |
| `suppliers`, `supplier_products` | Leverantörer/distributörer och deras artikelnummer. |
| `supplier_offers` | Aktuell organisationsspecifik pris-, lager- och ledtidsobservation. |
| `price_lists`, `price_list_items` | Versions- och giltighetsstyrda prislistor. |
| `stock_levels`, `lead_times` | Tidsstämplade observationer per lager/region. |
| `offer_history` | Automatisk historik för ändringar i `supplier_offers`. |
| `commercial_scenarios` | Vikter och kommersiella scenarier som endast får användas efter teknisk godkänning. |

Tekniska värden lagras aldrig i prislistan. Pris, lager och ledtid kan aldrig
ändra ett tekniskt `fail` till `pass`.

## Matchning, materiallista och export

| Tabeller | Syfte |
| --- | --- |
| `analyses` | Projektanalysens övergripande körning. |
| `match_runs` | En reproducerbar matchningskörning mot ett kravset. |
| `match_candidates` | Kandidat, tekniskt resultat, granskningsläge och eventuell ranking. |
| `requirement_evaluations` | Kontroll av ett krav mot en kandidat. |
| `matching_decisions`, `matching_overrides` | Spårbara användarbeslut och granskningsbegäran. |
| `project_product_suggestions`, `project_decisions` | Projektets presenterade förslag och generella beslut. |
| `material_lists`, `material_list_versions`, `material_list_items`, `material_list_item_alternatives` | Materiallistor, revisioner, valda rader och alternativ. |
| `exports` | Exportjobb och skapade filer. |
| `reference_projects`, `reference_project_products` | Anonymiserbara referensprojekt och utfall. |
| `material_estimation_rules`, `material_estimates`, `material_estimate_items` | Areabaserad demo/estimering från tekniska beskrivningar. |

Databasen verkställer följande ordning:

1. obligatoriska krav kontrolleras
2. godkännande och användningsområde kontrolleras
3. kompatibilitet kontrolleras
4. endast `technical_result = pass` och `review_status = eligible` får ranking
5. först därefter får kommersiella faktorer användas

Constraints på `match_candidates` förbjuder ranking och kommersiella faktorer
för en ej godkänd kandidat. Triggers räknar om grinden när krav- eller
kompatibilitetsresultat ändras. En vald materiallistrad måste ha
`technical_status = pass` och kompatibilitet `pass` eller `not_applicable`.
`override_reason` kan dokumentera ett beslut men kan inte kringgå grinden.

## Import, Sprsok och proveniens

| Tabeller | Syfte |
| --- | --- |
| `data_sources`, `data_sets` | Källa, licens/konfiguration, dataläge, version, kvalitet och disclaimer. |
| `import_jobs`, `import_job_rows`, `import_errors` | Generellt återupptagningsbart importflöde. |
| `external_product_mappings`, `external_attribute_mappings` | Stabil mappning från extern modell till FlowX. |
| `catalog_imports`, `catalog_import_errors` | Befintlig katalogimport, fortsatt kompatibel. |
| `sprsok_products`, `sprsok_source_snapshot`, `sprsok_product_search_index` | Sprsok-källa, snapshot och sökindex. |
| `sprsok_sync_runs`, `sprsok_sync_page_logs`, `sprsok_sync_errors` | Synkkörning, sidlogg och fel. |
| `sprsok_review_queue`, `sprsok_datasheet_discovery_queue` | Manuell avstämning och databladskö. |
| `catalog_revision_history` | Append-only historik för globala katalogobjekt. |

`flowx_data_mode` har `demo`, `external_unverified` och `verified`.
`data_quality_status` har `demo_unverified`, `source_unverified`,
`under_review`, `verified`, `rejected` och `expired`.

Demodata måste vara kopplad till ett `data_sets`-objekt med exakt text:

> Demo data – ej verifierad för projektering, installation eller inköp.

En databasconstraint nekar ett demo-dataset med annan eller tom text.

## Index och constraints

Alla primärnycklar är UUID. Tidsstämplade domänobjekt använder `created_at` och
`updated_at`; historikobjekt är append-only. `deleted_at` används där poster ska
kunna återställas eller bevaras för revision.

Viktiga indexmönster:

- `(organization_id, project_id)` och projektets status/tid för tenantsökning
- partiella unika index med `where deleted_at is null`
- `(data_set_id, quality_status)` för proveniens och demofiltrering
- `(supplier_product_id, observed_at desc)` för senaste pris/lager/ledtid
- `(match_run_id, review_status, ranking_score desc)` för matchningsresultat
- GIN-index för befintliga JSONB-fält där filtrering används

Viktiga constraints:

- sammansatta foreign keys håller projekthierarkin inom samma tenant/projekt
- typade värden använder `num_nonnulls` för exakt en representation
- mängder, priser, filstorlekar, area och ledtid kan inte vara negativa
- giltighetsintervall kräver `valid_to >= valid_from`
- `match_candidates_eligible_requires_pass`
- `match_candidates_ranking_requires_eligibility`
- `match_candidates_commercial_requires_eligibility`
- `material_list_items_selected_technical_gate`
- `data_sets_demo_disclaimer`

## Triggers och funktioner

| Funktion/trigger | Ansvar |
| --- | --- |
| `set_updated_at` | Gemensam tidsstämpel på uppdateringar. |
| `enforce_database_project_scope` | Kontrollerar direkt projekt/tenant-scope. |
| `enforce_material_list_version_scope` | Kontrollerar indirekt scope via materiallista och match run. |
| `enforce_reference_project_scope` | Kontrollerar referensprojektets källprojekt. |
| `protect_platform_admin_membership` | Stoppar plattformsroll i organisationsmedlemskap. |
| `capture_requirement_review` | Skapar granskningshistorik när ett krav ändras. |
| `recompute_match_candidate_technical_gate` | Räknar om kandidatens tekniska status. |
| `refresh_candidate_from_requirement_evaluation` | Reagerar på kravkontroll. |
| `refresh_candidates_from_compatibility_evaluation` | Reagerar på kompatibilitetskontroll. |
| `validate_matching_decision` | Förbjuder val av ej tekniskt godkänd kandidat. |
| `validate_material_list_item_selection` | Förbjuder ej godkänd rad i materiallista. |
| `capture_supplier_offer_history` | Skapar offert-/prishistorik. |
| `capture_catalog_revision` | Skapar global produktrevisionshistorik. |

Alla interna `SECURITY DEFINER`-funktioner har fast `search_path` och är
återkallade från `anon` och `authenticated`. Endast avsedda RPC-funktioner är
körbara av klientroller.

## RLS-matris

| Data | Läsning | Skrivning |
| --- | --- | --- |
| Projektstruktur och krav | `can_access_project` + relevant permission | Projektåtkomst + uppdateringspermission |
| Tenantpris, lager, ledtid | Aktiv medlem + `product.view` | `product.import` |
| Importjobb | Platform admin eller samma organisation | Platform admin eller `product.import` |
| Global teknisk katalog | Autentiserad och endast publicerbar status enligt befintlig policy | Backend `service_role` eller explicit platform-admin-policy där sådan finns |
| Regel-, enhets- och proveniensdata | Autentiserad | Platform admin/backend |
| Tenant-audit | Tillåten organisationsadmin | Endast interna auditfunktioner |
| Global kataloghistorik | Platform admin | Endast katalogtriggers |

RLS är den sista säkerhetsgränsen. Frontendens dolda menyval räknas inte som
behörighetskontroll.

## Kompatibilitetsvyer

| Begärt namn | Kanonisk källa |
| --- | --- |
| `companies`, `company_members`, `company_invitations` | `organizations`, `organization_members`, `organization_invitations` |
| `product_categories`, `product_attributes` | `categories`, `attribute_definitions` |
| `requirement_sources`, `requirement_conflicts` | `requirement_evidence`, `project_requirement_conflicts` |
| `distributors`, `distributor_offers` | `suppliers`, `supplier_products`, `supplier_offers` |
| `analysis_runs` | `analyses` |
| `matching_runs`, `matching_candidates`, `matching_results` | `match_runs`, `match_candidates` |
| `matching_result_checks` | `requirement_evaluations` |
| `compatibility_checks`, `compatibility_rule_results` | `compatibility_evaluations` |
| `material_list_exports` | `exports` |

Se [04_DATABASE_ER_DIAGRAM.md](04_DATABASE_ER_DIAGRAM.md) för relationsdiagram.
