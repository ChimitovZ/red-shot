<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowUpRight,
  Circle,
  Copy,
  Crop,
  Eraser,
  Grid3x3,
  Highlighter,
  Minus,
  Pencil,
  Save,
  Square,
  Type,
  X
} from '@lucide/vue'
import { ACTIONS, TOOLS, COLORS, TOOL_COLOR, TOOL_WIDTH, WIDTHS } from './draw'

const ICONS = {
  pencil: Pencil,
  marker: Highlighter,
  arrow: ArrowUpRight,
  line: Minus,
  rect: Square,
  ellipse: Circle,
  text: Type,
  blur: Grid3x3,
  eraser: Eraser,
  crop: Crop,
  save: Save,
  copy: Copy,
  exit: X
}

const props = defineProps({
  show: Boolean,
  x: Number,
  y: Number,
  hx: Number,
  hy: Number,
  tool: String,
  color: String,
  width: Number,
  flash: String
})

const R = 228
const tOut = 228
const tIn = 154
const cOut = 142
const cIn = 98
const wOut = 86
const wIn = 52
const barY = R + 10
const barH = 40
const btnW = 124
const btnGap = 0
const last = ref(null)
const warming = ref(false)

watch(
  () => props.show,
  (v) => {
    if (!v) last.value = null
  }
)

function warm(done) {
  if (props.show) {
    done?.()
    return
  }
  warming.value = true
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        warming.value = false
        done?.()
      })
    })
  })
}

const toolPolys = computed(() => sectorPolys(TOOLS.length, tIn, tOut, 0.028))
const colorPolys = computed(() => sectorPolys(COLORS.length, cIn, cOut, 0.03))
const thickPolys = computed(() => sectorPolys(WIDTHS.length, wIn, wOut, 0.04))
const barW = ACTIONS.length * btnW + (ACTIONS.length - 1) * btnGap

function sectorPolys(n, inner, outer, gap) {
  const out = []
  for (let i = 0; i < n; i++) {
    const a0 = (Math.PI * 2 * i) / n - Math.PI / 2 + gap
    const a1 = (Math.PI * 2 * (i + 1)) / n - Math.PI / 2 - gap
    const mid = (a0 + a1) / 2
    const ir = (inner + outer) / 2
    out.push({
      d: donut(a0, a1, inner, outer),
      ix: Math.cos(mid) * ir,
      iy: Math.sin(mid) * ir
    })
  }
  return out
}

function donut(a0, a1, inner, outer) {
  const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(a0, outer)
  const [x1, y1] = p(a1, outer)
  const [x2, y2] = p(a1, inner)
  const [x3, y3] = p(a0, inner)
  return `M${x0} ${y0} A${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`
}

function slot(n, ang) {
  return Math.min(n - 1, ((ang / (Math.PI * 2)) * n) | 0)
}

function hitBar(dx, dy) {
  if (dy < barY || dy > barY + barH) return null
  const x0 = -barW / 2
  if (dx < x0 || dx > x0 + barW) return null
  const i = Math.floor((dx - x0) / (btnW + btnGap))
  if (i < 0 || i >= ACTIONS.length) return null
  if (dx - x0 - i * (btnW + btnGap) > btnW) return null
  return { kind: 'action', i }
}

function hitAt(dx, dy) {
  const bar = hitBar(dx, dy)
  if (bar) {
    last.value = bar
    return bar
  }
  const r = Math.hypot(dx, dy)
  let ang = Math.atan2(dy, dx) + Math.PI / 2
  if (ang < 0) ang += Math.PI * 2
  let h = null
  if (r >= tIn && r <= tOut + 14) h = { kind: 'tool', i: slot(TOOLS.length, ang) }
  else if (r >= cIn && r <= cOut) h = { kind: 'color', i: slot(COLORS.length, ang) }
  else if (r >= wIn && r <= wOut) h = { kind: 'width', i: slot(WIDTHS.length, ang) }
  else if (r < wIn) h = null
  else if (last.value && last.value.kind !== 'action' && r <= tOut + 18) h = last.value
  last.value = h
  return h
}

const hit = computed(() => hitAt(props.hx - props.x, props.hy - props.y))

const peekTool = computed(() => (hit.value?.kind === 'tool' ? TOOLS[hit.value.i][0] : props.tool))
const dimColor = computed(() => !TOOL_COLOR.has(peekTool.value))
const dimWidth = computed(() => !TOOL_WIDTH.has(peekTool.value))

