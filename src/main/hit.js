import { app, screen, utilityProcess } from 'electron'
import { join } from 'path'
import koffi from 'koffi'
import { error } from './log'

let worker = null
let pending = null
let disabledUntil = 0

function stopWorker() {
  const old = worker
  worker = null
  old?.kill()
  pending?.({ items: [] })
}
app.on('before-quit', stopWorker)

function request(data) {
  if (pending || Date.now() < disabledUntil) return Promise.resolve({ items: [] })
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      error('hit worker timeout')
      disabledUntil = Date.now() + 3000
      stopWorker()
    }, 800)
    const done = (result) => {
      clearTimeout(timer)
      pending = null
      resolve(result)
    }
    pending = done
    try {
      if (!worker) {
        const child = utilityProcess.fork(join(__dirname, 'hit-worker.js'), [], { serviceName: 'RedShot: выбор области' })
        worker = child
        child.on('message', (result) => {
          if (worker === child) pending?.(result)
        })
        child.on('exit', () => {
          if (worker !== child) return
          worker = null
          disabledUntil = Date.now() + 3000
          pending?.({ items: [] })
        })
      }
      worker.postMessage(data)
    } catch (e) {
      error('hit worker', e)
      stopWorker()
    }
  })
}

function place(overlay, phys, name, x, y) {
  const tl = screen.screenToDipPoint({ x: Math.round(phys.left), y: Math.round(phys.top) })
  const br = screen.screenToDipPoint({ x: Math.round(phys.left + phys.w), y: Math.round(phys.top + phys.h) })
  const ob = overlay.getBounds()
  let l = Math.round(tl.x - ob.x)
  let t = Math.round(tl.y - ob.y)
  let r = l + Math.max(1, Math.round(br.x - tl.x))
  let b = t + Math.max(1, Math.round(br.y - tl.y))
  l = Math.max(0, l)
  t = Math.max(0, t)
  r = Math.min(ob.width, r)
  b = Math.min(ob.height, b)
  const box = { x: l, y: t, w: r - l, h: b - t, name: name || '' }
  if (box.w < 8 || box.h < 8) return null
  if (box.w >= ob.width - 8 && box.h >= ob.height - 8) return null
  if (x < box.x - 2 || y < box.y - 2 || x > box.x + box.w + 2 || y > box.y + box.h + 2) return null
  return box
}

export async function hitAt(overlay, others, x, y) {
  if (!overlay || overlay.isDestroyed() || pending) return { items: [] }
  const ob = overlay.getBounds()
  const phys = screen.dipToScreenPoint({ x: ob.x + x, y: ob.y + y })
  const handles = [overlay, ...others].filter((w) => w && !w.isDestroyed())
    .map((w) => koffi.decode(w.getNativeWindowHandle(), 'void *'))
  const displays = screen.getAllDisplays().map((d) => {
    const tl = screen.dipToScreenPoint({ x: d.bounds.x, y: d.bounds.y })
    return { left: tl.x, top: tl.y, w: Math.round(d.bounds.width * d.scaleFactor), h: Math.round(d.bounds.height * d.scaleFactor) }
  })
  const result = await request({ x: phys.x, y: phys.y, ours: handles.map((h) => String(koffi.address(h))), displays })
  if (overlay.isDestroyed() || !overlay.isVisible()) return { items: [] }
  return { items: (result.items || []).map((r) => place(overlay, r, r.name, x, y)).filter(Boolean) }
}
