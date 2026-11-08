#!/usr/bin/env node
/**
 * Upload the single-file lamp build to the lamp's flash filesystem.
 * The firmware is NOT touched: WLED serves files it finds in its filesystem.
 *
 *   npm run build:lamp
 *   npm run upload:lamp                    # → http://4.3.2.1/ui.htm  (stock UI stays at /)
 *   npm run upload:lamp -- 4.3.2.1 --as-index   # → replaces the UI served at http://4.3.2.1/
 *
 * Undo: open http://<lamp>/edit and delete /ui.htm (or /index.htm).
 * Uses WLED's POST /upload endpoint (the one behind "Restore presets"). Fails if
 * "OTA lock" is enabled in the lamp's security settings.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'

const args = process.argv.slice(2)
const host = args.find((a) => !a.startsWith('--')) ?? '4.3.2.1'
const asIndex = args.includes('--as-index')
const target = asIndex ? '/index.htm' : '/ui.htm'
const file = new URL('../dist-lamp/index.html', import.meta.url)

if (!existsSync(file)) {
  console.error('dist-lamp/index.html not found. Run `npm run build:lamp` first.')
  process.exit(1)
}
const sizeKb = Math.ceil(statSync(file).size / 1000)

const info = await fetch(`http://${host}/json/info`).then((r) => r.json()).catch((e) => {
  console.error(`Cannot reach http://${host}: ${e.message}`)
  process.exit(1)
})
const freeKb = info.fs.t - info.fs.u
console.log(`Lamp "${info.name}" (WLED ${info.ver}) · filesystem ${info.fs.u}/${info.fs.t} kB used · upload ${sizeKb} kB`)
if (sizeKb > freeKb - 20) {
  console.error(`Not enough free space (${freeKb} kB free). Nothing uploaded.`)
  process.exit(1)
}

const form = new FormData()
form.append('data', new Blob([readFileSync(file)], { type: 'text/html' }), target)
const res = await fetch(`http://${host}/upload`, { method: 'POST', body: form })
const text = await res.text()
if (!res.ok) {
  console.error(`Upload failed (HTTP ${res.status}): ${text}`)
  process.exit(1)
}
console.log(`${text.trim()}  →  http://${host}${asIndex ? '/' : target}`)
