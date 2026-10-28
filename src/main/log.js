import { app, shell } from 'electron'
import { appendFile, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

function file() {
  try {
    return join(app.getPath('userData'), 'redshot.log')
  } catch {
    return join(tmpdir(), 'redshot.log')
  }
}

function line(level, msg, err) {
  const extra = err ? `\n${err.stack || err}` : ''
  return `${new Date().toISOString()} [${level}] ${msg}${extra}\n`
}

export function logPath() {
  return file()
}

export function log(level, msg, err) {
  const text = line(level, msg, err)
  try {
    console.error(text.trimEnd())
    const p = file()
    mkdirSync(dirname(p), { recursive: true })
    appendFile(p, text, () => {})
  } catch (e) {
    console.error('log write failed', e)
  }
}

export const error = (msg, err) => log('ERROR', msg, err)
export const info = (msg) => log('INFO', msg)

export function hookProcess() {
  process.on('uncaughtException', (e) => error('uncaughtException', e))
  process.on('unhandledRejection', (e) => error('unhandledRejection', e))
}

export function openLog() {
  return shell.openPath(file())
}

hookProcess()
