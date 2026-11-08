import type { PaletteStop, RGBW } from './types'
import { rgbCss } from '../lib/color'

/**
 * Turn /json/palx data into a CSS gradient. Entries are [pos, r, g, b] or
 * placeholders: "c1".."c3" = the segment's colour slots, "r" = random.
 * Mirrors genPalPrevCss() in the stock UI.
 */
export function paletteGradient(stops: PaletteStop[] | undefined, colors: RGBW[]): string | undefined {
  if (!stops || stops.length === 0) return undefined
  const list = stops.length === 1 ? [stops[0], Array.isArray(stops[0]) ? [255, ...stops[0].slice(1)] : stops[0]] : stops
  const parts = list.map((e, i) => {
    let rgb: number[]
    let pos: number
    if (Array.isArray(e)) {
      rgb = e.slice(1)
      pos = (e[0] / 255) * 100
    } else {
      rgb =
        e === 'r'
          ? [0, 0, 0].map(() => Math.floor(Math.random() * 255))
          : (colors[Number(e.slice(1)) - 1] ?? [0, 0, 0]).slice(0, 3)
      pos = (i / (list.length - 1)) * 100
    }
    return `${rgbCss(rgb)} ${pos.toFixed(1)}%`
  })
  return `linear-gradient(90deg, ${parts.join(', ')})`
}
