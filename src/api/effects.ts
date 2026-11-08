/**
 * WLED Sound Reactive 0.13.4 embeds control metadata in effect names:
 *
 *   "Name@<sliders>;<colors>;<palette>"
 *   e.g. "Fireworks@Sharpness=96,Frequency=192;!,2,;!=11"
 *
 *  - sliders: up to 5 comma-separated labels for sx, ix, c1x, c2x, c3x.
 *             ""  = slider unused, "!" = default label, "Label=N" = default value N.
 *  - colors:  up to 3 labels for the colour slots; same "", "!" rules.
 *  - palette: "!" / label = palette selectable (optionally "=N" default palette),
 *             a bare number = palette forced to N and hidden, "" = no palette.
 *
 * Names without "@" use defaults: speed + intensity (effects < 128) or all
 * five sliders (SR audio effects ≥ 128), all colours, palette shown.
 * Upstream WLED 0.13.x sends plain names, which parse to those defaults.
 *
 * Mirrors setEffectParameters() in atuline/WLED v0.13.4 wled00/data/index.js.
 */

export type SliderKey = 'sx' | 'ix' | 'c1x' | 'c2x' | 'c3x'
const SLIDER_KEYS: SliderKey[] = ['sx', 'ix', 'c1x', 'c2x', 'c3x']
const SLIDER_DEFAULT_LABELS = ['Speed', 'Intensity', 'Custom 1', 'Custom 2', 'Custom 3']
const COLOR_DEFAULT_LABELS = ['Primary', 'Secondary', 'Tertiary']

export interface EffectSlider {
  key: SliderKey
  label: string
  default?: number
}

export interface EffectColorSlot {
  index: 0 | 1 | 2
  label: string
}

export interface EffectMeta {
  id: number
  /** Display name without metadata and audio symbols. */
  name: string
  /** "volume" (♪) / "frequency" (♫) reactive, or null. */
  audio: 'volume' | 'frequency' | null
  /** "2D" / "3D" effects designed for matrices. */
  dimension: '1D' | '2D' | '3D'
  sliders: EffectSlider[]
  colors: EffectColorSlot[]
  palette: { show: boolean; label: string; default?: number; forced?: number }
  /** Placeholder slots ("Reserved…") that shouldn't be listed. */
  hidden: boolean
}

function splitLabelDefault(raw: string): { label: string; value?: number } {
  const s = raw.trim()
  const eq = s.indexOf('=')
  if (eq > 0) {
    const n = parseInt(s.slice(eq + 1), 10)
    return { label: s.slice(0, eq).trim(), value: Number.isNaN(n) ? undefined : Math.max(0, Math.min(255, n)) }
  }
  return { label: s }
}

const list = (part: string | undefined) => (part === undefined || part === '' ? [] : part.split(','))

export function parseEffect(raw: string, id: number): EffectMeta {
  const at = raw.indexOf('@')
  const controlDefined = at >= 0
  const title = (controlDefined ? raw.slice(0, at) : raw).trim()
  const params = controlDefined ? raw.slice(at + 1) : ''
  const parts = params === '' ? [] : params.split(';')
  const sliderParts = list(parts[0])
  const colorParts = list(parts[1])
  const paletteParts = list(parts[2])

  const sliders: EffectSlider[] = []
  const defaultSliderCount = id < 128 ? 2 : 5
  for (let i = 0; i < 5; i++) {
    const def = sliderParts[i]?.trim() ?? ''
    if ((!controlDefined && i < defaultSliderCount) || def !== '') {
      const { label, value } = splitLabelDefault(def)
      sliders.push({
        key: SLIDER_KEYS[i],
        label: label === '' || label === '!' ? SLIDER_DEFAULT_LABELS[i] : label,
        default: value,
      })
    }
  }

  const colors: EffectColorSlot[] = []
  for (let i = 0; i < 3; i++) {
    const def = colorParts[i]?.trim() ?? ''
    const index = i as 0 | 1 | 2
    if (def !== '') colors.push({ index, label: def === '!' ? COLOR_DEFAULT_LABELS[i] : def })
    // Like the stock UI: when an effect uses a palette, expose all colour slots
    // because palettes such as "Colors 1&2" read them.
    else if (!controlDefined || paletteParts.length > 0) colors.push({ index, label: `Color ${i + 1}` })
  }

  const p0 = paletteParts[0]?.trim() ?? ''
  const numeric = p0 !== '' && !Number.isNaN(Number(p0))
  let palette: EffectMeta['palette']
  if (!controlDefined || (p0 !== '' && !numeric)) {
    const { label, value } = splitLabelDefault(p0)
    palette = { show: true, label: label === '' || label === '!' ? 'Palette' : label, default: value }
  } else {
    palette = { show: false, label: 'Palette', forced: numeric ? Number(p0) : undefined }
  }

  const audio = /♫/.test(title) ? 'frequency' : /♪/.test(title) || /\b(audio|beat)\b/i.test(title) ? 'volume' : null
  const name = title.replace(/[♪♫]/g, '').trim()
  const dimension = /^(?:\S+\s)?3D\b/.test(name) ? '3D' : /^(?:\S+\s)?2D\b/.test(name) ? '2D' : '1D'

  return {
    id,
    name,
    audio,
    dimension,
    sliders,
    colors,
    palette,
    hidden: /^(reserved|rsvd)/i.test(name) || name === '-' || name === '',
  }
}

export function parseEffects(names: string[]): EffectMeta[] {
  return names.map((n, i) => parseEffect(n, i))
}

/** Values to send along with {fx} when switching effect (embedded defaults). */
export function effectDefaults(meta: EffectMeta): Partial<Record<SliderKey | 'pal', number>> {
  const out: Partial<Record<SliderKey | 'pal', number>> = {}
  for (const s of meta.sliders) if (s.default !== undefined) out[s.key] = s.default
  if (meta.palette.default !== undefined) out.pal = meta.palette.default
  if (meta.palette.forced !== undefined) out.pal = meta.palette.forced
  return out
}
