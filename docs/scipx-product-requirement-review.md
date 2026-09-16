# Kravgenomgång vid produktval

Produktposter med PDF-text, NS-kod, attribut eller standardreferenser måste
gås igenom innan ett nytt produktval godkänns. Genomgången visar postens mängd,
strukturerade krav, tilläggstext och den fullständiga extraherade källtexten.
För rörposter som uttryckligen inkluderar delar visas även separata kontroller
för böjar, T-stycken, ändlock och upphängning när dessa nämns.

Varje krav kan kopplas till en eller flera artiklar i postens produktval.
Delprodukter lagras med den befintliga tillbehörsmodellen. Mängden är per
postenhet, till exempel per skåp eller per meter, och multipliceras med postens
mängd i den befintliga materialexporten. Montage, ritningskrav och andra
åtgärder dokumenteras med en obligatorisk kommentar. Endast uttryckligen
valfria krav kan markeras som inte tillämpliga, med motivering.

Genomgången är användarens dokumenterade kontroll mot underlaget. Att koppla
en artikel innebär ingen automatisk teknisk verifiering. Befintliga varningar
om produktavvikelser och saknade data behålls. Generella kapitelkrav måste
finnas med i extraktionen eller kontrolleras i käll-PDF:en; denna funktion
ersätter inte tolkningen av dokumentet och projekteringen.

Godkännande kräver att varje punkt har hanterats och att användaren bekräftar
hela det aktuella produktvalet. Ändrade eller borttagna artiklar/mängder
ogiltigförklarar kopplade kontroller. Slutbekräftelsen blir ogiltig vid ändrade
produkter eller beslut. Ändrade PDF-krav kräver en ny genomgång. Tidigare
produktminnen kan föreslå artiklar men återanvänder inte genomgången;
massgodkännande är avstängt för poster som kräver genomgång.

Sparade genomgångar finns i `product_snapshot.requirementReview` med kravtext,
beslut, artikelkopplingar, kommentarer, tidpunkt och användare. Äldre sparade
produktgodkännanden lämnas kvar; vid nästa godkännande krävs genomgången.
Osparade genomgångar omfattas av produktkortets befintliga varning vid byte
eller stängning. De sparas först tillsammans med godkännandet.

## Huvudprodukt före tillbehör

Produktkortet visar huvudproduktens sökning först. Kravgenomgången blir
tillgänglig efter huvudproduktvalet. För fördelarskåp läser motorn ut separata
delar för kall-/varmvattenfördelare, dränering samt uttryckligen beskrivna
kopparanslutningar och nya PEX-ledningar. Valfria ventilfält är valfria
delar, medan tryckklass och material förblir tekniska krav.

När skåpet väljs startar sökningen för första obligatoriska delen automatiskt.
Övriga delars knappar öppnar förberedda sökningar utan att användaren behöver
skriva sökord. Kända systemnamn i huvudprodukten används som sökhjälp.
Ahlsells resultat filtreras efter vald deltyp; gemensamt systemnamn innebär
inte verifierad kompatibilitet. Rörlängder lämnas tomma för användarens mängdning.

Varje del följs upp i steg 3. En del som ingår i skåppaketet kan kopplas till
huvudprodukten i stället för en separat artikel. Artikelvalet kryssar inte
automatiskt av kraven. Samma flöde gäller kompletta rörlängdsposter, exempelvis 33.2.2.1 och 33.2.2.2.
Rör är huvudprodukten även när en gammal extraktion har kategorin rördel.
Ändlock, böjar, T-stycken, kopplingar och upphängning söks separat efter rörvalet.
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
automatiskt igen. Poster utan namngivna tillbehör visar produktens kontrollpunkter.

Tillbehörssökningen skickar komponentens id och huvudproduktens NRF till servern.
Servern slår upp artikeluppgifterna, söker delens produktgrupp hos Ahlsell och
läser produktdetaljer innan bedömningen. Rördelar med konstaterad konflikt i
dimension, tryckklass, skarv eller uttryckligt rillsystem sorteras bort. Saknade
uppgifter ger kontrollbehov, aldrig verifierad kompatibilitet. Kända tillverkar-
och modellnamn är sökhjälp; projekttext används inte som extern sökfråga.
Valda delar visas i delöversikten som ”Vald för kontroll”. Hela posten kräver
fortfarande användarens genomgång och slutliga godkännande.

## Driftsättning

Kör `20260916120000_add_product_requirement_review.sql` före webbversionen.
API:t kontrollerar genomgången mot projektets aktuella krav och skickar
godkännande och genomgång till `approve_distributor_product_mapping_v3`.
RPC:n kontrollerar behörighet, låser kravraden och avvisar ändrat underlag.
Alla skrivningar ingår i samma transaktion. Saknas RPC:n stoppas sparningen
utan att en äldre godkännandefunktion används som reservväg.

## Verifiering

- `npm run test:requirement-review`: komplett/delvis genomgång, flera artiklar,
  ändrade krav och mängder, valfria krav, serialisering och massgodkännande.
- `npm run test:distributor-mapping`: befintlig produktmatchning och produktval.
- `cd supabase && npm run verify:empty`: hela migrationskedjan samt tester av
  sparning, behörighetsflöde, samtidig ändring och återställning vid fel.
