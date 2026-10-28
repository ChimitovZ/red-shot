<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'

const s = reactive({
  hotkeys: { region: '', window: '', screen: '' },
  saveDir: '',
  autostart: false,
  showCursor: true
})
const rec = reactive({ key: '' })
const saved = ref(false)
let savedT

onMounted(async () => {
  Object.assign(s, await window.redshot.getSettings())
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(savedT)
})

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

function hk(which) {
  if (rec.key === which) return 'нажмите клавишу'
  return s.hotkeys[which] || '—'
}

async function pick() {
  const dir = await window.redshot.pickDir()
  if (dir) s.saveDir = dir
}

async function save() {
  await window.redshot.setSettings({
    hotkeys: { ...s.hotkeys },
    saveDir: s.saveDir,
    autostart: s.autostart,
    showCursor: s.showCursor
  })
  saved.value = true
  clearTimeout(savedT)
  savedT = setTimeout(() => {
    saved.value = false
  }, 1200)
}
</script>

<template>
  <div class="wrap">
    <h1>RedShot</h1>
    <div class="grid">
      <label>Область</label>
      <button
        type="button"
        class="hk"
        :class="{ rec: rec.key === 'region' }"
        @click="recHotkey('region')"
      >
        {{ hk('region') }}
      </button>
      <label>Окно</label>
      <button
        type="button"
        class="hk"
        :class="{ rec: rec.key === 'window' }"
        @click="recHotkey('window')"
      >
        {{ hk('window') }}
      </button>
      <label>Весь экран</label>
      <button
        type="button"
        class="hk"
        :class="{ rec: rec.key === 'screen' }"
        @click="recHotkey('screen')"
      >
        {{ hk('screen') }}
      </button>
    </div>
    <label>Папка сохранения</label>
    <div class="row">
      <span class="path" :class="{ empty: !s.saveDir }" :title="s.saveDir">{{ s.saveDir || '—' }}</span>
      <button type="button" class="browse" title="Выбрать папку" @click="pick">…</button>
    </div>
    <label class="chk">
      <input v-model="s.autostart" type="checkbox" />
      автозагрузка
    </label>
    <label class="chk">
      <input v-model="s.showCursor" type="checkbox" />
      курсор на снимке
    </label>
    <button type="button" class="ok" :class="{ done: saved }" @click="save">
      {{ saved ? 'Сохранено' : 'Сохранить' }}
    </button>
  </div>
</template>

<style scoped>
.wrap {
  padding: 14px 16px 16px;
  background: var(--bg);
  color: var(--fg);
  font: 12px/1.3 'Segoe UI', system-ui, sans-serif;
}
h1 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
}
.grid {
  display: grid;
  grid-template-columns: 6.6em 1fr;
  gap: 6px 10px;
  align-items: center;
}
label {
  display: block;
  margin: 10px 0 4px;
  color: var(--muted);
}
.grid label {
  margin: 0;
}
.hk,
.browse,
.ok {
  background: var(--panel);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 8px;
  font: inherit;
  cursor: pointer;
}
.hk {
  width: 100%;
  text-align: left;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.hk:hover,
.browse:hover {
  background: var(--panel-2);
  border-color: #4a5088;
}
.hk:focus-visible,
.browse:focus-visible,
.ok:focus-visible,
.chk input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.hk.rec {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 45, 120, 0.1);
  animation: rec 1.1s ease-in-out infinite;
}
@keyframes rec {
  50% {
    box-shadow: 0 0 0 1px var(--accent);
  }
}
.row {
  display: flex;
  gap: 6px;
}
.path {
  flex: 1;
  min-width: 0;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.path.empty {
  color: var(--muted);
}
.browse {
  width: 32px;
  padding: 5px 0;
  flex-shrink: 0;
  text-align: center;
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  color: var(--fg);
  cursor: pointer;
}
.chk input {
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  cursor: pointer;
}
.chk input:checked {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 2px var(--bg);
}
.ok {
  margin-top: 12px;
  width: 100%;
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
  text-align: center;
  letter-spacing: 0.02em;
}
.ok:hover {
  filter: brightness(1.06);
}
.ok.done {
  background: var(--panel-2);
  border-color: var(--line);
  color: var(--fg);
  filter: none;
}
</style>
