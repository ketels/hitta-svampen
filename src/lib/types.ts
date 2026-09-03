/** Core types for Hitta Svampen. */

export type LatLng = { lat: number; lon: number }

export type BBox = { south: number; west: number; north: number; east: number }

/* ---------- Species ---------- */

export type SpeciesId =
  | 'chanterelle'
  | 'funnel-chanterelle'
  | 'black-trumpet'
  | 'porcini'
  | 'hedgehog'
  | 'sheep-polypore'
  | 'saffron-milkcap'
  | 'velvet-bolete'
  | 'bay-bolete'
  | 'other'

/** Tree species the fungus forms mycorrhiza with. Drives the habitat score. */
export type Host = 'spruce' | 'pine' | 'birch' | 'oak' | 'beech' | 'hazel' | 'aspen'

export type Species = {
  id: SpeciesId
  name: string
  latin: string
  color: string
  /** Trees it lives in symbiosis with, most important first. */
  hosts: Host[]
  /** Preferred forest type: weight 0–1 per leaf type. */
  leafType: { needleleaved: number; broadleaved: number; mixed: number }
  /** Optimal soil temperature at 6 cm depth (°C). */
  soilTemp: { min: number; opt: number; max: number }
  /** Optimal soil moisture 9–27 cm (m³/m³). */
  soilMoisture: { min: number; opt: number; max: number }
  /** Days from rain to fruit body — the kernel's centre of mass and width. */
  rainLag: { peak: number; width: number }
  /** Season as day-of-year (1–366) for central Sweden. Adjusted by latitude. */
  season: { start: number; peakStart: number; peakEnd: number; end: number }
  /** Frost tolerant? The funnel chanterelle is, the chanterelle is not. */
  frostHardy: boolean
  /** Topographic wetness index optimum (higher = wetter position). */
  twiOpt: number
  twiWidth: number
  /** Short description of where to find it. */
  where: string
  /** Distinguishing marks for confident identification. */
  features: string[]
  /** Dangerous or merely disappointing lookalikes. */
  lookalikes: string[]
}

/* ---------- Finds ---------- */

export type Amount = 'few' | 'handful' | 'basket' | 'jackpot'

export type Find = {
  id: string
  lat: number
  lon: number
  /** GPS accuracy in metres when the find was saved. */
  accuracy: number | null
  /** Timestamp (epoch ms). */
  time: number
  species: SpeciesId
  amount: Amount
  note: string
  /** Photo ids in the photo store. */
  photos: string[]
  /** The find is a secret — shown only as an unnamed dot when shared. */
  favorite: boolean
  /** Habitat description captured automatically on save. */
  habitat?: HabitatSample
  /** The weather over the past weeks when the find was made. */
  weather?: WeatherSummary
}

/** A recorded route through the forest. */
export type Track = {
  id: string
  name: string
  start: number
  end: number
  points: { lat: number; lon: number; t: number; alt: number | null }[]
  /** Length in metres. */
  length: number
}

/* ---------- Terrain & land cover ---------- */

export type LandType =
  | 'coniferous'
  | 'deciduous'
  | 'mixed'
  | 'forest'
  | 'scrub'
  | 'bog'
  | 'meadow'
  | 'farmland'
  | 'water'
  | 'built'
  | 'clearcut'
  | 'bare'
  | 'unknown'

export type HabitatSample = {
  lat: number
  lon: number
  landType: LandType
  /** Elevation above sea level (m). */
  elevation: number
  /** Slope in degrees. */
  slope: number
  /** Compass direction the slope faces, degrees from north. null if flat. */
  aspect: number | null
  /** Topographic wetness index — how much water collects here. */
  twi: number
  /** Metres to the nearest water body, ditch or stream. */
  toWater: number | null
  /** Metres to the nearest forest edge or path. */
  toEdge: number | null
  /** Tree species from the land cover data where it tells. */
  treeSpecies: Host[]
}

/* ---------- Weather ---------- */

export type WeatherDay = {
  date: string
  precipitation: number
  tempMax: number
  tempMin: number
  /** Soil moisture 9–27 cm (mycelium depth), daily mean. */
  soilMoisture: number
  /** Soil moisture 3–9 cm (surface), daily mean. Missing in older saved series. */
  surfaceMoisture?: number
  /** Deep moisture as relative extractable water (0 = the site's driest,
      1 = its wettest) against the 15-year climatology. Missing without a
      climatology — the model then works in absolute values. */
  soilMoistureRew?: number
  /** Surface moisture in the same REW space, against the surface layer's own
      climatology. */
  surfaceMoistureRew?: number
  /** Soil temperature at 6 cm, daily mean. */
  soilTemp: number
  /** Local time, ISO without zone. Null when the sun neither rises nor sets. */
  sunrise?: string | null
  sunset?: string | null
}

export type WeatherSummary = {
  /** Rain over the past 7 / 14 / 30 days (mm). */
  rain7: number
  rain14: number
  rain30: number
  soilMoisture: number
  soilTemp: number
  /** Fruiting index 0–1 for today's date. */
  index: number
}

/* ---------- Scoring ---------- */

export type ScorePart = {
  name: string
  value: number
  weight: number
  reason: string
  /**
   * `weight` — included in the weighted mean for the terrain.
   * `factor` — multiplies the whole score instead, for things that set the
   * ceiling rather than the nuance (land type, known finds).
   */
  kind?: 'weight' | 'factor'
}

export type Assessment = {
  /** Final chance 0–100. */
  score: number
  habitat: number
  fruiting: number
  season: number
  parts: ScorePart[]
  /** Short explanation in Swedish, shown in the UI. */
  summary: string
}

/** One cell in the habitat scan. */
export type ScanCell = {
  lat: number
  lon: number
  score: number
  habitat: HabitatSample
  /** Number of known finds (GBIF + your own) supporting the cell. */
  support: number
}
