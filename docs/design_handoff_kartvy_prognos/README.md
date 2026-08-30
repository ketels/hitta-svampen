# Handoff: Kartvy och Prognosvy — finslipning + ljust läge

## Översikt

Två godkända designändringar i **Hitta Svampen** (`hitta-svampen`, React + Vite + TypeScript, PWA):

1. **Finslipning av `KartVy` och `PrognosVy`** i det befintliga mörka formspråket. Inga nya färger, typsnitt eller navigationsstrukturer — enbart borttagen dubblering, omfördelad hierarki och större träffytor. Referens: skärm **2A** (karta) och **2B** (prognos).
2. **Ett ljust läge** av samma två vyer, som en spegling av de befintliga tokens i `src/styles/global.css`. Referens: skärm **3A** och **3B**.

Ändringarna är avsiktligt konservativa: samma komponenter, samma DOM-struktur, samma klassnamn där det går. Merparten kan implementeras som ändringar i `global.css` plus ett par omflyttade rader JSX.

## Om designfilerna

Filen i det här paketet är en **designreferens skriven i HTML** — en prototyp som visar avsett utseende, inte produktionskod att kopiera. Uppgiften är att återskapa designen i den befintliga kodbasen med dess egna mönster: `global.css` med CSS-variabler och semantiska klassnamn (`.kort`, `.panel`, `.knapp`, `.chip`, `.segment`), React-komponenter i `src/views/` och `src/components/`, ikoner ur `src/components/Ikoner.tsx`. Skriv ingen ny inline-CSS och inget nytt tokensystem — prototypen använder inline-stilar bara för att den är en enfilsprototyp.

## Fidelity

**Hi-fi.** Exakta färger, mått, typsnittsstorlekar och texter finns i det här dokumentet och i prototypen. Återskapa pixelnära. Alla värden i 2A/2B är hämtade ur nuvarande `global.css`; nya värden gäller enbart det ljusa läget.

---

## Filer

| Fil | Innehåll |
|---|---|
| `Hitta Svampen.dc.html` | Prototypen. Öppna direkt i en webbläsare. Fyra turer, nyast överst. |
| `support.js` | Runtime som prototypen behöver. Måste ligga i samma mapp. |

### Vad som är godkänt i prototypen

| Id | Skärm | Status |
|---|---|---|
| **2A** | Kartvy, mörkt läge, finslipad | **Bygg denna** |
| **2B** | Prognosvy, mörkt läge, finslipad | **Bygg denna** |
| **3A** | Kartvy, ljust läge | **Bygg denna** |
| **3B** | Prognosvy, ljust läge | **Bygg denna** |
| 1A–1D | Förkastad utforskning av nytt formspråk | Ignorera |
| 0A, 0B | Nuläget, återskapat ur koden som jämförelse | Ignorera |

Prototypen visar telefonskärmar på 390×844 (iPhone-standard). Prognosvyerna är renderade utrullade i full höjd i stället för scrollade, så allt syns på en gång.

---

## Ändring 1 — `KartVy` (skärm 2A)

Källfil: `src/views/KartVy.tsx`, sektionen `<div className="kart-fot">` samt `<div className="kart-overlager">`.

### 1.1 Panelhuvudet visar alltid art och läge

**Idag:** `.panel-huvud` renderar `<span className="etikett">Svampläge</span>` när `app.panelOppen` är sant, och först när panelen är hopfälld visas artprick + artnamn + väderläge. Samtidigt finns raden `Fruktsättning: bra` längre ned i panelen.

**Nytt:** ta bort villkoret. Huvudet renderar alltid samma innehåll i båda tillstånden:

```
[artprick 13px] Kantarell  · bra        [Dölj]  [Mark|Idag]  [chevron]
```

- `.artprick` 13×13 px, `border: 1.5px solid rgba(255,255,255,.55)`, `background: artData.farg`
- Artnamnet: 13,5 px, `font-weight: 650`, `var(--text)`
- Läget: 13,5 px, `color: chansfarg(vaderlage / 100)`, texten `· {chansOrd(vaderlage).toLowerCase()}`
- Huvudradens höjd: `min-height: 30px`, `margin: -4px 0 -2px` (oförändrat)

