# Hitta Svampen

**[hitta-svampen.vercel.app](https://hitta-svampen.vercel.app)**

En kantarellapp. Den sparar var du hittat svamp, analyserar skogen omkring dig
utifrån öppna kartdata och terrängmodeller, och räknar ut om det faktiskt står
något i skogen just nu.

Byggd för att fungera i handen, i regn, utan täckning.

---

## Vad den gör

**Karta med habitatanalys.** Tryck på *Skanna* så delas området runt dig upp i
ett rutnät på sexton meter. Varje ruta får en poäng utifrån skogstyp, hur
vattnet rinner i terrängen, lutning, väderstreck, avstånd till diken och stigar
— och dina egna tidigare fynd. Resultatet läggs som en värmekarta ovanpå
terrängkartan, med de bästa ställena numrerade.

**Väderprognos som förstår svamp.** En kantarell reagerar inte på gårdagens
regn utan på fukten i marken två till tre veckor tillbaka. Appen viktar därför
nederbörden med en fördröjningskurva per art, väger in verklig markfukt på
9–27 centimeters djup och marktemperatur på sex centimeter, och visar vilken
dag den närmaste veckan som ser bäst ut.

**Dina fyndplatser.** Spara med ett tryck. Appen fångar automatiskt hur marken
såg ut och vad vädret gjort de senaste veckorna. Kantarellmycel lever i
decennier och kommer tillbaka på samma ställe — dina egna platser är den
överlägset bästa informationen som finns.

**Appen lär sig din skog.** Modellens startvärden är hämtade ur litteraturen
och gäller Sverige i stort. Din trakt är inte Sverige i stort. Efter tio fynd
av en art väger din erfarenhet lika tungt som utgångsvärdet, och modellen
flyttar sitt optimum dit dina svampar faktiskt står.

**Offline.** Ladda hem kartrutor och höjddata i förväg. Kartan, GPS:en,
punktanalysen och den senaste skanningen fungerar sedan utan mobilnät.

**Artguide** med kännetecken och — viktigare — de farliga förväxlingarna.

---

## Köra

```bash
npm install
npm run dev
```

Öppna `http://localhost:5173`.

### På telefonen

Geolocation kräver "secure context". På localhost räknas http som säkert, men
inte över wifi. Använd därför:

```bash
npm run mobil
```

Servern startar då med ett självsignerat certifikat på `https://<din-ip>:5173`.
Telefonen varnar för certifikatet en gång — godkänn, och lägg sedan till sidan
på hemskärmen så beter den sig som en app.

### Deploy

Ligger på [hitta-svampen.vercel.app](https://hitta-svampen.vercel.app). Push
till `main` bygger och publicerar automatiskt.

```bash
git push
```

`vercel.json` sköter tre saker som spelar roll för en PWA:

- **`sw.js` cachas aldrig hårt.** Annars skulle en telefon som redan installerat
  appen fortsätta köra en gammal serviceworker i evighet och aldrig se en ny
  version.
- **Byggda tillgångar cachas för alltid** — de har innehållshash i filnamnet.
- **`Service-Worker-Allowed: /`** så att serviceworkern får styra hela sajten.

Bygget kör `tsc --noEmit` före `vite build`, så ett typfel stoppar deployen i
stället för att nå telefonen.

Vercel ger HTTPS automatiskt, vilket är hela poängen: GPS kräver "secure
context", och över wifi duger inte `http://`. Lägg till sidan på hemskärmen så
beter den sig som en app.

En sak att veta: URL:en är publik. Ingen data läcker — alla fynd ligger i
webbläsaren på din egen telefon och lämnar den aldrig — men vem som helst med
länken kan använda själva appen. Vill du stänga den går det med Vercels
lösenordsskydd (kräver betald plan) eller genom att låta bli att sprida
adressen.

### Övriga kommandon

```bash
npm run build      # typkontroll och produktionsbygge
npm run typecheck  # bara typkontroll
```

Testerna kör mot skarpa API:er och behöver uppkoppling (`migration.test.ts`
och `prefetch.test.ts` klarar sig utan):

```bash
node --experimental-strip-types test/terrain.test.ts         # terrängmatte
node --experimental-strip-types test/fruiting.test.ts       # vädermodell
node --experimental-strip-types test/elevationTiles.test.ts # höjddata
node --experimental-strip-types test/scan.test.ts           # hela kedjan
node --experimental-strip-types test/migration.test.ts      # databasmigrering
node --experimental-strip-types test/distribution.ts        # poängfördelning
```

---

## Datakällor

Allt är fritt och kräver ingen nyckel.

| Källa | Vad den ger |
|---|---|
| **OpenStreetMap** via Overpass | Skogstyp (barr/löv/bland), myrar, åkrar, vattendrag, stigar |
| **Terrängkakel** (AWS Open Data, Terrarium) | Höjddata, ~10 m upplösning på våra breddgrader |
| **Open-Meteo** (ERA5 + ICON) | Nederbörd, marktemperatur, markfukt 9–27 cm. 60 dygn bakåt, 16 framåt |
| **GBIF** | Rapporterade fynd, i Sverige mest via Artportalen |
| **OpenTopoMap** / **Esri** | Kartbilder |

Tjänsterna är gratis och delvis idealt drivna. Appen cachar allt den kan och
skannar inte i onödan.

---

## Så räknas poängen

Tre delar multipliceras ihop, eftersom alla tre är nödvändiga:

```
chans = habitat × fruktsättning × säsong
```

**Habitat** är platsen — den ändrar sig knappt mellan åren. Den vägs ihop av
markfuktighet (32 %), bryn och stigar (16 %), lutning (15 %), närhet till
vatten (14 %), trädslag (14 %) och väderstreck (9 %). Resultatet multipliceras
sedan med marktypens lämplighet och ett påslag för kända fynd. Åkrar och sjöar
har ett hårt tak — ingen terräng i världen räddar en insjö.

Markfuktigheten är inte gissad utan räknad. Höjdmodellen sänkfylls, får
D8-flödesriktningar och flödesackumulering, och ur det faller ett topografiskt
våtindex — samma mått som SLU:s markfuktighetskartor bygger på. Kantarellen
vill ligga i mitten av skalan: fuktigt men dränerat.

**Fruktsättning** är vädret, och följer minimumlagen snarare än ett medelvärde.
En knastertorr skog ger noll svamp hur varm marken än är, så vatten och värme
multipliceras i stället för att vägas ihop. Ett skyfall igår ger nästan
ingenting; regnet som räknas föll för ungefär sexton dygn sedan.

**Säsong** är en trapetskurva per art, förskjuten efter latitud eftersom
säsongen börjar senare och slutar tidigare längre norrut.

Värmekartan visar habitatpoängen sträckt över områdets egen fördelning. Frågan
den svarar på är "var *här* är det bäst?", inte "hur bra är den här skogen
jämfört med Sveriges alla skogar" — det senare vore sant men obrukbart när man
redan står i skogen.

---

## Integritet

Allt ligger i webbläsaren på din telefon. Inga konton, ingen server, ingenting
som skickas någonstans. Fyndplatser är personlig egendom.

Det betyder också att de försvinner om du rensar webbläsardatan. Ta en
säkerhetskopia under **Mer → Dina fynd → Exportera**.

---

## Ansvar

Appen hittar platser, inte svampar. Den kan inte se enskilda svampar, den vet
inte om det avverkats i förrgår, och den kan inte artbestämma något åt dig.

**Ät bara svamp du själv är säker på.** Toppig giftspindling växer i samma
mossiga granskog som kantarellen. Vid misstänkt förgiftning: 112 eller
Giftinformationscentralen 010-456 6700.
