<script setup>
import { computed, ref, watch } from 'vue'
import {
  ArrowUpRight,
  Circle,
  Crop,
  Eraser,
  Grid3x3,
  Highlighter,
  Minus,
  Pencil,
  Square,
  Type
} from '@lucide/vue'
import { TOOLS, COLORS, WIDTHS } from './draw'

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
  crop: Crop
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
const last = ref(null)

watch(
  () => props.show,
  (v) => {
    if (!v) last.value = null
  }
)

const toolPolys = computed(() => sectorPolys(TOOLS.length, tIn, tOut, 0.028))
const colorPolys = computed(() => sectorPolys(COLORS.length, cIn, cOut, 0.03))
const thickPolys = computed(() => sectorPolys(WIDTHS.length, wIn, wOut, 0.04))

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

function hitAt(dx, dy) {
  const r = Math.hypot(dx, dy)
  let ang = Math.atan2(dy, dx) + Math.PI / 2
  if (ang < 0) ang += Math.PI * 2
  let h = null
  if (r >= tIn && r <= tOut + 14) h = { kind: 'tool', i: slot(TOOLS.length, ang) }
  else if (r >= cIn && r <= cOut) h = { kind: 'color', i: slot(COLORS.length, ang) }
  else if (r >= wIn && r <= wOut) h = { kind: 'width', i: slot(WIDTHS.length, ang) }
  else if (r < wIn) h = null
  else if (last.value && r <= tOut + 18) h = last.value
  last.value = h
  return h
}

const hit = computed(() => hitAt(props.hx - props.x, props.hy - props.y))

const label = computed(() => {
  const h = hit.value
  if (!h) return TOOLS.find((t) => t[0] === props.tool)?.[1] || ''
  if (h.kind === 'tool') return TOOLS[h.i][1]
  if (h.kind === 'color') return 'Цвет'
  return 'Толщина ' + WIDTHS[h.i]
})

const aim = computed(() => {
  const dx = props.hx - props.x
  const dy = props.hy - props.y
  const r = Math.min(tOut - 8, Math.hypot(dx, dy))
  if (r < wIn) return null
  const a = Math.atan2(dy, dx)
  return { x1: Math.cos(a) * wIn, y1: Math.sin(a) * wIn, x2: Math.cos(a) * r, y2: Math.sin(a) * r }
})

defineExpose({ hitAt, R })
</script>

<template>
  <div
    class="wrap"
    :class="{ vis: show }"
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
        <path
          v-for="(p, i) in colorPolys"
          :key="'c' + i"
          :d="p.d"
          class="swatch"
          :class="{ on: hit?.kind === 'color' && hit.i === i, cur: color === COLORS[i] }"
          :style="{ fill: COLORS[i] }"
        />
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
        />
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
  </div>
</template>

<style scoped>
.wrap {
  position: fixed;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transform: scale(0.9);
  transform-origin: 50% 50%;
  visibility: hidden;
  transition:
    opacity 90ms ease,
    transform 140ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s 90ms;
}
.wrap.vis {
  opacity: 1;
  transform: scale(1);
  visibility: visible;
  transition:
    opacity 90ms ease,
    transform 140ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s;
}
.svg {
  display: block;
  filter: drop-shadow(0 18px 44px rgba(8, 10, 28, 0.72)) drop-shadow(0 0 22px rgba(255, 45, 120, 0.18));
}
.halo {
  fill: none;
  stroke: rgba(255, 45, 120, 0.28);
  stroke-width: 2;
  filter: url(#rs-glow);
}
.plate {
  fill: url(#rs-plate);
  stroke: #3a4074;
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
  transition: fill 100ms ease;
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
.swatch {
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 1.25;
  transition:
    stroke-width 100ms ease,
    stroke 100ms ease;
}
.swatch.cur,
.swatch.on {
  stroke: #ff2d78;
  stroke-width: 3;
  filter: url(#rs-glow);
}
.wdot {
  fill: #ececf6;
  pointer-events: none;
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
  filter: url(#rs-glow);
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
  color: #a8add0;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 1px 1px rgba(8, 10, 28, 0.5));
  transition:
    transform 100ms ease,
    color 100ms ease;
}
.ico.on,
.ico.cur {
  color: #fff;
  transform: translate(-50%, -50%) scale(1.14);
}
.cap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin: auto;
  text-align: center;
  color: #c8cce0;
  font: 600 11px/1.2 'Segoe UI', sans-serif;
  letter-spacing: 0.04em;
  transition: color 100ms ease;
}
.cap.acc {
  color: #ff5a9a;
}
</style>
