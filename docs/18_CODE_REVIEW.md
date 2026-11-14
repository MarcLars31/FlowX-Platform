# Kodgranskning efter databasleveransen

## Åtgärdat

- Teknisk beskrivningsimport sparar nu projektfilmetadata, Storage-objekt,
  sidor, körning och kravkandidater när den körs med projekt.
- Källkandidat och kravset kopplas till befintliga `project_requirements`.
- Nytt Storage-helper använder aktuell användares token och aldrig service role.
- Handhållna domäntyper dokumenterar den nya databaskontrakten.

## Kvar att refaktorera

- Matchningsmotor, kompatibilitetsregler, ranking och kommersiell optimering är
  ännu främst databasgrund; de måste implementeras som separata tjänster/API:er.
- Produktkatalogens fulla genererade Supabase-typer bör checkas in när CI kan
  köra `supabase gen types`.
- OCR och stora PDF-filer bör flyttas från synkron Route Handler till kö/worker.
- Storage-policy bör i nästa fas verifiera projektsegmentet via metadata.
- Seed-fixture för två organisationer och kompletta matchningsresultat saknas;
  befintliga pgTAP-fixtures är säkra och syntetiska.

Undvik nya parallella tabeller eller direkt klientåtkomst till service role.
