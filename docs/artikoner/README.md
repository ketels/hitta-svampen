# Artikoner

Tio ifyllda svampsilhuetter, 24×24, till `hitta-svampen`.

## Innehåll

| Mapp | Vad |
|---|---|
| `Artikoner.tsx` | React-komponenter i samma form som `src/components/Ikoner.tsx`. Lägg i `src/components/`. |
| `svg/` | Rena SVG-filer, `fill="currentColor"` — färgen sätts av föräldern. |
| `svg-fargad/` | Samma filer med artfärgen inbakad, för sammanhang utan CSS (export, delning, favicon). |

## Användning

```tsx
import { artIkon, IKONFARG } from '../components/Artikoner.tsx'

const Ikon = artIkon(a.id)
<Ikon size={17} style={{ color: IKONFARG[a.id].mork }} />
```

## Ifyllda, inte streckade

En 1,9-px-kontur försvinner vid 17 px, och 17 px är storleken de faktiskt
används i: `.chip` i artraden, `.artrad` i prognosvyn, `.fyndprick` i
fyndlistan (19 px), `.m-fynd` på kartan (11–16 px). Vid 11 px överlever bara
silhuetten — tratt, bukig fot, låg ticka. Det är avsiktligt vad formerna bygger
på.

## Färgerna är inte artens `farg`

`Species.farg` i `arter.ts` är valda som färgade pluppar. Som fyllnadsyta
håller de inte kontrast: svart trumpetsvamp `#4a4a52` ger 1,4:1 mot `--yta`,
och Karl Johan, brunsopp och blodriska är också för mörka. Åt andra hållet
försvinner blek taggsvamp och fårticka mot vitt.

`IKONFARG` i `Artikoner.tsx` innehåller därför två varianter per art: en
ljusad för mörkt läge och en mörkad för ljust. Alla ligger över 3:1 mot sin
bakgrund, vilket är kravet för grafik.

Vill du hellre ändra `Species.farg` direkt går det, men då ändras också
kartmarkörernas och staplarnas färg — vilket kan vara rätt, men är ett större
beslut.

## Formerna

| Art | Vad silhuetten säger |
|---|---|
| Kantarell | Sned, vågig tratt med solid, avsmalnande fot |
| Trattkantarell | Smalare tratt, vågig kant, tunn hålfot |
| Svart trumpetsvamp | Smal tratt med svagt vågig kant, ingen tydlig hattgräns |
| Karl Johan | Bred hatt, tjock bukig fot |
| Sandsopp | Bredast och plattast hatt, rak smal fot |
| Brunsopp | Liten hatt, hög smal fot |
| Blek taggsvamp | Buckligt hattvalv med taggar i underkanten |
| Fårticka | Låg, tvålobbig ticka, nästan ingen fot |
| Blodriska | Skålformad, nedsänkt hatt |
| Annan svamp | Generisk hatt och fot |

Soppar liknar soppar. Karl Johan, sandsopp och brunsopp skiljs bara på hattens
bredd och fotens längd — detaljer som nätmönstret på Karl Johans fot överlever
inte 11 px.

## Ursprung

Ritade som skisser i designdokumentet `Hitta Svampen.dc.html`, tur 4. Formerna
är geometri, inte illustration — mått och användning håller även om någon ritar
om själva silhuetterna.
