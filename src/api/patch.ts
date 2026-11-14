import type { ColorValue, RGBW, Segment, SegmentPatch, StatePatch, WledState } from './types'
import { hexToRgb, kelvinToRgb } from '../lib/color'

/**
 * Pure helpers for state patches:
 *  - applyPatch: optimistic local update so the UI reacts instantly
 *  - mergePatches: coalesce queued commands (e.g. a dragged slider) so the
 *    lamp only receives the latest value.
 */

/** Keys that trigger an action and must never be merged with neighbours. */
const ACTION_KEYS: (keyof StatePatch)[] = ['ps', 'psave', 'pdel', 'n', 'playlist']

function isAction(p: StatePatch) {
  return ACTION_KEYS.some((k) => p[k] !== undefined) || p.on === 't'
}

function mergeColors(a: ColorValue[] | undefined, b: ColorValue[] | undefined): ColorValue[] | undefined {
  if (!a) return b
  if (!b) return a
  const out: ColorValue[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const bv = b[i]
    const emptyB = bv === undefined || (Array.isArray(bv) && bv.length === 0)
    out.push(emptyB ? (a[i] ?? []) : bv)
  }
  return out
}

function mergeSegment(a: SegmentPatch, b: SegmentPatch): SegmentPatch | null {
  // Pixel writes are incremental: merging would drop the earlier batch.
  if (a.id !== b.id || a.i || b.i) return null
  const col = mergeColors(a.col, b.col)
  return { ...a, ...b, ...(col ? { col } : {}) }
}

export function mergePatches(a: StatePatch, b: StatePatch): StatePatch | null {
  if (isAction(a) || isAction(b)) return null
  let seg: StatePatch['seg']
  if (a.seg && b.seg) {
    if (Array.isArray(a.seg) || Array.isArray(b.seg)) return null
    const merged = mergeSegment(a.seg, b.seg)
    if (!merged) return null
    seg = merged
  } else {
    seg = a.seg ?? b.seg
  }
  const out: StatePatch = { ...a, ...b }
  if (seg) out.seg = seg
  if (a.nl || b.nl) out.nl = { ...a.nl, ...b.nl }
  if (a.udpn || b.udpn) out.udpn = { ...a.udpn, ...b.udpn }
  return out
}

function toRgbw(v: ColorValue, prev: RGBW): RGBW | null {
  if (Array.isArray(v)) return v.length === 0 ? null : (v.slice(0, 4) as RGBW)
  if (typeof v === 'number') return v === 0 ? [0, 0, 0] : kelvinToRgb(v)
  const rgb = hexToRgb(v.slice(0, 6))
  return rgb ? (prev.length === 4 ? [...rgb, 0] : rgb) : null
}

function applySegment(seg: Segment, p: SegmentPatch): Segment {
  const next: Segment = { ...seg, col: [...seg.col] as Segment['col'] }
  for (const [k, v] of Object.entries(p)) {
    if (k === 'col' || k === 'id' || k === 'i' || v === undefined) continue
    ;(next as unknown as Record<string, unknown>)[k] = v
  }
  p.col?.forEach((c, i) => {
    if (i > 2) return
    const rgbw = toRgbw(c, seg.col[i])
    if (rgbw) next.col[i] = rgbw
  })
  // WLED: setting segment bri > 0 also turns the segment on, bri 0 turns it off.
  if (p.bri !== undefined && p.on === undefined) {
    next.on = p.bri > 0
    if (p.bri === 0) next.bri = seg.bri
  }
  // Writing individual LEDs freezes the segment on the lamp.
  if (p.i && p.frz === undefined) next.frz = true
  next.len = next.stop - next.start
  return next
}

/** The segment the UI shows controls for: first selected, else mainseg, else first. */
export function focusSegment(state: WledState): Segment | undefined {
  return state.seg.find((s) => s.sel) ?? state.seg.find((s) => s.id === state.mainseg) ?? state.seg[0]
}

export function applyPatch(state: WledState, patch: StatePatch): WledState {
  const s: WledState = { ...state, seg: [...state.seg] }

  if (patch.bri !== undefined) {
    if (patch.bri > 0) s.bri = patch.bri
    if (patch.on === undefined) s.on = patch.bri > 0
  }
  if (patch.on !== undefined) s.on = patch.on === 't' ? !state.on : patch.on
  if (patch.transition !== undefined) s.transition = patch.transition
  if (patch.inputLevel !== undefined) s.inputLevel = patch.inputLevel
  if (patch.nl) s.nl = { ...s.nl, ...patch.nl }
  if (patch.ps !== undefined) s.ps = patch.ps
  if (patch.udpn) s.udpn = { ...s.udpn, ...patch.udpn }
  if (patch.playlist && !('ps' in patch.playlist)) s.pl = -1

  if (patch.seg) {
    const list = Array.isArray(patch.seg) ? patch.seg : [patch.seg]
    list.forEach((sp, idx) => {
      let targetIds: number[]
      if (sp.id !== undefined) targetIds = [sp.id]
      else if (Array.isArray(patch.seg)) targetIds = [idx]
      else {
        const selected = s.seg.filter((x) => x.sel).map((x) => x.id)
        targetIds = selected.length ? selected : [s.mainseg]
      }
      s.seg = s.seg.map((seg) => (targetIds.includes(seg.id) ? applySegment(seg, sp) : seg))
      // {id, stop: 0} deletes a segment
      if (sp.id !== undefined && sp.stop === 0) s.seg = s.seg.filter((x) => x.id !== sp.id)
    })
  }
  return s
}
