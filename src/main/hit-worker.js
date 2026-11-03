import koffi from 'koffi'
const error = (message, err) => console.error(message, err || '')
let displays = []

const user32 = koffi.load('user32.dll')
const ole32 = koffi.load('ole32.dll')
const oleaut = koffi.load('oleaut32.dll')
const dwm = koffi.load('dwmapi.dll')

const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *p, uint32 mode)')
const CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(void *clsid, void *outer, uint32 ctx, void *iid, _Out_ void **ppv)')
const VariantClear = oleaut.func('long __stdcall VariantClear(void *v)')
const SysStringLen = oleaut.func('uint32 __stdcall SysStringLen(void *bstr)')
const GetWindowLongPtrW = user32.func('intptr __stdcall GetWindowLongPtrW(void *hwnd, int index)')
const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void *hwnd)')
const GetWindowRect = user32.func('int __stdcall GetWindowRect(void *hwnd, void *rc)')
const GetAncestor = user32.func('void * __stdcall GetAncestor(void *hwnd, uint ga)')
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *hwnd, void *buf, int max)')
const EnumWindows = user32.func('int __stdcall EnumWindows(void *cb, intptr lp)')
const DwmGetWindowAttribute = dwm.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint attr, void *pv, uint cb)')

const ReleaseP = koffi.proto('uint32 __stdcall RsRelease(void *self)')
const GetPropP = koffi.proto('long __stdcall RsGetProp(void *self, int32 id, void *v)')
const FromHandleP = koffi.proto('long __stdcall RsFromHandle(void *self, void *hwnd, _Out_ void **el)')
const WalkerP = koffi.proto('long __stdcall RsWalker(void *self, _Out_ void **w)')
const ParentP = koffi.proto('long __stdcall RsParent(void *self, void *el, _Out_ void **parent)')
const EnumP = koffi.proto('int __stdcall RsEnum(void *hwnd, intptr lp)')

const GWL_EXSTYLE = -20
const WS_EX_TRANSPARENT = 0x20
const WS_EX_LAYERED = 0x00080000
const GA_ROOT = 2
const DWM_BOUNDS = 9
const DWM_CLOAKED = 14
const NAME_ID = 30005
const RECT_ID = 30001
const HWND_ID = 30020

function guid(s) {
  const hex = s.replace(/[{}-]/g, '')
  const b = Buffer.alloc(16)
  b.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0)
  b.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4)
  b.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6)
  b.write(hex.slice(16), 8, 'hex')
  return b
}

function com(obj, index, proto, args) {
  const vt = koffi.decode(obj, 'void *')
  const fn = koffi.decode(vt, 'void *', index + 1)[index]
  return koffi.call(fn, proto, obj, ...args)
}

function release(obj) {
  if (obj) com(obj, 2, ReleaseP, [])
}

let uia = null
let walker = null
let uiaOff = false

function ensureUia() {
  if (uia && walker) return true
  if (uiaOff) return false
  try {
    const hr0 = CoInitializeEx(null, 2)
    if (hr0 < 0 && (hr0 >>> 0) !== 0x80010106) error('CoInitializeEx ' + (hr0 >>> 0).toString(16))
    const pp = [null]
    const hr = CoCreateInstance(
      guid('FF48DBA4-60EF-4201-AA87-54103EEF594E'),
      null,
      1,
      guid('30CBE57D-D9D0-452A-AB13-7AC5AC4825EE'),
      pp
    )
    if (hr < 0 || !pp[0]) {
      uiaOff = true
      error('uia ' + (hr >>> 0).toString(16))
      return false
    }
    uia = pp[0]
    const w = [null]
    if (com(uia, 14, WalkerP, [w]) < 0 || !w[0]) {
      uiaOff = true
      error('uia walker')
      return false
    }
    walker = w[0]
    return true
  } catch (e) {
    uiaOff = true
    error('uia', e)
    return false
  }
}

function hwndFromInt(n) {
  if (!n) return null
  const b = Buffer.alloc(8)
  b.writeInt32LE(n | 0, 0)
  if ((n | 0) < 0) b.writeInt32LE(-1, 4)
  return koffi.decode(b, 'void *')
}

function clipName(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > 32 ? t.slice(0, 31) + '...' : t
}

function readName(el) {
  const v = Buffer.alloc(24)
  try {
    if (com(el, 10, GetPropP, [NAME_ID, v]) < 0 || v.readUInt16LE(0) !== 8) return ''
    const bstr = koffi.decode(v.subarray(8), 'void *')
    if (!bstr) return ''
    const n = SysStringLen(bstr)
    if (!n) return ''
    return clipName(String.fromCharCode(...koffi.decode(bstr, 'uint16', Math.min(n, 64))))
  } finally {
    VariantClear(v)
  }
}

function readRect(el) {
  const v = Buffer.alloc(24)
  try {
    const hr = com(el, 10, GetPropP, [RECT_ID, v])
    if (hr < 0 || (v.readUInt16LE(0) & 0xfff) !== 5) return null
    const psa = koffi.decode(v.subarray(8), 'void *')
    if (!psa) return null
    const sa = Buffer.from(koffi.decode(psa, 'uint8', 32))
    const data = koffi.decode(sa.subarray(16), 'void *')
    if (!data) return null
    const n = koffi.decode(data, 'double', 4)
    const left = Number(n[0])
    const top = Number(n[1])
    const w = Number(n[2])
    const h = Number(n[3])
    if (![left, top, w, h].every(Number.isFinite) || w < 1 || h < 1) return null
    return { left, top, w, h }
  } finally {
    VariantClear(v)
  }
}

