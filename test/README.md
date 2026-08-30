# Tester

Kör med Nodes inbyggda typavskalning:

```bash
node --experimental-strip-types test/<fil>
```

| Fil | Vad den kollar | Nät? |
|---|---|---|
| `terrang.test.ts` | Lutning, väderstreck och hydrologi mot syntetiska höjdmodeller — plan yta, kända sluttningar, en V-dal och en sänka utan utlopp | nej |
| `fruktsattning.test.ts` | Vädermodellen mot konstruerade scenarier: torka, idealt regnfönster, skyfall igår, vattensjuk mark, frost, säsongskurvan | nej |
| `hojdkakel.test.ts` | Upplösningsformeln, zoomvalet och att höjdvärdena stämmer med verkligheten | ja |
| `skanning.test.ts` | Hela kedjan mot skarp data över Lunsen söder om Uppsala | ja |
| `fordelning.ts` | Skriver ut poängfördelningen — används för att se att modellen skiljer platser åt inom en och samma skog | ja |
| `varmekarta.ts` | Hur stor andel av en skanning som blir synlig i värmekartan | ja |

`shim.ts` härmar webbläsarens `createImageBitmap` och `OffscreenCanvas` så att
avkodningen av terrängkakel går att köra i Node.
