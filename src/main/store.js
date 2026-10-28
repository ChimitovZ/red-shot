import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const defaults = () => ({
  hotkeys: {
    region: 'PrintScreen',
    window: 'Alt+PrintScreen',
    screen: 'Control+PrintScreen'
  },
  saveDir: app.getPath('pictures'),
  autostart: false
})

function file() {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings() {
  const d = defaults()
  try {
    if (!existsSync(file())) return d
    const raw = JSON.parse(readFileSync(file(), 'utf8'))
    return { ...d, ...raw, hotkeys: { ...d.hotkeys, ...raw.hotkeys } }
  } catch {
    return d
  }
}

export function saveSettings(s) {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 2), 'utf8')
}