Ta bort hela raden `Fruktsättning: {chansOrd(...)}` — den säger nu samma sak som huvudet. Det sparar 22 px.

### 1.2 `Dölj` och segmentväljaren Mark/Idag flyttas upp till huvudraden

**Idag:** `Dölj`-knappen ligger i fruktsättningsraden och segmentet ligger inne i `.legend`, som därmed klämmer in gradient, två etiketter och en segmentväljare på samma rad.

**Nytt:** både `Dölj` (12 px, `font-weight: 650`, `var(--guld)`) och segmentet flyttas in i panelhuvudet, till höger, före chevronen. Segmentet blir en snäppa mindre: `border-radius: 12px`, `padding: 2px`, knappar `min-height: 26px`, `padding: 0 9px`, 12 px text — annars oförändrat (`aria-pressed` styr `background: var(--yta-3)`).

Notera: huvudet är idag en `<button>` som fäller panelen. Det går inte att lägga knappar inuti en knapp. Gör om `.panel-huvud` till en `<div>` med chevronen + artnamnet i en egen `<button>` som tar `onClick={() => app.setPanelOppen(!app.panelOppen)}`, och lägg `Dölj` respektive segmentet som syskonknappar.

### 1.3 Legenden får hela bredden

`.legend` innehåller nu bara: `Svagt` — gradient (`flex: 1`, 8 px hög) — `Starkt` — en 1×12 px avdelare i `var(--kant)` — dagsljustexten (12 px, `var(--text-svagast)`).

Dagsljustexten (`ljus?.text`) flyttas alltså in hit från sin egen rad. `gammalSkanning`-varningen behåller sin egen rad när den är aktuell.

### 1.4 `Spara fynd` får hela knappraden

**Idag:** `.knapprad` med två likadana `.knapp` som delar bredden lika.

**Nytt:**

- `Skanna` blir en kvadratisk ikonknapp: 52×52 px, `border-radius: 16px`, `background: var(--yta-2)`, `border: 1px solid var(--kant-stark)`, ikon `IkonRadar` 22 px. Ingen text. `aria-label="Skanna området"`. Behåll `disabled`-läget när en skanning pågår.
- `Spara fynd` tar resten: `flex: 1`, höjd 52 px, `border-radius: 16px`, `background: var(--guld)`, `color: #191203`, `font-weight: 700`, 17 px text, `IkonPlus` 21 px, `gap: 9px`.

Motivering att ta med i commit-meddelandet: man skannar en gång per skogsbesök och sparar fynd varje gång man hittar något. Två likadana knappar påstod att de är lika viktiga.

### 1.5 Toning i artradens högerkant

`.chips.rad` scrollar horisontellt men slutar idag i ett avhugget artnamn. Lägg en 34 px bred överliggande toning i högerkanten:

```css
.chips.rad { position: relative; }
.chips.rad::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0; right: 0;
  width: 34px;
  background: linear-gradient(to right, rgba(21, 30, 23, 0), rgba(21, 30, 23, .94) 70%);
  pointer-events: none;
}
```

Färgen måste matcha `.panel`-bakgrunden (`rgba(21,30,23,.94)`), inte `--yta`. I `PrognosVy` ligger samma chipsrad mot sidbakgrunden — där ska tonigen gå mot `#0d1310`.

### 1.6 Navigeringspanelen

`.navpanel` i `src/views/KartVy.tsx`:

- Etiketten `Mot ditt mål` → `Mot plats {n}` när målet kommer ur en skanning, annars artnamnet eller `Mot fyndplats`. Använd det namn användaren själv tryckte på.
- Avståndet: 21 px → **26 px**, `line-height: 1.1`
- Lägg till gångtid efter kompassriktningen: `NNO · 11 min`. Räkna på 4,5 km/h i skogsterräng; visa bara hela minuter.
- Pilen: 26 → **30 px**
- Padding: `10px 12px` → `9px 10px 9px 14px`, `gap: 11px`

