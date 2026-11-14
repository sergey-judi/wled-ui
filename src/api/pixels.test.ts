import { describe, expect, it } from 'vitest'
import { changeCommands, encodePairs, encodeRun, fullFrameCommands, virtualLength } from './pixels'

/** Port of the "i" loop in wled00/json.cpp deserializeSegment() (WLED-SR 0.13.4). */
function firmwareApply(iarr: (number | string)[], leds: string[]) {
  let start = 0
  let stop = 0
  let set = 0
  for (const v of iarr) {
    if (typeof v === 'number') {
      if (!set) {
        start = v
        set = 1
      } else {
        stop = v
        set = 2
      }
    } else {
      if (set < 2) stop = start + 1
      for (let i = start; i < stop; i++) leds[i] = v
      if (!set) start++
      set = 0
    }
  }
  return leds
}

const colors = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `C${from + i}`)

describe('individual LED encoding', () => {
  it('a run from 0 paints every LED in order', () => {
    expect(firmwareApply(encodeRun(colors(5)), [])).toEqual(colors(5))
  })

  it('a run at an offset works around the 0.13 first-colour quirk', () => {
    const leds = firmwareApply(encodeRun(colors(4, 10), 10), Array(14).fill('-'))
    expect(leds.slice(10)).toEqual(colors(4, 10))
    expect(leds.slice(0, 10)).toEqual(Array(10).fill('-'))
    // The naive encoding would be wrong:
    expect(firmwareApply([10, 'A', 'B'], [])[10]).toBe('B')
  })

  it('pairs set scattered LEDs', () => {
    const leds = firmwareApply(encodePairs([[3, 'A'], [7, 'B'], [4, 'C']]), Array(8).fill('-'))
    expect(leds).toEqual(['-', '-', '-', 'A', 'C', '-', '-', 'B'])
  })

  it('full-frame chunks reassemble to the whole picture and fit a WebSocket frame', () => {
    const pic = Array.from({ length: 300 }, (_, i) => (i * 99991).toString(16).padStart(6, '0').slice(-6).toUpperCase())
    const leds: string[] = []
    const cmds = fullFrameCommands(2, pic)
    expect(cmds.length).toBeGreaterThan(1)
    for (const c of cmds) {
      expect(JSON.stringify({ ...c, v: true }).length).toBeLessThanOrEqual(1000)
      firmwareApply((c.seg as { i: (number | string)[] }).i, leds)
    }
    expect(leds).toEqual(pic)
  })

  it('change commands stay under the frame limit', () => {
    const changes = new Map(Array.from({ length: 200 }, (_, i) => [i * 3 + 1000, 'ABCDEF'] as [number, string]))
    for (const c of changeCommands(0, changes)) expect(JSON.stringify({ ...c, v: true }).length).toBeLessThanOrEqual(1000)
  })

  it('virtual length follows grouping, spacing and mirroring', () => {
    expect(virtualLength({ start: 0, stop: 60, grp: 1, spc: 0, mi: false })).toBe(60)
    expect(virtualLength({ start: 0, stop: 60, grp: 2, spc: 1, mi: false })).toBe(20)
    expect(virtualLength({ start: 10, stop: 21, grp: 1, spc: 0, mi: true })).toBe(6)
  })
})
