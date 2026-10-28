import { screen } from 'electron'
import { error } from './log'
import koffi from 'koffi'

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')

const SetCursorPos = user32.func('int __stdcall SetCursorPos(int, int)')
const GetDC = user32.func('void* __stdcall GetDC(void*)')
const ReleaseDC = user32.func('int __stdcall ReleaseDC(void*, void*)')
const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
const GetWindowRect = user32.func('int __stdcall GetWindowRect(void*, void*)')
const CreateCompatibleDC = gdi32.func('void* __stdcall CreateCompatibleDC(void*)')
const CreateCompatibleBitmap = gdi32.func('void* __stdcall CreateCompatibleBitmap(void*, int, int)')
const SelectObject = gdi32.func('void* __stdcall SelectObject(void*, void*)')
const BitBlt = gdi32.func('int __stdcall BitBlt(void*, int, int, int, int, void*, int, int, uint)')
const DeleteDC = gdi32.func('int __stdcall DeleteDC(void*)')
const DeleteObject = gdi32.func('int __stdcall DeleteObject(void*)')
const GetDIBits = gdi32.func('int __stdcall GetDIBits(void*, void*, uint, uint, void*, void*, uint)')
const GetCursorInfo = user32.func('int __stdcall GetCursorInfo(void*)')
const GetIconInfo = user32.func('int __stdcall GetIconInfo(void*, void*)')
const DrawIconEx = user32.func('int __stdcall DrawIconEx(void*, int, int, void*, int, int, uint, void*, uint)')

const SRCCOPY = 0x00cc0020
const CURSOR_SHOWING = 1
const DI_NORMAL = 3

function stampCursor(mem, capX, capY) {
  try {
    const ci = Buffer.alloc(24)
    ci.writeUInt32LE(24, 0)
    if (!GetCursorInfo(ci)) return
    if (!(ci.readUInt32LE(4) & CURSOR_SHOWING)) return
    const hCursor = ci.readBigUInt64LE(8)
    if (!hCursor) return
    const cx = ci.readInt32LE(16)
    const cy = ci.readInt32LE(20)
    const ii = Buffer.alloc(32)
    let hx = 0
    let hy = 0
    if (GetIconInfo(hCursor, ii)) {
      hx = ii.readUInt32LE(4)
      hy = ii.readUInt32LE(8)
      const mask = ii.readBigUInt64LE(16)
      const color = ii.readBigUInt64LE(24)
      if (mask) DeleteObject(mask)
      if (color) DeleteObject(color)
    }
    DrawIconEx(mem, cx - hx - capX, cy - hy - capY, hCursor, 0, 0, 0, null, DI_NORMAL)
  } catch (e) {
    error('stampCursor', e)
  }
}

function hit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ay < by + bh && ax + aw > bx && ay + ah > by
}

function capturePhysical(x, y, w, h, withCursor) {
  if (w < 1 || h < 1) {
    error(`capturePhysical bad size ${w}x${h} at ${x},${y}`)
    return null
  }
  try {
    const hdc = GetDC(null)
    if (!hdc) throw new Error('GetDC failed')
    const mem = CreateCompatibleDC(hdc)
    const bmp = CreateCompatibleBitmap(hdc, w, h)
    const old = SelectObject(mem, bmp)
    const ok = BitBlt(mem, 0, 0, w, h, hdc, x, y, SRCCOPY)
    if (!ok) error(`BitBlt failed ${x},${y} ${w}x${h}`)
    if (withCursor) stampCursor(mem, x, y)

    const bmi = Buffer.alloc(44)
    bmi.writeUInt32LE(40, 0)
    bmi.writeInt32LE(w, 4)
    bmi.writeInt32LE(-h, 8)
    bmi.writeUInt16LE(1, 12)
    bmi.writeUInt16LE(32, 14)

    const pixels = Buffer.alloc(w * h * 4)
    const n = GetDIBits(mem, bmp, 0, h, pixels, bmi, 0)
    if (!n) error(`GetDIBits returned ${n} for ${w}x${h}`)
    for (let i = 0; i < pixels.length; i += 4) {
      const b = pixels[i]
      pixels[i] = pixels[i + 2]
      pixels[i + 2] = b
      pixels[i + 3] = 255
    }

    SelectObject(mem, old)
    DeleteObject(bmp)
    DeleteDC(mem)
    ReleaseDC(null, hdc)

    return { pixels: new Uint8Array(pixels), w, h }
  } catch (e) {
    error(`capturePhysical ${x},${y} ${w}x${h}`, e)
    return null
  }
}

