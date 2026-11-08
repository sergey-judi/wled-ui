#!/usr/bin/env node
/**
 * Minimal stand-in for a WLED Sound Reactive 0.13.4 lamp, for UI development only.
 * It copies the firmware's routes, CORS headers, response shapes, WebSocket push and
 * live-view frames, using the real SR effect/palette name lists. It does NOT render
 * real effects, and the firmware's edge cases are only roughly modelled.
 * Always confirm behaviour on the real lamp (npm run probe).
 *
 *   node scripts/mock-wled.mjs            # http://localhost:8080
 *   PORT=9000 LEDS=64 MATRIX=8x8 node scripts/mock-wled.mjs
 */
import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT ?? 8080)
const LEDS = Number(process.env.LEDS ?? 60)
const [MW, MH] = (process.env.MATRIX ?? '').split('x').map(Number)
const LATENCY = Number(process.env.LATENCY ?? 25)
const names = JSON.parse(readFileSync(new URL('./fixtures/sr-0.13.4-names.json', import.meta.url), 'utf8'))

const seg = (id, start, stop, extra = {}) => ({
  id, start, stop, len: stop - start, grp: 1, spc: 0, of: 0, on: true, frz: false, bri: 255, cct: 127,
  col: [[255, 160, 0], [0, 0, 0], [0, 0, 0]], fx: 0, sx: 128, ix: 128, c1x: 128, c2x: 128, c3x: 128,
  pal: 0, sel: id === 0, rev: false, rev2D: false, mi: false, rot2D: false, ...extra,
})

let state = {
  on: true, bri: 128, inputLevel: 128, transition: 7, ps: -1, pl: -1,
  nl: { on: false, dur: 60, mode: 1, tbri: 0, rem: -1 },
  udpn: { send: false, recv: true }, lor: 0, mainseg: 0,
  seg: [seg(0, 0, LEDS)],
}
let pmt = 1
let presets = {
  0: {},
  1: { n: 'Cozy evening', on: true, bri: 110, seg: [{ id: 0, fx: 0, col: [[255, 120, 30], [0, 0, 0], [0, 0, 0]] }] },
  2: { n: 'Party', ql: '🎉', on: true, bri: 200, seg: [{ id: 0, fx: 9, sx: 200, pal: 11 }] },
  3: { n: 'Ocean', on: true, seg: [{ id: 0, fx: 110, pal: 9 }] },
  4: { n: 'Rotation', playlist: { ps: [1, 2, 3], dur: [300, 300, 300], transition: [7, 7, 7], repeat: 0 } },
}
const startedAt = Date.now()

const info = () => ({
  ver: '0.13.4', rel: 'mock_soundReactive_esp32', vid: 2309021,
  leds: { count: LEDS, pwr: state.on ? Math.round(LEDS * 6 * (state.bri / 255)) : 0, fps: 42, maxpwr: 850, maxseg: 32,
    seglc: state.seg.map(() => 1), somp: MW ? 1 : 0, lc: 1, rgbw: false, wv: 0, cct: 0 },
  str: false, name: 'Mock WLED Lamp', udpport: 21324, live: false, liveseg: -1, lm: '', lip: '',
  ws: wss ? wss.clients.size : -1, fxcount: names.effects.length, palcount: names.palettes.length,
  wifi: { bssid: '', rssi: 0, signal: 0, channel: 1 }, fs: { u: 18, t: 983, pmt },
  ndc: 0, arch: 'esp32', core: 'v3.3.6', lwip: 0, freeheap: 152000, totalheap: 290000, minfreeheap: 120000,
  audioType: 'I2S digital', audioStatus: 'receiving', audioGain: '1.00', ssyncMode: 'off', ssyncStatus: '', soundAgc: 1,
  e32model: 'ESP32-D0WD-V3 rev.3', e32cores: 2, e32speed: 240, e32flash: 4,
  uptime: Math.floor((Date.now() - startedAt) / 1000), opt: 79, brand: 'WLED', product: 'FOSS', mac: 'aabbccddeeff', ip: '',
})

// ---------- state handling (simplified json.cpp deserializeState) ----------
function kelvinToRgb(k) {
  const t = k / 100
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)))
  if (t <= 66) return [255, c(99.47 * Math.log(t) - 161.12), t <= 19 ? 0 : c(138.52 * Math.log(t - 10) - 305.04)]
  return [c(329.7 * Math.pow(t - 60, -0.1332)), c(288.12 * Math.pow(t - 60, -0.0755)), 255]
}

