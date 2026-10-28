import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard, dialog, nativeImage, screen, net } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { error, info, log, logPath, openLog } from './log'
import { captureDesktop, cursorDisplay, dipOnVirt, foregroundDip, overlayBounds, setCursorDip, toOverlay, virtualDip } from './capture'
import { loadSettings, saveSettings } from './store'
import { trayIcon } from './icon'

let tray
let overlay
let settingsWin
let settings = null
let busy = false
let uiReady = false
let uiWait = []
const loadTries = new WeakMap()

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

function shotDir() {
  const d = new Date()
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return join(settings.saveDir, ym)
}

function autoSavePng(buf) {
  try {
    const dir = shotDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `redshot-${Date.now()}.png`), Buffer.from(buf))
  } catch (e) {
    error('auto-save', e)
  }
}

function markUiReady() {
  uiReady = true
  info('ui-ready')
  uiWait.splice(0).forEach((fn) => fn())
}

function waitUi() {
  if (uiReady) return Promise.resolve()
  return new Promise((r) => {
    const t = setTimeout(() => {
      error('ui-ready timeout')
      r()
    }, 10000)
    uiWait.push(() => {
      clearTimeout(t)
      r()
    })
  })
}

function viteBase() {
  const env = process.env.ELECTRON_RENDERER_URL
  return env ? env.replace('://localhost', '://127.0.0.1') : null
}

async function waitVite() {
  const base = viteBase()
  if (!base) return
  for (let i = 0; i < 40; i++) {
    try {
      const r = await net.fetch(base + '/index.html')
      if (r.ok) {
        info('vite up ' + base)
        return
      }
    } catch {}
    await delay(250)
  }
  error('vite not up, fallback to out/renderer: ' + base)
  process.env.ELECTRON_RENDERER_URL = ''
}

function builtPage(name) {
  return join(__dirname, '../renderer', name)
}

function loadPage(win, name) {
  if (!win._rsHook) {
    win._rsHook = true
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      error(`did-fail-load ${name} ${code} ${desc} ${url}`)
      uiReady = false
      const n = (loadTries.get(win) || 0) + 1
      loadTries.set(win, n)
      if (n > 8) return
      setTimeout(() => {
        process.env.ELECTRON_RENDERER_URL = ''
        loadPage(win, name)
      }, 300)
    })
    win.webContents.on('did-finish-load', () => {
      loadTries.set(win, 0)
      info(`loaded ${name} ${win.webContents.getURL()}`)
    })
    win.webContents.on('render-process-gone', (_e, d) => {
      uiReady = false
      error(`render gone ${name} ${JSON.stringify(d)}`)
    })
    win.webContents.on('preload-error', (_e, path, err) => error(`preload ${path}`, err))
  }
  const base = viteBase()
  const p = base ? win.loadURL(`${base}/${name}`) : win.loadFile(builtPage(name))
  p.catch((e) => error(`loadPage ${name}`, e))
}

function createOverlay() {
  info('createOverlay')
  overlay = new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    transparent: true,
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  overlay.setMenu(null)
  loadPage(overlay, 'index.html')
  overlay.on('closed', () => {
    overlay = null
    uiReady = false
  })
}

async function overlayReady() {
  if (!overlay) createOverlay()
  await waitUi()
}

function placeOverlay(b) {
  const v = b || virtualDip()
  overlay.setBounds({ x: v.x, y: v.y, width: v.width, height: v.height })
  overlay.setAlwaysOnTop(true, 'screen-saver')
}

function createSettings() {
  if (settingsWin) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 420,
    height: 340,
    title: 'RedShot',
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  settingsWin.setMenu(null)
  globalShortcut.unregisterAll()
  loadPage(settingsWin, 'settings.html')
  settingsWin.on('closed', () => {
    settingsWin = null
    bindHotkeys()
  })
}

function applyAutostart() {
  app.setLoginItemSettings({ openAtLogin: !!settings.autostart, path: process.execPath })
}

function bindHotkeys() {
  globalShortcut.unregisterAll()
  const map = [
    [settings.hotkeys.region, 'region'],
    [settings.hotkeys.window, 'window'],
    [settings.hotkeys.screen, 'screen']
  ]
  for (const [acc, mode] of map) {
    if (!acc) continue
    try {
      const ok = globalShortcut.register(acc, () => startCapture(mode))
      if (!ok) error(`hotkey not registered: ${acc} (${mode})`)
      else info(`hotkey ${acc} -> ${mode}`)
    } catch (e) {
      error(`hotkey ${acc} (${mode})`, e)
    }
  }
}

