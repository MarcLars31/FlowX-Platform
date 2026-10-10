# Regler och regelflaggningar

Sidan `/regler` visar 116 regelbeskrivningar i 14 grupper med sökning, typfilter, villkor/resultat, exempel, poängtabeller, undantag och versionsbundna källänkar. Katalogen sammanfattar kodversion `4868d66`; den är inte en automatisk förteckning över varje kodvillkor eller en redigerbar regelmotor. Den nya sidan ändrar inte produktmatchningen.

Varje regel kan flaggas som **Fel på regel** eller **Föreslå ändring**, med en obligatorisk kommentar på högst 3 000 tecken. Alla rapporter samlas i **Flaggade regler**, med filter för öppna, hanterade och alla rapporter. En rapport kan öppnas igen. Regelns ID, titel och granskade kodversion sparas tillsammans med rapporten.

Rapporter lagras i `matching_rule_feedback`. Kundanvändare behöver aktivt medlemskap och `project.product_suggestion.view`, och ser endast rapporter i sin valda organisation. Plattformens administratörer ser alla rapporter och kan rapportera även utan kundmedlemskap. Rapportören och organisationens administratörer kan ändra status; innehåll, författare och organisation är oföränderliga. Plattformens administratörer kan hantera alla rapporter. API och databas kontrollerar båda behörigheterna. Statusbyten tidsstämplas i databasen. Ett stabilt rapport-ID skyddar mot dubblering vid omförsök.

Migrering: `supabase/migrations/20260927120000_add_matching_rule_feedback.sql`. Tillämpa före publicering av webbappen. Den lägger enbart till rapportlagring, index, trigger och behörigheter till den nya tabellen.

## Verifiering

- `npm run test:rules`: validering, organisationsgränser, regelreferenser och källkodsändringar.
- `node supabase/scripts/verify-empty-database.mjs`: samtliga 53 migreringar och särskilda prov för beständig rapportlagring, RLS, författare/administratör, återöppning, spärrad ändring av innehåll, återkallat medlemskap och anonym åtkomst.
- TypeScript, ESLint och produktionsbygge kontrollerade. Två äldre ofullständiga testobjekt i mängdtestet har kompletterats så att hela TypeScript-kontrollen kan köras.
- Webbläsarprov omfattar formulärvalidering, sparad flagga, samlingsvy, hanterad/öppen status, historik och omladdning.

`matching-rule-source-snapshot.json` innehåller kontrollsummor för de 32 refererade källfilerna. Vid kodändring fallerar `test:rules` tills beskrivningarna har granskats och kontrollsummorna uppdaterats. Detta skyddar mot inaktuella beskrivningar, men bevisar inte att varje kodgren har en egen regelbeskrivning.

## Lokal förhandsvisning

Från `apps/web`:

```powershell
$env:SCIPX_RULES_PREVIEW='1'
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3190
```

Förhandsvisningen kräver både `NODE_ENV=development` och `SCIPX_RULES_PREVIEW=1`. Rapportflödet använder då tydligt märkta testflaggningar i webbläsarens lokala lagring. API:et har ingen inloggningsfri testväg. I produktion krävs ordinarie inloggning och flaggningarna sparas i databasen.
