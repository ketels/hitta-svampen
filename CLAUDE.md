# Hitta Svampen

En svensk kantarellapp: habitatanalys, väderprognos och egna fyndplatser.
React + TypeScript + Vite, allt lagrat lokalt i IndexedDB.

## Språk: kod på engelska, gränssnitt på svenska

**All kod skrivs på engelska. Undantagslöst.** Även om appen är på svenska och
domänen är svensk, ska ingenting som kompilatorn eller läsaren uppfattar som
kod vara på svenska.

Det gäller:

- **Identifierare** — variabler, funktioner, typer, gränssnitt, egenskaper,
  konstanter, enum-värden, generiska parametrar.
- **Filnamn och mappnamn** — `fruiting.ts`, inte `fruktsattning.ts`.
- **Kommentarer och doc-kommentarer**, inklusive JSDoc.
- **CSS-klasser och custom properties** — `.find-row`, `--gold-text`.
- **Commit-meddelanden**, branch-namn och PR-titlar.
- **HTML-attribut som är kod** — `id`, `class`, `data-*`-nycklar.

Det gäller **inte** — här är svenska rätt och ska bevaras:

- **Alla strängar användaren ser.** Knapptexter, rubriker, felmeddelanden,
  artnamn, kännetecken, förväxlingsvarningar, `aria-label`, `placeholder`,
  `title`. Appen är svensk och ska förbli det.
- **Lokalisering** — `toLocaleDateString('sv-SE')`, `lang="sv"`, väderstrecken
  i `COMPASS` (N/O/S/V, inte N/E/S/W).
- **Testutskrifter** — de beskriver beteende för en svensk läsare.
- **README och annan prosa-dokumentation.**
- **Fältnamn i sparad data från äldre versioner** — se `src/lib/dbMigrate.ts`.
  De svenska namnen där är ett wire-format, inte kod som får döpas om.

När du behöver ett svenskt ord i en engelsk kontext: låt strängen vara svensk
och identifieraren engelsk.

```ts
// Rätt
const chanceWord = (percent: number) => (percent >= 68 ? 'Utmärkt' : 'Bra')

// Fel
const chansOrd = (procent: number) => (procent >= 68 ? 'Utmärkt' : 'Bra')
```

## Ordlista

Domänen är svensk, så översättningarna är inte alltid självklara. Håll dig till
dessa så att koden är sökbar:

| Svenska | Engelska |
|---|---|
| fynd | find |
| spår (inspelad rutt) | track |
| art / arter | species |
| poäng / delpoäng | score / score part |
| bedömning | assessment |
| chans | chance |
| fruktsättning | fruiting |
| säsong | season |
| habitat | habitat |
| marktyp | land type |
| landtäcke | land cover |
| markfukt / ytfukt | soil moisture / surface moisture |
| marktemperatur | soil temperature |
| nederbörd | precipitation |
| lutning / väderstreck | slope / aspect |
| höjd (över havet) | elevation |
| trädslag | tree species |
| värdträd | host |
| skanning | scan |
| rutnät / cell | grid / cell |
| kartruta (kakel) | tile |
| värmekarta | heatmap |
| förhämtning | prefetch |
| lärande / anpassning | learning / adaptation |
| klimatologi | climatology |
| terräng | terrain |
| våtindex | TWI (topographic wetness index) |

## Persistens

Fyndplatser är oersättliga — de tar år att samla och ligger bara på användarens
telefon. Om du byter namn på ett fält i `Find`, `Track` eller `HabitatSample`,
eller på ett IndexedDB-lager, **måste** du samtidigt:

1. Höja `DB_VERSION` i `src/lib/db.ts` och skriva migreringen.
2. Lägga till mappningen i `src/lib/dbMigrate.ts`.
3. Utöka `test/migration.test.ts` så den bevisar att gammal data överlever.
4. Se till att importfunktionen i `MoreView.tsx` läser båda formaten.

Migreringen som tog appen från svenska till engelska fältnamn (version 1 → 2)
är mallen. Glöm inte att även *värden* kan behöva översättas, inte bara
nycklar — ett kvarglömt `'satellit'` i `mapLayer` slår upp till `undefined` och
tar ner kartan.

Höj `CACHE_VERSION` när formen på något cachat ändras.

## Kommandon

```bash
npm run dev        # utvecklingsserver på :5173
npm run mobil      # samma, men med HTTPS så GPS fungerar från telefonen
npm run typecheck  # tsc --noEmit
npm run build      # typkontroll + produktionsbygge
```

Testerna körs en och en med Nodes typavskalning; se `test/README.md` för vilka
som behöver nät.

```bash
node --experimental-strip-types test/migration.test.ts
```
