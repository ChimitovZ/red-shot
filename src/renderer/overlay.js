import { createApp } from 'vue'
import OverlayApp from './OverlayApp.vue'
import { hookRenderer, logErr } from './log'
import './theme.css'

const app = createApp(OverlayApp)
hookRenderer(app)
try {
  app.mount('#app')
} catch (e) {
  logErr('overlay mount', e)
}
