# NS-koder i produktvalet

Scipx använder ett gemensamt, versionerat referensregister i
`apps/web/src/data/ns3420-code-catalog.json`, enligt samma modell som appens
befintliga produktregister. Första versionen innehåller 73 hela NS-koder och
28 olika kodrubriker. Svenska kortförklaringar visas i produktlistan. Den
norska rubriken och registrets avgränsning finns under ”Om kodförklaringen” i
produktkortet. Klick på koden i tabellen öppnar produktkortet.

Kolumnen ”Produktkrav” visar samma svenska betydelse som NS-koden när en
referensträff finns. Sorteringen använder den text som visas. För okända,
saknade och projektspecifika koder används den ursprungliga PDF-beskrivningen.
Originaltexten och matchmotorns underlag ändras inte.

Registret är en uppslagstabell över **rubriker i granskade referensunderlag**.
Det är inte Standard Norges kompletta NS 3420-databas och inte en avkodare
för siffrornas matriseval. Ingen standardutgåva har fastställts för hela
referensmaterialet; `standardEdition` är därför `null`. Förklaringarna ändrar
inte matchningspoäng, tekniska krav, godkännanden eller dokumentdata.

## Innehåll och källor

Varje kod pekar på en betydelse och minst en källsida. Den ursprungliga
kodrubriken har granskats i de redan extraherade sidorna från användarens
fyra referensfiler:

| Käll-id | Underlag | Läsning |
| --- | --- | --- |
| reference-01 | 1403 AB - 33 Rev03.pdf | Direkt textutvinning |
| reference-02 | Sprinkler.pdf | OCR |
| reference-03 | Sprinkler_Vågå svømmehall.pdf | OCR |
| reference-04 | Sprinkler2.pdf | OCR |

Registret innehåller generella kodrubriker, svenska kortförklaringar och
källsidnummer. Kundnamn, mängder, priser, adresser, produktval och
projektspecifika krav ingår inte. Underposternas egna produktnamn får inte
ersätta huvudkodens rubrik. Exempelvis behåller rördelar under en komplett
rörinstallation installationens kodrubrik, medan postens eget produktkrav
fortsätter beskriva den aktuella delen.

## Uppslag och avgränsningar

- Hela koden måste finnas i registret. Gemener och blanksteg normaliseras.
- Liknande koder, prefix och en känd grundkod ger inte automatiskt en träff.
- Suffixet `A` bevaras. Produktkortet förklarar att posten har andra krav
  eller anpassningar som måste läsas i postens egen beskrivning.
- Koder med `%`, exempelvis `%SMA.032`, visas som projektspecifika och
  registreras inte som gemensamma NS-definitioner.
- Okända koder visar ”Betydelse saknas”. Tomma värden visas som `—`.
- Koder och kortförklaringar visas på en rad i tabellen. Den befintliga
  sidledsrullningen och fulla skärmbredden är kvar.

Standard Norge beskriver en separat officiell databasprodukt och publicerar
versionsinformation. Ett framtida officiellt importflöde behöver ange
standardutgåva och källa; befintliga dokumentobservationer ska inte
omklassificeras till officiella definitioner utan verifiering:

- https://standard.no/fagomrader/ns-3420-/hvordan-skaffe-seg-ns-3420/
- https://standard.no/fagomrader/ns-3420-/ns-3420-database-utgave/

Focus Softwares dokumentation beskriver hur kodens text består av
matriseval, stikkord och andra krav samt hur ändringar kan ge suffixet A:
https://hjelp.focus.no/beskrivelse-nb/nb/funksjoner/enkeltpost.htm

## Utöka registret

1. Kontrollera hela koden och rubriken mot en tillgänglig källa. Ange
   käll-id och sida. Blanda inte projektets egna beteckningar med NS-koder.
2. Återanvänd en befintlig betydelse eller lägg till norsk rubrik och en
   kort svensk förklaring. Lägg inte in tekniska attribut som om de vore
   kodens betydelse utan separat belägg för kodens matriseval.
3. Lägg till koden under `codes`, uppdatera `version` och granska diffen.
   Om samma kod förekommer med olika rubriker eller standardutgåvor ska
   konflikten lösas innan den blir en gemensam förklaring.
4. Kör `npm run test:ns-codes` och produktionsbygget före publicering.

Uppslag sker lokalt i appens kodregister, utan extra databas- eller
nätverksanrop per produktrad. Nya uppladdningar och redan sparade projekt
använder samma register; inga projektdata behöver migreras.
