import { nativeImage } from 'electron'

export function trayIcon() {
  const w = 16
  const h = 16
  const buf = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      const inner = x > 3 && x < 12 && y > 3 && y < 12
      if (edge || inner) {
        buf[i] = 0x3a
        buf[i + 1] = 0x1e
        buf[i + 2] = 0xc4
        buf[i + 3] = 255
      } else {
        buf[i] = 0x1a
        buf[i + 1] = 0x1a
        buf[i + 2] = 0x1a
        buf[i + 3] = 255
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: w, height: h })
}
