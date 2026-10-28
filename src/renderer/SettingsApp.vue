<script setup>
import { onMounted, onUnmounted, reactive } from 'vue'

const s = reactive({
  hotkeys: { region: '', window: '', screen: '' },
  saveDir: '',
  autostart: false
})
const rec = reactive({ key: '' })

onMounted(async () => {
  Object.assign(s, await window.redshot.getSettings())
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

function recHotkey(which) {
  rec.key = which
}

function onKey(e) {
  if (!rec.key) return
  e.preventDefault()
  const parts = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let k = e.code === 'PrintScreen' || e.key === 'PrintScreen' ? 'PrintScreen' : e.key
  if (!k || ['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return
  if (k.length === 1) k = k.toUpperCase()
  s.hotkeys[rec.key] = parts.length ? parts.join('+') + '+' + k : k
  rec.key = ''
}

async function pick() {
  const dir = await window.redshot.pickDir()
  if (dir) s.saveDir = dir
}

async function save() {
  await window.redshot.setSettings({
    hotkeys: { ...s.hotkeys },
    saveDir: s.saveDir,
    autostart: s.autostart
  })
}
</script>

<template>
  <div class="wrap">
    <h1>RedShot</h1>
    <label>Область</label>
    <button :class="{ rec: rec.key === 'region' }" @click="recHotkey('region')">
      {{ rec.key === 'region' ? 'нажмите клавишу' : s.hotkeys.region }}
    </button>
    <label>Окно</label>
    <button :class="{ rec: rec.key === 'window' }" @click="recHotkey('window')">
      {{ rec.key === 'window' ? 'нажмите клавишу' : s.hotkeys.window }}
    </button>
    <label>Весь экран</label>
    <button :class="{ rec: rec.key === 'screen' }" @click="recHotkey('screen')">
      {{ rec.key === 'screen' ? 'нажмите клавишу' : s.hotkeys.screen }}
    </button>
    <label>Папка сохранения</label>
    <div class="row">
      <span class="path">{{ s.saveDir }}</span>
      <button @click="pick">…</button>
    </div>
    <label class="chk"><input v-model="s.autostart" type="checkbox" /> автозагрузка</label>
    <button class="ok" @click="save">Сохранить</button>
  </div>
</template>

<style scoped>
.wrap {
  padding: 12px 14px;
  background: #111;
  color: #d0d0d0;
  font: 12px/1.3 'Segoe UI', sans-serif;
  outline: none;
}
h1 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #c41e3a;
}
label {
  display: block;
  margin: 8px 0 3px;
  color: #d0d0d0;
}
button {
  background: #1a1a1a;
  color: #d0d0d0;
  border: 1px solid #1a1a1a;
  padding: 4px 8px;
  font: inherit;
  cursor: pointer;
  width: 100%;
  text-align: left;
}
button.rec {
  border-color: #c41e3a;
  color: #c41e3a;
}
.row {
  display: flex;
  gap: 6px;
}
.path {
  flex: 1;
  background: #1a1a1a;
  padding: 4px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row button {
  width: auto;
}
.chk {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.ok {
  margin-top: 12px;
  border-color: #c41e3a;
  text-align: center;
}
</style>
