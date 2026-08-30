/** Grundläggande typer för Hitta Svampen. */

export type LatLng = { lat: number; lon: number }

export type BBox = { south: number; west: number; north: number; east: number }

/* ---------- Arter ---------- */

export type SpeciesId =
  | 'kantarell'
  | 'trattkantarell'
  | 'svart-trumpetsvamp'
  | 'karljohan'
  | 'blek-taggsvamp'
  | 'faarticka'
  | 'blodriska'
  | 'sandsopp'
  | 'brunsopp'
  | 'annat'

/** Vilka trädslag svampen bildar mykorrhiza med. Styr habitatpoängen. */
export type Host = 'gran' | 'tall' | 'bjork' | 'ek' | 'bok' | 'hassel' | 'asp'

export type Species = {
  id: SpeciesId
  namn: string
  latin: string
  emoji: string
  farg: string
  /** Trädslag den lever i symbios med, viktigast först. */
  vardar: Host[]
  /** Föredragen skogstyp: vikt 0–1 per lövtyp. */
  lovtyp: { needleleaved: number; broadleaved: number; mixed: number }
  /** Optimal marktemperatur på 6 cm djup (°C). */
  marktemp: { min: number; opt: number; max: number }
  /** Optimal markfuktighet 7–28 cm (m³/m³). */
  markfukt: { min: number; opt: number; max: number }
  /** Dagar från regn till fruktkropp — kärnans tyngdpunkt och bredd. */
  regnfordrojning: { topp: number; bredd: number }
  /** Säsong som dagnummer (1–366) i mellansverige. Justeras efter latitud. */
  sasong: { start: number; toppStart: number; toppSlut: number; slut: number }
  /** Tål frost? Trattkantarell gör det, kantarell inte. */
  frosttalig: boolean
  /** Topografiskt våtindex-optimum (högre = blötare läge). */
  twiOpt: number
  twiBredd: number
  /** Kort beskrivning av var man hittar den. */
  var: string
  /** Kännetecken för säker identifiering. */
  kannetecken: string[]
  /** Farliga eller trista förväxlingssvampar. */
  forvaxling: string[]
}

/* ---------- Fynd ---------- */

export type Mangd = 'enstaka' | 'handfull' | 'korg' | 'jackpot'

export type Find = {
  id: string
  lat: number
  lon: number
  /** GPS-noggrannhet i meter när fyndet sparades. */
  noggrannhet: number | null
  /** Tidpunkt (epoch ms). */
  tid: number
  art: SpeciesId
  mangd: Mangd
  anteckning: string
  /** Bild-id:n i bildlagret. */
  bilder: string[]
  /** Fyndet är hemligt — visas bara som prick utan namn vid delning. */
  favorit: boolean
  /** Automatiskt fångad habitatbeskrivning vid sparandet. */
  habitat?: HabitatProv
  /** Vädret de senaste veckorna när fyndet gjordes. */
  vader?: VaderSammanfattning
}

/** En inspelad rutt genom skogen. */
export type Spar = {
  id: string
  namn: string
  start: number
  slut: number
  punkter: { lat: number; lon: number; t: number; alt: number | null }[]
  /** Längd i meter. */
  langd: number
}

/* ---------- Terräng & landtäcke ---------- */

export type Marktyp =
  | 'barrskog'
  | 'lovskog'
  | 'blandskog'
  | 'skog'
  | 'busksnar'
  | 'myr'
  | 'ang'
  | 'aker'
  | 'vatten'
  | 'bebyggt'
  | 'hygge'
  | 'okant'

export type HabitatProv = {
  lat: number
  lon: number
  marktyp: Marktyp
  /** Höjd över havet (m). */
  hojd: number
  /** Lutning i grader. */
  lutning: number
  /** Väderstreck lutningen pekar mot, grader från norr. null om platt. */
  vaderstreck: number | null
  /** Topografiskt våtindex — hur mycket vatten som samlas här. */
  twi: number
  /** Meter till närmaste vatten/dike/å. */
  tillVatten: number | null
  /** Meter till närmaste skogsbryn eller stig. */
  tillKant: number | null
  /** Trädslag från OSM-taggar om de finns. */
  tradslag: Host[]
}

/* ---------- Väder ---------- */

export type VaderDag = {
  datum: string
  nederbord: number
  tempMax: number
  tempMin: number
  /** Markfukt 7–28 cm, dygnsmedel. */
  markfukt: number
  /** Marktemp 6 cm, dygnsmedel. */
  marktemp: number
  /** Lokal tid, ISO utan zon. Null när solen inte går upp eller ned alls. */
  soluppgang?: string | null
  solnedgang?: string | null
}

export type VaderSammanfattning = {
  /** Regn senaste 7 / 14 / 30 dygnen (mm). */
  regn7: number
  regn14: number
  regn30: number
  markfukt: number
  marktemp: number
  /** Fruktsättningsindex 0–1 för dagens datum. */
  index: number
}

/* ---------- Poängsättning ---------- */

export type Delpoang = {
  namn: string
  varde: number
  vikt: number
  motivering: string
  /**
   * `vikt` — ingår i det viktade medelvärdet för terrängen.
   * `faktor` — multiplicerar hela poängen i stället, för sådant som avgör
   * takhöjden snarare än nyansen (marktyp, kända fynd).
   */
  typ?: 'vikt' | 'faktor'
}

export type Bedomning = {
  /** Slutlig chans 0–100. */
  poang: number
  habitat: number
  fruktsattning: number
  sasong: number
  delar: Delpoang[]
  /** Kort textmotivering på svenska. */
  sammanfattning: string
}

/** En cell i habitatskanningen. */
export type ScanCell = {
  lat: number
  lon: number
  poang: number
  habitat: HabitatProv
  /** Antal kända fynd (GBIF + egna) som stöttar cellen. */
  stod: number
}
