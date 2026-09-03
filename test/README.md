# Tester

Kör med Nodes inbyggda typavskalning:

```bash
node --experimental-strip-types test/<fil>
```

| Fil | Vad den kollar | Nät? |
|---|---|---|
| `terrain.test.ts` | Lutning, väderstreck och hydrologi mot syntetiska höjdmodeller — plan yta, kända sluttningar, en V-dal och en sänka utan utlopp | nej |
| `fruiting.test.ts` | Vädermodellen mot konstruerade scenarier: torka, idealt regnfönster, skyfall igår, vattensjuk mark, frost, säsongskurvan, REW-normaliseringen | nej |
| `migration.test.ts` | Att en databas skriven av den svenska versionen överlever bytet till engelska fält- och lagernamn — fynd, spår, bilder, kartrutor och inställningar | nej |
| `prefetch.test.ts` | Att en förhämtad trakt täcker skanningar inuti den och att 2023- och 2018-utgåvorna av marktäckedatan läggs ihop rätt, mot en låtsas-WMS | nej |
| `elevationTiles.test.ts` | Upplösningsformeln, zoomvalet och att höjdvärdena stämmer med verkligheten | ja |
| `landCover.test.ts` | Att färgtabellerna stämmer med Naturvårdsverkets legend, att Lunsen kommer tillbaka som skog med trädslag, och att vektorrutorna ger stigar och bäckar | ja |
| `scan.test.ts` | Hela kedjan mot skarp data över Lunsen söder om Uppsala | ja |
| `climatology.test.ts` | Att Open-Meteos arkiv och prognos fortfarande är kommensurabla, vilket REW-mappningen förutsätter | ja |
| `degradation.ts` | Att en skanning fungerar och flaggar sig själv när både marktäcke- och vektorrutorna är onåbara | ja |
| `distribution.ts` | Skriver ut poängfördelningen — används för att se att modellen skiljer platser åt inom en och samma skog | ja |
| `heatmap.ts` | Hur stor andel av en skanning som blir synlig i värmekartan | ja |

`shim.ts` härmar webbläsarens `createImageBitmap` och `OffscreenCanvas` så att
avkodningen av terrängkakel går att köra i Node.

## Språk

Testerna är kod och skrivs därför på engelska, precis som resten av `src/`.
Undantaget är utskrifterna: de beskriver appens beteende för en svensk läsare
och står kvar på svenska, på samma sätt som gränssnittets texter.