function applySeg(p, fallbackId) {
  const id = p.id ?? fallbackId
  let s = state.seg.find((x) => x.id === id)
  if (!s) {
    if (p.stop === undefined || p.stop === 0) return
    s = seg(id, p.start ?? 0, p.stop, { sel: false })
    state.seg.push(s)
    state.seg.sort((a, b) => a.id - b.id)
  }
  if (p.stop === 0) {
    state.seg = state.seg.filter((x) => x.id !== id)
    return
  }
  for (const k of ['start', 'stop', 'grp', 'spc', 'of', 'on', 'frz', 'cct', 'n', 'sx', 'ix', 'c1x', 'c2x', 'c3x', 'sel', 'rev', 'mi', 'rev2D', 'rot2D']) {
    if (p[k] !== undefined) s[k] = p[k]
  }
  if (p.bri !== undefined) {
    if (p.bri > 0) s.bri = p.bri
    s.on = p.bri > 0
  }
  if (p.fx !== undefined && p.fx < names.effects.length) s.fx = p.fx
  if (p.pal !== undefined && p.pal < names.palettes.length) s.pal = p.pal
  if (p.cct > 255) s.cct = Math.min(255, Math.max(0, (p.cct - 1900) >> 5))
  p.col?.forEach((c, i) => {
    if (i > 2) return
    if (Array.isArray(c)) { if (c.length) s.col[i] = c.slice(0, 3) }
    else if (typeof c === 'number') s.col[i] = c === 0 ? [0, 0, 0] : kelvinToRgb(c)
    else if (typeof c === 'string' && /^[0-9a-f]{6}/i.test(c)) { const n = parseInt(c.slice(0, 6), 16); s.col[i] = [n >> 16, (n >> 8) & 255, n & 255] }
  })
  s.len = s.stop - s.start
}

function deserializeState(root, fromPreset = false) {
  if (typeof root.bri === 'number' && root.bri >= 0) { if (root.bri > 0) state.bri = root.bri; else state.on = false }
  if (root.on === 't') state.on = !state.on
  else if (typeof root.on === 'boolean') state.on = root.on
  else if (root.bri > 0) state.on = true
  if (root.transition >= 0) state.transition = root.transition
  if (root.inputLevel >= 0) state.inputLevel = root.inputLevel
  if (root.nl) Object.assign(state.nl, root.nl)
  state.nl.rem = state.nl.on ? state.nl.dur * 60 : -1
  if (root.seg) {
    if (Array.isArray(root.seg)) root.seg.forEach((p, i) => applySeg(p, i))
    else if (root.seg.id !== undefined) applySeg(root.seg)
    else {
      const sel = state.seg.filter((s) => s.sel)
      ;(sel.length ? sel : [state.seg[0]]).forEach((s) => applySeg(root.seg, s.id))
    }
  }
  if (!fromPreset) state.ps = root.ps ?? (root.seg || root.bri !== undefined || root.on !== undefined ? -1 : state.ps)
  if (root.psave > 0) {
    const snap = structuredClone({ on: state.on, bri: state.bri, transition: state.transition, mainseg: state.mainseg, seg: state.seg })
    presets[root.psave] = { n: root.n ?? `Preset ${root.psave}`, ...snap }
    state.ps = root.psave
    pmt++
  } else if (root.pdel > 0) {
    delete presets[root.pdel]
    pmt++
  } else if (root.ps > 0 && presets[root.ps]) {
    const p = presets[root.ps]
    if (p.playlist) { state.pl = root.ps; deserializeState(presets[p.playlist.ps[0]] ?? {}, true) }
    else { state.pl = -1; deserializeState(p, true) }
    state.ps = root.ps
  }
  const firstSel = state.seg.find((s) => s.sel)
  state.mainseg = firstSel ? firstSel.id : (state.seg[0]?.id ?? 0)
  return !!root.v
}

