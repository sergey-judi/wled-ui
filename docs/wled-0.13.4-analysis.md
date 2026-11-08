# WLED 0.13.4 analysis: API, existing UI, network constraints

Source analysed: **`atuline/WLED` tag `v0.13.4`** (WLED Sound Reactive, "WLED-SR", `VERSION 2309021`),
compared against **`wled/WLED` tag `v0.13.3`**.

## 0. Which firmware is "0.13.4"?

The upstream repository `wled/WLED` has **no 0.13.4 release**. 0.13.x ends at `v0.13.3` (Aug 2022), then `v0.14.0`.
The Sound Reactive fork (`atuline/WLED`) does have `v0.13.4`. The lamp's SSID ends in "sound" and its version
is 0.13.4, so this analysis assumes the lamp runs WLED-SR 0.13.4. **`npm run probe` confirms it on the real
device**: SR builds report `info.rel`, `info.leds.somp` and `audio*` fields, and their effect names contain `@` metadata.

Differences that matter for a UI:

| Topic | Upstream 0.13.3 | WLED-SR 0.13.4 (this lamp, presumably) | Latest docs (0.14/0.15) |
|---|---|---|---|
| Effect names | plain (`"Blink"`) | with metadata (`"Blink@!,;!,!,;!"`) | plain + separate `/json/fxdata` |
| Extra effect sliders | – | `c1x`, `c2x`, `c3x` | `c1`, `c2`, `c3`, `o1`–`o3` |
| Effect count | 118 | 195 (incl. ♪/♫ audio and 2D/3D effects) | 180+ |
| Sound sensitivity | – | `state.inputLevel` (0–255) | `AudioReactive` usermod object |
| 2D | – | `info.leds.somp`, `rev2D`, `rot2D` | `info.leds.matrix`, segment `startY/stopY` |
| `/json/fxdata` | ✗ | ✗ | ✓ |

So the current WLED docs do **not** describe this device accurately. Do not use `c1/c2/c3`, `fxdata`, `seg.set`,
`seg.o1..o3` or `seg.m12`. They don't exist in 0.13.x.

## 1. HTTP API (verified in source)

