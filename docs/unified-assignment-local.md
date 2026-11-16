# Gemensam vy för kapitel, avdelningar och personer

Utvecklingsgren: `codex/scipx-upgrades`. Ändringen är för lokal testning.

Projektstyrningen visar nu kapitel till vänster och posternas avdelning,
ansvariga person, frist och status till höger. Samma vy används för
projektledare, arbetsledare och medarbetare med deras befintliga behörigheter.
Filter finns för mina uppgifter, min avdelning, avdelning, person, avdelningskö,
hjälp, försenat och färdigt. Inställningarna för avdelningar och projektfrist
öppnas direkt i vyn.

Gemensam tilldelning kan omfatta ett kapitel, en post eller flera markeringar.
En avdelning kan äga arbetet utan utsedd person. Projektledaren kan också
tilldela direkt till en person. Egna posttilldelningar bevaras som standard;
att ersätta dem kräver ett särskilt val. Ångra använder samma skydd mot
mellanliggande ändringar som tidigare. Arbetsledaren fördelar inom sin avdelning.

Kapittelfrister kan anges samtidigt som tilldelningen. Redan tilldelade
postfrister bevaras. Klicka på en post för dess frist, klarmarkering och samtal.
Arbetsstatus och teknisk produktgranskning förblir separata.

## Testa lokalt

I utvecklingsarbetskopians `apps/web`, med den lokala servern stoppad:

```powershell
node --no-wasm-code-gc scripts/seed-assignment-demo.mjs
npm.cmd run dev
```

Öppna länken som exempelkommandot skriver ut. Det idempotenta kommandot lägger
till projektet **Fordeling – lokalt eksempel**, två avdelningar och tre fiktiva
personer i den separata lokala databasen. Befintliga lokala projekt behålls.
Databasen måste vara stängd innan kommandot körs. Inga liveuppgifter används.

Prova att fördela kapitlet 31 till Ola, ändra kapitlet 33 från Anna till
avdelningskö och kontrollera att Eriks egna ventilpost ligger kvar. Testa även
att ersätta egna undantag, ångra och öppna en post för frist och klarmarkering.

Migrationen `20261109191532_unified_project_assignment.sql` inför avdelningskö
och ett atomiskt, behörighetskontrollerat tilldelningsanrop. Den appliceras av
den lokala startaren. Den ska inte appliceras i produktion utan en separat
begäran om publicering. Appändringen behöver denna migration vid en framtida release.

## Verifiering

- Projektets samlade releasekontroll: 1 328 tester passerade, inga fel eller hoppade tester; TypeScript och lint godkända.
- Lokala databastester verifierar avdelningskö, medlemskap, ärvt ansvar, egna undantag, frister, atomisk fördelning, ångra, arbetsledarens delegering och nekad anonym åtkomst.
- Webbläsartest i det lokala exemplet verifierar köfilter, blandat kapitel-/posturval, sparande och ångra. Undantaget för Eriks post bevaras vid kapiteländring.
- Desktopbredd 1 440 px och mobilbredd 360 px kontrollerade utan horisontellt sidspill.
- Exempelprojektet återställdes efter browser-testet med funktionens Ångra.
