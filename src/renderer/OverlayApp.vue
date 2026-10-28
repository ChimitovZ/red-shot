<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Redo2, Square, Undo2 } from '@lucide/vue'
import RingMenu from './RingMenu.vue'
import { ACTIONS, arrowFromBox, COLORS, cursorName, measureTextW, replay, showPreview, strokeLast, textBg, textBox, textHandle, TOOLS, WIDTHS } from './draw'
import { logErr } from './log'

const SNAP = 28
const MAG = 12
const MAG_SRC = 17
const MAG_PX = MAG * MAG_SRC
const GEO = new Set(['arrow', 'rect', 'blur'])
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const EDGE = 7
const MIN_SEL = 8
let lastFont = 18

let shots = []
const sel = reactive({ x: 0, y: 0, w: 0, h: 0, on: false })
const drag = reactive({ on: false, x: 0, y: 0 })
const fr = reactive({ op: '', h: '', ax: 0, ay: 0, x: 0, y: 0, w: 0, h0: 0 })
const tool = ref('pencil')
const drawReady = ref(false)
const color = ref(COLORS[0])
const width = ref(4)
const items = []
const redo = []
const preview = ref(null)
const ring = reactive({ show: false, x: 0, y: 0, hx: 0, hy: 0, flash: '' })
let ringLmb = false
const texting = reactive({ on: false, edit: -1, x: 0, y: 0, val: '', fontSize: 18, bg: false, outline: false, b: null, drag: '' })
const tOff = { x: 0, y: 0 }
const vw = ref(1)
const vh = ref(1)
const view = ref(null)
const loupeEl = ref(null)
const ringRef = ref(null)
const hint = ref('Выделите область · стрелки — точно')
const aim = reactive({ x: 0, y: 0, on: false })
const spaceHeld = ref(false)
let actx

let base = null
let overlayC = null
let drawing = false

function liveItems() {
  return texting.on && texting.edit >= 0 ? items.filter((_, i) => i !== texting.edit) : items
}

function paint() {
  const c = view.value
  if (!c || !base || !overlayC) return
  try {
    replay(c, base, overlayC, liveItems(), preview.value)
  } catch (e) {
    logErr('paint', e)
  }
}

function sizeLayer(c, w, h) {
  c.width = w
  c.height = h
  c._g2 = null
}

function rgba(s) {
  const p = s.pixels
  const n = s.pw * s.ph * 4
  if (p instanceof Uint8ClampedArray && p.length === n) return p
  if (p?.buffer && p.byteLength >= n) return new Uint8ClampedArray(p.buffer, p.byteOffset, n)
  const u = new Uint8ClampedArray(n)
  u.set(p?.data || p)
  return u
}

let stamp
function stampShot(s) {
  if (!stamp) stamp = document.createElement('canvas')
  stamp.width = s.pw
  stamp.height = s.ph
  stamp.getContext('2d').putImageData(new ImageData(rgba(s), s.pw, s.ph), 0, 0)
  return stamp
}

function blank(id) {
  shots = []
  items.length = 0
  redo.length = 0
  preview.value = null
  drawing = false
  drag.on = false
  fr.op = ''
  texting.on = false
  texting.edit = -1
  texting.drag = ''
  ring.show = false
  aim.on = false
  drawReady.value = false
  Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
  base = null
  overlayC = null
  const c = view.value
  if (c) {
    c.width = 1
    c.height = 1
  }
  nextTick(() => window.redshot.blanked(id))
}

function makeBase() {
  try {
    base = document.createElement('canvas')
    overlayC = document.createElement('canvas')
    sizeLayer(base, vw.value, vh.value)
    sizeLayer(overlayC, vw.value, vh.value)
    const ctx = base.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, base.width, base.height)
    shots.forEach((s, i) => {
      try {
        ctx.drawImage(stampShot(s), s.x, s.y, s.w, s.h)
      } catch (e) {
        logErr(`shot ${i} ${s.pw}x${s.ph}`, e)
      }
    })
    if (view.value) sizeLayer(view.value, vw.value, vh.value)
    paint()
    paintLoupe()
  } catch (e) {
    logErr('makeBase', e)
  }
}

function applyStart(data) {
  try {
    items.length = 0
    redo.length = 0
    preview.value = null
    texting.on = false
    texting.edit = -1
    drawing = false
    drag.on = false
    fr.op = ''
    texting.drag = ''
    ring.show = false
    aim.on = false
    shutter()
    vw.value = data.virt.width
    vh.value = data.virt.height
    shots = data.shots || []
    drawReady.value = !!data.selection
    if (data.selection) {
      Object.assign(sel, { ...data.selection, on: true })
    } else {
      Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
    }
    syncHint()
    nextTick(() => {
      makeBase()
      const done = () => requestAnimationFrame(() => window.redshot.painted())
      ringRef.value?.warm ? ringRef.value.warm(done) : done()
    })
  } catch (e) {
    logErr('applyStart', e)
    window.redshot.painted()
  }
}

