<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Redo2, Square, Undo2 } from '@lucide/vue'
import RingMenu from './RingMenu.vue'
import { arrowFromBox, blit, COLORS, cursorName, measureTextW, replay, showPreview, strokeLast, textBg, textBox, textHandle, TOOLS, WIDTHS } from './draw'
import { logErr } from './log'

const SNAP = 28
let lastFont = 18

let shots = []
const sel = reactive({ x: 0, y: 0, w: 0, h: 0, on: false })
const drag = reactive({ on: false, x: 0, y: 0 })
const tool = ref('pencil')
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
const ringRef = ref(null)
const hint = ref('Выделите область')

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
  texting.on = false
  texting.edit = -1
  texting.drag = ''
  ring.show = false
  base = null
  overlayC = null
  const c = view.value
  if (c) {
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
  }
  window.redshot.blanked(id)
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
    texting.drag = ''
    ring.show = false
    vw.value = data.virt.width
    vh.value = data.virt.height
    shots = data.shots || []
    if (data.selection) {
      Object.assign(sel, { ...data.selection, on: true })
      hint.value = 'ПКМ — меню · Ctrl+Z — отмена · Enter — копировать · Esc — выход'
    } else {
      Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
      hint.value = 'Выделите область'
    }
    nextTick(makeBase)
  } catch (e) {
    logErr('applyStart', e)
  }
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

function startItem(x, y) {
  const t = tool.value
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
  if (t === 'pencil' || t === 'marker' || t === 'eraser') {
    preview.value = { tool: t, color: color.value, width: t === 'marker' ? width.value * 2 : width.value, pts: [{ x, y }] }
    return
  }
  preview.value = { tool: t, color: color.value, width: width.value, a: { x, y }, b: { x, y } }
  const c = view.value
  if (c && base && overlayC) showPreview(c, base, overlayC, preview.value)
}

function moveItem(x, y) {
  const p = preview.value
  if (!p) return
  const c = view.value
  if (p.pts) {
    p.pts.push({ x, y })
    if (!c || !overlayC) return
    if (p.tool === 'eraser') {
      strokeLast(overlayC, null, p)
      blit(c, base, overlayC)
    } else strokeLast(overlayC, c, p)
    return
  }
  p.b = { x, y }
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
  ring.y = Math.min(vh.value - R - 8, Math.max(R + 8, y))
  ring.hx = x
  ring.hy = y
  ring.show = true
  ringLmb = false
}

function applyRing() {
  const h = ringRef.value?.hitAt(ring.hx - ring.x, ring.hy - ring.y)
  if (!h) return
  if (h.kind === 'tool') {
    tool.value = TOOLS[h.i][0]
    ring.flash = tool.value
    setTimeout(() => {
      ring.flash = ''
    }, 160)
  }
  if (h.kind === 'color') color.value = COLORS[h.i]
  if (h.kind === 'width') width.value = WIDTHS[h.i]
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
    if (!sel.on) return
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
  if (!sel.on) {
    drag.on = true
    drag.x = e.clientX
    drag.y = e.clientY
    Object.assign(sel, { x: drag.x, y: drag.y, w: 0, h: 0 })
    return
  }
  if (!inSel(e.clientX, e.clientY)) return
  const i = hitText(e.clientX, e.clientY)
  if (i >= 0) {
    openText(i)
    return
  }
  startItem(e.clientX, e.clientY)
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
  if (drag.on) {
    sel.x = Math.min(drag.x, e.clientX)
    sel.y = Math.min(drag.y, e.clientY)
    sel.w = Math.abs(e.clientX - drag.x)
    sel.h = Math.abs(e.clientY - drag.y)
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
  if (drawing) moveItem(e.clientX, e.clientY)
}

function onUp(e) {
  if (e.type === 'pointercancel') {
    ringLmb = false
    texting.drag = ''
    if (drag.on) {
      drag.on = false
      if (!(sel.w > 3 && sel.h > 3)) Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
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
    if (sel.w > 3 && sel.h > 3) {
      sel.on = true
      hint.value = 'ПКМ — меню · Ctrl+Z — отмена · Enter — копировать · Esc — выход'
    } else Object.assign(sel, { x: 0, y: 0, w: 0, h: 0, on: false })
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
    if (buf) await window.redshot.copy(buf)
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

function onKey(e) {
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
  window.redshot.uiReady()
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('contextmenu', (e) => e.preventDefault())
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousedown', onMouseDown, true)
})

const dimRects = computed(() => {
  if (!sel.on && !drag.on) return [{ x: 0, y: 0, w: '100%', h: '100%' }]
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
    :style="{ cursor: sel.on ? cursorName(tool) : 'crosshair' }"
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
    />
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
    <div v-if="sel.on" class="hint">
      <button type="button" class="hb" title="Ctrl+Z" @pointerdown.stop @click="undoLast">
        <Undo2 :size="14" :stroke-width="2" />
      </button>
      <button type="button" class="hb" title="Ctrl+Y" @pointerdown.stop @click="redoLast">
        <Redo2 :size="14" :stroke-width="2" />
      </button>
      <span>{{ hint }}</span>
    </div>
    <div v-else class="hint">{{ hint }}</div>
  </div>
</template>

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
  pointer-events: none;
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
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  padding: 0;
  border: 2px solid #f2f2f2;
  border-radius: 50%;
  background: var(--accent);
  cursor: grab;
}
.tbar {
  position: absolute;
  z-index: 14;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--panel);
  padding: 3px 4px;
}
.tfs {
  width: 38px;
  height: 20px;
  border: 0;
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
  text-align: center;
  outline: none;
  appearance: textfield;
}
.tfs::-webkit-inner-spin-button,
.tfs::-webkit-outer-spin-button {
  appearance: none;
}
.tb {
  display: flex;
  padding: 2px;
  border: 0;
  background: none;
  color: var(--fg);
  cursor: pointer;
}
.tb.on,
.tb:hover {
  color: var(--accent);
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
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel);
  color: var(--fg);
  font-size: 12px;
  padding: 4px 8px;
  pointer-events: none;
}
.hb {
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg);
  cursor: pointer;
  pointer-events: auto;
}
.hb:hover {
  color: var(--accent);
}
</style>
