# Leverantörsgranskning

Senast tekniskt granskad: 2026-08-05. Detta är en operativ säkerhetslista, inte
juridisk rådgivning. Villkor och `robots.txt` måste kontrolleras igen före större
körningar.

## Aktiv

### Viking Group Inc.

- Tillåten domän: `www.vikinggroupinc.com`
- Verifierade startpunkter:
  - <https://www.vikinggroupinc.com/resources/technical-resources>
  - <https://www.vikinggroupinc.com/products/fire-sprinklers>
  - <https://www.vikinggroupinc.com/resources/technical/viking-sprinklers-special-bulletins>
- Sitemap: <https://www.vikinggroupinc.com/sitemap.xml>
- Villkor: ingen generell crawlerbestämmelse verifierades i den undersökta
  resursytan. Därför gäller en konservativ, fail-closed `robots.txt`-kontroll vid
  varje körning och låg standardhastighet.

## Avstängda

### Reliable Automatic Sprinkler Co.

- Officiell domän/startpunkt är verifierad.
- [Publicerade villkor](https://www.reliablesprinkler.com/terms-conditions/) har
  granskats, men avsedd systematisk nedladdning behöver fortfarande godkännas
  manuellt innan leverantören aktiveras.

### Victaulic

- Officiell domän och resurscenter är verifierade.
- [Webbplatsvillkoren](https://www.victaulic.com/victaulic-company-website-terms-of-use-and-legal-restrictions/)
  förbjuder robot, spider, deep-link och page-scrape. Ska inte aktiveras utan
  uttryckligt skriftligt tillstånd.

### Tyco Fire / Johnson Controls

- Officiell Tyco-domän och resurscenter är verifierade.
- JCI:s [webbplatsvillkor](https://www.johnsoncontrols.com/Legal/Terms) förbjuder
  robot/spider och automatiserad åtkomst. Ska inte aktiveras utan uttryckligt
  skriftligt tillstånd.

### Potter Electric Signal Company

- Officiell domän och produktområde är verifierade.
- [Webbplatsvillkoren](https://www.pottersignal.com/terms) förbjuder robot/spider
  och andra automatiska metoder. Ska inte aktiveras utan uttryckligt skriftligt
  tillstånd.

## Checklista innan en leverantör aktiveras

1. Verifiera att domän och startpunkter ägs av leverantören.
2. Läs aktuella webbplatsvillkor och dokumentera datum/länk.
3. Kontrollera `robots.txt`, inklusive crawl delay och sitemap.
4. Skaffa skriftligt tillstånd om villkor är oklara eller förbjudande.
5. Lägg endast exakta domäner i `allowed_domains`.
6. Kör först dry-run med `--max-pages 3 --max-files 1 --max-depth 1`.
7. Inspektera `crawler errors` och `review_hits` innan gränserna höjs.
