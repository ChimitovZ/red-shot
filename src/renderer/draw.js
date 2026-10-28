export const TOOLS = [
  ['pencil', 'Карандаш', 'Кр'],
  ['marker', 'Маркер', 'Мар'],
  ['arrow', 'Стрелка', '→'],
  ['line', 'Линия', '─'],
  ['rect', 'Прямоугольник', '□'],
  ['ellipse', 'Эллипс', '○'],
  ['text', 'Текст', 'А'],
  ['blur', 'Размытие', '▒'],
  ['eraser', 'Ластик', 'Лс']
]

export const COLORS = ['#c41e3a', '#d0d0d0', '#111111', '#f0c040', '#3d8bff', '#3cb371', '#ff7a1a', '#9b59b6']
export const WIDTHS = [2, 4, 8, 14]

export function normRect(a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

export function pixelate(ctx, x, y, w, h, block = 12) {
  x = Math.max(0, x | 0)
  y = Math.max(0, y | 0)
  w = Math.max(1, w | 0)
  h = Math.max(1, h | 0)
  const sw = Math.max(1, Math.ceil(w / block))
  const sh = Math.max(1, Math.ceil(h / block))
  const tmp = document.createElement('canvas')
  tmp.width = sw
  tmp.height = sh
  const t = tmp.getContext('2d')
  t.imageSmoothingEnabled = false
  t.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, h)
  ctx.imageSmoothingEnabled = true
}

function strokeStyle(ctx, item) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = item.color
  ctx.fillStyle = item.color
  ctx.lineWidth = item.width
  ctx.globalAlpha = item.tool === 'marker' ? 0.35 : 1
  ctx.globalCompositeOperation = item.tool === 'eraser' ? 'destination-out' : 'source-over'
}

function drawPath(ctx, pts) {
  if (!pts.length) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

function arrowHead(ctx, a, b, w) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const len = 10 + w * 2
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - len * Math.cos(ang - 0.4), b.y - len * Math.sin(ang - 0.4))
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - len * Math.cos(ang + 0.4), b.y - len * Math.sin(ang + 0.4))
  ctx.stroke()
}

const FONT = '"Segoe UI", sans-serif'
let mctx

export function textFont(fs) {
  return `${Math.max(10, fs | 0)}px ${FONT}`
}

export function measureTextW(text, fs) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')
  mctx.font = textFont(fs)
  return Math.max(mctx.measureText(text || ' ').width, fs * 0.5)
}

export function textBox(item) {
  const fs = Math.max(10, item.fontSize | 0)
  const pad = item.bg || item.outline ? 5 : 0
  return {
    x: item.a.x - pad,
    y: item.a.y - pad,
    w: measureTextW(item.text, fs) + pad * 2,
    h: fs * 1.2 + pad * 2,
    pad,
    fs
  }
}

export function textHandle(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h + 14 }
}

export function arrowFromBox(box, p) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = p.x - cx
  const dy = p.y - cy
  if (Math.abs(dx) * box.h > Math.abs(dy) * box.w) return { x: dx > 0 ? box.x + box.w : box.x, y: cy }
  return { x: cx, y: dy > 0 ? box.y + box.h : box.y }
}

function lum(hex) {
  const n = parseInt((hex || '#000').slice(1), 16)
  if (Number.isNaN(n)) return 0
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}

export function textBg(color) {
  return lum(color) > 160 ? '#1a1a1a' : '#f2f2f2'
}

function roundBox(ctx, b) {
  const r = Math.min(6, b.w / 4, b.h / 4)
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, r)
}

function drawText(ctx, item) {
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const box = textBox(item)
  ctx.font = textFont(box.fs)
  ctx.textBaseline = 'top'
  if (item.b) {
    const a = arrowFromBox(box, item.b)
    ctx.strokeStyle = item.color
    ctx.lineWidth = Math.max(2, box.fs / 10)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(item.b.x, item.b.y)
    ctx.stroke()
    arrowHead(ctx, a, item.b, box.fs / 6)
  }
  if (item.bg) {
    ctx.fillStyle = lum(item.color) > 160 ? '#1a1a1a' : '#f2f2f2'
    roundBox(ctx, box)
    ctx.fill()
  }
  if (item.outline) {
    ctx.strokeStyle = item.color
    ctx.lineWidth = Math.max(1.5, box.fs / 12)
    roundBox(ctx, box)
    ctx.stroke()
  }
  ctx.fillStyle = item.color
  ctx.fillText(item.text || '', item.a.x, item.a.y)
}

export function drawItem(ctx, item) {
  strokeStyle(ctx, item)
  if (item.tool === 'pencil' || item.tool === 'marker' || item.tool === 'eraser') {
    drawPath(ctx, item.pts)
  } else if (item.tool === 'line' || item.tool === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(item.a.x, item.a.y)
    ctx.lineTo(item.b.x, item.b.y)
    ctx.stroke()
    if (item.tool === 'arrow') arrowHead(ctx, item.a, item.b, item.width)
  } else if (item.tool === 'rect') {
    const r = normRect(item.a, item.b)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
  } else if (item.tool === 'ellipse') {
    const r = normRect(item.a, item.b)
    ctx.beginPath()
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (item.tool === 'text') {
    drawText(ctx, item)
    return
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

export function replay(view, base, overlay, items, preview) {
  const octx = overlay.getContext('2d')
  octx.clearRect(0, 0, overlay.width, overlay.height)
  const list = preview ? items.concat([preview]) : items
  for (const it of list) {
    if (it.tool === 'blur') {
      const r = normRect(it.a, it.b)
      if (r.w < 3 || r.h < 3) continue
      const t = document.createElement('canvas')
      t.width = r.w
      t.height = r.h
      const tctx = t.getContext('2d')
      tctx.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
      tctx.drawImage(overlay, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
      pixelate(tctx, 0, 0, r.w, r.h, 12)
      octx.drawImage(t, r.x, r.y)
    } else drawItem(octx, it)
  }
  const v = view.getContext('2d')
  v.clearRect(0, 0, view.width, view.height)
  v.drawImage(base, 0, 0)
  v.drawImage(overlay, 0, 0)
}

export function cursorName(tool) {
  if (tool === 'text') return 'text'
  if (tool === 'eraser') return 'cell'
  return 'crosshair'
}