function geoOn() {
  return GEO.has(tool.value)
}

function cropOn() {
  return tool.value === 'crop'
}

function selecting() {
  return cropOn() || (!sel.on && !drawReady.value)
}

function syncHint() {
  if (sel.on) hint.value = 'ПКМ — меню · Ctrl+Z — отмена · Enter — копировать · Esc — выход'
  else if (drawReady.value && !cropOn()) hint.value = 'Рисуйте · «Область» в меню — выделить'
  else hint.value = 'Выделите область · ПКМ — рисовать · стрелки — точно'
}

function clampAim() {
  aim.x = Math.max(0, Math.min(vw.value - 1, Math.round(aim.x)))
  aim.y = Math.max(0, Math.min(vh.value - 1, Math.round(aim.y)))
}

function setAim(x, y) {
  aim.x = x
  aim.y = y
  aim.on = true
  clampAim()
}

function shutter() {
  try {
    actx = actx || new AudioContext()
    if (actx.state === 'suspended') actx.resume()
    const t0 = actx.currentTime
    const o = actx.createOscillator()
    const g = actx.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(2200, t0)
    o.frequency.exponentialRampToValueAtTime(420, t0 + 0.045)
    g.gain.setValueAtTime(0.1, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08)
    o.connect(g)
    g.connect(actx.destination)
    o.start(t0)
    o.stop(t0 + 0.09)
  } catch {}
}

function boxFrom(ax, ay, bx, by, square) {
  let dx = bx - ax
  let dy = by - ay
  if (square) {
    const s = Math.max(Math.abs(dx), Math.abs(dy))
    dx = dx < 0 ? -s : s
    dy = dy < 0 ? -s : s
  }
  let x = Math.min(ax, ax + dx)
  let y = Math.min(ay, ay + dy)
  let w = Math.abs(dx)
  let h = Math.abs(dy)
  if (x < 0) {
    w += x
    x = 0
  }
  if (y < 0) {
    h += y
    y = 0
  }
  Object.assign(sel, {
    x,
    y,
    w: Math.max(0, Math.min(w, vw.value - x)),
    h: Math.max(0, Math.min(h, vh.value - y))
  })
}

function clampSel() {
  sel.w = Math.max(MIN_SEL, Math.min(sel.w, vw.value))
  sel.h = Math.max(MIN_SEL, Math.min(sel.h, vh.value))
  sel.x = Math.max(0, Math.min(sel.x, vw.value - sel.w))
  sel.y = Math.max(0, Math.min(sel.y, vh.value - sel.h))
}

function hitFrame(x, y) {
  if (!sel.on) return ''
  const { x: sx, y: sy, w, h } = sel
  const r = sx + w
  const b = sy + h
  if (x < sx - EDGE || x > r + EDGE || y < sy - EDGE || y > b + EDGE) return ''
  const L = Math.abs(x - sx) <= EDGE
  const R = Math.abs(x - r) <= EDGE
  const T = Math.abs(y - sy) <= EDGE
  const B = Math.abs(y - b) <= EDGE
  if (T && L) return 'nw'
  if (T && R) return 'ne'
  if (B && L) return 'sw'
  if (B && R) return 'se'
  if (T) return 'n'
  if (B) return 's'
  if (L) return 'w'
  if (R) return 'e'
  return ''
}

function applyPan(x, y) {
  sel.x = x - fr.ax
  sel.y = y - fr.ay
  sel.w = fr.w
  sel.h = fr.h0
  clampSel()
}

function applyResize(px, py, square) {
  let L = fr.x
  let T = fr.y
  let R = fr.x + fr.w
  let B = fr.y + fr.h0
  const h = fr.h
  if (h.includes('w')) L = px
  if (h.includes('e')) R = px
  if (h.includes('n')) T = py
  if (h.includes('s')) B = py
  if (square) {
    const s = Math.max(Math.abs(R - L), Math.abs(B - T), MIN_SEL)
    if (h === 'n' || h === 's') {
      const cx = fr.x + fr.w / 2
      L = cx - s / 2
      R = cx + s / 2
    } else if (h.includes('e')) R = L + (R >= L ? s : -s)
    else if (h.includes('w')) L = R - (R >= L ? s : -s)
    if (h === 'e' || h === 'w') {
      const cy = fr.y + fr.h0 / 2
      T = cy - s / 2
      B = cy + s / 2
    } else if (h.includes('s')) B = T + (B >= T ? s : -s)
    else if (h.includes('n')) T = B - (B >= T ? s : -s)
  }
  Object.assign(sel, {
    x: Math.min(L, R),
    y: Math.min(T, B),
    w: Math.abs(R - L),
    h: Math.abs(B - T),
    on: true
  })
  clampSel()
}

