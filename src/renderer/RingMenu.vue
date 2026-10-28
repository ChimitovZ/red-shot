<script setup>
import { computed, ref, watch } from 'vue'
import {
  ArrowUpRight,
  Circle,
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
  eraser: Eraser
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

const R = 172
const tOut = 172
const tIn = 112
const cOut = 104
const cIn = 68
const wOut = 60
const wIn = 34
const last = ref(null)

watch(
  () => props.show,
  (v) => {
    if (!v) last.value = null
  }
)

const toolPolys = computed(() => sectorPolys(TOOLS.length, tIn, tOut))
const colorPolys = computed(() => sectorPolys(COLORS.length, cIn, cOut))
const thickPolys = computed(() => sectorPolys(WIDTHS.length, wIn, wOut))

function sectorPolys(n, inner, outer) {
  const out = []
  for (let i = 0; i < n; i++) {
    const a0 = (Math.PI * 2 * i) / n - Math.PI / 2
    const a1 = (Math.PI * 2 * (i + 1)) / n - Math.PI / 2
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
  if (r >= tIn && r <= tOut + 10) h = { kind: 'tool', i: slot(TOOLS.length, ang) }
  else if (r >= cIn && r <= cOut) h = { kind: 'color', i: slot(COLORS.length, ang) }
  else if (r >= wIn && r <= wOut) h = { kind: 'width', i: slot(WIDTHS.length, ang) }
  else if (r < wIn) h = null
  else if (last.value && r <= tOut + 16) h = last.value
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
  const r = Math.min(tOut - 6, Math.hypot(dx, dy))
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
      <g :transform="`translate(${R},${R})`">
        <circle :r="tOut" class="plate" />
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
        <line
          v-for="(p, i) in thickPolys"
          :key="'wd' + i"
          :x1="p.ix - 7"
          :y1="p.iy"
          :x2="p.ix + 7"
          :y2="p.iy"
          class="wline"
          :style="{ strokeWidth: Math.min(8, WIDTHS[i]) }"
        />
        <line v-if="aim" class="aim" :x1="aim.x1" :y1="aim.y1" :x2="aim.x2" :y2="aim.y2" />
        <circle :r="wIn - 1" class="hub" />
      </g>
    </svg>
    <div
      v-for="(p, i) in toolPolys"
      :key="'i' + i"
      class="ico"
      :class="{ on: hit?.kind === 'tool' && hit.i === i, cur: tool === TOOLS[i][0] }"
      :style="{ left: R + p.ix + 'px', top: R + p.iy + 'px' }"
    >
      <component :is="ICONS[TOOLS[i][0]]" :size="18" :stroke-width="1.75" />
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
  transform: scale(0.88);
  transform-origin: 50% 50%;
  visibility: hidden;
  transition:
    opacity 140ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s 140ms;
}
.wrap.vis {
  opacity: 1;
  transform: scale(1);
  visibility: visible;
  transition:
    opacity 140ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s;
}
.svg {
  display: block;
}
.plate {
  fill: #111;
}
.sec {
  fill: #1a1a1a;
  stroke: #111;
  stroke-width: 1;
  transition: fill 120ms ease;
}
.sec.cur {
  stroke: #c41e3a;
  stroke-width: 1.5;
}
.sec.on,
.sec.flash {
  fill: #c41e3a;
}
.swatch {
  stroke: #111;
  stroke-width: 1;
  transition: stroke-width 120ms ease, stroke 120ms ease;
}
.swatch.cur,
.swatch.on {
  stroke: #c41e3a;
  stroke-width: 2.5;
}
.wline {
  stroke: #d0d0d0;
  stroke-linecap: square;
}
.hub {
  fill: #111;
  stroke: #1a1a1a;
}
.aim {
  stroke: #c41e3a;
  stroke-width: 1;
  stroke-linecap: round;
}
.ico {
  position: absolute;
  display: flex;
  color: #d0d0d0;
  transform: translate(-50%, -50%);
  transition: transform 120ms ease, color 120ms ease;
}
.ico.on,
.ico.cur {
  color: #f2f2f2;
  transform: translate(-50%, -50%) scale(1.12);
}
.cap {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 56px;
  text-align: center;
  color: #d0d0d0;
  font: 600 10px/1.2 'Segoe UI', sans-serif;
  transition: color 120ms ease;
}
.cap.acc {
  color: #c41e3a;
}
</style>