All routes are in `wled00/wled_server.cpp` and `wled00/json.cpp`.

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /json` | state + info + effect names + palette names | One call to bootstrap the UI |
| `GET /json/state` | current state | |
| `GET /json/info` | device info & capabilities | |
| `GET /json/si` | `{state, info}` | What the stock UI polls |
| `GET /json/eff` (`/json/effects`) | effect names (array index = effect id) | SR: names carry metadata |
| `GET /json/pal` (`/json/palettes`) | palette names (index = id) | |
| `GET /json/palx?page=N` | palette colour stops for previews | 8 per page on ESP32 (5 on ESP8266); `m` = last page |
| `GET /json/nodes` | other WLED devices discovered via UDP | |
| `GET /json/cfg` | `cfg.json` (full configuration) | Read-only use here |
| `POST /json`, `/json/state`, `/json/si` | apply a (partial) state | `Content-Type: application/json` **required**. With `"v":true` the reply is the new state, otherwise `{"success":true}` |
| `POST /json/cfg` | change configuration | Not used by the UI (risky, can disconnect the lamp) |
| `GET /presets.json` | all presets (file on flash) | 404 when none saved |
| `GET /<file>` | any file stored on flash | `handleFileRead()`; paths containing "sec" are refused |
| `POST /upload` | upload a file to flash (multipart, field `data`) | Blocked if "OTA lock" is enabled |
| `GET /edit` | file manager | Same lock |
| `GET /win&…` | legacy HTTP API | Deprecated; don't use |
| `GET /settings…` | built-in config pages (HTML) | Linked from Settings |
| `GET /reset` | reboot | Not used |
| `WS /ws` | WebSocket, see §3 | |

### State object (`serializeState`)

```jsonc
{
  "on": true, "bri": 128,            // bri = last non-zero brightness, even when off
  "transition": 7,                   // ×100 ms
  "ps": -1, "pl": -1,                // current preset / playlist
  "nl": { "on": false, "dur": 60, "mode": 1, "tbri": 0, "rem": -1 },   // nightlight
  "udpn": { "send": false, "recv": true }, "lor": 0,
  "mainseg": 0,
  "inputLevel": 128,                 // SR only
  "seg": [{
    "id": 0, "start": 0, "stop": 60, "len": 60, "grp": 1, "spc": 0, "of": 0,
    "on": true, "frz": false, "bri": 255, "cct": 127, "n": "optional name",
    "col": [[255,160,0],[0,0,0],[0,0,0]],      // [r,g,b] or [r,g,b,w] when the bus is RGBW
    "fx": 0, "sx": 128, "ix": 128, "c1x": 128, "c2x": 128, "c3x": 128,   // c*x: SR only
    "pal": 0, "sel": true, "rev": false, "mi": false, "rev2D": false, "rot2D": false
  }]
}
```

### Writable keys (`deserializeState` / `deserializeSegment`)

* Top level: `on` (bool or `"t"` toggle), `bri`, `transition`, `tt` (one-shot transition), `nl{on,dur,mode,tbri}`,
  `ps` (load preset), `psave` + `n` + `ib` + `sb` (save preset), `pdel`, `playlist`, `mainseg`, `inputLevel` (SR),
  `rb` (reboot), `live`, `lor`, `time`, `v`.
* Segment (`seg` as an object or an array): `id`, `start`, `stop`/`len`, `grp`, `spc`, `of`, `on`, `bri`, `cct`
  (0–255 or Kelvin 1900–10091), `n`, `col`, `fx`, `sx`, `ix`, `c1x`–`c3x`, `pal`, `sel`, `rev`, `mi`, `frz`, `i`
  (individual LEDs), `rpt`, `reset` (SR).
* `seg` **without `id`** applies to **all selected** segments (or the main segment if none are selected).
* `col` slots accept `[r,g,b(,w)]`, `"RRGGBB"` hex, a **number = Kelvin**, or `[]` to leave the slot unchanged.
* `{"seg":{"id":N,"stop":0}}` deletes a segment. Setting `start`/`stop` on an unused id creates one.
* `fx`, `sx`, `ix`, `pal` also accept `"r"` (random) and `"~"`/`"~-"` (increment/decrement).

### Info object (`serializeInfo`), the fields the UI uses

`ver`, `rel` (SR), `vid`, `name`, `arch`, `leds{count, fps, pwr, maxpwr, maxseg, lc, seglc[], rgbw, somp(SR)}`,
`ws` (WS client count, `-1` = WebSockets compiled out), `fxcount`, `palcount`, `fs{u,t,pmt}`, `wifi{rssi,signal,channel}`,
`freeheap`, `uptime`, `mac`, `ip` (empty in AP mode), SR: `audioType`, `audioStatus`, `audioGain`, `soundAgc`, `e32model`….

* **Light capabilities** `lc`/`seglc`: bit 0 RGB, bit 1 white channel, bit 2 CCT. The UI shows the white and CCT sliders only when present.
* `fs.pmt` changes whenever `presets.json` is written. The UI uses it to reload presets.

### Effect metadata (SR only)

`"Name@<sliders>;<colors>;<palette>"`, parsed in `src/api/effects.ts`, mirroring `setEffectParameters()` in the stock UI:

* sliders → `sx, ix, c1x, c2x, c3x`; `""` hidden, `"!"` default label, `"Label=96"` default value.
* colors → slots 0–2; same rules.
* palette → `"!"`/label shown (optional `=N` default palette), a bare number = forced palette (hidden), empty = no palette.
* No `@` → speed + intensity (ids < 128) or all 5 sliders (ids ≥ 128), all colours, palette shown.
* `♪` = volume-reactive, `♫` = frequency-reactive. `Reserved…` entries are unused slots.

## 2. Existing UI (`wled00/data/index.js`)

* Bootstraps with `GET /json`, then loads palette previews (`/json/palx` pages), then `presets.json`, then opens the WebSocket.
* Sends every change as a JSON patch with `"v":true`. It uses the WebSocket when open (and the payload is ≤ 1000 bytes),
  otherwise `POST /json/si`.
* Applies defaults embedded in effect metadata when you pick an effect.
* Has a "remote" mode (`http://${locip}/json/…`) that controls a lamp from a UI hosted elsewhere, so cross-origin control is intended.
* The App Store "WLED" app, as far as I know, discovers lamps and shows this same device-hosted web UI in a web view,
  rather than being a separate API client. This isn't verifiable from the firmware repository. One consequence: uploading
  the custom UI as `/index.htm` would likely make the app show it too.

Redesigned here: navigation (6 tabs instead of a dense single page), effect browsing (search, sound/2D filters, labelled
sliders), presets (cards, save/delete), segments (cards with inline editing), and a lamp-coloured, responsive look.
Left to the stock settings pages: Wi-Fi, LED hardware, sound input, sync, time, usermods, OTA.

## 3. WebSocket `/ws` (`wled00/ws.cpp`)

* On connect the lamp sends `{"state":…,"info":…}`. After any state change, from any source, it broadcasts the same to all
  clients (rate-limited by `INTERFACE_UPDATE_COOLDOWN` = 2 s).
