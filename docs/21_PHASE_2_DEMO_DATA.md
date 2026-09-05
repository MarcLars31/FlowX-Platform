# Fas 2 – säker demodatabas

## Status

Fas 2 är implementerad och verifierad lokalt. Den vanliga databasseedningen
skapar inga lösenord eller Auth-användare. Ett separat, produktionsspärrat
kommando kan skapa demokontot i lokal miljö eller staging efter att
migrationerna och demoseedningen har körts.

Den obligatoriska märkningen är:

> Demo data – ej verifierad för projektering, installation eller inköp.

## Innehåll

Demodatasetet har stabila UUID:n och innehåller:

- en fiktiv datakälla och ett versionsmärkt dataset;
- en fiktiv tillverkare;
- två produktkategorier och produktfamiljer;
- 50 fiktiva sprinklerhuvuden och en fiktiv rörkoppling med egna varianter;
- tio K-faktorer samt normaliserat arbetstryck, temperatur, respons,
  montage, anslutning, finish och värmeelement;
- fem helt fiktiva godkännandetyper med temperaturvillkor och varierande
  produktkombinationer;
- en fiktiv distributör med pris, lager och ledtid för samtliga sprinklerhuvuden;
- en demoorganisation och ett projekt;
- system, byggnad, våning, zon och position;
- PDF-metadata, en fiktiv dokumentsida och en extraktionskörning;
- ett bekräftat krav med källevidens;
- en tekniskt godkänd matchningskandidat;
- en versionsbunden materiallista.

PDF-posten är avsiktligt endast metadata. Seedningen installerar ingen binär
PDF-fil i Storage och anger detta i `extraction_result`.

## Databasskydd

Migrationen `20260806140000_harden_demo_data_safety.sql` installerar triggers
som:

- kräver `quality_status = demo_unverified` för alla rader med demodataset;
- nekar `manufacturer_verified` och `manually_verified` för demoattribut;
- nekar verifieringsanvändare och verifieringstid för demoattribut;
- validerar att `projects.demo_data_set_id` pekar på ett korrekt märkt
  demodataset;
- behåller den exakta varningstexten som databasconstraint.

Teknisk pass/fail kan användas för att demonstrera arbetsflödet, men raden
förblir alltid `demo_unverified`. Ett tekniskt demoutfall blir därmed aldrig
manufacturer-verified produktdata.

## Seed och borttagning

Normal seed:

```powershell
cd supabase
npm.cmd run verify:empty
```

Seedfilerna kan köras flera gånger utan dubletter. Borttagningsfilen ligger
separat i `supabase/seed/remove/20260806_remove_demo_data.sql` och körs aldrig
automatiskt av normal seedning. Den:

- kontrollerar datasetets stabila ID, kod, dataläge, kvalitet och varning;
- tar endast bort det identitetskontrollerade demodatasetets fixture-rader;
- kan köras flera gånger;
- bevarar append-only audit-logg och den tomma, inaktiverade
  demoorganisationsposten.

## Demokonto

Skapa aldrig demokontot i produktion. Från `apps/web` används samma hårda
miljöspärrar som för övriga testkonton:

```powershell
npm.cmd run accounts -- seed-demo-user
npm.cmd run accounts -- remove-demo-user --dry-run
npm.cmd run accounts -- remove-demo-user
```

Kontot är `flowx-demo-user@example.test`. Lösenordet läses enbart från
`TEST_ACCOUNT_PASSWORD` i testkonfigurationen och skrivs inte till loggen.
Borttagning kräver matchande fixturemarkering i både Auth `app_metadata` och
`profiles.is_test_account`.

## Gränssnitt och export

- Alla explicita `/projects/demo`-sidor visar den exakta varningen.
- Databasbaserade projekt visar varningen när `demo_data_set_id` finns.
- Projektlistan visar samma märkning för demoprojekt.
- Demo-materiallistans CSV-export placerar varningen överst och skyddar mot
  kalkylbladsformler.
- PDF-export, leverantörsutskick och verkligt godkännande är avstängda på
  demonstrationssidan tills Fas 7 implementerar de riktiga flödena.
- `localStorage` och `mock-data.ts` används endast av de uttryckliga äldre
  demonstrationssidorna, inte av riktiga projekt- eller produktflöden.

## Verifiering

Tomdatabaskontrollen bevisar att:

- hela migrationskedjan går att köra från tom databas;
- seedningen är idempotent;
- demoprojekt, 50 sprinklerhuvuden och PDF-metadata finns;
- alla sprinklerhuvuden har minst ett fiktivt godkännande och katalogen har
  tio olika K-faktorer;
- demo inte kan uppgraderas till verifierad data;
- borttagningen kan köras två gånger;
- övriga tekniska och tenantbaserade säkerhetsspärrar fortfarande fungerar.
