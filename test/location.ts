/**
 * The place the tests scan. Everything that needs real terrain, land cover or
 * weather points here, so that one edit moves the whole suite to another
 * forest — and so that reported numbers are comparable between tests.
 */
export const CENTER = { lat: 57.571917, lon: 12.141222 }

/** A bounding box around {@link CENTER}, given half-extents in degrees. */
export const boxAround = (halfLat: number, halfLon: number) => ({
  south: CENTER.lat - halfLat,
  north: CENTER.lat + halfLat,
  west: CENTER.lon - halfLon,
  east: CENTER.lon + halfLon,
})