function startResize(handle, x, y) {
  fr.op = 'resize'
  fr.h = handle
  fr.x = sel.x
  fr.y = sel.y
  fr.w = sel.w
  fr.h0 = sel.h
  setAim(x, y)
}

function onHandleDown(h, e) {
  if (e.button !== 0 || ring.show) return
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {}
  if (spaceHeld.value) {
    setAim(e.clientX, e.clientY)
    fr.op = 'pan'
    fr.ax = aim.x - sel.x
    fr.ay = aim.y - sel.y
    fr.w = sel.w
    fr.h0 = sel.h
    return
  }
  startResize(h, e.clientX, e.clientY)
}

function ortho(a, x, y) {
  return Math.abs(x - a.x) >= Math.abs(y - a.y) ? { x, y: a.y } : { x: a.x, y }
}

function paintLoupe() {
  if (!showGuides.value) return
  const c = loupeEl.value
  const src = view.value?.width ? view.value : base
  if (!c || !src) {
    if (!c) nextTick(paintLoupe)
    return
  }
  if (c.width !== MAG_PX) {
    c.width = MAG_PX
    c.height = MAG_PX
  }
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const half = (MAG_SRC - 1) / 2
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, MAG_PX, MAG_PX)
  ctx.drawImage(src, aim.x - half, aim.y - half, MAG_SRC, MAG_SRC, 0, 0, MAG_PX, MAG_PX)
  ctx.strokeStyle = 'rgba(255,255,255,.14)'
  ctx.lineWidth = 1
  for (let i = 1; i < MAG_SRC; i++) {
    const p = i * MAG + 0.5
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, MAG_PX)
    ctx.moveTo(0, p)
    ctx.lineTo(MAG_PX, p)
    ctx.stroke()
  }
  ctx.strokeStyle = '#ff2d78'
  ctx.strokeRect(half * MAG + 0.5, half * MAG + 0.5, MAG - 1, MAG - 1)
}

const loupePos = computed(() => {
  const gap = 16
  let x = aim.x + gap
  let y = aim.y + gap
  if (x + MAG_PX + 8 > vw.value) x = aim.x - gap - MAG_PX
  if (y + MAG_PX + 22 > vh.value) y = aim.y - gap - MAG_PX
  if (x < 8) x = 8
  if (y < 8) y = 8
  return { x, y }
})

const showGuides = computed(
  () => aim.on && !ring.show && !texting.on && (selecting() || geoOn() || fr.op === 'resize')
)
watch(showGuides, (v) => {
  if (v) nextTick(paintLoupe)
})

const cursorNow = computed(() => {
  if (ring.show) {
    const R = ringRef.value?.R || 228
    return Math.hypot(ring.hx - ring.x, ring.hy - ring.y) > R ? 'pointer' : 'none'
  }
  if (spaceHeld.value && sel.on) return fr.op === 'pan' ? 'grabbing' : 'grab'
  if (fr.op === 'resize') return 'none'
  return selecting() || (geoOn() && !texting.on) ? 'none' : cursorName(tool.value)
})

const aimLabel = computed(() => {
  const p = `${aim.x}, ${aim.y}`
  if (drag.on || fr.op) return `${p} · ${sel.w}×${sel.h}`
  const pr = preview.value
  if (pr?.a && pr?.b) return `${p} · ${Math.abs(pr.b.x - pr.a.x)}×${Math.abs(pr.b.y - pr.a.y)}`
  return p
})

function trackAim(e) {
  setAim(e.clientX, e.clientY)
}

function nudgeAim(e) {
  if (!aim.on) return false
  e.preventDefault()
  const step = e.shiftKey ? 10 : 1
  if (e.key === 'ArrowLeft') aim.x -= step
  if (e.key === 'ArrowRight') aim.x += step
  if (e.key === 'ArrowUp') aim.y -= step
  if (e.key === 'ArrowDown') aim.y += step
  clampAim()
  window.redshot.setCursor(aim.x, aim.y)
  if (drag.on) boxFrom(drag.x, drag.y, aim.x, aim.y, e.shiftKey)
  if (fr.op === 'resize') applyResize(aim.x, aim.y, e.shiftKey)
  if (fr.op === 'pan') applyPan(aim.x, aim.y)
  if (drawing) moveItem(aim.x, aim.y, e.shiftKey)
  paintLoupe()
  return true
}