function readHwnd(el) {
  const v = Buffer.alloc(24)
  try {
    const hr = com(el, 10, GetPropP, [HWND_ID, v])
    const vt = v.readUInt16LE(0)
    if (hr < 0 || (vt !== 3 && vt !== 19 && vt !== 22)) return null
    return hwndFromInt(v.readInt32LE(8))
  } finally {
    VariantClear(v)
  }
}

function coversDisplay(rect) {
  return displays.some((d) => rect.left <= d.left + 8 && rect.top <= d.top + 8 &&
    rect.left + rect.w >= d.left + d.w - 8 && rect.top + rect.h >= d.top + d.h - 8)
}

function hiddenOverlay(hwnd) {
  const ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE))
  if (ex & WS_EX_TRANSPARENT) return true
  if (!((ex & 0x08000000) && (ex & WS_EX_LAYERED))) return false
  const rect = winRect(hwnd)
  return !!rect && coversDisplay(rect)
}

function isTopLevel(hwnd) {
  const r = GetAncestor(hwnd, GA_ROOT)
  return !!r && koffi.address(r) === koffi.address(hwnd)
}

function dwmRect(hwnd) {
  const rc = Buffer.alloc(16)
  if (DwmGetWindowAttribute(hwnd, DWM_BOUNDS, rc, 16) < 0) return null
  const left = rc.readInt32LE(0)
  const top = rc.readInt32LE(4)
  const right = rc.readInt32LE(8)
  const bottom = rc.readInt32LE(12)
  if (right - left < 1 || bottom - top < 1) return null
  return { left, top, w: right - left, h: bottom - top }
}

function winRect(hwnd) {
  const d = dwmRect(hwnd)
  if (d) return d
  const rc = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rc)) return null
  const left = rc.readInt32LE(0)
  const top = rc.readInt32LE(4)
  const right = rc.readInt32LE(8)
  const bottom = rc.readInt32LE(12)
  if (right - left < 1 || bottom - top < 1) return null
  return { left, top, w: right - left, h: bottom - top }
}

function titleOf(hwnd) {
  const buf = Buffer.alloc(256)
  const n = GetWindowTextW(hwnd, buf, 128)
  return n > 0 ? clipName(buf.toString('utf16le', 0, n * 2)) : ''
}

function near(a, b) {
  return Math.abs(a.left - b.left) <= 2 && Math.abs(a.top - b.top) <= 2 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2
}

function chainAt(hwnd, px, py) {
  const out = [null]
  if (com(uia, 6, FromHandleP, [hwnd, out]) < 0 || !out[0]) return []
  const items = []
  let el = out[0]
  let budget = 120
  try {
    for (let depth = 0; depth < 14 && el; depth++) {
      const rect = readRect(el)
      const h = readHwnd(el)
      const box = h && isTopLevel(h) ? dwmRect(h) || rect : rect
      if (box && hitPhys(box, px, py)) {
        const item = { ...box, name: readName(el) }
        if (!items.some((it) => near(it, item))) items.unshift(item)
      }
      const first = [null]
      com(walker, 4, ParentP, [el, first])
      let child = first[0]
      let found = null
      try {
        while (child && budget-- > 0) {
          const rc = readRect(child)
          if (rc && hitPhys(rc, px, py)) {
            found = child
            child = null
            break
          }
          const next = [null]
          com(walker, 6, ParentP, [child, next])
          release(child)
          child = next[0]
        }
      } finally {
        release(child)
      }
      release(el)
      el = found
    }
  } finally {
    release(el)
  }
  return items
}

function hitPhys(rect, px, py) {
  return px >= rect.left && py >= rect.top && px < rect.left + rect.w && py < rect.top + rect.h
}

let scan = null
const onEnum = koffi.register((hwnd) => {
  const s = scan
  if (!s || s.done) return 1
  try {
    if (s.ours.has(koffi.address(hwnd)) || !IsWindowVisible(hwnd)) return 1
    if (hiddenOverlay(hwnd)) return 1
    const cloak = Buffer.alloc(4)
    if (DwmGetWindowAttribute(hwnd, DWM_CLOAKED, cloak, 4) >= 0 && cloak.readInt32LE(0)) return 1
    const rect = winRect(hwnd)
    if (!rect || !hitPhys(rect, s.px, s.py)) return 1
    s.box = { ...rect, name: titleOf(hwnd) }
    s.hwnd = hwnd
    s.done = true
    return 0
  } catch {
    return 1
  }
}, koffi.pointer(EnumP))

function enumAt(ours, px, py) {
  const st = { ours, px, py, box: null, done: false }
  scan = st
  try {
    EnumWindows(onEnum, 0)
  } finally {
    scan = null
  }
  return st
}

process.parentPort.on('message', ({ data }) => {
  try {
    displays = data.displays
    const ours = new Set(data.ours.map(BigInt))
    const top = enumAt(ours, data.x, data.y)
    let items = []
    try {
      if (top.hwnd && ensureUia()) items = chainAt(top.hwnd, data.x, data.y)
    } catch (e) {
      error('uia hit', e)
    }
    if (!items.length && top.box) items = [top.box]
    process.parentPort.postMessage({ items })
  } catch (e) {
    error('hit worker', e)
    process.parentPort.postMessage({ items: [] })
  }
})
