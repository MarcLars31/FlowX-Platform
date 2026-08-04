# Handover – databasfasen

## Genomfört

- `20260804150000_complete_flowx_database.sql` är applicerad i Supabase-projektet
  `myzegtifgbvjhdlcpebi`.
- `20260804153000_allow_technical_description_pipeline.sql` lägger till
  teknisk-beskrivningspolicies.
- Nya tabeller täcker dokument, körningar, kravgranskning, typade attribut,
  leverantörsofferter, matchningsresultat, materiallisteversioner, exporter och
  referensprojekt.
- `project-files` är en privat Storage-bucket.
- `20260804160000_complete_organization_data_model.sql` är applicerad i
  Supabase och kompletterar profiler
  och organisationer med registreringsfält, soft-delete-fält och tabellen
  `organization_join_requests`. Godkännande/avslag sker genom tre RPC:er.
- `20260804170000_add_join_request_review_identity.sql` sparar en begränsad
  identitetssnapshot för adminvyn och är kopplad till `/organization`.
- `20260804180000_complete_invitation_lifecycle.sql` lägger till RPC:er för
  återkallad och accepterad inbjudan.

## Verifiering

Kör från `apps/web`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:authz
npm.cmd run test:rbac
npm.cmd run test:extractor
npm.cmd run test:normalizer
npm.cmd run test:technical-description
npm.cmd run build
```

Kör pgTAP-filerna i `supabase/tests`, särskilt
`flowx_database_completion.sql` och `organization_rbac_rls.sql`, mot en
transaktionell testdatabas. Kontrollera live att de 24 nya tabellerna,
policyerna och Storage-bucketen finns innan deploy.

## Nästa steg

Implementera accepter/avvisa/ändra-API för kravkandidater,
företagssökning via organisationsnummer och
matchningsmotorn med teknisk gate före ranking,
materiallisteversionering i UI, projektbunden Storage-policy och en lokal
syntetisk seed med två organisationer. Ändra inte Auth/RBAC-namn eller
befintliga projekt-/dokumenttabeller utan en ny inventering och migration.