function inSel(x, y) {
  return sel.on && x >= sel.x && y >= sel.y && x <= sel.x + sel.w && y <= sel.y + sel.h
}

const tLive = computed(() => ({
  a: { x: texting.x, y: texting.y },
  text: texting.val,
  fontSize: texting.fontSize,
  bg: texting.bg,
  outline: texting.outline,
  b: texting.b,
  color: color.value
}))
const tBox = computed(() => textBox(tLive.value))
const tDot = computed(() => texting.b || textHandle(tBox.value))
const tFrom = computed(() => (texting.b ? arrowFromBox(tBox.value, texting.b) : null))
const tinW = computed(() => measureTextW(texting.val, texting.fontSize) + 6)

function hitText(x, y) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (texting.on && i === texting.edit) continue
    const it = items[i]
    if (it.tool !== 'text') continue
    const b = textBox(it)
    const p = 8
    if (x >= b.x - p && y >= b.y - p && x <= b.x + b.w + p && y <= b.y + b.h + p) return i
    if (it.b && Math.hypot(x - it.b.x, y - it.b.y) < 14) return i
  }
  return -1
}

function openText(i) {
  const it = items[i]
  color.value = it.color
  Object.assign(texting, {
    on: true,
    edit: i,
    x: it.a.x,
    y: it.a.y,
    val: it.text || '',
    fontSize: it.fontSize || lastFont,
    bg: !!it.bg,
    outline: !!it.outline,
    b: it.b ? { x: it.b.x, y: it.b.y } : null,
    drag: ''
  })
  paint()
  nextTick(() => document.querySelector('.tin')?.select())
}

function commitText() {
  const fs = Math.min(96, Math.max(10, texting.fontSize | 0 || 18))
  const edit = texting.edit
  const row = {
    tool: 'text',
    color: color.value,
    fontSize: fs,
    a: { x: texting.x, y: texting.y },
    text: texting.val,
    bg: texting.bg,
    outline: texting.outline,
    b: texting.b
  }
  if (texting.val.trim()) {
    lastFont = fs
    if (edit >= 0 && items[edit]) Object.assign(items[edit], row)
    else {
      items.push(row)
      redo.length = 0
    }
  } else if (edit >= 0) {
    items.splice(edit, 1)
    redo.length = 0
  }
  texting.on = false
  texting.edit = -1
  texting.drag = ''
  paint()
}

function downMove(e) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {}
  texting.drag = 'text'
  tOff.x = e.clientX - texting.x
  tOff.y = e.clientY - texting.y
}

function downHandle(e) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {}
  texting.drag = 'handle'
  texting.b = { x: e.clientX, y: e.clientY }
}

function nextNum() {
  let m = 0
  for (const it of items) if (it.tool === 'number' && it.n > m) m = it.n
  return m + 1
}

function startItem(x, y) {
  const t = tool.value
  if (t === 'crop') return
  if (t === 'number') {
    items.push({ tool: 'number', color: color.value, width: width.value, a: { x, y }, n: nextNum() })
    redo.length = 0
    paint()
    return
  }
  if (t === 'text') {
    Object.assign(texting, {
      on: true,
      edit: -1,
      x,
      y,
      val: '',
      fontSize: lastFont,
      bg: false,
      outline: false,
      b: null,
      drag: ''
    })
    return
  }
  drawing = true
  if (t === 'pencil') {
    preview.value = { tool: t, color: color.value, width: width.value, pts: [{ x, y }] }
    return
  }
  preview.value = { tool: t, color: color.value, width: width.value, a: { x, y }, b: { x, y } }
  const c = view.value
  if (c && base && overlayC) showPreview(c, base, overlayC, preview.value)
}

function moveItem(x, y, shift) {
  const p = preview.value
  if (!p) return
  const c = view.value
  if (p.pts) {
    p.pts.push({ x, y })
    if (!c || !overlayC) return
    strokeLast(overlayC, c, p)
    return
  }
  p.b = shift && p.tool === 'arrow' ? ortho(p.a, x, y) : { x, y }
  if (c && base && overlayC) showPreview(c, base, overlayC, p)
}

function endItem() {
  if (preview.value) {
    items.push(preview.value)
    redo.length = 0
    preview.value = null
    paint()
  }
  drawing = false
}

function cancelItem() {
  preview.value = null
  drawing = false
  paint()
}

