import { createApp } from 'vue'
import SettingsApp from './SettingsApp.vue'
import { hookRenderer, logErr } from './log'
import './theme.css'

const app = createApp(SettingsApp)
hookRenderer(app)
try {
  app.mount('#app')
} catch (e) {
  logErr('settings mount', e)
}
