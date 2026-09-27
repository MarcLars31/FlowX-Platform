# Nästa projektstyrningssteg

1. Bygg domänvyerna i varje projektsektion (dokument, krav, analys, matchning,
   materiallista och export) ovanpå de nya gates.
2. Lägg integrationstester mot en isolerad Supabase-testdatabas för RLS,
   cross-tenant-skydd, unika projektnummer och stale-propagation.
3. Kräv att tekniska avvikelser är hanterade före approval/completed.
4. Koppla Storage-sökvägar strikt till `project_documents` och dokumentera
   retention-jobb för arkiverade projekt.

## Förbättringar från genomgången

### F04. Tydlig hantering när ingen produkt matchar

- **Status:** Genomförd 2026-09-15 efter Marcus instruktion.
- Bekräftade avvikelser visas i en stängd lista, **Visa bortvalda produkter och
  orsaker**. Alla hämtade alternativ går att visa. Om alla träffar är fel visas
  **Ingen match bland kontrollerade produkter**, orsak och knappar för att söka
  efter en annan produkt eller kontrollera PDF-kravet.
- Saknade uppgifter och osäkra underlag visas i gult under **Produkter att
  kontrollera**. Röda avvikelser och gula kontrollpunkter separeras även när
  samma produkt har båda. Ett misslyckat sökanrop visar sitt eget felmeddelande.
- NRF- och länksökning i **Lägg till produkt** kompletteras med samma tekniska
  MLDL/Ahlsell-bedömning. Tillbehör jämförs inte med huvudproduktens K-värde.
- Ett valt avvikande alternativ märks **Manuellt vald – avvikelse**, även efter
  sparande och i produktpostlistan. Ofullständiga underlag märks **Manuellt vald
  – kontroll krävs**. Bedömningen sparas som läsbar notering i den befintliga
  godkännandetransaktionen, tillsammans med produktval och matchminne.
  Dessa noterade val utesluts från återanvändbara matchminnen och massgodkännande.
- **Inte i sortiment** är fortfarande ett uttryckligt användarval.
- Länken **Ahlsells hemsida** öppnar ahlsell.no i en ny flik och ligger direkt
  efter **Legg til vedlegg**.
- Verifierat med 232 produktmatchningstester, 13 hybridtester och 34 tester för
  Ahlsell-sökning/tillbehör (vissa tester ingår i flera sviter). Lokal webbläsare
  provar enbart avvikelser, saknade uppgifter, tom lista, samtliga bortvalda
  alternativ samt valt alternativ och tangentbordsfokus vid öppning/stängning.

### F01. Utfällbar lista med matchade produkter

- **Sparat:** 2026-09-15.
- **Status:** Genomförd 2026-09-15 efter Marcus instruktion att genomföra förbättringarna.
- **Önskat beteende:** Visa en rad eller ett kort med texten **Matchade produkter**,
  med samma grundutseende som när en produkt visas. Vid klick fälls en lista med
  alla produkter som matchar den aktuella PDF-posten ut. Användaren kan välja
  önskad artikel i listan.
- **Bakgrund:** Flera produkter kan uppfylla samma krav. Detta visas i dag som
  en varning under rubriken ”Matchar inte PDF-kravet”, trots att antalet matchande
  alternativ inte i sig är ett tekniskt fel.
- **Att kontrollera vid en framtida ändring:** Listan visar samtliga matchande
  alternativ, går att öppna och stänga och låter användaren välja en artikel.
  Flera godtagbara alternativ skiljs från verkliga avvikelser eller saknade
  tekniska belägg. Produktval och användarens godkännande hanteras separat.

### F02. Visa tillbehörsvarningen endast en gång

- **Sparat:** 2026-09-15.
- **Status:** Genomförd 2026-09-15 tillsammans med F03.
- **Berörd post:** Nästa post efter 30.332.14 i genomgången av Sprinkler2.pdf,
  enligt Marcus. Detta gäller inte den första postens I.R./Nej-värden.
- **Problem:** Samma tillbehörskontroll visas med två formuleringar:
  ”Specifikationen kräver ett tillbehör eller skydd som måste kontrolleras mot
  sprinklerhuvudets exakta utförande.” och ”Täckbricka, skydd eller annat tillbehör
  måste kompatibilitetskontrolleras mot exakt sprinklerutförande.”
- **Önskat beteende:** Ta bort dubbleringen och visa en enda varning för samma
  tillbehörskontroll. Det relevanta kravet och kontrollen ska finnas kvar.
  Visningstexten preciseras i F03 nedan.
- **Teknisk orsak:** Katalogkontrollen och den tekniska rankningen skapar varsin
  text. Nuvarande deduplicering tar endast bort exakt identiska varningstexter.

### F03. En tydlig upplysning om vilket tillbehör som ska användas

- **Sparat:** 2026-09-15.
- **Status:** Genomförd 2026-09-15.
- **Önskat beteende:** Visa en enda tillbehörspunkt som anger vilket tillbehör
  som ska användas. Ta bort generella, separata påminnelser om att tillbehöret
  måste vara kompatibelt med vald produkt. Detta är ett grundkrav som
  matchmotorn ska hantera vid produkt- och tillbehörsvalet.
- **Exempel:** ”Tillbehör: Dubbel rosett.” Om PDF-kravet är villkorat:
  ”Tillbehör: Dubbel rosett vid infällt montage.” Montagevillkoret bevaras i
  samma punkt och ska inte bli ett ovillkorligt tillbehörskrav.
- **Avser:** Fallet med tre överlappande varningar om dubbel rosett,
  tillbehör/skydd och kompatibilitet. Preciserar F02.
- **Att kontrollera vid en framtida ändring:** Ett tillbehörskrav ger en tydlig
  upplysning, utan dubblering eller generell kompatibilitetsvarning. De tekniska
  kraven på vilka tillbehör som får matchas behålls.

### Verifiering av F01–F03

- Alla hämtade, tekniskt godtagbara matchningar visas i den utfällbara gruppen.
  Valet av en artikel behåller övriga hämtade alternativ. Avgränsad extern
  sökning redovisas fortfarande när Ahlsell har fler träffar.
- Tillbehör visas en gång per PDF-post. I.R./Nej och ej tillämpliga villkor
  ger inget obligatoriskt tillbehör. Olöst tillbehörskontroll finns kvar som
  intern granskningsstatus och kan inte i sig ge en grön eller automatisk match.
- 307 tester passerar: 226 för produktmatchning, 13 för kombinerad MLDL/Ahlsell
  och 68 för PDF-flödet. Typkontroll, ESLint och produktionsbygge passerar.
- Den faktiska listkomponenten har provats i lokal webbläsare med sju matchningar,
  öppning/stängning, tangentbord, val längre ned i listan, villkorad dubbel rosett
  och kraven från Sprinkler2:s första sprinklerpost. Inga produktval sparades i drift.