function undoLast() {
  if (!items.length) return
  redo.push(items.pop())
  paint()
}

function redoLast() {
  if (!redo.length) return
  items.push(redo.pop())
  paint()
}

function openRing(x, y) {
  const R = ringRef.value?.R || 228
  ring.x = Math.min(vw.value - R - 8, Math.max(R + 8, x))
  ring.y = Math.min(vh.value - R - 64, Math.max(R + 8, y))
  ring.hx = x
  ring.hy = y
  ring.show = true
  ring.flash = ''
  ringLmb = false
}

function applyRing() {
  const h = ringRef.value?.hitAt(ring.hx - ring.x, ring.hy - ring.y)
  if (!h) return
  if (h.kind === 'tool') {
    tool.value = TOOLS[h.i][0]
    if (!cropOn()) drawReady.value = true
    syncHint()
    ring.flash = tool.value
    setTimeout(() => {
      ring.flash = ''
    }, 160)
  }
  if (h.kind === 'color') color.value = COLORS[h.i]
  if (h.kind === 'width') width.value = WIDTHS[h.i]
  if (h.kind === 'action') {
    const id = ACTIONS[h.i][0]
    ring.show = false
    ringLmb = false
    if (id === 'save') saveOut()
    else if (id === 'copy') copyOut()
    else window.redshot.close()
  }
}

function pickRing() {
  applyRing()
  ring.show = false
  ringLmb = false
}

function tapRing(e) {
  ring.hx = e.clientX
  ring.hy = e.clientY
  applyRing()
}

function onMouseDown(e) {
  if (!ring.show || e.button !== 0) return
  ringLmb = true
  tapRing(e)
}

function onDown(e) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {}
  if (e.button === 2) {
    cancelItem()
    openRing(e.clientX, e.clientY)
    return
  }
  if (ring.show) {
    if (e.button === 0) {
      ringLmb = true
      tapRing(e)
    }
    return
  }
  if (e.button !== 0) return
  if (texting.on) {
    commitText()
    const n = hitText(e.clientX, e.clientY)
    if (n >= 0) openText(n)
    return
  }
  if (sel.on && spaceHeld.value) {
    setAim(aim.on ? aim.x : e.clientX, aim.on ? aim.y : e.clientY)
    fr.op = 'pan'
    fr.ax = aim.x - sel.x
    fr.ay = aim.y - sel.y
    fr.w = sel.w
    fr.h0 = sel.h
    return
  }
  {
    const hf = hitFrame(e.clientX, e.clientY)
    if (hf) {
      startResize(hf, e.clientX, e.clientY)
      return
    }
  }
  if (selecting()) {
    setAim(aim.on ? aim.x : e.clientX, aim.on ? aim.y : e.clientY)
    drag.on = true
    drag.x = aim.x
    drag.y = aim.y
    Object.assign(sel, { x: drag.x, y: drag.y, w: 0, h: 0, on: false })
    return
  }
  if (geoOn()) setAim(aim.on ? aim.x : e.clientX, aim.on ? aim.y : e.clientY)
  const x = geoOn() ? aim.x : e.clientX
  const y = geoOn() ? aim.y : e.clientY
  if (sel.on && !geoOn() && !inSel(x, y)) return
  const i = hitText(x, y)
  if (i >= 0) {
    openText(i)
    return
  }
  startItem(x, y)
}

function onMove(e) {
  if (ring.show) {
    ring.hx = e.clientX
    ring.hy = e.clientY
    const down = !!(e.buttons & 1)
    if (down && !ringLmb) applyRing()
    ringLmb = down
    return
  }
  if (fr.op === 'pan') {
    trackAim(e)
    applyPan(aim.x, aim.y)
    return
  }
  if (fr.op === 'resize') {
    trackAim(e)
    applyResize(aim.x, aim.y, e.shiftKey)
    paintLoupe()
    return
  }
  if (drag.on) {
    trackAim(e)
    boxFrom(drag.x, drag.y, aim.x, aim.y, e.shiftKey)
    paintLoupe()
    return
  }
  if (texting.drag === 'text') {
    texting.x = e.clientX - tOff.x
    texting.y = e.clientY - tOff.y
    return
  }
  if (texting.drag === 'handle') {
    texting.b = { x: e.clientX, y: e.clientY }
    return
  }
  if (selecting() || geoOn()) {
    trackAim(e)
    if (drawing) moveItem(aim.x, aim.y, e.shiftKey)
    paintLoupe()
    return
  }
  if (drawing) moveItem(e.clientX, e.clientY, e.shiftKey)
}

