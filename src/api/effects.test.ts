import { describe, expect, it } from 'vitest'
import { effectDefaults, parseEffect, parseEffects } from './effects'
import names from '../../scripts/fixtures/sr-0.13.4-names.json'

describe('parseEffect (WLED-SR 0.13.4 metadata)', () => {
  it('Solid: only primary colour, no sliders, no palette', () => {
    const e = parseEffect('Solid@;!;', 0)
    expect(e.name).toBe('Solid')
    expect(e.sliders).toEqual([])
    expect(e.colors.map((c) => c.index)).toEqual([0])
    expect(e.palette.show).toBe(false)
  })

  it('reads labels, defaults and default palette', () => {
    const e = parseEffect('Fireworks@Sharpness=96,Frequency=192;!,2,;!=11', 42)
    expect(e.sliders).toEqual([
      { key: 'sx', label: 'Sharpness', default: 96 },
      { key: 'ix', label: 'Frequency', default: 192 },
    ])
    expect(e.colors.map((c) => c.label)).toEqual(['Primary', '2', 'Color 3'])
    expect(e.palette).toMatchObject({ show: true, default: 11 })
    expect(effectDefaults(e)).toEqual({ sx: 96, ix: 192, pal: 11 })
  })

  it('a numeric palette is forced and hidden', () => {
    const e = parseEffect('Chase Rainbow@!,Width;!,!,;0', 30)
    expect(e.palette).toMatchObject({ show: false, forced: 0 })
    expect(effectDefaults(e)).toEqual({ pal: 0 })
  })

  it('names without metadata get speed+intensity (<128) or 5 sliders (>=128)', () => {
    expect(parseEffect('Stream', 39).sliders.map((s) => s.key)).toEqual(['sx', 'ix'])
    expect(parseEffect('Some SR effect', 140).sliders).toHaveLength(5)
    expect(parseEffect('Stream', 39).palette.show).toBe(true)
  })

  it('custom sliders with leading spaces and audio markers', () => {
    const e = parseEffect(' ♫ Waterfall@!,Adjust color,,Select bin=14, Volume (minimum)=62;!,!;!', 150)
    expect(e.name).toBe('Waterfall')
    expect(e.audio).toBe('frequency')
    expect(e.sliders.map((s) => [s.key, s.label, s.default])).toEqual([
      ['sx', 'Speed', undefined],
      ['ix', 'Adjust color', undefined],
      ['c2x', 'Select bin', 14],
      ['c3x', 'Volume (minimum)', 62],
    ])
  })

  it('parses the whole SR effect list and hides reserved slots', () => {
    const all = parseEffects(names.effects)
    expect(all).toHaveLength(195)
    expect(all.filter((e) => e.hidden).every((e) => /^Reserved/.test(e.name))).toBe(true)
    expect(all.filter((e) => e.audio).length).toBeGreaterThan(30)
    expect(all.find((e) => e.name === '2D Matrix')?.dimension).toBe('2D')
    expect(all.find((e) => e.name === '3D Ripples')?.dimension).toBe('3D')
    for (const e of all) for (const s of e.sliders) if (s.default !== undefined) expect(s.default).toBeLessThanOrEqual(255)
  })
})
