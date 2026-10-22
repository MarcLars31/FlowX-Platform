# Ahlsell: stabilare manuell produktsökning

Kontrollerat 2026-09-20 för rapporten om 955911 och 4011976.

## Fel som återskapades

- Klienten startade bara nummersökning automatiskt för exakt sju siffror.
  Länkimport krävde också ett synligt sjusiffrigt NRF.
- Ahlsells publika `productVariantProxy/4011976` avvisades av URL-kontrollen.
  Den omdirigerar via en äldre `/33/.../4011976/`-adress till `/products/...`.
- Manuell sökning använde de automatiska förslagens produktgruppsfilter.
  En hittad vattenmätare kunde därför döljas på en rörpost i stället för att
  visas med en varning om fel produkttyp.
- Saknad reservväg gjorde nummersökningen beroende av sökindexet och
  variantanropen. Tomma svar och misslyckade variantanrop kunde cachelagras.

## Ändrat beteende

Nummersökningar (6–12 siffror) börjar med Ahlsells publika artikelomdirigering.
Det synliga artikelnumret måste stämma med sökningen; ersättningsartiklar väljs
aldrig automatiskt. Godkända värdar, HTTPS, portkontroll, storleksgränser och
kontroll av varje omdirigering gäller fortsatt. Äldre `/33/`-produktadresser
normaliseras till offentliga `/products/`-adresser.

Om produktsidan inte kan hämtas används exakt katalog-/variantsökning. En
lyckad familj behålls även om en annan misslyckas. Tekniska hämtfel skiljs från
en genomförd sökning utan träff. Tomma söksvar och felaktiga variantsvar sparas
inte i katalogcachen. Ahlsells uttryckliga meddelande om saknat artikelnummer
tolkas som saknad artikel även när sidan svarar HTTP 200.

Manuell huvudsökning visar hittade produkter med befintlig kravbedömning,
inklusive varningar för fel produktgrupp. Automatiska förslag och sökning i
specifika tillbehörsgrupper behåller sina relevans- och kompatibilitetsfilter.

## Verifierat hos Ahlsell

- **4011976 – Vannmengdemåler Turbo Lux 3** hämtades efter ändringen via
  artikelnummer, vanlig produktlänk och `productVariantProxy` utan sökindexet.
  [Produktsida](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/ventiler--armaturer/filter--siler-og-vannbehandling/4011976).
- **955911** gav noll sökträffar. Ahlsells artikelomdirigering visade dessutom
  uttryckligen att artikeln inte kunde hittas. Inget annat nummer har lagts in
  som ersättning eller antagits vara samma produkt.

Regressionskontroller täcker kortare nummer, gamla länkar, felande sök-/variant-
anrop, tomma cacheposter, felaktig produktfamilj, ersättningsartiklar, avbrutna
anrop och spärrade omdirigeringar. Ändringen kräver ingen databasmigration.
