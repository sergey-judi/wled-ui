import { useEffect, useState } from 'react'
import { RgbColorPicker } from 'react-colorful'
import { useDevice } from '../../store/device'
import { send, useCurrentEffect, useFocusSegment, useLightCaps } from '../../store/hooks'
import { Card, Chip, Slider, Empty } from '../../components/ui'
import { cctToKelvin, hexToRgb, kelvinToRgb, rgbCss, rgbToHex } from '../../lib/color'
import type { ColorValue, RGBW } from '../../api/types'

const KELVIN_SWATCHES = [2200, 2700, 3500, 4500, 5500, 6500]
const SWATCHES: [number, number, number][] = [
  [255, 0, 0], [255, 80, 0], [255, 160, 0], [255, 230, 0], [120, 255, 0], [0, 255, 60],
  [0, 255, 200], [0, 160, 255], [0, 40, 255], [110, 0, 255], [200, 0, 255], [255, 0, 120],
]

/** Colour slot patch: [] leaves the other slots untouched. */
function slotPatch(slot: number, value: ColorValue): ColorValue[] {
  return [0, 1, 2].slice(0, slot + 1).map((i) => (i === slot ? value : []))
}

export function ColorsPanel() {
  const seg = useFocusSegment()
  const effect = useCurrentEffect()
  const caps = useLightCaps()
  const segCount = useDevice((s) => s.state?.seg.length ?? 0)
  const [slot, setSlot] = useState(0)

  const slots = effect?.colors.length ? effect.colors : [{ index: 0 as const, label: 'Primary' }]
  useEffect(() => {
    if (!slots.some((s) => s.index === slot)) setSlot(slots[0].index)
  }, [slots, slot])

  if (!seg) return <Empty title="No active segment" />
  const current: RGBW = seg.col[slot] ?? [0, 0, 0]
  const hasW = current.length === 4

  const setRgb = (rgb: [number, number, number]) => send({ seg: { col: slotPatch(slot, hasW ? [...rgb, current[3] ?? 0] : rgb) } })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card
        title="Color"
        action={
          segCount > 1 && <span className="text-xs text-muted">{seg.n ?? `Segment ${seg.id}`}</span>
        }
      >
        {slots.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
            {slots.map((s) => (
              <Chip key={s.index} active={slot === s.index} onClick={() => setSlot(s.index)}>
                <span className="mr-2 inline-block size-3 rounded-full align-[-1px] ring-1 ring-white/30" style={{ background: rgbCss(seg.col[s.index]) }} />
                {s.label}
              </Chip>
            ))}
          </div>
        )}

        {caps.rgb ? (
          <>
            <div className="picker">
              <RgbColorPicker color={{ r: current[0], g: current[1], b: current[2] }} onChange={({ r, g, b }) => setRgb([r, g, b])} />
            </div>
            <ColorInputs rgb={[current[0], current[1], current[2]]} onChange={setRgb} />
          </>
        ) : (
          <p className="text-sm text-muted">This segment has no RGB channels.</p>
        )}

        {caps.white && hasW && (
          <div className="mt-4">
            <Slider
              label="White channel"
              value={current[3] ?? 0}
              onChange={(w) => send({ seg: { col: slotPatch(slot, [current[0], current[1], current[2], w]) } })}
              format={(v) => `${Math.round((v / 255) * 100)}%`}
              track="linear-gradient(90deg, #333, #fff)"
            />
          </div>
        )}
        {caps.cct && (
          <div className="mt-2">
            <Slider
              label="White temperature"
              value={seg.cct}
              onChange={(cct) => send({ seg: { cct } })}
              format={(v) => `${cctToKelvin(v)} K`}
              track={`linear-gradient(90deg, ${rgbCss(kelvinToRgb(1900))}, ${rgbCss(kelvinToRgb(6000))}, ${rgbCss(kelvinToRgb(10000))})`}
            />
          </div>
        )}
      </Card>

      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        {caps.rgb && (
          <Card title="Swatches">
            <div className="grid grid-cols-6 gap-3">
              {SWATCHES.map((c) => (
                <button
                  key={c.join()}
                  type="button"
                  aria-label={`Set ${rgbToHex(c)}`}
                  onClick={() => setRgb(c)}
                  className="aspect-square rounded-2xl border border-white/10 transition-transform hover:scale-105 active:scale-95"
                  style={{ background: rgbCss(c) }}
                />
              ))}
            </div>
            <h3 className="mt-5 mb-2 text-xs text-muted">White tones</h3>
            <div className="grid grid-cols-6 gap-3">
              {KELVIN_SWATCHES.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`${k} Kelvin`}
                  // WLED converts a bare number in "col" from Kelvin to RGB on the lamp.
                  onClick={() => send({ seg: { col: slotPatch(slot, k) } })}
                  className="flex aspect-square items-end justify-center rounded-2xl border border-white/10 pb-1 text-[10px] font-medium text-black/60 transition-transform hover:scale-105"
                  style={{ background: rgbCss(kelvinToRgb(k)) }}
                >
                  {k / 1000}K
                </button>
              ))}
            </div>
          </Card>
        )}
        {effect && effect.id !== 0 && (
          <Card>
            <p className="text-sm text-muted">
              Effect <span className="text-fg">{effect.name}</span> is running. It uses these colours
              {effect.palette.show ? ' together with its palette' : ''}.{' '}
              <button type="button" className="accent-text underline-offset-2 hover:underline" onClick={() => send({ seg: { fx: 0 } })}>
                Switch to solid colour
              </button>
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}

function ColorInputs({ rgb, onChange }: { rgb: [number, number, number]; onChange(rgb: [number, number, number]): void }) {
  const [hex, setHex] = useState(rgbToHex(rgb))
  const key = rgbToHex(rgb)
  useEffect(() => setHex(key), [key])

  const field = 'w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm tabular-nums outline-none focus:border-[rgb(var(--accent))]'
  return (
    <div className="mt-4 grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2">
      <label className="text-xs text-muted">
        Hex
        <input
          className={field}
          value={hex}
          spellCheck={false}
          onChange={(e) => {
            setHex(e.target.value)
            const v = hexToRgb(e.target.value)
            if (v) onChange(v)
          }}
        />
      </label>
      {(['R', 'G', 'B'] as const).map((ch, i) => (
        <label key={ch} className="text-xs text-muted">
          {ch}
          <input
            className={field}
            type="number"
            min={0}
            max={255}
            value={rgb[i]}
            onChange={(e) => {
              const next = [...rgb] as [number, number, number]
              next[i] = Math.max(0, Math.min(255, Number(e.target.value) || 0))
              onChange(next)
            }}
          />
        </label>
      ))}
    </div>
  )
}
