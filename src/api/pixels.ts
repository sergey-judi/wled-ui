import type { Segment, StatePatch } from './types'

/**
 * Individual LED control through the segment "i" array (wled00/json.cpp, WLED-SR 0.13.4).
 *
 * How the firmware reads the array:
 *  - A colour with no index before it paints `start` and then moves `start` forward by one.
 *    `start` begins at 0.
 *  - An integer sets `start`. The colour right after it paints that LED but does NOT move
 *    forward (0.13 quirk). The next colour paints the same LED again and then moves on.
 *  - Two integers set a range [start, stop) that the next colour fills.
 *
 * Indices are relative to the segment and count grouped LEDs as one (the "virtual" length).
 * The first write freezes the segment and blanks it. Send {frz:false} to resume the effect.
 */

export type Hex = string // "RRGGBB"

/** Colours per message. Keeps each command under the 1000-byte WebSocket frame limit. */
const RUN_CHUNK = 96
const PAIR_CHUNK = 64
/**
 * Upper bound for "save drawing as preset": the whole request is parsed into the lamp's JSON
 * buffer (20 kB on ESP32, 10 kB on ESP8266) at about 24 bytes per colour.
 */
export const MAX_PRESET_PIXELS = 300

/** Number of addressable positions in a segment, as WLED's virtualLength(). */
export function virtualLength(seg: Pick<Segment, 'start' | 'stop' | 'grp' | 'spc' | 'mi'>): number {
  const len = Math.max(0, seg.stop - seg.start)
  const group = Math.max(1, seg.grp) + Math.max(0, seg.spc)
  let v = Math.ceil(len / group)
  if (seg.mi) v = Math.ceil(v / 2)
  return v
}

/** Contiguous colours starting at `offset`, in firmware order. */
export function encodeRun(colors: readonly Hex[], offset = 0): (number | string)[] {
  if (colors.length === 0) return []
  // Without an index the run starts at 0 and advances normally.
  if (offset === 0) return [...colors]
  // With an index the first colour doesn't advance, so send it twice.
  return [offset, colors[0], ...colors]
}

/** Scattered LEDs as [index, colour] pairs (each pair is independent of the 0.13 quirk). */
export function encodePairs(changes: ReadonlyMap<number, Hex> | [number, Hex][]): (number | string)[] {
  const out: (number | string)[] = []
  for (const [idx, hex] of changes) out.push(idx, hex)
  return out
}

/** Commands that paint the whole segment, split so each fits a WebSocket frame. */
export function fullFrameCommands(segId: number, colors: readonly Hex[]): StatePatch[] {
  const cmds: StatePatch[] = []
  for (let at = 0; at < colors.length; at += RUN_CHUNK) {
    cmds.push({ seg: { id: segId, i: encodeRun(colors.slice(at, at + RUN_CHUNK), at) } })
  }
  return cmds
}

/** Commands for a set of changed LEDs. */
export function changeCommands(segId: number, changes: ReadonlyMap<number, Hex>): StatePatch[] {
  const entries = [...changes].sort((a, b) => a[0] - b[0])
  const cmds: StatePatch[] = []
  for (let at = 0; at < entries.length; at += PAIR_CHUNK) {
    cmds.push({ seg: { id: segId, i: encodePairs(entries.slice(at, at + PAIR_CHUNK)) } })
  }
  return cmds
}

/** A preset that redraws this picture when loaded (stored verbatim with "o":true). */
export function drawingPreset(id: number, name: string, segId: number, colors: readonly Hex[], ql?: string): StatePatch {
  return { psave: id, n: name, ...(ql ? { ql } : {}), o: true, on: true, seg: { id: segId, i: encodeRun(colors, 0) } }
}

export const toHex = (r: number, g: number, b: number): Hex =>
  [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()

export const hexToCss = (hex: Hex) => `#${hex}`
