import type { RGBW } from '../api/types'

export type RGB = [number, number, number]

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

export function rgbToHex([r, g, b]: readonly number[]): string {
  return '#' + [r, g, b].map((v) => clamp(v ?? 0).toString(16).padStart(2, '0')).join('')
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbCss(c: readonly number[] | undefined, alpha = 1): string {
  if (!c) return `rgba(0,0,0,${alpha})`
  // Fold the white channel into RGB for on-screen display.
  const w = c[3] ?? 0
  return `rgba(${clamp(c[0] + w)},${clamp(c[1] + w)},${clamp(c[2] + w)},${alpha})`
}

/** Approximate RGB for a colour temperature (Tanner Helland), for previews only. */
export function kelvinToRgb(kelvin: number): RGB {
  const t = kelvin / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  return [clamp(r), clamp(g), clamp(b)]
}

/** WLED stores CCT as 0–255, mapped from 1900–10091 K via (K - 1900) >> 5. */
export const cctToKelvin = (cct: number) => 1900 + cct * 32
export const kelvinToCct = (k: number) => Math.max(0, Math.min(255, Math.round((k - 1900) / 32)))

export function isBlack(c: RGBW | undefined) {
  return !c || (c[0] === 0 && c[1] === 0 && c[2] === 0 && (c[3] ?? 0) === 0)
}

/** Perceived brightness 0–1, for picking legible foreground colours. */
export function luminance(c: readonly number[]) {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
}
