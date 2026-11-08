# wled-ui

A modern, responsive web UI for a WLED lamp running **WLED 0.13.4**, most likely the Sound Reactive fork. It runs entirely in
the browser and talks straight to the lamp's JSON API and WebSocket. There's no backend and no firmware change.

Features: power and brightness, a colour picker with RGB/hex input, white and CCT sliders (only when the LEDs support them),
quick colours, 195 effects with labelled sliders read from the firmware's metadata, palette previews, sound-reactive and 2D
filters, sound sensitivity, presets (activate/save/delete), segments (select/toggle/brightness/range/reverse/mirror/add/delete),
nightlight, transition time, live LED preview, device info and connection monitoring.

Firmware findings, the API reference and the network analysis are in **[docs/wled-0.13.4-analysis.md](docs/wled-0.13.4-analysis.md)**.

## Quick start (computer joined to the lamp Wi-Fi)

```bash
npm install
npm run dev          # http://localhost:5173  → talks to http://4.3.2.1
```

1. Join the lamp's Wi-Fi (`[LF.UA] sound`). Your computer gets a 4.3.2.x address.
2. Open http://localhost:5173.
3. To test from your phone on the same lamp Wi-Fi: Vite prints a `Network:` URL (e.g. `http://4.3.2.5:5173`).
   Open it on the phone. It still targets the lamp at 4.3.2.1 by default.

### Lamp Wi-Fi vs home Wi-Fi

| You're connected to | Lamp address comes from | Commands |
|---|---|---|
| The lamp's own Wi-Fi | `.env` → `4.3.2.1` | `npm run dev` · `npm run serve` · `npm run build` |
| Your home Wi-Fi | `.env.home` → set `VITE_WLED_HOST` to the lamp's IP or `wled-xxxxxx.local` | `npm run dev:home` · `npm run serve:home` · `npm run build:home` |

The `:home` commands refuse to run if `.env.home` has no address. Don't put `VITE_WLED_HOST` in `.env.local`:
Vite loads that file in every mode, and it would override `.env`.

These files only set the *default*. An address someone entered in **Settings** (remembered per browser) or a
`?host=<ip>` URL parameter takes precedence. Use **Settings → Reset to …** to go back to the default.

## Where to host it

| Option | Works with | How |
|---|---|---|
| **On the lamp** | Every browser, including iPhone; lamp Wi-Fi or home Wi-Fi | `npm run build:lamp && npm run upload:lamp`, then open `http://<lamp>/ui.htm` |
| **Vercel** (or any HTTPS static host) | **Chrome / Edge, desktop and Android**, with the lamp on your **home Wi-Fi** | Deploy `dist/`, open the site, enter the lamp's local IP, click **Allow** when the browser asks |
| Local dev server / laptop | Any browser on the same network | `npm run dev` · `npm run serve` (see below) |

### Hosted on Vercel: how it works

Vercel only serves the static files. After the page loads, **your browser talks to the lamp directly** at the address
you enter. No server is involved.