* Client → lamp: any state patch (same format as HTTP); `{"v":true}` requests a state push; `"p"` → `"pong"` heartbeat;
  `{"lv":true}` starts binary live-view frames (40 ms) to that one client.
* Live-view frame (SR): `'L', 1, layout, width, height, depth, preset, playlist, R,G,B,…`. Upstream 0.13 uses a 2-byte header.
* Fragmented frames are rejected (`{"error":9}`). The stock UI sends patches > 1000 bytes over HTTP instead.
* On low memory the lamp closes all sockets with code 1013. Clients must reconnect.

**Use for real-time control:** WebSocket for commands and state push; HTTP for bootstrap, palettes and presets, plus polling as a fallback.

### Concurrency caveat

Each JSON request takes a global JSON buffer lock (`requestJSONBufferLock`). If the lock is busy, the HTTP handler
**returns without sending a response**, and the request hangs until the client times out. The UI therefore serialises HTTP
calls, coalesces slider updates (latest value wins) and paces WebSocket sends (≥ 40 ms).

## 4. Network architecture

| Path | Works? | Why |
|---|---|---|
| Page served **by the lamp** (`http://4.3.2.1/ui.htm`) | ✅ best | Same origin, plain HTTP, no internet needed, works on phones. The captive portal points to 4.3.2.1 too |
| Page from **`http://localhost`** (dev server) on a computer joined to the lamp Wi-Fi | ✅ | localhost is http, so there's no mixed content; the lamp sends `Access-Control-Allow-Origin: *` and answers preflights |
| Page on **Vercel/Render (HTTPS)**, lamp on **home Wi-Fi** | ✅ Chrome/Edge · ❌ Safari/iOS | Chrome's Local Network Access exempts requests to private IP literals and `.local` names from mixed-content blocking once the user grants the "local network" permission (HTTP since Chrome 142, WebSockets since ~147). No headers needed on the lamp. Safari/WebKit has no such exemption |
| Page on **Vercel/Render (HTTPS)**, lamp's **own Wi-Fi** | ❌ | No internet to load the page, and 4.3.2.1 is a public address, so the exemption doesn't apply |
| Page on a plain-HTTP host on the internet | ⚠️ | No mixed content, but still needs internet while you're on the lamp AP |

CORS: `DefaultHeaders` add `Access-Control-Allow-Origin/Methods/Headers: *` to every response, and `OPTIONS` returns 200
with `Access-Control-Max-Age: 7200`. JSON POSTs need `Content-Type: application/json`, which triggers a preflight; it's cached.

Note: 4.3.2.1 is technically a public IPv4 address that WLED borrows for its AP, so browsers classify it as "public", not "local".

**Hosted-build test (2026-11-08):** Chrome 156, page served over HTTPS and forced to count as a public site
(`--ip-address-space-overrides`), mock lamp at a private IP. With the local-network permission granted, `fetch` and `ws://`
both connected and commands worked. Without it, Chrome blocked the request ("Permission was denied for this request to access
the `local` address space"). Not yet tried with a real Vercel deployment and the real lamp.

**Hosting the UI on the lamp** (no firmware change): `handleFileRead()` serves any file in flash. `serveIndex()` prefers
`/index.htm` over the built-in UI. The firmware sends `.js` as `text/plain` and doesn't serve `.gz` transparently,
so the build must be one self-contained HTML file. `vite build --mode lamp` produces it (~320 kB; the lamp's FS is ~960 kB on the default 4 MB layout).

### Future backend / persistence

A cloud backend (e.g. PostgreSQL behind an HTTPS API) can **never talk to the lamp directly**: the lamp lives on a private AP.
Lamp control must stay in the browser. Persistence (favourites, custom presets, UI settings) would be a separate API module
next to `src/api/`, called from the store. It only works when the device has internet access, which it doesn't while joined
to the lamp's AP. Plan for local-first storage with later sync.

## 5. Verified vs assumed

| Item | Status |
|---|---|
| Endpoints, payload shapes, WS protocol, CORS, file serving, metadata format | Verified in the SR 0.13.4 source |
| The lamp actually runs WLED-SR 0.13.4 (vs a vendor build) | **Assumed**; run `npm run probe` |
| LED type (RGB/RGBW/CCT), LED count, strip vs matrix, segment count | **Unknown**; the UI reads `info.leds` at runtime |
| WebSockets enabled in the vendor build | **Assumed** (default on); the UI falls back to polling if `info.ws = -1` |
| Presets on the lamp | **Unknown**; loaded at runtime |
| OTA lock disabled (needed for `/upload`) | **Assumed** (default); the upload script reports a lock |
| UI behaviour | Verified with unit tests and a headless-browser E2E run against `scripts/mock-wled.mjs` (a mock, not the lamp) |