function onUp(e) {
  if (e.type === 'pointercancel') {
    ringLmb = false
    texting.drag = ''
    fr.op = ''
    if (drag.on) {
      drag.on = false
      if (!(sel.w > 3 && sel.h > 3)) Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
      else sel.on = true
      syncHint()
    }
    cancelItem()
    return
  }
  if (e.button === 0) ringLmb = false
  if (e.button === 2) {
    if (ring.show) pickRing()
    return
  }
  if (e.button !== 0 || ring.show) return
  if (fr.op) {
    fr.op = ''
    return
  }
  if (texting.drag) {
    if (texting.drag === 'handle' && texting.b) {
      const d = textHandle(tBox.value)
      if (Math.hypot(texting.b.x - d.x, texting.b.y - d.y) < SNAP) texting.b = null
    }
    texting.drag = ''
    return
  }
  if (drag.on) {
    drag.on = false
    if (sel.w > 3 && sel.h > 3) sel.on = true
    else Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
    syncHint()
    return
  }
  endItem()
}

async function exportPng() {
  try {
    if (!sel.on) return null
    const sc = Math.max(1, ...shots.map((s) => s.scale || 1))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(sel.w * sc))
    c.height = Math.max(1, Math.round(sel.h * sc))
    const ctx = c.getContext('2d')
    for (const s of shots) {
      const ix = Math.max(sel.x, s.x)
      const iy = Math.max(sel.y, s.y)
      const ir = Math.min(sel.x + sel.w, s.x + s.w)
      const ib = Math.min(sel.y + sel.h, s.y + s.h)
      if (ir <= ix || ib <= iy) continue
      const src = stampShot(s)
      const k = s.pw / s.w
      ctx.drawImage(
        src,
        (ix - s.x) * k,
        (iy - s.y) * k,
        (ir - ix) * k,
        (ib - iy) * k,
        (ix - sel.x) * sc,
        (iy - sel.y) * sc,
        (ir - ix) * sc,
        (ib - iy) * sc
      )
    }
    if (overlayC) ctx.drawImage(overlayC, sel.x, sel.y, sel.w, sel.h, 0, 0, c.width, c.height)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    if (!blob) {
      logErr('exportPng', new Error('toBlob null'))
      return null
    }
    return new Uint8Array(await blob.arrayBuffer())
  } catch (e) {
    logErr('exportPng', e)
    return null
  }
}

async function copyOut() {
  try {
    if (texting.on || !sel.on) return
    const buf = await exportPng()
    if (!buf) return
    await window.redshot.copy(buf)
  } catch (e) {
    logErr('copyOut', e)
  }
}

async function saveOut() {
  try {
    if (!sel.on) return
    const buf = await exportPng()
    if (buf) await window.redshot.save(buf)
  } catch (e) {
    logErr('saveOut', e)
  }
}

function onKeyUp(e) {
  if (e.code === 'Space') spaceHeld.value = false
}

function onKey(e) {
  if (e.code === 'Space' && !texting.on) {
    spaceHeld.value = true
    e.preventDefault()
  }
  if (texting.on) {
    if (e.key === 'Enter') {
      commitText()
      e.preventDefault()
    }
    if (e.key === 'Escape') {
      texting.on = false
      texting.edit = -1
      texting.drag = ''
      paint()
      e.preventDefault()
    }
    return
  }
  if (e.key.startsWith('Arrow') && (selecting() || geoOn() || fr.op || drag.on) && nudgeAim(e)) return
  if (e.key === 'Escape') {
    window.redshot.close()
    return
  }
  const ctrl = e.ctrlKey || e.metaKey
  if ((ctrl && e.code === 'KeyC') || e.key === 'Enter') {
    e.preventDefault()
    copyOut()
  }
  if (ctrl && e.code === 'KeyS') {
    e.preventDefault()
    saveOut()
  }
  if (ctrl && e.code === 'KeyZ') {
    e.preventDefault()
    e.shiftKey ? redoLast() : undoLast()
  }
  if (ctrl && e.code === 'KeyY') {
    e.preventDefault()
    redoLast()
  }
}

onMounted(() => {
  window.redshot.onStart(applyStart)
  window.redshot.onBlank(blank)
  window.redshot.onShown(() => ringRef.value?.warm())
  window.redshot.uiReady()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('contextmenu', (e) => e.preventDefault())
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('mousedown', onMouseDown, true)
})

