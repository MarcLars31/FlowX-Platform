# Arbetsflöde vid produktval

1. Gå igenom postens krav. Specifikationen visas först, med mängd, NS-kod,
   attribut, standardreferenser och möjlighet att läsa hela PDF-texten och
   tilläggskraven eller öppna käll-PDF:en.
2. Välj huvudprodukt.
3. Komplettera med tillbehör via postens tillbehörsgrupper.
4. Godkänn och spara huvudprodukten och tillbehören tillsammans.

Den separata checklistan med ett beslut per krav visas inte längre och
spärrar inte godkännandet. Produktvalet skapar inga automatiskt avbockade
krav eller påståenden om verifierad kravuppfyllelse. Befintliga varningar om
produktavvikelser och saknade data behålls, liksom validering av artiklar
och tillbehörsmängder. Godkännandet kräver fortfarande användarens klick.

Delprodukter lagras med den befintliga tillbehörsmodellen. Mängden är per
postenhet, till exempel per skåp eller per meter, och multipliceras med postens
mängd i materialexporten. Tidigare sparade kravgenomgångar ändras inte.
Äldre klienter som skickar en detaljerad genomgång får den fortfarande
validerad. Massgodkännande för detaljerade PDF-poster är fortsatt avstängt.

## Huvudprodukt före tillbehör

Produktkortet visar kraven före produktvalet och huvudproduktens sökning före
tillbehören. För fördelarskåp läser motorn ut separata
delar för kall-/varmvattenfördelare, dränering samt uttryckligen beskrivna
kopparanslutningar och nya PEX-ledningar. Valfria ventilfält är valfria
delar, medan tryckklass och material förblir tekniska krav.

När skåpet väljs startar sökningen för första obligatoriska delen automatiskt.
Övriga delars knappar öppnar förberedda sökningar utan att användaren behöver
skriva sökord. Kända systemnamn i huvudprodukten används som sökhjälp.
Ahlsells resultat filtreras efter vald deltyp; gemensamt systemnamn innebär
inte verifierad kompatibilitet. Rörlängder lämnas tomma för användarens mängdning.

Delar som ingår i huvudproduktens leverans behöver inte läggas till igen.
Samma flöde gäller kompletta rörlängdsposter, exempelvis 33.2.2.1 och 33.2.2.2.
Rör är huvudprodukten även när en gammal extraktion har kategorin rördel.
Ändlock, böjar, T-stycken, kopplingar och upphängning söks separat efter rörvalet.
När röret väljs fälls huvudförslagen ihop till en sammanfattning av det valda
röret. Direkt under visas postens tillbehörsgrupper. Användaren klickar på
en grupp för att starta den förberedda sökningen och se produktalternativen
i samma rad. Efter tillbehörsvalet stängs alternativen och vald artikel visas
på gruppen. Användaren kan sedan öppna nästa grupp eller byta/ta bort röret.
Huvudförslag från katalogen och tidigare val filtreras så att rördelar inte
kan visas som rör. DN följer aktuell underpost; gängat eller rillat sökord
hämtas från det valda röret när anslutningen framgår. Tillåtna alternativ i
PDF-posten ska båda kunna matcha. Delarna bedöms mot egen produktfamilj,
DN och tryckkrav utan att ärva själva rörets materialkrav.

Rördelars mängd lämnas tom. Befintlig tillbehörslagring anger mängd per
enhet av huvudposten, här per meter rör; export multiplicerar med postens
rörlängd. Programmet räknar inte ut antal delar från rörlängden. Antal,
vinklar, grenanslutningar och kompatibilitet ska kontrolleras mot ritning
innan hela posten godkänns.

Sprinklerposter får samma arbetsordning. Alarmventilsetets uttryckliga krav på
retardationskammare och alarmgivarsetets extra alarmgivare visas separat.
Sprinklerhuvudens rosett/täckbricka och skydd följer montagevillkoren; ”Nei”
skapar inget tillbehör. Delar på egna mängdsatta PDF-poster beställs inte
automatiskt igen. Poster utan namngivna tillbehör kan gå vidare till godkännandet.

Tillbehörssökningen skickar komponentens id och huvudproduktens NRF till servern.
Servern slår upp artikeluppgifterna, söker delens produktgrupp hos Ahlsell och
läser produktdetaljer innan bedömningen. Rördelar med konstaterad konflikt i
dimension, tryckklass, skarv eller uttryckligt rillsystem sorteras bort. Saknade
uppgifter ger kontrollbehov, aldrig verifierad kompatibilitet. Kända tillverkar-
och modellnamn är sökhjälp; projekttext används inte som extern sökfråga.
Valda delar visas i delöversikten som ”Vald för kontroll”. Hela posten kräver
fortfarande användarens genomgång och slutliga godkännande.

## Driftsättning

Ingen ny databasmigration behövs för det förenklade flödet. Nya produktval
utan detaljerad kravgenomgång sparas med den befintliga funktionen
`approve_distributor_product_mapping_v2`. Behörighetskontroller och uttryckligt
godkännande gäller som tidigare. Om en äldre klient skickar en genomgång
valideras den mot aktuella krav och sparas atomärt med
`approve_distributor_product_mapping_v3`; fel får inte falla tillbaka till
godkännande utan den inskickade genomgången.

## Verifiering

- `npm run test:requirement-review`: komplett/delvis genomgång, flera artiklar,
  ändrade krav och mängder, valfria krav, serialisering och massgodkännande.
- `npm run test:distributor-mapping`: befintlig produktmatchning och produktval.
- `cd supabase && npm run verify:empty`: hela migrationskedjan samt tester av
  sparning, behörighetsflöde, samtidig ändring och återställning vid fel.
