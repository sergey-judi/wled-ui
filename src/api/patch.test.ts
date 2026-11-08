import { describe, expect, it } from 'vitest'
import { applyPatch, mergePatches } from './patch'
import type { Segment, WledState } from './types'

const seg = (id: number, extra: Partial<Segment> = {}): Segment => ({
  id, start: id * 10, stop: id * 10 + 10, len: 10, grp: 1, spc: 0, of: 0, on: true, frz: false, bri: 255, cct: 127,
  col: [[255, 0, 0], [0, 0, 0], [0, 0, 0]], fx: 0, sx: 128, ix: 128, pal: 0, sel: id === 0, rev: false, mi: false, ...extra,
})
const state = (segs = [seg(0)]): WledState => ({
  on: true, bri: 128, transition: 7, ps: -1, pl: -1, nl: { on: false, dur: 60, mode: 1, tbri: 0, rem: -1 },
  udpn: { send: false, recv: true }, lor: 0, mainseg: 0, seg: segs,
})

describe('mergePatches', () => {
  it('latest slider value wins', () => {
    expect(mergePatches({ bri: 10 }, { bri: 20 })).toEqual({ bri: 20 })
    expect(mergePatches({ seg: { sx: 1 } }, { seg: { sx: 2, ix: 3 } })).toEqual({ seg: { sx: 2, ix: 3 } })
  })
  it('merges colour slots, keeping earlier slots that later patches leave empty', () => {
    expect(mergePatches({ seg: { col: [[1, 1, 1]] } }, { seg: { col: [[], [2, 2, 2]] } })).toEqual({ seg: { col: [[1, 1, 1], [2, 2, 2]] } })
  })
  it('does not merge actions, toggles, different segments or arrays', () => {
    expect(mergePatches({ ps: 1 }, { bri: 1 })).toBeNull()
    expect(mergePatches({ bri: 1 }, { psave: 3, n: 'x' })).toBeNull()
    expect(mergePatches({ on: 't' }, { on: 't' })).toBeNull()
    expect(mergePatches({ seg: { id: 0, sx: 1 } }, { seg: { id: 1, sx: 1 } })).toBeNull()
    expect(mergePatches({ seg: [{ sel: true }] }, { seg: { sx: 1 } })).toBeNull()
  })
})

describe('applyPatch (optimistic state)', () => {
  it('brightness > 0 turns on, 0 turns off but keeps last bri', () => {
    const off = { ...state(), on: false }
    expect(applyPatch(off, { bri: 50 })).toMatchObject({ on: true, bri: 50 })
    expect(applyPatch(state(), { bri: 0 })).toMatchObject({ on: false, bri: 128 })
    expect(applyPatch(state(), { on: 't' }).on).toBe(false)
  })
  it('segment patch without id targets selected segments', () => {
    const s = applyPatch(state([seg(0, { sel: false }), seg(1, { sel: true })]), { seg: { fx: 9 } })
    expect(s.seg.map((x) => x.fx)).toEqual([0, 9])
  })
  it('falls back to the main segment when none is selected', () => {
    const s = applyPatch(state([seg(0, { sel: false }), seg(1, { sel: false })]), { seg: { fx: 9 } })
    expect(s.seg.map((x) => x.fx)).toEqual([9, 0])
  })
  it('applies colours: arrays, empty slots, kelvin numbers', () => {
    const s = applyPatch(state(), { seg: { col: [[], [0, 0, 255]] } })
    expect(s.seg[0].col).toEqual([[255, 0, 0], [0, 0, 255], [0, 0, 0]])
    const k = applyPatch(state(), { seg: { col: [2700] } })
    expect(k.seg[0].col[0][0]).toBe(255)
    expect(k.seg[0].col[0][2]).toBeLessThan(200)
  })
  it('{id, stop: 0} deletes a segment', () => {
    expect(applyPatch(state([seg(0), seg(1)]), { seg: { id: 1, stop: 0 } }).seg.map((x) => x.id)).toEqual([0])
  })
  it('does not mutate the input', () => {
    const s = state()
    applyPatch(s, { seg: { col: [[1, 2, 3]] }, bri: 3 })
    expect(s.seg[0].col[0]).toEqual([255, 0, 0])
    expect(s.bri).toBe(128)
  })
})