const dimRects = computed(() => {
  if (!sel.on && !drag.on) {
    if (drawReady.value && !cropOn()) return []
    return [{ x: 0, y: 0, w: '100%', h: '100%' }]
  }
  const { x, y, w, h } = sel
  return [
    { x: 0, y: 0, w: '100%', h: y + 'px' },
    { x: 0, y: y + h, w: '100%', h: `calc(100% - ${y + h}px)` },
    { x: 0, y, w: x + 'px', h: h + 'px' },
    { x: x + w, y, w: `calc(100% - ${x + w}px)`, h: h + 'px' }
  ]
})
</script>

<template>
  <div
    class="root"
    :style="{ cursor: cursorNow }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <canvas ref="view" class="view" />
    <div v-for="(d, i) in dimRects" :key="i" class="dim" :style="{ left: d.x + 'px', top: d.y + 'px', width: d.w, height: d.h }" />
    <div
      v-if="sel.on || drag.on"
      class="frame"
      :style="{ left: sel.x + 'px', top: sel.y + 'px', width: sel.w + 'px', height: sel.h + 'px' }"
    >
      <i
        v-for="h in HANDLES"
        v-show="sel.on"
        :key="h"
        class="hnd"
        :class="h"
        @pointerdown.stop="onHandleDown(h, $event)"
      />
    </div>
    <template v-if="showGuides">
      <div class="rule-h" :style="{ top: aim.y + 'px' }" />
      <div class="rule-v" :style="{ left: aim.x + 'px' }" />
      <div class="aim-dot" :style="{ left: aim.x + 'px', top: aim.y + 'px' }" />
      <canvas
        ref="loupeEl"
        class="loupe"
        :style="{ left: loupePos.x + 'px', top: loupePos.y + 'px', width: MAG_PX + 'px', height: MAG_PX + 'px' }"
      />
      <div class="aim-xy" :style="{ left: loupePos.x + 'px', top: loupePos.y + MAG_PX + 4 + 'px' }">{{ aimLabel }}</div>
    </template>
    <template v-if="texting.on">
      <svg v-if="tFrom" class="tarr">
        <line :x1="tFrom.x" :y1="tFrom.y" :x2="tDot.x" :y2="tDot.y" :stroke="color" stroke-width="2" stroke-linecap="round" />
      </svg>
      <div
        class="twrap"
        :style="{
          left: tBox.x + 'px',
          top: tBox.y + 'px',
          padding: tBox.pad + 'px',
          background: texting.bg ? textBg(color) : 'transparent',
          boxShadow: texting.outline ? `0 0 0 1.5px ${color}` : 'none'
        }"
        @pointerdown.stop="downMove"
      >
        <span class="tgrip" />
        <input
          class="tin"
          v-model="texting.val"
          :style="{ color, fontSize: texting.fontSize + 'px', width: tinW + 'px' }"
          autofocus
          @pointerdown.stop
        />
      </div>
      <button
        type="button"
        class="tdot"
        :style="{ left: tDot.x + 'px', top: tDot.y + 'px' }"
        @pointerdown.stop="downHandle"
      />
      <div
        class="tbar"
        :style="{ left: tBox.x + tBox.w + 8 + 'px', top: tBox.y + 'px' }"
        @pointerdown.stop
      >
        <input class="tfs" type="number" min="10" max="96" v-model.number="texting.fontSize" />
        <button type="button" class="tb" :class="{ on: texting.bg }" title="Подложка" @click="texting.bg = !texting.bg">
          <span class="tfill" />
        </button>
        <button type="button" class="tb" :class="{ on: texting.outline }" title="Обводка" @click="texting.outline = !texting.outline">
          <Square :size="13" :stroke-width="2" />
        </button>
      </div>
    </template>
    <RingMenu
      ref="ringRef"
      :show="ring.show"
      :x="ring.x"
      :y="ring.y"
      :hx="ring.hx"
      :hy="ring.hy"
      :tool="tool"
      :color="color"
      :width="width"
      :flash="ring.flash"
    />
    <div v-if="(sel.on || drawReady) && !ring.show" class="hint">
      <button type="button" class="hb" title="Ctrl+Z" @pointerdown.stop @click="undoLast">
        <Undo2 :size="13" :stroke-width="2.2" />
      </button>
      <button type="button" class="hb" title="Ctrl+Y" @pointerdown.stop @click="redoLast">
        <Redo2 :size="13" :stroke-width="2.2" />
      </button>
      <span>{{ hint }}</span>
    </div>
    <div v-else-if="!ring.show" class="hint">{{ hint }}</div>
  </div>
</template>