// ---------- palettes (/json/palx) ----------
function palx(page) {
  const per = 8
  const count = names.palettes.length
  const max = Math.floor((count - 1) / per)
  page = Math.min(page, max)
  const p = {}
  for (let i = page * per; i < Math.min(count, page * per + per); i++) {
    if (i === 1) p[i] = ['r', 'r', 'r', 'r']
    else if (i === 2) p[i] = ['c1']
    else if (i === 3) p[i] = ['c1', 'c1', 'c2', 'c2']
    else if (i === 4) p[i] = ['c3', 'c2', 'c1']
    else if (i === 5) p[i] = ['c1', 'c1', 'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c2', 'c2', 'c3', 'c3', 'c3', 'c3', 'c3', 'c1']
    else {
      // Deterministic fake gradient. Real data comes from the lamp's palettes.h.
      const h = (n) => (Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1
      p[i] = [0, 85, 170, 255].map((pos, k) => [pos, ...[0, 1, 2].map((ch) => Math.floor(Math.abs(h(k * 3 + ch)) * 255))])
    }
  }
  return { m: max, p }
}

// ---------- HTTP ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' }
const json = (res, body, code = 200) => {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  setTimeout(() => {
    if (req.method === 'OPTIONS') { res.writeHead(200, { ...CORS, 'Access-Control-Max-Age': '7200' }); return res.end() }
    if (req.method === 'POST' && path.startsWith('/json')) {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(res, 'Not found', 404) // AsyncJson handler requires it
        let root
        try { root = JSON.parse(body) } catch { return json(res, { error: 9 }, 400) }
        const verbose = deserializeState(root)
        scheduleBroadcast()
        if (!verbose) return json(res, { success: true })
        if (path.includes('si')) return json(res, { state, info: info() })
        if (path === '/json') return json(res, { state, info: info(), effects: names.effects, palettes: names.palettes })
        return json(res, state)
      })
      return
    }
    if (req.method === 'POST' && path === '/upload') {
      // Accepts the upload but doesn't store it (the mock always serves dist-lamp).
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const name = /filename="([^"]+)"/.exec(body)?.[1]
        res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain' })
        res.end(name ? 'File Uploaded!' : 'No file')
        console.log(`upload: ${name} (${body.length} bytes)`)
      })
      return
    }
    if (req.method !== 'GET') return json(res, 'Not found', 404)
    switch (true) {
      case path === '/json': return json(res, { state, info: info(), effects: names.effects, palettes: names.palettes })
      case path.startsWith('/json/state'): return json(res, state)
      case path.startsWith('/json/info'): return json(res, info())
      case path.startsWith('/json/si'): return json(res, { state, info: info() })
      case path.startsWith('/json/palx'): return json(res, palx(Number(url.searchParams.get('page') ?? 0)))
      case path.startsWith('/json/eff'): return json(res, names.effects)
      case path.startsWith('/json/pal'): return json(res, names.palettes)
      case path.startsWith('/json/'): return json(res, { error: 'Not implemented' }, 501)
      case path === '/presets.json': return json(res, presets)
      // Like the firmware's handleFileRead(): files uploaded to flash are served by path.
      case path === '/ui.htm' || path === '/index.htm': {
        const f = new URL('../dist-lamp/index.html', import.meta.url)
        if (!existsSync(f)) { res.writeHead(404, CORS); return res.end('run npm run build:lamp first') }
        res.writeHead(200, { ...CORS, 'Content-Type': 'text/html' })
        return res.end(readFileSync(f))
      }
      case path === '/version': res.writeHead(200, CORS); return res.end('2309021')
      default:
        res.writeHead(404, { ...CORS, 'Content-Type': 'text/html' })
        res.end('<h1>404 (mock WLED)</h1>')
    }
  }, LATENCY)
})

// ---------- WebSocket (/ws) ----------
const wss = new WebSocketServer({ server, path: '/ws' })
let liveClient = null
let broadcastTimer = null
const payload = () => JSON.stringify({ state, info: info() })
function scheduleBroadcast() {
  clearTimeout(broadcastTimer)
  broadcastTimer = setTimeout(() => wss.clients.forEach((c) => c.readyState === 1 && c.send(payload())), 120)
}

wss.on('connection', (ws) => {
  ws.send(payload())
  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    const text = data.toString()
    if (text.length < 10 && text[0] === 'p') return ws.send('pong')
    let root
    try { root = JSON.parse(text) } catch { return }
    if (root.v && Object.keys(root).length === 1) return ws.send(payload())
    if ('lv' in root) { liveClient = root.lv ? ws : null; return }
    deserializeState(root)
    scheduleBroadcast()
  })
  ws.on('close', () => { if (liveClient === ws) liveClient = null; scheduleBroadcast() })
})

// Live view frames, SR format: 'L', ver, layout, width, height, depth, preset, playlist, RGB…
setInterval(() => {
  if (!liveClient || liveClient.readyState !== 1) return
  const buf = Buffer.alloc(8 + LEDS * 3)
  buf.write('L', 0)
  buf[1] = 1; buf[2] = MW ? 1 : 0; buf[3] = MW || LEDS; buf[4] = MH || 1; buf[5] = 1
  buf[6] = Math.max(0, state.ps); buf[7] = Math.max(0, state.pl)
  const t = Date.now() / 1000
  for (const s of state.seg) {
    for (let i = s.start; i < s.stop && i < LEDS; i++) {
      const k = state.on && s.on ? (state.bri / 255) * (s.bri / 255) : 0
      let rgb = s.col[0]
      if (s.fx !== 0) {
        const phase = (i / LEDS + t * (s.sx / 255)) % 1
        const a = s.col[0], b = s.col[1].some((v) => v) ? s.col[1] : [0, 0, 255]
        const m = (Math.sin(phase * Math.PI * 2) + 1) / 2
        rgb = a.map((v, ch) => v * m + b[ch] * (1 - m))
      }
      for (let ch = 0; ch < 3; ch++) buf[8 + i * 3 + ch] = Math.round(rgb[ch] * k)
    }
  }
  liveClient.send(buf)
}, 40)

server.listen(PORT, () => {
  console.log(`Mock WLED-SR 0.13.4 on http://localhost:${PORT}  (ws://localhost:${PORT}/ws, ${LEDS} LEDs${MW ? `, ${MW}x${MH} matrix` : ''})`)
  console.log(`Open the UI with  http://localhost:5173/?host=localhost:${PORT}`)
})