That's possible because of Chrome's **Local Network Access** permission. An HTTPS page may call a plain-HTTP device at
a private address (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`) or a `.local` name once you click **Allow** on the
"access devices on your local network" prompt. The first time, you'll see:

1. A "Connect to your lamp" screen. Enter e.g. `192.168.1.106` or `wled-xxxxxx.local`; it's remembered in that browser.
2. The browser's permission prompt. Click **Allow**. If you clicked Block by mistake: site settings (🔒 icon) → Local network access → Allow.

Limits:
* **Safari and all iPhone/iPad browsers** block plain-HTTP calls from HTTPS pages. Use the copy installed on the lamp there.
* **The lamp's own Wi-Fi (4.3.2.1) can't work**: there's no internet to load the site, and 4.3.2.1 isn't a private address,
  so the exemption doesn't apply. The UI warns if you type it.
* Firefox is rolling out a similar permission; I haven't verified it there.

Deploy (from this folder, with your Vercel account):

```bash
npx vercel           # first time: log in, link/create the project. Vercel detects Vite (build: npm run build, output: dist)
npx vercel --prod    # production URL
```

Or push the project to GitHub and import it at vercel.com/new. Leave `VITE_WLED_HOST` unset on Vercel: the hosted page
always asks for the address.

### Serving from this laptop to others on the network

```bash
npm run serve          # lamp Wi-Fi: http://<laptop-ip>:4173, lamp at 4.3.2.1
npm run serve:home     # home Wi-Fi: lamp address from .env.home
```

The laptop only serves the page. Each visitor's browser sends commands straight to the lamp, so every visitor must be on
a network where the lamp is reachable.

### Installing on the lamp

```bash
npm run build:lamp                      # dist-lamp/index.html, one self-contained file (~320 kB)
npm run upload:lamp                     # uploads it to the lamp as /ui.htm; the stock UI stays at /
npm run upload:lamp -- 4.3.2.1 --as-index   # optional: make it the page served at http://4.3.2.1/
```

This writes a file to the lamp's flash storage, the same storage that holds presets. It does **not** touch the firmware.
To undo, open http://4.3.2.1/edit and delete `/ui.htm` (or `/index.htm`). Uploading fails if "OTA lock" is enabled in
the lamp's security settings.

## Testing against the real lamp

```bash
npm run probe                     # read-only compatibility check of 4.3.2.1
npm run probe -- 4.3.2.1 --json   # also saves raw responses to ./probe-output/
```

The probe checks `/json/info`, `/json/state`, effect/palette names and metadata, `/json/palx`, `presets.json`, CORS
preflight, the POST path with an empty command (`{"v": true}`, changes nothing), WebSocket push + heartbeat, and whether `/ui.htm` is installed.
**Please run it first and share the output** if anything looks off.

Manual requests (no app needed):

```bash
curl http://4.3.2.1/json/info
curl http://4.3.2.1/json/state
curl http://4.3.2.1/json/eff
curl http://4.3.2.1/presets.json
curl "http://4.3.2.1/json/palx?page=0"

# turn on at 50 % brightness, warm white (a number in "col" is Kelvin), reply with new state
curl -X POST http://4.3.2.1/json/state -H 'Content-Type: application/json' \
     -d '{"on":true,"bri":128,"seg":{"fx":0,"col":[2700]},"v":true}'

curl -X POST http://4.3.2.1/json/state -H 'Content-Type: application/json' -d '{"on":"t"}'   # toggle
curl -X POST http://4.3.2.1/json/state -H 'Content-Type: application/json' -d '{"ps":1}'     # load preset 1
curl -X POST http://4.3.2.1/json/state -H 'Content-Type: application/json' \
     -d '{"seg":{"fx":42,"sx":96,"ix":192,"pal":11}}'                                          # Fireworks + its defaults
```

`POST` must send `Content-Type: application/json`, otherwise WLED answers 404. Without `"v":true` the reply is `{"success":true}`.

Example `GET /json/state` reply (shape from the firmware source; values will differ):

```json
{"on":true,"bri":128,"inputLevel":128,"transition":7,"ps":-1,"pl":-1,
 "nl":{"on":false,"dur":60,"mode":1,"tbri":0,"rem":-1},"udpn":{"send":false,"recv":true},"lor":0,"mainseg":0,
 "seg":[{"id":0,"start":0,"stop":60,"len":60,"grp":1,"spc":0,"of":0,"on":true,"frz":false,"bri":255,"cct":127,
         "col":[[255,160,0],[0,0,0],[0,0,0]],"fx":0,"sx":128,"ix":128,"c1x":128,"c2x":128,"c3x":128,
         "pal":0,"sel":true,"rev":false,"rev2D":false,"mi":false,"rot2D":false}]}
```

### Without the lamp

```bash
npm run dev:mock        # mock WLED-SR 0.13.4 on :8080 (real effect/palette names, WS push, live view)
npm run dev             # then open http://localhost:5173/?host=localhost:8080
npm test                # unit tests (metadata parser, patch merging/applying)
```

The mock helps with UI work. It is **not** proof of compatibility; `npm run probe` against the lamp is.

## How it talks to the lamp

```
Browser ──GET /json──────────────▶ lamp   bootstrap: state + info + effect & palette names
        ◀═══ ws://lamp/ws ════════▶       lamp pushes {state, info} on connect and after every change;
                                          commands are sent as JSON patches over the socket
        ──GET /json/palx?page=N──▶        palette previews (sequential, cached per firmware build)
        ──GET /presets.json──────▶        presets (reloaded when info.fs.pmt changes)
        ──POST /json/state───────▶        fallback when WS is unavailable, plus GET /json/si polling every 4 s
```

* **Optimistic UI**: changes apply locally at once. Pushed state is ignored for ~350 ms after your last command so sliders
  don't jump back, then the confirmed state is fetched.
* **Coalescing**: dragging a slider queues many patches. Consecutive compatible ones merge (latest wins), and actions
  (`ps`, `psave`, `pdel`, toggles) never merge.
* **One HTTP request at a time**: the firmware silently drops overlapping JSON requests.
* **Connection monitoring**: WS heartbeat (`"p"` → `"pong"` every 10 s), automatic fallback to HTTP polling, reconnect
  with backoff, and resync when the tab becomes visible again.

## Project structure

```
src/
  api/                 everything that talks to or knows about WLED (no React)
    types.ts           TypeScript types for state/info/presets/patches (0.13.4 SR)
    client.ts          HTTP client (fetch + timeouts)
    connection.ts      sync engine: bootstrap, WebSocket, queue/coalescing, polling, reconnect, live view
    effects.ts         SR effect-metadata parser ("Name@sliders;colors;palette")
    palettes.ts        /json/palx → CSS gradients
    patch.ts           optimistic applyPatch + mergePatches (pure, unit-tested)
    config.ts          which lamp to talk to (?host, saved setting, build default)
  store/               zustand store + hooks: the only thing components use
  features/            one folder per tab: dashboard, colors, effects, presets, segments, settings
  components/ui.tsx    small UI primitives (Card, Slider, Toggle, Chip, Button…)
scripts/
  probe.mjs            real-device compatibility check
  upload-to-lamp.mjs   install the lamp build onto the lamp
  mock-wled.mjs        local fake lamp for UI development
docs/wled-0.13.4-analysis.md
```

Persistence (favourites, custom presets…) can be added later as another module next to `src/api/`, called from the store.
See [docs §4](docs/wled-0.13.4-analysis.md#future-backend--persistence) for why lamp control stays in the browser even then.

## Stack

React 19, TypeScript, Vite, Tailwind CSS v4, zustand (state), react-colorful (colour picker), lucide-react (icons).
`vite-plugin-singlefile` builds the on-lamp version.