<style>
html,
body {
  background: transparent;
}
</style>
<style scoped>
.root {
  position: fixed;
  inset: 0;
}
.view {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
.dim {
  position: absolute;
  background: var(--dim);
  pointer-events: none;
}
.frame {
  position: absolute;
  border: 1px solid var(--accent);
  box-shadow: 0 0 0 1px rgba(12, 14, 32, 0.45);
  pointer-events: none;
}
.hnd {
  position: absolute;
  width: 7px;
  height: 7px;
  background: #fff;
  border: 1px solid var(--accent);
  box-sizing: border-box;
  pointer-events: auto;
}
.hnd.nw {
  left: -3px;
  top: -3px;
  cursor: nwse-resize;
}
.hnd.ne {
  right: -3px;
  top: -3px;
  cursor: nesw-resize;
}
.hnd.sw {
  left: -3px;
  bottom: -3px;
  cursor: nesw-resize;
}
.hnd.se {
  right: -3px;
  bottom: -3px;
  cursor: nwse-resize;
}
.hnd.n {
  left: calc(50% - 3px);
  top: -3px;
  cursor: ns-resize;
}
.hnd.s {
  left: calc(50% - 3px);
  bottom: -3px;
  cursor: ns-resize;
}
.hnd.e {
  right: -3px;
  top: calc(50% - 3px);
  cursor: ew-resize;
}
.hnd.w {
  left: -3px;
  top: calc(50% - 3px);
  cursor: ew-resize;
}
.rule-h,
.rule-v {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  opacity: 0.55;
}
.rule-h {
  left: 0;
  width: 100%;
  height: 1px;
  background: repeating-linear-gradient(90deg, var(--accent) 0 4px, transparent 4px 10px);
}
.rule-v {
  top: 0;
  height: 100%;
  width: 1px;
  background: repeating-linear-gradient(180deg, var(--accent) 0 4px, transparent 4px 10px);
}
.aim-dot {
  position: absolute;
  z-index: 7;
  width: 5px;
  height: 5px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1px #0c0e20;
  pointer-events: none;
}
.loupe {
  position: absolute;
  z-index: 8;
  border-radius: 50%;
  border: 2px solid var(--accent);
  box-shadow:
    0 8px 22px #0008,
    inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  pointer-events: none;
  image-rendering: pixelated;
}
.aim-xy {
  position: absolute;
  z-index: 8;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(30, 33, 64, 0.92);
  border: 1px solid var(--line);
  color: var(--fg);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  pointer-events: none;
  white-space: nowrap;
}
.tarr {
  position: absolute;
  inset: 0;
  z-index: 11;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.twrap {
  position: absolute;
  z-index: 12;
  cursor: move;
  border-radius: 6px;
}
.tgrip {
  position: absolute;
  left: -5px;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 2px;
  background: var(--accent);
}
.tin {
  display: block;
  background: transparent;
  border: 0;
  outline: none;
  padding: 0;
  margin: 0;
  font-family: 'Segoe UI', sans-serif;
  caret-color: var(--accent);
  cursor: text;
}
.tdot {
  position: absolute;
  z-index: 13;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  padding: 0;
  border: 2px solid #f2f2f2;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1px #0c0e20;
  cursor: grab;
}
.tdot:focus-visible {
  outline: 2px solid var(--accent-2);
  outline-offset: 1px;
}
.tbar {
  position: absolute;
  z-index: 14;
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(30, 33, 64, 0.94);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  padding: 3px;
}
.tfs {
  width: 36px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
  text-align: center;
  outline: none;
  appearance: textfield;
}
.tfs:focus-visible {
  box-shadow: 0 0 0 1px var(--accent);
}
.tfs::-webkit-inner-spin-button,
.tfs::-webkit-outer-spin-button {
  appearance: none;
}
.tb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--fg);
  cursor: pointer;
}
.tb:hover,
.tb:focus-visible {
  color: var(--accent);
  background: rgba(255, 45, 120, 0.12);
}
.tb.on {
  color: #fff;
  background: var(--accent);
}
.tb:focus-visible {
  outline: none;
}
.tfill {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: currentColor;
}
.hint {
  position: fixed;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: min(92vw, 640px);
  background: rgba(30, 33, 64, 0.9);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  color: var(--fg);
  font-size: 11px;
  letter-spacing: 0.01em;
  padding: 3px 8px 3px 3px;
  pointer-events: none;
}
.hint:not(:has(.hb)) {
  padding: 5px 10px;
}
.hint span {
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--fg);
  cursor: pointer;
  pointer-events: auto;
  flex-shrink: 0;
}
.hb:hover,
.hb:focus-visible {
  color: var(--accent);
  background: rgba(255, 45, 120, 0.14);
}
.hb:focus-visible {
  outline: 1px solid var(--accent);
}
</style>
