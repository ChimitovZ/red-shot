import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const defaults = () => ({
  hotkeys: {
    region: 'PrintScreen',
    window: 'Alt+PrintScreen',
    screen: 'Control+PrintScreen'
  },
  saveDir: join(app.getPath('pictures'), 'RedShot'),
  autostart: false,
  showCursor: true
})

function file() {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings() {
  const d = defaults()
  try {
    if (!existsSync(file())) return d
    const raw = JSON.parse(readFileSync(file(), 'utf8'))
    const s = { ...d, ...raw, hotkeys: { ...d.hotkeys, ...raw.hotkeys } }
    if (raw.saveDir === app.getPath('pictures')) s.saveDir = d.saveDir
    return s
  } catch {
    return d
  }
}

export function saveSettings(s) {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 2), 'utf8')
}
