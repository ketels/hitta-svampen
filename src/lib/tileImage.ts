/**
 * Reads the pixels out of a tile image.
 *
 * Both the elevation tiles and the land cover tiles arrive as PNGs whose
 * colours are data rather than pictures. Decoding goes through a canvas, which
 * is the only way a browser will hand over raw pixels. The canvas is kept and
 * reused per size — creating one per tile is slow on a phone.
 */

type Surface = {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}

const surfaces = new Map<number, Surface>()

function surface(size: number): Surface {
  const existing = surfaces.get(size)
  if (existing) return existing
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      const s = { canvas, ctx }
      surfaces.set(size, s)
      return s
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Kan inte skapa rityta för kakel')
  const s = { canvas, ctx }
  surfaces.set(size, s)
  return s
}

/** RGBA bytes of a square tile image, `size × size × 4` of them. */
export async function tilePixels(blob: Blob, size: number): Promise<Uint8ClampedArray> {
  const image = await createImageBitmap(blob)
  const { ctx } = surface(size)
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(image, 0, 0, size, size)
  image.close?.()
  return ctx.getImageData(0, 0, size, size).data
}