---

## Ändring 2 — `PrognosVy` (skärm 2B)

Källfil: `src/views/PrognosVy.tsx`, samt `Chansmatare` i `src/components/Poang.tsx`.

### 2.1 Chansordet flyttas in i mätaren

`Chansmatare`: `chansOrd(p)` flyttas in i `.matare-mitt`, direkt under procenttalet — 17 px, `font-weight: 650`, samma `farg`, `margin-top: 2px`. Kvar utanför ringen står bara `chansRad(p)`, 14 px, `var(--text-svag)`, `margin-top: -14px`.

Etiketten med artnamnet i versaler (`KANTARELL`) utgår — arten står redan i det valda chipset ovanför. Propen `etikett` kan tas bort, eller behållas som valfri för andra användningsställen.

### 2.2 Ta bort dubbleringen

Raden `{chansOrd(analys.chans)}. {chansRad(analys.chans)}.` sist i kortet **Marken just nu** tas bort. Den upprepade ordagrant vad mätaren redan säger.

### 2.3 Säsongsraden flyttas till mätarkortet

`sasongsText(...)` ligger idag som svag text i rubriken för **Kommande dygn**. Flytta ned den i mätarkortet, i en fotrad delad med dagsljustexten:

```
[sol-ikon] Ljust till 20:14        Toppsäsong till 20 sept
```

Fotraden: `margin-top: 14px`, `padding-top: 12px`, `border-top: 1px solid var(--kant)`, centrerad, `gap: 14px`, 13 px, `var(--text-svagast)`.

### 2.4 Bästa dagen upp i kortrubriken

Meningen `Bäst dag: fredag 4 september — 55 %` under diagrammet flyttas upp till `.kort-rubrik` som en kort variant: `Bäst fre 4 sep · 55 %`, 13 px, `var(--guld-ljus)`. Kortformat på veckodag och månad.

Faller villkoret (`bast.chans` inte tillräckligt högre än idag) visas i stället nuvarande fallback-text på samma plats — samma två fall som i dag, ny placering.

Ta bort raden `{dagIManad(...)}` (den fjärde raden i varje `.prognosdag`). Med veckodag ovanför är datumsiffran redundant och kolumnerna får mer luft.

### 2.5 Regnsiffrorna: 4 kolumner → 2×2

`.matvarden` med fyra `mm / N d` byts mot ett 2×2-rutnät med etikett och värde på samma rad:

| Cell | Etikett | Värde |
|---|---|---|
| 1 | I fönstret | `41 mm` — **`var(--guld)`** |
| 2 | 30 dygn | `88 mm` |
| 3 | 7 dygn | `12 mm` |
| 4 | Sen regn | `6 dygn` |

Rutnätet: `grid-template-columns: 1fr 1fr`, `gap: 1px`, `background: var(--kant)`, `border: 1px solid var(--kant)`, `border-radius: 8px`, `overflow: hidden`. Varje cell `background: var(--yta)`, `padding: 10px 12px`, `display: flex`, `justify-content: space-between`, `align-items: baseline`. Etikett 13 px `var(--text-svag)`, värde 18 px `.siffror`.

Cell 1 är ny data: nederbörden summerad över artens fördröjningsfönster (`regnfordrojning.topp ± bredd`) — samma fönster som markeras i gult i `Regndiagram`. Det är den siffra hela modellen bygger på och den enda som förtjänar guld.

### 2.6 Artlistan visar fem

`artlage` klipps till fem rader. Under listan: en avdelare (`border-top: 1px solid var(--kant)`, `padding-top: 10px`, `margin-top: 10px`) och en knapp `Visa alla nio arter`, 13,5 px, `font-weight: 650`, `var(--guld)`, som fäller ut resten. Antalet i texten ska räknas fram, inte hårdkodas.

---

## Ändring 3 — Ljust läge (skärm 3A och 3B)

Identisk layout och identiska mått som 2A/2B. Endast tokens byts. Lägg det som ett tema på `:root` respektive `[data-tema='ljus']` och behåll `color-scheme` i takt (`dark` / `light`).

