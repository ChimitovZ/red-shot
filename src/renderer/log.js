export function logErr(where, e) {
  const msg = e?.stack || e?.message || String(e)
  console.error(where, e)
  window.redshot?.log('error', `${where}: ${msg}`)
}

export function hookRenderer(app) {
  window.addEventListener('error', (e) => logErr('window.error', e.error || e.message))
  window.addEventListener('unhandledrejection', (e) => logErr('unhandledrejection', e.reason))
  if (app) {
    app.config.errorHandler = (err, _vm, info) => logErr('vue ' + info, err)
  }
}
