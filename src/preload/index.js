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
  copy: (buf) => ipcRenderer.invoke('copy', buf),
  save: (buf) => ipcRenderer.invoke('save', buf),
  close: () => ipcRenderer.send('close-overlay'),
  blanked: (id) => ipcRenderer.send('blanked', id),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  log: (level, msg) => ipcRenderer.send('log', { level, msg }),
  uiReady: () => ipcRenderer.send('ui-ready')
})