### Tokenmappning

| Token | Mörkt (nuvarande) | Ljust (nytt) |
|---|---|---|
| `--bakgrund` | `#0d1310` | `#F7F6F1` |
| kartunderlagets bottenfärg | `#101a13` | `#E8E6DC` |
| `--yta` | `#151e17` | `#FFFFFF` |
| `--yta-2` | `#1c2820` | `#F1F0E9` |
| `--yta-3` | `#24332a` | `#E4E3D9` |
| `--kant` | `#29392e` | `#DAD8CD` |
| `--kant-stark` | `#3d5544` | `#C2C0B1` |
| `--text` | `#e9f2e8` | `#191C18` |
| `--text-svag` | `#a0b3a4` | `#585E56` |
| `--text-svagast` | `#6f8375` | `#686E63` |
| `--bla` | `#4fa3d9` | `#1B7CBC` |
| `--guld` | `#f2b705` | `#f2b705` (oförändrad) |
| `--guld-ljus` | `#ffd24a` | `#96690A` |

**`--guld` ändras inte.** Guldet är varumärket och fungerar som fyllnadsfärg mot vitt: knappar, markörer, gradienter och den gula fönstermarkeringen i regndiagrammet behåller exakt `#f2b705`.

**Men guld duger inte som textfärg mot vitt** — `#f2b705` mot `#FFFFFF` ger 1,7:1. Inför därför en separat token för guldfärgad text:

```css
--guld-text: #96690A;   /* 4,86:1 mot vitt */
```

I mörkt läge sätts `--guld-text: var(--guld)`. Allt som idag skriver `color: var(--guld)` byter till `var(--guld-text)`: `Dölj`, aktiv flik i `.nav`, `fönstret som avgör` i diagramfoten, `Visa alla nio arter`, `.marke`, `Bäst fre 4 sep`.

`--text-svagast` i ljust läge är satt till `#686E63` (5,2:1 mot vitt) och inte till en direkt spegling av `#6f8375` — den tonen hade landat på 3,8:1, alltså sämre än mörka läget. Småtexten i 11–12 px är för viktig för det: appens egen premiss i `global.css` är hög kontrast i motljus, och ljust läge är just vad man använder i motljus.

### Chansfärgerna

`SKALA` i `src/lib/farg.ts` är byggd för mörk bakgrund. Mot vitt behöver de tre mellersta stegen sänkas i ljushet. Prototypen använder:

| Värde | Mörkt | Ljust |
|---|---|---|
| chansfarg(0.46) | `rgb(106 152 51)` | `rgb(84 120 38)` |
| chansfarg(0.52) | `rgb(120 158 43)` | `rgb(90 122 32)` |
| chansfarg(0.68) | `rgb(214 164 13)` | `rgb(160 119 6)` |
| chansfarg(0.62) | `rgb(196 154 16)` | `rgb(147 113 8)` |

Implementera som en andra skala i `farg.ts` — `SKALA_LJUS` — och låt `chansfarg(v, ljust = false)` välja. Skalan används både som textfärg och som stapelfyllning; textkraven är hårdare, så ta den mörkare varianten genomgående.

`VARME_LJUS` och `varmeAlfa` i `farg.ts` behöver **inte** ändras. De är redan gjorda för ljus bakgrund (kommentaren i filen förklarar varför) och är den ramp båda lägena använder över terrängkartan.

### Kartunderlaget mörkas inte i ljust läge

Kartrutorna renderas idag mot `#101a13`. I ljust läge tas dämpningen bort helt — värmekartans guldramp får arbeta mot en ljus karta som den är byggd för. `.kartyta` och `.leaflet-container` byter bottenfärg till `#E8E6DC`.

### Skuggor och genomskinliga paneler

