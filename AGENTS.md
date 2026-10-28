# RedShot — контекст для агента

Локальная утилита скриншотов для **Windows 10 x64**. Electron + Vue 3, живёт в трее, без окна в панели задач, без бэкенда, облака и аккаунтов. Один экземпляр (`requestSingleInstanceLock`). Спека: `TZ.md` (список инструментов там шире кода — истина в `src/renderer/draw.js` и `README.md`).

## Стек

- JS без TypeScript. Vue только `<script setup>`. Нет Pinia, vue-router, HTTP API, тестов.
- Electron 35, electron-vite 3, Vite 6, `@lucide/vue`, native захват через `koffi` → `user32`/`gdi32`.
- Сборка: `electron-builder` portable x64 (`appId` `com.redshot.app`). CI/стендов нет.

## Запуск

- `npm run dev` — порт **5173**, `strictPort` (занят = падение). Не гонять `pack`/`build` для проверки.
- Настройки: `%APPDATA%\redshot\settings.json`. Лог: `%APPDATA%\redshot\redshot.log`.
- PNG: `%USERPROFILE%\Pictures\RedShot\<YYYY-MM>\redshot-<unix>.png` (`saveDir` меняется в настройках).

## Карта

```
src/main/index.js     окна, трей, хоткеи, IPC copy/save
src/main/capture.js   GDI-захват, DIP vs phys
src/main/store.js     persist настроек
src/main/log.js       лог
src/main/icon.js      иконка трея
src/preload/index.js  window.redshot
src/renderer/         OverlayApp, RingMenu, SettingsApp, toast.html, draw.js, theme.css
```

Три окна, не SPA: overlay (разметка), settings (~420×372), toast (vanilla). Публичный API UI — только `window.redshot`.

## Поток снимка

Хоткей/трей → `startCapture(mode)` → `captureDesktop` → IPC `start` `{ virt, shots, selection, mode }` → оверлей + `draw.js` → copy: PNG в буфер + автосейв + hide + toast; save: диалог, оверлей живёт; Esc: без файла. Пока открыты настройки — хоткеи сняты.

Режимы: `region` / `window` / `screen`. Пока `busy` — второй захват не стартует.

Инструменты в коде: `pencil`, `arrow`, `rect`, `text`, `number`, `blur`, `crop`. Кольцевое меню — зажать ПКМ.

Настройки: `hotkeys.{region,window,screen}`, `saveDir`, `autostart`, `showCursor`.

## Конвенции

- Короткий код, компактный тёмный UI (`theme.css`: фон `#16182e`, акцент `#ff2d78`). Не раздувать оверлей панелями.
- UI и коммиты на русском. Не править SVG path без просьбы. Не вводить TS.
- Windows-only: не «портировать» GDI/koffi.
- Print Screen может перехватывать ножницы Windows — не баг приложения.
