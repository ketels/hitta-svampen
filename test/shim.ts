/** Makes the terrain-tile decoding runnable in Node by imitating the
 *  browser's createImageBitmap and OffscreenCanvas. Used only by the tests. */
import { PNG } from 'pngjs'

type Bitmap = { data: Uint8ClampedArray; width: number; height: number; close(): void }

;(globalThis as any).createImageBitmap = async (blob: Blob): Promise<Bitmap> => {
  const png = PNG.sync.read(Buffer.from(await blob.arrayBuffer()))
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    close() {},
  }
}

;(globalThis as any).OffscreenCanvas = class {
  width: number
  height: number
  private current: Uint8ClampedArray | null = null
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
  }
  getContext() {
    const self = this
    return {
      clearRect() {},
      drawImage(b: Bitmap) {
        self.current = b.data
      },
      getImageData() {
        return { data: self.current ?? new Uint8ClampedArray(self.width * self.height * 4) }
      },
    }
  }
}
