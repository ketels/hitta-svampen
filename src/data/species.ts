/**
 * Species catalogue with the ecological parameters the model needs.
 *
 * The numbers come from Swedish mycological literature and field data: when
 * the species fruit in central Sweden, which trees they form mycorrhiza with,
 * and how long the lag is between rain and fruit body. The chanterelle is the
 * slowest of them — the mycelium needs roughly two to three weeks of sustained
 * soil moisture before anything pushes up. That is why "it rained yesterday"
 * is a poor chanterelle forecast, but "it rained properly sixteen days ago" is
 * a good one.
 *
 * Names, descriptions and identification notes stay in Swedish: they are user
 * interface copy, not code.
 */

import type { Species, SpeciesId } from '../lib/types.ts'

/** Helper: day-of-year from month/day. */
const d = (month: number, day: number) =>
  Math.round((new Date(Date.UTC(2001, month - 1, day)).getTime() - Date.UTC(2001, 0, 1)) / 864e5) + 1

export const SPECIES: Species[] = [
  {
    id: 'chanterelle',
    name: 'Kantarell',
    latin: 'Cantharellus cibarius',
    color: '#f2b705',
    hosts: ['spruce', 'pine', 'birch', 'oak', 'beech'],
    leafType: { needleleaved: 0.92, broadleaved: 0.72, mixed: 1.0 },
    soilTemp: { min: 8, opt: 16, max: 24 },
    soilMoisture: { min: 0.16, opt: 0.29, max: 0.42 },
    rainLag: { peak: 16, width: 8 },
    season: { start: d(6, 20), peakStart: d(7, 25), peakEnd: d(9, 20), end: d(10, 25) },
    frostHardy: false,
    twiOpt: 8.6,
    twiWidth: 2.6,
    where: 'Mossig barr- och blandskog, gärna i sluttning med blåbärsris. Ofta längs stigkanter, diken och gläntor där ljuset når ner men marken håller fukt.',
    features: [
      'Äggulegul rakt igenom — bryt itu, köttet är gult även inuti',
      'Ribbor (trubbiga åsar) på undersidan som löper ned på foten, inte skivor',
      'Doftar tydligt av aprikos',
      'Fast och seg, går inte att smula sönder mellan fingrarna',
      'Växer i grupper eller ringar på samma ställe år efter år',
    ],
    lookalikes: [
      'Narrkantarell — äkta, gaffelgrenade orange skivor, mjukare kött, ofta på barrmatta. Ofarlig men smaklös.',
      'Pluggskivling — GIFTIG. Brun, skivor som lossnar från hatten, mörknar vid tryck.',
      'Toppig giftspindling — DÖDLIGT GIFTIG och växer i samma mossiga granskog. Rödbrun, spetsig puckel, äkta skivor, tydlig fot. Lik kantarell bara för den som inte tittar.',
    ],
  },
  {
    id: 'funnel-chanterelle',
    name: 'Trattkantarell',
    latin: 'Craterellus tubaeformis',
    color: '#c98a3c',
    hosts: ['spruce', 'pine', 'birch'],
    leafType: { needleleaved: 1.0, broadleaved: 0.35, mixed: 0.85 },
    soilTemp: { min: 2, opt: 10, max: 18 },
    soilMoisture: { min: 0.2, opt: 0.34, max: 0.48 },
    rainLag: { peak: 12, width: 6 },
    season: { start: d(8, 15), peakStart: d(9, 15), peakEnd: d(11, 5), end: d(12, 5) },
    frostHardy: true,
    twiOpt: 10.6,
    twiWidth: 2.6,
    where: 'Fuktig mossig granskog, gärna på vitmossa, murken ved och längs diken. Står ofta i täta mattor — hittar du en, sitt ner och leta.',
    features: [
      'Gul, ihålig fot som går att trycka ihop',
      'Gråbrun, trattformad hatt med vågig kant',
      'Ribbor på undersidan, gråaktiga och glest greniga',
      'Tunnare och spädare än kantarell',
    ],
    lookalikes: [
      'Rödgul trumpetsvamp — också god matsvamp, kraftigare gul fot.',
      'Inga farliga förväxlingar i svensk skog, men kontrollera alltid ribborna.',
    ],
  },
  {
    id: 'black-trumpet',
    name: 'Svart trumpetsvamp',
    latin: 'Craterellus cornucopioides',
    color: '#4a4a52',
    hosts: ['beech', 'oak', 'hazel'],
    leafType: { needleleaved: 0.15, broadleaved: 1.0, mixed: 0.6 },
    soilTemp: { min: 8, opt: 14, max: 22 },
    soilMoisture: { min: 0.18, opt: 0.32, max: 0.45 },
    rainLag: { peak: 14, width: 7 },
    season: { start: d(8, 1), peakStart: d(8, 25), peakEnd: d(10, 5), end: d(10, 25) },
    frostHardy: false,
    twiOpt: 9.6,
    twiWidth: 2.4,
    where: 'Ädellövskog på mullrik, gärna kalkhaltig mark i södra Sverige. Bok och ek. Nästan omöjlig att se mot förnan — leta på knäna i motljus.',
    features: [
      'Svartgrå trumpet, ihålig hela vägen ner till basen',
      'Tunn och nästan genomskinlig i kanten',
      'Ingen skarp gräns mellan hatt och fot',
      'Kraftig, nästan parfymerad doft',
    ],
    lookalikes: ['Inga farliga. Formen är omisskännlig när du väl sett den.'],
  },
  {
    id: 'porcini',
    name: 'Karl Johan',
    latin: 'Boletus edulis',
    color: '#8b5e34',
    hosts: ['spruce', 'pine', 'birch', 'oak'],
    leafType: { needleleaved: 0.95, broadleaved: 0.8, mixed: 1.0 },
    soilTemp: { min: 8, opt: 14, max: 22 },
    soilMoisture: { min: 0.15, opt: 0.27, max: 0.4 },
    rainLag: { peak: 11, width: 5 },
    season: { start: d(7, 10), peakStart: d(8, 10), peakEnd: d(9, 25), end: d(10, 20) },
    frostHardy: false,
    twiOpt: 8.0,
    twiWidth: 2.6,
    where: 'Skogsbryn, gläntor och vägkanter i barr- och blandskog. Vill ha ljus och värme — de första kommer där solen når marken.',
    features: [
      'Vitt, upphöjt nätmönster högst upp på den tjocka foten',
      'Porer under hatten, vita som gulnar med åldern — inte skivor',
      'Vitt kött som inte färgas när du skär i det',
      'Hatten känns som mockaskinn',
    ],
    lookalikes: [
      'Gallsopp — rosa porer, mörkt nät på foten, brutalt bitter. Förstör hela grytan. Slicka på köttet vid tvekan.',
      'Blodsopp och andra blånande soppar — köttet blånar vid snitt.',
    ],
  },
  {
    id: 'hedgehog',
    name: 'Blek taggsvamp',
    latin: 'Hydnum repandum',
    color: '#e8dcc0',
    hosts: ['spruce', 'pine', 'beech', 'oak'],
    leafType: { needleleaved: 0.85, broadleaved: 0.7, mixed: 1.0 },
    soilTemp: { min: 6, opt: 13, max: 21 },
    soilMoisture: { min: 0.17, opt: 0.3, max: 0.43 },
    rainLag: { peak: 13, width: 6 },
    season: { start: d(8, 5), peakStart: d(9, 1), peakEnd: d(10, 10), end: d(11, 5) },
    frostHardy: false,
    twiOpt: 9.0,
    twiWidth: 2.6,
    where: 'Mossig blandskog, ofta i sällskap med kantarell och i samma sorts sluttningar.',
    features: [
      'Mjuka vita taggar på undersidan i stället för skivor eller ribbor',
      'Ojämn, buckliga gräddvit hatt',
      'Sprött kött som bryts som krita',
    ],
    lookalikes: ['Rödgul taggsvamp — också ätlig, mer orange. Inga farliga taggsvampar i Sverige.'],
  },
  {
    id: 'sheep-polypore',
    name: 'Fårticka',
    latin: 'Albatrellus ovinus',
    color: '#d8cfae',
    hosts: ['spruce'],
    leafType: { needleleaved: 1.0, broadleaved: 0.1, mixed: 0.7 },
    soilTemp: { min: 5, opt: 12, max: 20 },
    soilMoisture: { min: 0.18, opt: 0.31, max: 0.44 },
    rainLag: { peak: 13, width: 6 },
    season: { start: d(8, 1), peakStart: d(8, 25), peakEnd: d(10, 1), end: d(10, 20) },
    frostHardy: false,
    twiOpt: 9.2,
    twiWidth: 2.5,
    where: 'Mossig granskog, gärna äldre och lite fuktig. Står i grupper och knuffar upp mossan.',
    features: [
      'Vit till gräddgul hatt som gulnar och spricker med åldern',
      'Fina vita porer på undersidan som löper ner på foten',
      'Gulnar tydligt vid kokning',
    ],
    lookalikes: ['Grangråticka — bittrare, gråare. Ofarlig men trist.'],
  },
  {
    id: 'saffron-milkcap',
    name: 'Blodriska',
    latin: 'Lactarius deterrimus',
    color: '#d2691e',
    hosts: ['spruce'],
    leafType: { needleleaved: 1.0, broadleaved: 0.1, mixed: 0.7 },
    soilTemp: { min: 5, opt: 13, max: 21 },
    soilMoisture: { min: 0.17, opt: 0.3, max: 0.44 },
    rainLag: { peak: 12, width: 6 },
    season: { start: d(8, 1), peakStart: d(8, 20), peakEnd: d(10, 5), end: d(10, 25) },
    frostHardy: false,
    twiOpt: 9.0,
    twiWidth: 2.6,
    where: 'Ung granskog, granplanteringar och grandungar i hagmark.',
    features: [
      'Orange mjölksaft när du skär i den, som långsamt blir vinröd',
      'Gröna fläckar på hatt och fot där den skadats',
      'Nedsänkt trattformad hatt med svaga ringzoner',
    ],
    lookalikes: ['Andra riskor med vit mjölksaft — skarpa och olämpliga. Orange saft är nyckeln.'],
  },
  {
    id: 'velvet-bolete',
    name: 'Sandsopp',
    latin: 'Suillus variegatus',
    color: '#c9a227',
    hosts: ['pine'],
    leafType: { needleleaved: 1.0, broadleaved: 0.1, mixed: 0.6 },
    soilTemp: { min: 7, opt: 14, max: 22 },
    soilMoisture: { min: 0.13, opt: 0.25, max: 0.38 },
    rainLag: { peak: 11, width: 5 },
    season: { start: d(7, 20), peakStart: d(8, 15), peakEnd: d(9, 30), end: d(10, 25) },
    frostHardy: false,
    twiOpt: 7.4,
    twiWidth: 2.6,
    where: 'Torr tallhed på sandig mark, ofta där renlav och ljung växer.',
    features: [
      'Ockragul, filtig och lite sandig hatt',
      'Små olivbruna porer',
      'Blånar svagt i köttet vid snitt',
    ],
    lookalikes: ['Övriga soppar på tallhed är ätliga. Inga farliga i den här miljön.'],
  },
  {
    id: 'bay-bolete',
    name: 'Brunsopp',
    latin: 'Imleria badia',
    color: '#6f4e2e',
    hosts: ['spruce', 'pine'],
    leafType: { needleleaved: 1.0, broadleaved: 0.3, mixed: 0.8 },
    soilTemp: { min: 4, opt: 12, max: 21 },
    soilMoisture: { min: 0.15, opt: 0.28, max: 0.42 },
    rainLag: { peak: 12, width: 6 },
    season: { start: d(8, 1), peakStart: d(8, 25), peakEnd: d(10, 20), end: d(11, 15) },
    frostHardy: true,
    twiOpt: 8.6,
    twiWidth: 2.6,
    where: 'Barrskog, ofta på och kring gamla stubbar och murken ved.',
    features: [
      'Kastanjebrun, blank och klibbig hatt i väta',
      'Gulaktiga porer som blånar tydligt vid beröring',
      'Slank fot utan nätmönster',
    ],
    lookalikes: ['Blånandet är normalt och ofarligt här. Kontrollera att foten saknar nät.'],
  },
  {
    id: 'other',
    name: 'Annan svamp',
    latin: '—',
    color: '#9aa0a6',
    hosts: ['spruce', 'pine', 'birch'],
    leafType: { needleleaved: 0.9, broadleaved: 0.9, mixed: 1.0 },
    soilTemp: { min: 5, opt: 14, max: 22 },
    soilMoisture: { min: 0.16, opt: 0.3, max: 0.44 },
    rainLag: { peak: 13, width: 7 },
    season: { start: d(7, 1), peakStart: d(8, 15), peakEnd: d(10, 5), end: d(11, 10) },
    frostHardy: false,
    twiOpt: 9.0,
    twiWidth: 3.0,
    where: 'Allmän skogsmark.',
    features: [],
    lookalikes: [],
  },
]

export const SPECIES_MAP = new Map<SpeciesId, Species>(SPECIES.map((s) => [s.id, s]))

export function species(id: SpeciesId): Species {
  return SPECIES_MAP.get(id) ?? SPECIES_MAP.get('other')!
}

/** The species you realistically go out looking for, in a chosen order. */
export const MAIN_SPECIES: SpeciesId[] = [
  'chanterelle',
  'funnel-chanterelle',
  'porcini',
  'black-trumpet',
  'hedgehog',
  'sheep-polypore',
  'bay-bolete',
  'saffron-milkcap',
  'velvet-bolete',
]

/** GBIF taxon keys, for fetching verified finds from Artportalen and others. */
export const GBIF_KEYS: Partial<Record<SpeciesId, number>> = {
  chanterelle: 5249504,
  'funnel-chanterelle': 2554536,
  'black-trumpet': 2554662,
  porcini: 5954958,
  hedgehog: 2554716,
  'sheep-polypore': 2551823,
  'saffron-milkcap': 7925734,
}