| Egenskap | Mörkt | Ljust |
|---|---|---|
| `--skugga` | `0 2px 8px rgba(0,0,0,.4)` | `0 2px 8px rgba(0,0,0,.16)` |
| `.panel` / `.kart-knapp` bakgrund | `rgba(21,30,23,.94)` | `rgba(255,255,255,.95)` |
| `.nav` bakgrund | `rgba(15,23,18,.94)` | `rgba(255,255,255,.96)` |
| status­textens skugga över kartan | `0 1px 3px rgba(0,0,0,.7)` | `0 1px 2px rgba(255,255,255,.85)` |
| `.leaflet-control-attribution` | `rgba(13,19,16,.78)` | `rgba(255,255,255,.82)` |

`backdrop-filter: blur(16px)` behålls oförändrat i båda lägena.

### Kartmarkörer

De gula markörerna (`.m-fynd`, `.m-topp`) har en vit ring som försvinner mot en ljus karta. I ljust läge:

- `.m-topp`: `border: 2px solid rgba(58,43,0,.5)`
- `.m-fynd`: `border: 2.5px solid rgba(58,43,0,.45)`
- `.m-gps` behåller vit ring — den blå pricken behöver den mot båda underlagen.
- `.m-obs` (GBIF-prickarna) är `rgba(255,255,255,.62)` och blir osynliga mot vitt. Byt till `rgba(30,30,30,.55)` med ljus kant i ljust läge.

### Hur läget väljs

Inte specificerat i designen. Rekommendation: `Mer`-vyn får en `.segment` med **Auto / Ljust / Mörkt**, standard Auto som följer `prefers-color-scheme`, valet sparat i samma store som övriga inställningar. `color-scheme` måste sättas i takt så att formulärkontroller och scrollbars följer med.

---

## Designtokens som inte ändras

Behåll oförändrat ur `global.css`: alla radier (`--r-s` 8, `--r-m` 14, `--r-l` 20, `--r-xl` 28), `--sidled: 16px`, `--nav-hojd: 62px`, typografiskalan (`h1` 26, `h2` 20, `h3` 17, brödtext 16/1,45, `.liten` 13,5, `.mini` 12, `.etikett` 11 px med `.07em` versaler), typsnittsstacken (`--sans` = system, `--siffror` = `ui-rounded`), alla träffytor på minst 36 px, `env(safe-area-inset-*)`-hanteringen och `prefers-reduced-motion`-blocket.

De två nya måtten är knapparna i 1.4: 52 px höjd och `border-radius: 16px`.

## Tillgänglighet

- Alla nya textfärger är kontrollerade mot sin faktiska bakgrund. Lägsta värde i ljust läge: `#686E63` mot vitt = 5,2:1.
- `.panel-huvud` blir en `<div>` med tre separata kontroller — se till att var och en har eget `aria-label` eller synlig text, och att fäll-knappen behåller `aria-expanded`.
- Ikonknappen `Skanna` (1.4) tappar sin synliga text och behöver `aria-label`.
- `Dölj`/`Visa` för värmekartan bör behålla `aria-pressed`.

## Assets

Inga nya. Alla ikoner finns i `src/components/Ikoner.tsx` och används oförändrade: `IkonRadar`, `IkonPlus`, `IkonSikte`, `IkonLager`, `IkonSpar`, `IkonKryss`, `IkonNed`, `IkonSol`, `IkonKarta`, `IkonMoln`, `IkonKorg`, `IkonBok`, `IkonMer`. Prototypen har samma SVG-vägar inlinade.

Kartbilden i prototypen är en enda OpenTopoMap-ruta som bakgrund (`14/8856/4872`) — bara ett stillbildsunderlag för att visa panelerna i sitt sammanhang. Värmekartan är målad på en `<canvas>` med determinstiskt brus, inte riktig data.

## Data i prototypen

Påhittade men modellmässigt rimliga värden för kantarell, 30 augusti, 59.620/15.200: fruktsättningsindex 62 %, säsong 0,74, chans 46 % (`Bra`), markfukt 31 %, marktemp 13,4°, regn 12/41/88 mm över 7/14/30 dygn, 6 dygn sedan regn, bästa dag fredag 4 september 55 %. Använd riktiga värden från modellen — texterna är inte hårdkodade i designen.
