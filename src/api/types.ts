/**
 * Types for the WLED JSON API as implemented by WLED Sound Reactive 0.13.4
 * (atuline/WLED tag v0.13.4, wled00/json.cpp). Fields marked "SR" are specific
 * to the Sound Reactive fork and are absent on upstream WLED 0.13.x.
 */

/** [r, g, b] or [r, g, b, w] — WLED sends 4 values only when an RGBW bus exists. */
export type RGBW = [number, number, number] | [number, number, number, number]

export interface Segment {
  id: number
  start: number
  stop: number
  len: number
  grp: number
  spc: number
  of: number
  on: boolean
  frz: boolean
  /** Segment opacity, 1–255. */
  bri: number
  /** Color temperature, 0 (warm) – 255 (cold). */
  cct: number
  n?: string
  /** Primary (Fx), secondary (Bg), tertiary (Cs) colors. */
  col: [RGBW, RGBW, RGBW]
  fx: number
  sx: number
  ix: number
  /** SR: extra effect sliders. */
  c1x?: number
  c2x?: number
  c3x?: number
  pal: number
  sel: boolean
  rev: boolean
  mi: boolean
  /** SR: 2D options. */
  rev2D?: boolean
  rot2D?: boolean
}

export interface Nightlight {
  on: boolean
  /** minutes */
  dur: number
  /** 0 instant, 1 fade, 2 color fade, 3 sunrise */
  mode: number
  tbri: number
  /** seconds remaining, -1 when inactive */
  rem: number
}

export interface WledState {
  on: boolean
  /** Last non-zero master brightness (1–255), even when off. */
  bri: number
  /** Transition time in units of 100 ms. */
  transition: number
  /** Current preset id, -1 for none. */
  ps: number
  /** Current playlist id, -1 for none. */
  pl: number
  nl: Nightlight
  udpn: { send: boolean; recv: boolean }
  lor: number
  mainseg: number
  seg: Segment[]
  /** SR: audio input gain / squelch level. */
  inputLevel?: number
  error?: number
}

export interface LedsInfo {
  count: number
  pwr: number
  fps: number
  maxpwr: number
  maxseg: number
  /** Light capabilities per segment (bit 0 RGB, bit 1 white, bit 2 CCT). */
  seglc: number[]
  /** Combined light capabilities of all segments. */
  lc: number
  rgbw: boolean
  wv: number | boolean
  cct: number | boolean
  /** SR: 0 = strip, 1 = 2D matrix, 2 = 3D. */
  somp?: number
}

export interface WledInfo {
  ver: string
  /** SR: release / binary name. */
  rel?: string
  vid: number
  leds: LedsInfo
  str: boolean
  name: string
  udpport: number
  live: boolean
  liveseg: number
  lm: string
  lip: string
  /** Number of connected WebSocket clients, -1 if WebSockets are compiled out. */
  ws: number
  fxcount: number
  palcount: number
  wifi: { bssid: string; rssi: number; signal: number; channel: number }
  /** Filesystem usage in kB; pmt = presets modification time. */
  fs: { u: number; t: number; pmt: number }
  ndc: number
  arch: string
  core: string
  freeheap: number
  uptime: number
  opt: number
  brand: string
  product: string
  mac: string
  ip: string
  // SR-only fields
  audioType?: string
  audioStatus?: string
  audioGain?: string
  ssyncMode?: string
  ssyncStatus?: string
  audioWarning?: string
  soundAgc?: number
  totalheap?: number
  minfreeheap?: number
  e32model?: string
  e32cores?: number
  e32speed?: number
  e32flash?: number
}

/** GET /json */
export interface WledFull {
  state: WledState
  info: WledInfo
  effects: string[]
  palettes: string[]
}

/** GET /json/si and every WebSocket state push. */
export interface WledStateInfo {
  state: WledState
  info: WledInfo
}

/** One entry of a /json/palx page: [position, r, g, b] or a placeholder ("c1".."c3", "r"). */
export type PaletteStop = [number, number, number, number] | string

/** GET /json/palx?page=N */
export interface PalettePage {
  /** Highest page index. */
  m: number
  p: Record<string, PaletteStop[]>
}

/** An entry of /presets.json (a stored partial state, or a playlist). */
export interface Preset {
  n?: string
  /** Quick-load label (1–2 characters / emoji). */
  ql?: string
  playlist?: { ps: number[]; dur: number[] | number; transition: number[] | number; repeat?: number; end?: number }
  win?: string
  [key: string]: unknown
}

export type PresetsFile = Record<string, Preset>

// ---------- Requests ----------

export type ColorValue = RGBW | [] | string | number

export interface SegmentPatch {
  id?: number
  start?: number
  stop?: number
  grp?: number
  spc?: number
  of?: number
  on?: boolean
  frz?: boolean
  bri?: number
  cct?: number
  n?: string
  /** Up to 3 slots. Use [] to leave a slot unchanged; a number is a Kelvin temperature. */
  col?: ColorValue[]
  fx?: number
  sx?: number
  ix?: number
  c1x?: number
  c2x?: number
  c3x?: number
  pal?: number
  sel?: boolean
  rev?: boolean
  mi?: boolean
}

export interface StatePatch {
  on?: boolean | 't'
  bri?: number
  transition?: number
  /** One-shot transition for this call only (100 ms units). */
  tt?: number
  /** Object without id: applies to all selected segments. */
  seg?: SegmentPatch | SegmentPatch[]
  nl?: Partial<Omit<Nightlight, 'rem'>>
  ps?: number
  psave?: number
  pdel?: number
  /** Preset name (with psave). */
  n?: string
  /** With psave: include brightness / segment bounds. */
  ib?: boolean
  sb?: boolean
  inputLevel?: number
  v?: boolean
  time?: number
}

/** Light capability bits (info.leds.lc / seglc). */
export const LC_RGB = 0x01
export const LC_WHITE = 0x02
export const LC_CCT = 0x04
