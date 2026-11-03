import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('redshot', {
  onStart: (cb) => {
    ipcRenderer.removeAllListeners('start')
    ipcRenderer.on('start', (_, data) => cb(data))
  },
  onBlank: (cb) => {
    ipcRenderer.removeAllListeners('blank')
    ipcRenderer.on('blank', (_, id) => cb(id))
  },
  onShown: (cb) => {
    ipcRenderer.removeAllListeners('shown')
    ipcRenderer.on('shown', (_, data) => cb(data || null))
  },
  hitAt: (x, y) => ipcRenderer.invoke('hit-at', { x, y }),
  copy: (buf) => ipcRenderer.invoke('copy', buf),
  save: (buf) => ipcRenderer.invoke('save', buf),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  close: () => ipcRenderer.send('close-overlay'),
  setCursor: (x, y) => ipcRenderer.send('set-cursor', { x, y }),
  blanked: (id) => ipcRenderer.send('blanked', id),
  painted: () => ipcRenderer.send('painted'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  onUpdateState: (cb) => {
    const listener = (_, state) => cb(state)
    ipcRenderer.on('update-state', listener)
    return () => ipcRenderer.removeListener('update-state', listener)
  },
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  log: (level, msg) => ipcRenderer.send('log', { level, msg }),
  uiReady: () => ipcRenderer.send('ui-ready')
})