function dipToPhys(rect) {
  const a = screen.dipToScreenPoint({ x: rect.x, y: rect.y })
  const b = screen.dipToScreenPoint({ x: rect.x + rect.width, y: rect.y + rect.height })
  return { x: a.x, y: a.y, width: Math.max(1, b.x - a.x), height: Math.max(1, b.y - a.y) }
}

export function virtualDip() {
  const ds = screen.getAllDisplays()
  let x = Infinity
  let y = Infinity
  let r = -Infinity
  let b = -Infinity
  for (const d of ds) {
    x = Math.min(x, d.bounds.x)
    y = Math.min(y, d.bounds.y)
    r = Math.max(r, d.bounds.x + d.bounds.width)
    b = Math.max(b, d.bounds.y + d.bounds.height)
  }
  return { x, y, width: r - x, height: b - y }
}

export function setCursorDip(x, y) {
  try {
    const s = screen.dipToScreenPoint({ x: Math.round(x), y: Math.round(y) })
    SetCursorPos(s.x, s.y)
  } catch (e) {
    error('setCursorDip', e)
  }
}

export function cursorDisplay() {
  const p = screen.getCursorScreenPoint()
  return (
    screen.getAllDisplays().find((d) => {
      const b = d.bounds
      return p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height
    }) || screen.getPrimaryDisplay()
  )
}

export function dipOnVirt(bounds, virt) {
  return { x: bounds.x - virt.x, y: bounds.y - virt.y, w: bounds.width, h: bounds.height }
}

export function overlayBounds(virt, shots) {
  let x = Infinity
  let y = Infinity
  let r = -Infinity
  let b = -Infinity
  for (const s of shots) {
    x = Math.min(x, virt.x + s.x)
    y = Math.min(y, virt.y + s.y)
    r = Math.max(r, virt.x + s.x + s.w)
    b = Math.max(b, virt.y + s.y + s.h)
  }
  if (!Number.isFinite(x)) return virt
  return { x, y, width: r - x, height: b - y }
}

export function toOverlay(virt, ov, shots, selection) {
  const dx = ov.x - virt.x
  const dy = ov.y - virt.y
  if (!dx && !dy) return { virt: ov, shots, selection }
  return {
    virt: ov,
    shots: shots.map((s) => ({ ...s, x: s.x - dx, y: s.y - dy })),
    selection: selection ? { ...selection, x: selection.x - dx, y: selection.y - dy } : null
  }
}

export function captureDesktop(clip, withCursor) {
  try {
    const virt = virtualDip()
    let displays = screen.getAllDisplays()
    if (!displays.length) error('no displays')
    if (clip) {
      displays = displays.filter((d) =>
        hit(d.bounds.x - virt.x, d.bounds.y - virt.y, d.bounds.width, d.bounds.height, clip.x, clip.y, clip.w, clip.h)
      )
      if (!displays.length) displays = screen.getAllDisplays()
    }
    const shots = displays
      .map((d) => {
        const p = dipToPhys(d.bounds)
        const raw = capturePhysical(p.x, p.y, p.width, p.height, withCursor)
        if (!raw) {
          error(`shot failed display ${d.id} ${JSON.stringify(d.bounds)} phys ${JSON.stringify(p)}`)
          return null
        }
        return {
          x: d.bounds.x - virt.x,
          y: d.bounds.y - virt.y,
          w: d.bounds.width,
          h: d.bounds.height,
          pw: raw.w,
          ph: raw.h,
          scale: d.scaleFactor,
          pixels: raw.pixels
        }
      })
      .filter(Boolean)
    return { virt, shots }
  } catch (e) {
    error('captureDesktop', e)
    return { virt: { x: 0, y: 0, width: 0, height: 0 }, shots: [] }
  }
}

export function foregroundDip() {
  const hwnd = GetForegroundWindow()
  if (!hwnd) {
    error('GetForegroundWindow empty')
    return null
  }
  const rc = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rc)) {
    error('GetWindowRect failed')
    return null
  }
  const left = rc.readInt32LE(0)
  const top = rc.readInt32LE(4)
  const right = rc.readInt32LE(8)
  const bottom = rc.readInt32LE(12)
  const tl = screen.screenToDipPoint({ x: left, y: top })
  const br = screen.screenToDipPoint({ x: right, y: bottom })
  const virt = virtualDip()
  const x = Math.max(virt.x, Math.min(tl.x, br.x))
  const y = Math.max(virt.y, Math.min(tl.y, br.y))
  const r = Math.min(virt.x + virt.width, Math.max(tl.x, br.x))
  const b = Math.min(virt.y + virt.height, Math.max(tl.y, br.y))
  return { x: x - virt.x, y: y - virt.y, w: Math.max(1, r - x), h: Math.max(1, b - y) }
}
