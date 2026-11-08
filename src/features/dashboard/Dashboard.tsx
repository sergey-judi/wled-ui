import { Moon, Power, Sparkles, Palette as PaletteIcon, Bookmark } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send, useCurrentEffect, useFocusSegment } from '../../store/hooks'
import { Card, Chip, Slider, Toggle, cx } from '../../components/ui'
import { kelvinToRgb, rgbCss } from '../../lib/color'
import { LivePreview } from './LivePreview'

const QUICK: { name: string; value: [number, number, number] | number }[] = [
  { name: 'Warm white', value: 2700 },
  { name: 'Neutral white', value: 4500 },
  { name: 'Daylight', value: 6500 },
  { name: 'Red', value: [255, 0, 0] },
  { name: 'Orange', value: [255, 110, 0] },
  { name: 'Amber', value: [255, 180, 30] },
  { name: 'Green', value: [0, 255, 70] },
  { name: 'Cyan', value: [0, 220, 255] },
  { name: 'Blue', value: [0, 40, 255] },
  { name: 'Purple', value: [150, 0, 255] },
  { name: 'Pink', value: [255, 30, 140] },
]

const NL_DURATIONS = [5, 15, 30, 60]
const NL_MODES = [
  { id: 1, label: 'Fade' },
  { id: 0, label: 'Instant' },
  { id: 3, label: 'Sunrise' },
]

export function Dashboard() {
  const state = useDevice((s) => s.state)!
  const palettes = useDevice((s) => s.palettes)
  const presets = useDevice((s) => s.presets)
  const wsAvailable = useDevice((s) => (s.info?.ws ?? -1) > -1)
  const seg = useFocusSegment()
  const effect = useCurrentEffect()
  const primary = seg?.col[0]
  const pct = Math.round((state.bri / 255) * 100)
  const presetName = state.ps > 0 ? (presets?.[state.ps]?.n ?? `Preset ${state.ps}`) : null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:row-span-2">
        <div className="flex flex-col items-center gap-6 py-4">
          <button
            type="button"
            onClick={() => send({ on: !state.on })}
            aria-label={state.on ? 'Turn off' : 'Turn on'}
            className="group relative grid size-48 place-items-center rounded-full transition-transform active:scale-95 sm:size-56"
          >
            <span
              className="absolute inset-0 rounded-full blur-2xl transition-opacity duration-500"
              style={{ background: rgbCss(primary, 0.55), opacity: state.on ? 0.25 + (state.bri / 255) * 0.75 : 0 }}
            />
            <span
              className={cx('absolute inset-3 rounded-full border transition-colors duration-500', state.on ? 'border-white/20' : 'border-line bg-surface-2')}
              style={state.on ? { background: `radial-gradient(circle at 35% 30%, ${rgbCss(primary, 1)}, ${rgbCss(primary, 0.35)})` } : undefined}
            />
            <span className="relative flex flex-col items-center">
              <Power className={cx('size-10', state.on ? 'text-white drop-shadow' : 'text-muted')} strokeWidth={2.2} />
              <span className={cx('mt-2 text-sm font-semibold', state.on ? 'text-white' : 'text-muted')}>{state.on ? `${pct}%` : 'Off'}</span>
            </span>
          </button>

          <div className="w-full max-w-md">
            <Slider label="Brightness" min={1} max={255} value={state.bri} onChange={(bri) => send({ bri })} format={(v) => `${Math.round((v / 255) * 100)}%`} />
          </div>

          <dl className="grid w-full max-w-md grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <Info icon={<Sparkles className="size-4" />} label="Effect" value={effect?.name ?? '—'} />
            <Info icon={<PaletteIcon className="size-4" />} label="Palette" value={seg && effect?.palette.show ? (palettes[seg.pal] ?? '—') : '—'} />
            <Info icon={<Bookmark className="size-4" />} label="Preset" value={presetName ?? '—'} />
          </dl>
        </div>
      </Card>

      <Card title="Quick colors">
        <div className="grid grid-cols-6 gap-3 sm:grid-cols-6">
          {QUICK.map((q) => {
            const rgb = typeof q.value === 'number' ? kelvinToRgb(q.value) : q.value
            return (
              <button
                key={q.name}
                type="button"
                title={q.name}
                aria-label={q.name}
                // Quick colours switch to the Solid effect so the lamp actually shows the colour.
                onClick={() => send({ on: true, seg: { fx: 0, col: [q.value] } })}
                className="aspect-square rounded-2xl border border-white/10 transition-transform hover:scale-105 active:scale-95"
                style={{ background: rgbCss(rgb) }}
              />
            )
          })}
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Moon className="size-4" /> Nightlight
          </span>
        }
        action={<Toggle label="Nightlight" checked={state.nl.on} onChange={(on) => send({ nl: { on } })} />}
      >
        <p className="mb-3 text-sm text-muted">
          {state.nl.on && state.nl.rem >= 0
            ? `Dimming to ${state.nl.tbri === 0 ? 'off' : `${Math.round((state.nl.tbri / 255) * 100)}%`} — ${Math.ceil(state.nl.rem / 60)} min left`
            : `Gradually turns the lamp ${state.nl.tbri === 0 ? 'off' : 'down'} over ${state.nl.dur} min.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {NL_DURATIONS.map((d) => (
            <Chip key={d} active={state.nl.dur === d} onClick={() => send({ nl: { dur: d } })}>
              {d} min
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" />
          {NL_MODES.map((m) => (
            <Chip key={m.id} active={state.nl.mode === m.id} onClick={() => send({ nl: { mode: m.id } })}>
              {m.label}
            </Chip>
          ))}
        </div>
      </Card>

      {wsAvailable && <LivePreview />}
    </div>
  )
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  )
}
