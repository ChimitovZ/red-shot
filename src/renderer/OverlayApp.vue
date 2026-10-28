<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Redo2, Undo2 } from '@lucide/vue'
import RingMenu from './RingMenu.vue'
import { COLORS, WIDTHS, cursorName, replay, TOOLS } from './draw'
import { logErr } from './log'

const shots = ref([])
const sel = reactive({ x: 0, y: 0, w: 0, h: 0, on: false })
const drag = reactive({ on: false, x: 0, y: 0 })
const tool = ref('pencil')
const color = ref(COLORS[0])
const width = ref(4)
const items = []
const redo = []
const preview = ref(null)
const ring = reactive({ show: false, x: 0, y: 0, hx: 0, hy: 0, flash: '' })
const texting = reactive({ on: false, x: 0, y: 0, val: '' })
const vw = ref(1)
const vh = ref(1)
const view = ref(null)
const ringRef = ref(null)
const hint = ref('Выделите область')

let base = null
let overlayC = null
let drawing = false

function paint() {
  const c = view.value
  if (!c || !base || !overlayC) return
  try {
    replay(c, base, overlayC, items, preview.value)
  } catch (e) {
    logErr('paint', e)
  }
}

function sizeLayer(c, w, h) {
  c.width = w
  c.height = h
}

async function makeBase() {
  try {
    base = document.createElement('canvas')
    overlayC = document.createElement('canvas')
    sizeLayer(base, vw.value, vh.value)
    sizeLayer(overlayC, vw.value, vh.value)
    const ctx = base.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, base.width, base.height)
    await Promise.all(
      shots.value.map(async (s, i) => {
        try {
          const img = new Image()
          img.src = s.src
          await img.decode()
          ctx.drawImage(img, s.x, s.y, s.w, s.h)
        } catch (e) {
          logErr(`shot decode ${i} ${s.w}x${s.h}`, e)
        }
      })
    )
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
    drawing = false
    ring.show = false
    vw.value = data.virt.width
    vh.value = data.virt.height
    shots.value = data.shots.map((s) => ({ ...s, src: 'data:image/png;base64,' + s.b64 }))
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

function startItem(x, y) {
  const t = tool.value
  if (t === 'text') {
    texting.on = true
    texting.x = x
    texting.y = y
    texting.val = ''
    return
  }
  drawing = true
  if (t === 'pencil' || t === 'marker' || t === 'eraser') {
    preview.value = { tool: t, color: color.value, width: t === 'marker' ? width.value * 2 : width.value, pts: [{ x, y }] }
  } else {
    preview.value = { tool: t, color: color.value, width: width.value, a: { x, y }, b: { x, y } }
  }
  paint()
}

function moveItem(x, y) {
  const p = preview.value
  if (!p) return
  if (p.pts) p.pts.push({ x, y })
  else p.b = { x, y }
  paint()
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
}

function pickRing() {
  const h = ringRef.value?.hitAt(ring.hx - ring.x, ring.hy - ring.y)
  ring.show = false
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

function onDown(e) {
  if (e.button === 2) {
    if (!sel.on) return
    cancelItem()
    openRing(e.clientX, e.clientY)
    return
  }
  if (e.button !== 0 || ring.show || texting.on) return
  if (!sel.on) {
    drag.on = true
    drag.x = e.clientX
    drag.y = e.clientY
    Object.assign(sel, { x: drag.x, y: drag.y, w: 0, h: 0 })
    return
  }
  if (!inSel(e.clientX, e.clientY)) return
  startItem(e.clientX, e.clientY)
}

function onMove(e) {
  if (ring.show) {
    ring.hx = e.clientX
    ring.hy = e.clientY
    return
  }
  if (drag.on) {
    sel.x = Math.min(drag.x, e.clientX)
    sel.y = Math.min(drag.y, e.clientY)
    sel.w = Math.abs(e.clientX - drag.x)
    sel.h = Math.abs(e.clientY - drag.y)
    return
  }
  if (drawing) moveItem(e.clientX, e.clientY)
}

function onUp(e) {
  if (e.button === 2) {
    if (ring.show) pickRing()
    return
  }
  if (e.button !== 0) return
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
    const sc = Math.max(1, ...shots.value.map((s) => s.scale || 1))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(sel.w * sc))
    c.height = Math.max(1, Math.round(sel.h * sc))
    const ctx = c.getContext('2d')
    for (const s of shots.value) {
      const ix = Math.max(sel.x, s.x)
      const iy = Math.max(sel.y, s.y)
      const ir = Math.min(sel.x + sel.w, s.x + s.w)
      const ib = Math.min(sel.y + sel.h, s.y + s.h)
      if (ir <= ix || ib <= iy) continue
      const img = new Image()
      img.src = s.src
      await img.decode()
      const k = img.width / s.w
      ctx.drawImage(
        img,
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
      items.push({
        tool: 'text',
        color: color.value,
        width: width.value,
        a: { x: texting.x, y: texting.y },
        text: texting.val
      })
      redo.length = 0
      texting.on = false
      paint()
      e.preventDefault()
    }
    if (e.key === 'Escape') {
      texting.on = false
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
  window.redshot.uiReady()
  window.addEventListener('keydown', onKey)
  window.addEventListener('contextmenu', (e) => e.preventDefault())
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

const dimRects = () => {
  if (!sel.on && !drag.on) return [{ x: 0, y: 0, w: '100%', h: '100%' }]
  const { x, y, w, h } = sel
  return [
    { x: 0, y: 0, w: '100%', h: y + 'px' },
    { x: 0, y: y + h, w: '100%', h: `calc(100% - ${y + h}px)` },
    { x: 0, y, w: x + 'px', h: h + 'px' },
    { x: x + w, y, w: `calc(100% - ${x + w}px)`, h: h + 'px' }
  ]
}
</script>

<template>
  <div
    class="root"
    :style="{ cursor: sel.on ? cursorName(tool) : 'crosshair' }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
  >
    <img
      v-for="(s, i) in shots"
      :key="i"
      class="shot"
      :src="s.src"
      :style="{ left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' }"
    />
    <canvas ref="view" class="view" />
    <div v-for="(d, i) in dimRects()" :key="i" class="dim" :style="{ left: d.x + 'px', top: d.y + 'px', width: d.w, height: d.h }" />
    <div
      v-if="sel.on || drag.on"
      class="frame"
      :style="{ left: sel.x + 'px', top: sel.y + 'px', width: sel.w + 'px', height: sel.h + 'px' }"
    />
    <input
      v-if="texting.on"
      class="tin"
      v-model="texting.val"
      :style="{ left: texting.x + 'px', top: texting.y + 'px', color, fontSize: Math.max(14, width * 6) + 'px' }"
      autofocus
    />
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
.shot,
.view {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
.view {
  left: 0;
  top: 0;
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
.tin {
  position: absolute;
  z-index: 12;
  background: transparent;
  border: 1px solid var(--accent);
  outline: none;
  font-family: 'Segoe UI', sans-serif;
  min-width: 80px;
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
  background: #1a1a1a;
  color: #d0d0d0;
  font-size: 12px;
  padding: 4px 8px;
  pointer-events: none;
}
.hb {
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  color: #d0d0d0;
  cursor: pointer;
  pointer-events: auto;
}
.hb:hover {
  color: #c41e3a;
}
</style>
