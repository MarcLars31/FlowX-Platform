# FlowX-databas: seedstrategi

FlowX kör ingen automatisk produkt- eller organisationsseed mot en delad miljö.
Det skyddar befintlig katalogdata och undviker att lokala test-ID:n blandas med
produktionens organisationer, användare och produkter.

För databasverifiering används i stället transaktionella pgTAP-fixtures:

- `supabase/tests/organization_rbac_rls.sql`
- `supabase/tests/flowx_database_completion.sql`

Testerna körs i en rollback-transaktion och lämnar ingen data efter sig. En
separat syntetisk katalogseed kan läggas till när den slutliga katalogmodellen
och testorganisationerna är fastställda; den ska då köras endast i lokal eller
dedikerad staging-miljö och aldrig innehålla riktiga användare eller hemligheter.