const label = computed(() => {
  const h = hit.value
  if (!h) return TOOLS.find((t) => t[0] === props.tool)?.[1] || ''
  if (h.kind === 'tool') return TOOLS[h.i][1]
  if (h.kind === 'action') return ACTIONS[h.i][1]
  if (h.kind === 'color') return 'Цвет'
  return 'Толщина ' + WIDTHS[h.i]
})

const aim = computed(() => {
  const dx = props.hx - props.x
  const dy = props.hy - props.y
  if (hitBar(dx, dy)) return null
  const r = Math.min(tOut - 8, Math.hypot(dx, dy))
  if (r < wIn) return null
  const a = Math.atan2(dy, dx)
  return { x1: Math.cos(a) * wIn, y1: Math.sin(a) * wIn, x2: Math.cos(a) * r, y2: Math.sin(a) * r }
})

defineExpose({ hitAt, R, warm })
</script>

<template>
  <div
    class="wrap"
    :class="{ vis: show, warm: warming }"
    :style="{ left: x - R + 'px', top: y - R + 'px', width: R * 2 + 'px', height: R * 2 + 'px' }"
  >
    <svg class="svg" :width="R * 2" :height="R * 2">
      <defs>
        <radialGradient id="rs-plate" cx="38%" cy="28%" r="78%">
          <stop offset="0%" stop-color="#2c315c" />
          <stop offset="55%" stop-color="#1c1f40" />
          <stop offset="100%" stop-color="#12142c" />
        </radialGradient>
        <radialGradient id="rs-hub" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="#262a52" />
          <stop offset="100%" stop-color="#16182e" />
        </radialGradient>
        <linearGradient id="rs-hot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ff7ab0" />
          <stop offset="100%" stop-color="#ff2d78" />
        </linearGradient>
        <filter id="rs-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g :transform="`translate(${R},${R})`">
        <circle :r="tOut + 3" class="halo" />
        <circle :r="tOut" class="plate" />
        <circle :r="tIn - 1" class="gap" />
        <circle :r="cIn - 1" class="gap" />
        <path
          v-for="(p, i) in toolPolys"
          :key="'t' + i"
          :d="p.d"
          class="sec"
          :class="{ on: hit?.kind === 'tool' && hit.i === i, cur: tool === TOOLS[i][0], flash: flash === TOOLS[i][0] }"
        />
        <g :class="{ mute: dimColor, live: dimColor && hit?.kind === 'color' }">
          <path
            v-for="(p, i) in colorPolys"
            :key="'c' + i"
            :d="p.d"
            class="swatch"
            :class="{ on: hit?.kind === 'color' && hit.i === i, cur: color === COLORS[i] }"
            :style="{ fill: COLORS[i] }"
          />
        </g>
        <g :class="{ mute: dimWidth, live: dimWidth && hit?.kind === 'width' }">
          <path
            v-for="(p, i) in thickPolys"
            :key="'w' + i"
            :d="p.d"
            class="sec"
            :class="{ on: hit?.kind === 'width' && hit.i === i, cur: width === WIDTHS[i] }"
          />
          <circle
            v-for="(p, i) in thickPolys"
            :key="'wd' + i"
            :cx="p.ix"
            :cy="p.iy"
            :r="1.8 + WIDTHS[i] * 0.42"
            class="wdot"
            :class="{ on: hit?.kind === 'width' && hit.i === i, cur: width === WIDTHS[i] }"
          />
        </g>
        <line v-if="aim" class="aim" :x1="aim.x1" :y1="aim.y1" :x2="aim.x2" :y2="aim.y2" />
        <circle v-if="aim" class="aimdot" :cx="aim.x2" :cy="aim.y2" r="3.5" />
        <circle :r="wIn - 1" class="hub" />
        <circle :r="wIn - 10" class="hub-ring" />
      </g>
    </svg>
    <div
      v-for="(p, i) in toolPolys"
      :key="'i' + i"
      class="ico"
      :class="{ on: hit?.kind === 'tool' && hit.i === i, cur: tool === TOOLS[i][0] }"
      :style="{ left: R + p.ix + 'px', top: R + p.iy + 'px' }"
    >
      <component :is="ICONS[TOOLS[i][0]]" :size="22" :stroke-width="1.7" />
    </div>
    <div class="cap" :class="{ acc: !!hit }">{{ label }}</div>
    <div class="bar">
      <div
        v-for="(a, i) in ACTIONS"
        :key="a[0]"
        class="abtn"
        :class="{ on: hit?.kind === 'action' && hit.i === i, flash: flash === a[0] }"
      >
        <component :is="ICONS[a[0]]" :size="18" :stroke-width="2" />
        {{ a[1] }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: fixed;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transform: translateZ(0) scale(0.9);
  transform-origin: 50% 50%;
  visibility: hidden;
  will-change: transform, opacity;
  transition:
    opacity 90ms ease,
    transform 140ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s 90ms;
}
.wrap.vis {
  opacity: 1;
  transform: translateZ(0) scale(1);
  visibility: visible;
  transition:
    opacity 90ms ease,
    transform 140ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s;
}
.wrap.warm {
  left: 8px !important;
  top: 8px !important;
  visibility: visible;
  opacity: 0.001;
  transform: translateZ(0);
  transition: none;
}
.svg {
  display: block;
  filter: drop-shadow(0 12px 28px rgba(8, 10, 28, 0.55));
}
.halo {
  fill: none;
  stroke: rgba(255, 45, 120, 0.32);
  stroke-width: 2;
}
.plate {
  fill: url(#rs-plate);
  stroke: var(--line);
  stroke-width: 1.25;
}
.gap {
  fill: none;
  stroke: #101228;
  stroke-width: 5;
}
.sec {
  fill: #1c2044;
  stroke: #101228;
  stroke-width: 1.25;
  transition: fill 80ms ease;
}
.sec.cur {
  fill: #3a1840;
  stroke: url(#rs-hot);
  stroke-width: 1.75;
  filter: url(#rs-glow);
}
.sec.on,
.sec.flash {
  fill: url(#rs-hot);
  stroke: #ff8fbf;
  filter: url(#rs-glow);
}
.mute {
  opacity: 0.32;
  transition: opacity 80ms ease;
}
.mute.live {
  opacity: 0.62;
}
.swatch {
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.25;
  transition:
    stroke-width 80ms ease,
    stroke 80ms ease;
}
.swatch.cur,
.swatch.on {
  stroke: #fff;
  stroke-width: 2.5;
  filter: url(#rs-glow);
}
.wdot {
  fill: #c8cce0;
  opacity: 0.55;
  pointer-events: none;
}
.wdot.cur,
.wdot.on {
  fill: #fff;
  opacity: 1;
}
.hub {
  fill: url(#rs-hub);
  stroke: #3a4074;
  stroke-width: 1.25;
}
.hub-ring {
  fill: none;
  stroke: #ff2d78;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 48 140;
  stroke-dashoffset: 18;
  opacity: 0.95;
}
.aim {
  stroke: #ff2d78;
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.95;
  filter: url(#rs-glow);
}
.aimdot {
  fill: #ff2d78;
  stroke: #ffe6f1;
  stroke-width: 1.25;
  filter: url(#rs-glow);
}
.ico {
  position: absolute;
  display: flex;
  color: #b4b9dc;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 1px 1px rgba(8, 10, 28, 0.55));
  transition:
    transform 80ms ease,
    color 80ms ease;
}
.ico.on,
.ico.cur {
  color: #fff;
  transform: translate(-50%, -50%) scale(1.12);
}
.cap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  margin: auto;
  padding: 0 6px;
  text-align: center;
  color: var(--fg);
  font: 600 12px/1.15 'Segoe UI', sans-serif;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 8px rgba(8, 10, 28, 0.7);
  transition: color 80ms ease;
}
.cap.acc {
  color: var(--accent-2);
}
.bar {
  position: absolute;
  left: 50%;
  top: 100%;
  display: flex;
  overflow: hidden;
  margin-top: 10px;
  border-radius: 10px;
  background: rgba(28, 31, 64, 0.96);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  transform: translateX(-50%);
}
.abtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  width: 124px;
  height: 40px;
  border: none;
  border-right: 1px solid var(--line);
  color: var(--fg);
  font: 600 12px/1 'Segoe UI', sans-serif;
  letter-spacing: 0.01em;
  transition:
    background 80ms ease,
    color 80ms ease;
}
.abtn:last-child {
  border-right: none;
}
.abtn.on,
.abtn.flash {
  background: var(--accent);
  color: #fff;
}
</style>