async function startCapture(mode) {
  if (busy) {
    info('startCapture skipped: busy')
    return
  }
  busy = true
  try {
    info(`startCapture ${mode}`)
    if (overlay?.isVisible()) {
      hideOverlay()
      await delay(50)
    }
    let selection = null
    let clip = null
    if (mode === 'window') {
      selection = foregroundDip()
      clip = selection
      if (!selection) error('window selection empty')
    } else if (mode === 'screen') {
      selection = dipOnVirt(cursorDisplay().bounds, virtualDip())
      clip = selection
    }
    const data = captureDesktop(clip)
    if (!data?.shots?.length) {
      error(`capture empty mode=${mode} virt=${JSON.stringify(data?.virt)}`)
      return
    }
    if (mode === 'screen' && !selection) selection = { x: 0, y: 0, w: data.virt.width, h: data.virt.height }
    const ov = overlayBounds(data.virt, data.shots)
    const packed = toOverlay(data.virt, ov, data.shots, selection)
    info(`captured ${packed.shots.length} shot(s) ${packed.shots.map((s) => `${s.pw}x${s.ph}`).join(',')}`)
    await overlayReady()
    placeOverlay(packed.virt)
    await waitPainted({ ...packed, mode })
    overlay.showInactive()
    overlay.webContents.send('shown')
    overlay.focus()
  } catch (e) {
    error(`startCapture ${mode}`, e)
  } finally {
    busy = false
  }
}

function hideOverlay() {
  if (!overlay) return
  overlay.webContents.send('blank')
  overlay.hide()
}

function waitPainted(data) {
  if (!overlay) return Promise.resolve()
  return new Promise((r) => {
    const done = () => {
      ipcMain.removeListener('painted', done)
      clearTimeout(t)
      r()
    }
    const t = setTimeout(done, 2000)
    ipcMain.on('painted', done)
    overlay.webContents.send('start', data)
  })
}

function makeTray() {
  try {
  tray = new Tray(trayIcon())
  tray.setToolTip('RedShot')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Область', click: () => startCapture('region') },
      { label: 'Окно', click: () => startCapture('window') },
      { label: 'Весь экран', click: () => startCapture('screen') },
      { type: 'separator' },
      { label: 'Настройки', click: createSettings },
      { label: 'Открыть лог', click: () => openLog().catch((e) => error('openLog', e)) },
      { label: 'Выход', click: () => app.quit() }
    ])
  )
  } catch (e) {
    error('makeTray', e)
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
app.commandLine.appendSwitch('wm-window-animations-disabled')

app.whenReady().then(async () => {
  info(`ready log=${logPath()} ELECTRON_RENDERER_URL=${process.env.ELECTRON_RENDERER_URL || ''}`)
  settings = loadSettings()
  applyAutostart()
  ipcMain.on('ui-ready', markUiReady)
  ipcMain.on('log', (_, p) => log((p?.level || 'error').toUpperCase(), `renderer: ${p?.msg || ''}`))
  makeTray()
  bindHotkeys()
  await waitVite()
  createOverlay()

  ipcMain.handle('copy', (_, buf) => {
    try {
      const img = nativeImage.createFromBuffer(Buffer.from(buf))
      if (img.isEmpty()) error(`copy empty image bytes=${buf?.byteLength || buf?.length}`)
      clipboard.writeImage(img)
      autoSavePng(buf)
      hideOverlay()
      return true
    } catch (e) {
      error('copy', e)
      return false
    }
  })
  ipcMain.handle('save', async (_, buf) => {
    try {
      const res = await dialog.showSaveDialog(overlay, {
        defaultPath: join(shotDir(), `redshot-${Date.now()}.png`),
        filters: [{ name: 'PNG', extensions: ['png'] }]
      })
      if (res.canceled || !res.filePath) return false
      writeFileSync(res.filePath, Buffer.from(buf))
      return true
    } catch (e) {
      error('save', e)
      return false
    }
  })
  ipcMain.on('close-overlay', hideOverlay)
  ipcMain.on('set-cursor', (_, p) => {
    if (!overlay || !p) return
    const b = overlay.getBounds()
    setCursorDip(b.x + p.x, b.y + p.y)
  })
  ipcMain.handle('get-settings', () => settings)
  ipcMain.handle('set-settings', (_, s) => {
    try {
      settings = { ...settings, ...s, hotkeys: { ...settings.hotkeys, ...s.hotkeys } }
      saveSettings(settings)
      applyAutostart()
      if (!settingsWin) bindHotkeys()
      return settings
    } catch (e) {
      error('set-settings', e)
      throw e
    }
  })
  ipcMain.handle('pick-dir', async () => {
    try {
      const res = await dialog.showOpenDialog(settingsWin || undefined, { properties: ['openDirectory'] })
      if (res.canceled || !res.filePaths[0]) return null
      return res.filePaths[0]
    } catch (e) {
      error('pick-dir', e)
      return null
    }
  })

  screen.on('display-metrics-changed', () => {
    if (overlay && !overlay.isVisible()) placeOverlay()
  })
}).catch((e) => error('whenReady', e))

app.on('window-all-closed', () => {})
app.on('will-quit', () => globalShortcut.unregisterAll())
