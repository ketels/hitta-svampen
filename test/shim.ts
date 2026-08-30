/** Gör terrängkakel-avkodningen körbar i Node genom att härma webbläsarens
 *  createImageBitmap och OffscreenCanvas. Används bara av testerna. */
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
  private aktuell: Uint8ClampedArray | null = null
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
  }
  getContext() {
    const self = this
    return {
      clearRect() {},
      drawImage(b: Bitmap) {
        self.aktuell = b.data
      },
      getImageData() {
        return { data: self.aktuell ?? new Uint8ClampedArray(self.width * self.height * 4) }
      },
    }
  }
}
