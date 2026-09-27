# Scipx Document Crawler

En fristående och försiktig crawler för offentliga PDF-dokument inom sprinkler och
brandskydd. Den hittar produktblad, manualer, installationsanvisningar, certifikat,
godkännanden och närliggande dokumentation. Den kringgår aldrig inloggning,
CAPTCHA, betalvägg eller andra åtkomstskydd.

Crawlern är avsiktligt separerad från webbappen och från den befintliga
produkt-PDF-extractorn. Efter en godkänd nedladdning kan den **valfritt** skicka
PDF-filen till den befintliga FastAPI-tjänstens `POST /extract`. Den innehåller
ingen ny produktparser.

## Säker standardkonfiguration

Endast Viking är aktiverad från start. Alla körningar begränsas till exakt angivna
domäner och kontrollerar `robots.txt` innan varje resurs hämtas.

| Leverantör | Status | Officiell utgångspunkt | Orsak |
|---|---:|---|---|
| Viking Group | Aktiv | [Technical Resources](https://www.vikinggroupinc.com/resources/technical-resources) | Offentligt dokumentbibliotek; `robots.txt` styr varje körning. |
| Reliable | Avstängd | [Quick-Add Bulletins](https://www.reliablesprinkler.com/quick-add-bulletins/) | Automatisk användning måste först godkännas manuellt mot [villkoren](https://www.reliablesprinkler.com/terms-conditions/). |
| Victaulic | Avstängd | [Resources](https://www.victaulic.com/resources/) | [Villkoren](https://www.victaulic.com/victaulic-company-website-terms-of-use-and-legal-restrictions/) förbjuder robot/spider/page-scrape. |
| Tyco Fire | Avstängd | [Resources](https://www.tyco-fire.com/Resources) | JCI:s [webbplatsvillkor](https://www.johnsoncontrols.com/Legal/Terms) förbjuder robot/spider/automatisk insamling. |
| Potter | Avstängd | [Sprinkler Monitoring](https://www.pottersignal.com/products/sprinkler-monitoring) | [Villkoren](https://www.pottersignal.com/terms) förbjuder robot/spider och andra automatiska metoder. |

Ändra inte `enabled = false` utan att aktuell `robots.txt`, villkor och eventuell
skriftlig tillåtelse har kontrollerats. Domäner gissas inte. Se även
[SUPPLIERS.md](SUPPLIERS.md).

## Installation

Kräver Python 3.11 eller senare. Från `apps/document-crawler`:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -e ".[dev]"
& .\.venv\Scripts\crawler.exe suppliers
```

Vanlig crawlning kräver inte Playwright. För en leverantör som uttryckligen har
`javascript = true` och där vanlig HTTP inte räcker:

```powershell
& .\.venv\Scripts\python.exe -m pip install -e ".[browser]"
& .\.venv\Scripts\python.exe -m playwright install chromium
```

JavaScript-adaptern är isolerad, headless och blockerar nätverksanrop utanför
leverantörens tillåtna domäner. Den försöker inte lösa CAPTCHA eller logga in.

## Kommandon

```powershell
crawler crawl --supplier viking
crawler crawl --all
crawler crawl --all --dry-run --max-requests 150 --max-pages 100
crawler crawl --supplier viking --max-requests 50 --max-pages 25 --max-files 5 --max-depth 2
crawler crawl --supplier viking --resume
crawler export --format csv
crawler export --format json --output .\data\exports\documents.json
crawler stats
crawler errors --limit 25
crawler reviews --limit 25
crawler suppliers
```

Produktlänkar och datablad som innehåller ett tydligt produkt-id (exempelvis
`VK145`) och K-faktor prioriteras före generella översikter och specialbulletiner.
En redan sitemap-upptäckt URL uppgraderas automatiskt när en produktsida senare
ger bättre länktext och kontext.

`--dry-run` sparar inga PDF-filer och anropar inte product-extractorn. Vanliga
HTML/XML-sidor läses för länkutvinning, men alla andra svar begränsas till ett litet
signaturprov. Det gäller även PDF-adresser utan filändelse eller med query-parametrar.
Temporära signaturprov tas bort direkt efter klassificering.

Om en gräns nås får körningen status `paused`. `--resume` fortsätter den senaste
pausade, avbrutna eller ofullständigt avslutade kön. Att öppna databasen med exempelvis
`stats` eller `export` ändrar aldrig en aktiv körning eller ett aktivt jobb. Återställning
av avbrutna bearbetningsjobb sker endast vid ett uttryckligt `--resume`.

`--max-requests` begränsar antalet köresurser som kontrolleras per körpass, även om
svaret är trasigt eller har en typ som inte stöds. Räknarna checkpointas fortlöpande
och återställs därför inte efter ett avbrott. `--resume --dry-run` gör alltid den
fortsatta körningen skrivskyddad och kan inte spara en väntande PDF.

Filgränsen räknar varje verifierad PDF-kandidat, även en dry-run- eller
granskningspost. Därmed kan ett stort dokumentbibliotek inte kringgå säkerhetsgränsen
bara för att länkarna senare behöver mänsklig granskning.

Globala flaggor skrivs före kommandot:

```powershell
crawler --config .\config\suppliers.toml --verbose crawl --supplier viking
```

## Konfiguration

All central konfiguration finns i [config/suppliers.toml](config/suppliers.toml).

Varje `[[suppliers]]` har:

- stabilt `id` och visningsnamn;
- `enabled`;
- en exakt lista med `allowed_domains`;
- verifierade `start_urls` och eventuella `sitemaps`;
- valfri, explicit `javascript`-adapter;
- granskningsanteckning och länk till villkor.

Gemensamma inställningar styr timeout, fördröjning, retries, exponential backoff,
maxdjup, request-/sid-/filgränser och maximala svarsstorlekar. Relevansens inkluderings- och
exkluderingsord ligger också i TOML och kan utökas utan kodändring.

User-Agent kan ersättas vid drift:

```powershell
$env:SCIPX_CRAWLER_USER_AGENT = "ScipxDocumentCrawler/0.1 (+https://www.scipx.ai/crawler)"
```

Den bör alltid tydligt identifiera Scipx och länka till en sida med kontaktväg.
`robots_fail_open = false` gör att ett nätverksfel vid robotskontrollen stoppar
crawlning av just den webbplatsen i stället för att anta tillåtelse.

Alla crawlerstyrda HTTP-anrop tillåter bara standardport 80/443 och verifierar varje
DNS-resultat före varje begäran och omdirigering. Privata, loopback-, link-local- och
andra icke-publika adresser blockeras. Samma kontroll används av `robots.txt` och den
valfria JavaScript-adaptern; HTTPS får inte nedgraderas via en omdirigering.

## Product PDF-extractor (valfri)

Integrationen är avstängd om URL saknas, även om `enabled = true`. Aktivera den
först när den separata FastAPI-extractorn körs:

```powershell
$env:SCIPX_EXTRACTOR_ENABLED = "true"
$env:SCIPX_EXTRACTOR_URL = "http://127.0.0.1:8000"
crawler crawl --supplier viking
```

Adaptern normaliserar automatiskt bas-URL till `POST /extract` och skickar
multipart-fältet `file` (konfigurerbart). Varje försök och rått JSON-resultat
sparas i SQLite. Ett extractor-fel loggas men stoppar aldrig övrig crawlning.

Tillåtna behandlingsstatusar:

- `pending`
- `processing`
- `success`
- `partial`
- `no_products_found`
- `unreadable`
- `failed`

Avbruten `processing` återställs till `pending` vid ett uttryckligt `--resume`.
Misslyckade jobb kan försöka igen upp till `extractor.max_attempts`.
Framgångsrika/slutliga jobb skickas inte igen.

### Valfri överlämning till FlowX

Crawlern kan alternativt skicka ett accepterat datablad till FlowX, som därefter
kan använda sin befintliga extractor och granskningsprocess. Ange den **fullständiga**
ingest-endpointen och en separat hemlig token:

```powershell
$env:SCIPX_FLOWX_INGEST_ENABLED = "true"
$env:SCIPX_FLOWX_INGEST_URL = "https://www.scipx.ai/api/pkms/document-processing/ingest"
$env:SCIPX_FLOWX_INGEST_TOKEN = "<hemlig crawler-token>"
crawler crawl --supplier viking
```

Token skickas endast i `X-Scipx-Crawler-Token` och sparas aldrig i SQLite eller
loggar. Multipart-anropet innehåller `file`, `supplier`, `title`, `documentType`,
`finalPdfUrl`, `originalUrl`, `sourcePageUrl`, `sha256`, `language` och
`downloadedAt`. Jobb/försök lagras i `flowx_ingest_jobs` och
`flowx_ingest_attempts`. Saknad URL eller token gör adaptern inaktiv. Fel isoleras
och hindrar inte crawlningen.

`supplier` innehåller leverantörens visningsnamn från den centrala konfigurationen;
det interna leverantörs-id:t används endast som reservvärde.

Den lokala FastAPI-adaptern och FlowX-ingest är oberoende. Aktiveras båda skickas
dokumentet till båda flödena; normalt väljer man ett av dem för att undvika dubbel
produktbearbetning.

## Arkitektur

```text
config/suppliers.toml
        │
        ▼
robots + exakt domänlista
        │
        ▼
beständig prioritetskö ── HTML/sitemap-parser ── nya interna URL:er
        │
        ▼
streamad hämtning ── header + %PDF-signatur ── relevansklassificering
        │                                      │
        │                                      └─ review_hits
        ▼
SHA-256 + canonical URL ── stabil fil ── documents/document_sources
                                              │
                                              └─ valfri POST /extract
```

Viktiga moduler:

- `crawler.py`: körning, återupptagning och felisolering;
- `http_client.py`: streaming, timeout, omdirigeringskontroll, rate limit och retry;
- `network_security.py`: DNS-/IP-/portkontroll mot SSRF;
- `robots.py`: cachad, fail-closed robotskontroll och sitemap-upptäckt;
- `database.py`: SQLite-schema, kö, metadata, dedup och extractorhistorik;
- `relevance.py`: konfigurerbar klassificering till relevant/review/excluded;
- `extractor.py`: valfri adapter till den befintliga tjänsten;
- `renderers.py`: separat och valfri Playwright-adapter.

## SQLite-datamodell

Databasen skapas automatiskt i `data/crawler.sqlite3` med WAL och foreign keys.

| Tabell | Innehåll |
|---|---|
| `runs` | Körningsstatus, request-/sid-/filgränser och beständiga räknare. |
| `crawl_queue` | Beständig URL-kö med djup, källkontext, prioritet och felstatus. |
| `crawl_cache` | ETag, Last-Modified, MIME, slutlig URL och senaste kontroll. |
| `documents` | Titel, typ, produktfamilj, fil, storlek, SHA-256, språk och tid. |
| `document_sources` | Alla canonical/original/final-URL:er för samma hashade dokument. |
| `review_hits` | Osäkra PDF-träffar med poäng och matchade/exkluderade ord. |
| `crawl_errors` | Isolerade fel per leverantör, URL och steg. |
| `extraction_jobs` | Senaste produkt-extractorstatus och resultat per dokument. |
| `extraction_attempts` | Full försökshistorik, HTTP-status, resultat och fel. |
| `flowx_ingest_jobs` | Senaste överlämningsstatus och svar från FlowX. |
| `flowx_ingest_attempts` | Full FlowX-försökshistorik utan den hemliga tokenen. |

SHA-256 är unikt i `documents`, medan `document_sources` bevarar flera URL:er till
samma byte-identiska fil. ETag/Last-Modified skickas villkorligt vid senare körning;
HTTP 304 används endast om den lokala filens signatur och SHA-256 fortfarande stämmer.
En saknad eller skadad fil hämtas igen. Om samma canonical URL får nytt innehåll flyttas
källan atomiskt till den nya hashen och en helt orefererad gammal fil tas bort.

## Tester och kvalitet

```powershell
python -m pytest
python -m ruff check .
python -m ruff format --check .
python -m mypy src/document_crawler
```

Testerna använder mockade HTTP-svar och kontaktar inga leverantörer. De täcker
URL-normalisering, relativa länkar, sitemap, omdirigeringar, externa redirects,
storleksgränser, PDF-signatur, relevans, säkra filnamn, SQLite-resume/dedup,
robotsregler, SSRF/DNS/portskydd, felisolering, dry-run, extractorstatus och FlowX-ingest.

## Försiktig första verifiering

Granska alltid aktuell `robots.txt` och villkor först. Börja sedan utan lagring:

```powershell
crawler crawl --supplier viking --dry-run --max-pages 3 --max-files 1 --max-depth 1
crawler stats
crawler errors
```

Öka gränserna först när resultat och serverrespons ser korrekta ut. Nedladdade
dokument, SQLite, loggar och temporära filer är ignorerade av Git i denna app.

## Begränsningar

- Relevans och metadata är regelbaserade; osäkra dokument kräver mänsklig kontroll.
- Språk och produktfamilj uppskattas från länk-/sidkontext, inte PDF-innehållet.
- Sitemap-gzip (`.xml.gz`) stöds inte i den första versionen.
- Rate limiting är sekventiellt per värd i en process; kör inte flera instanser mot
  samma leverantör utan extern samordning.
- Villkor och robotsregler kan ändras. En aktiverad leverantör är inte ett
  permanent juridiskt godkännande.
