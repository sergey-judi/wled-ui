#!/usr/bin/env node
/**
 * Checks a real lamp against everything this UI relies on.
 * It doesn't change anything on the lamp: no settings, no Wi-Fi/IP, no presets, no files.
 * The only POST is {"v":true}, an empty command that just returns the current state.
 * (Re-sending the current brightness would NOT be safe: in WLED 0.13 a bare "bri" turns a switched-off lamp on.)
 *
 *   npm run probe                 # 4.3.2.1
 *   npm run probe -- 192.168.1.50
 *   npm run probe -- 4.3.2.1 --json   # also dump raw responses to ./probe-output/
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const host = args.find((a) => !a.startsWith('--')) ?? '4.3.2.1'
const dump = args.includes('--json')
const base = `http://${host}`
let failures = 0
const ok = (msg) => console.log(`  \x1b[32m✔\x1b[0m ${msg}`)
const bad = (msg) => (failures++, console.log(`  \x1b[31m✘\x1b[0m ${msg}`))
const note = (msg) => console.log(`  \x1b[33m•\x1b[0m ${msg}`)
const save = (name, data) => {
  if (!dump) return
  mkdirSync('probe-output', { recursive: true })
  writeFileSync(`probe-output/${name}.json`, JSON.stringify(data, null, 2))
}

async function get(path, init) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(base + path, { ...init, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}
const getJson = async (path) => {
  const res = await get(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const hasKeys = (obj, keys) => keys.filter((k) => !(k in obj))

console.log(`\nProbing WLED at ${base}\n`)

// 1. info
let info
console.log('Device info  GET /json/info')
try {
  info = await getJson('/json/info')
  save('info', info)
  const missing = hasKeys(info, ['ver', 'vid', 'leds', 'name', 'ws', 'fxcount', 'palcount', 'fs', 'arch'])
  missing.length ? bad(`missing fields: ${missing.join(', ')}`) : ok('shape matches')
  note(`"${info.name}" · WLED ${info.ver}${info.rel ? ` (${info.rel})` : ''} · build ${info.vid} · ${info.arch}${info.e32model ? ` ${info.e32model}` : ''}`)
  note(`${info.leds.count} LEDs · light caps lc=${info.leds.lc} (RGB=${!!(info.leds.lc & 1)}, white=${!!(info.leds.lc & 2)}, CCT=${!!(info.leds.lc & 4)}) · layout somp=${info.leds.somp ?? 'n/a'} · max segments ${info.leds.maxseg}`)
  note(`${info.fxcount} effects · ${info.palcount} palettes · filesystem ${info.fs.u}/${info.fs.t} kB used`)
  const sr = info.rel !== undefined || info.leds.somp !== undefined
  note(sr ? 'Sound Reactive fork fields present (rel/somp/audio*)' : 'Looks like upstream WLED (no SR fields)')
  if (info.audioType) note(`audio: ${info.audioType} · ${info.audioStatus ?? ''}`)
  if (!/^0\.13\./.test(info.ver)) note(`firmware is ${info.ver}, not 0.13.x. The UI should still work, but it was built against 0.13.4.`)
} catch (e) {
  bad(`cannot reach ${base}: ${e.message}`)
  console.log('\nIs this computer connected to the lamp\'s Wi-Fi? Is the address right?\n')
  process.exit(1)
}

// 2. state
console.log('\nState  GET /json/state')
let state
try {
  state = await getJson('/json/state')
  save('state', state)
  const missing = hasKeys(state, ['on', 'bri', 'transition', 'ps', 'nl', 'mainseg', 'seg'])
  missing.length ? bad(`missing fields: ${missing.join(', ')}`) : ok('shape matches')
  const s0 = state.seg?.[0]
  if (s0) {
    const segMissing = hasKeys(s0, ['id', 'start', 'stop', 'on', 'bri', 'col', 'fx', 'sx', 'ix', 'pal', 'sel'])
    segMissing.length ? bad(`segment missing: ${segMissing.join(', ')}`) : ok(`${state.seg.length} segment(s); segment 0 shape matches`)
    note(`on=${state.on} bri=${state.bri} fx=${s0.fx} pal=${s0.pal} col=${JSON.stringify(s0.col)}${'c1x' in s0 ? ' · SR custom sliders c1x–c3x present' : ''}`)
  }
  if ('inputLevel' in state) note(`SR inputLevel (sound sensitivity) = ${state.inputLevel}`)
} catch (e) {
  bad(e.message)
}

// 3. names
console.log('\nEffects & palettes  GET /json/eff, /json/pal, /json/palx')
try {
  const eff = await getJson('/json/eff')
  save('effects', eff)
  const withMeta = eff.filter((n) => n.includes('@')).length
  ok(`${eff.length} effect names${eff.length === info.fxcount ? '' : ` (info says ${info.fxcount}!)`}`)
  note(withMeta ? `${withMeta} names carry "@" slider metadata (SR format), e.g. ${JSON.stringify(eff[1])}` : 'no "@" metadata: the UI falls back to speed/intensity sliders')
  const pal = await getJson('/json/pal')
  save('palettes', pal)
  ok(`${pal.length} palette names`)
  const px = await getJson('/json/palx?page=0')
  save('palx-0', px)
  'm' in px && 'p' in px ? ok(`palette colour data: ${px.m + 1} pages, ${Object.keys(px.p).length} per page`) : bad('unexpected /json/palx shape')
} catch (e) {
  bad(e.message)
}

// 4. presets
console.log('\nPresets  GET /presets.json')
try {
  const res = await get('/presets.json')
  if (res.status === 404) note('no presets.json yet (no presets saved)')
  else {
    const p = await res.json()
    save('presets', p)
    const ids = Object.keys(p).filter((k) => k !== '0')
    ok(`${ids.length} preset(s): ${ids.slice(0, 8).map((id) => `#${id} ${p[id].n ?? ''}`).join(', ')}${ids.length > 8 ? '…' : ''}`)
  }
} catch (e) {
  bad(e.message)
}

// 5. CORS
console.log('\nCORS  OPTIONS /json/state (as a browser preflight)')
try {
  const res = await get('/json/state', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  })
  const acao = res.headers.get('access-control-allow-origin')
  res.ok && acao === '*' ? ok(`preflight ${res.status}, Access-Control-Allow-Origin: ${acao}, Allow-Headers: ${res.headers.get('access-control-allow-headers')}`) : bad(`preflight ${res.status}, ACAO=${acao}`)
  const pna = res.headers.get('access-control-allow-private-network')
  note(`Access-Control-Allow-Private-Network: ${pna ?? 'not sent'} (matters only for Chrome Local Network Access from public sites)`)
} catch (e) {
  bad(e.message)
}

// 6. no-op write
console.log('\nWrite path  POST /json/state {"v": true}  (empty command, changes nothing)')
try {
  const res = await get('/json/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: true }) })
  const body = await res.json()
  res.ok && Array.isArray(body.seg) ? ok('lamp accepts JSON commands and returns full state ("v": true works)') : bad(`unexpected reply ${res.status}: ${JSON.stringify(body).slice(0, 120)}`)
} catch (e) {
  bad(e.message)
}

// 7. WebSocket
console.log('\nWebSocket  ws://' + host + '/ws')
if (info.ws < 0) note('firmware reports WebSockets disabled (info.ws = -1): the UI will use HTTP polling')
else
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}/ws`)
    let gotState = false
    const timer = setTimeout(() => (bad('no WebSocket messages within 4 s'), ws.close(), resolve()), 4000)
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      if (!gotState && ev.data.startsWith('{')) {
        const m = JSON.parse(ev.data)
        m.state && m.info ? ok('connected; lamp pushed {state, info} on connect') : bad('unexpected first message')
        gotState = true
        ws.send('p')
      } else if (ev.data === 'pong') {
        ok('heartbeat "p" → "pong" works')
        clearTimeout(timer)
        ws.close()
        resolve()
      }
    }
    ws.onerror = () => (clearTimeout(timer), bad('WebSocket connection failed'), resolve())
  })

// 8. hosted UI
console.log('\nHosted UI  GET /ui.htm')
try {
  const res = await get('/ui.htm')
  res.ok ? ok(`custom UI is installed on the lamp: ${base}/ui.htm`) : note('not installed (see npm run upload:lamp)')
} catch (e) {
  note(e.message)
}

console.log(failures ? `\n\x1b[31m${failures} check(s) failed\x1b[0m\n` : '\n\x1b[32mAll checks passed. The lamp matches what the UI expects.\x1b[0m\n')
process.exit(failures ? 1 : 0)
