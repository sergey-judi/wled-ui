import { useEffect, useMemo, useState } from 'react'
import { AudioLines, Grid3x3, Search } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send, useCurrentEffect, useFocusSegment } from '../../store/hooks'
import { effectDefaults, type EffectMeta } from '../../api/effects'
import { paletteGradient } from '../../api/palettes'
import { Card, Chip, Empty, Slider, cx } from '../../components/ui'
import { LivePreview } from '../../components/LivePreview'

type Filter = 'all' | 'audio' | '2d'

/** Ignore leading emoji/symbols ("🎉 audio Popcorn") when sorting. */
const sortKey = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()

export function EffectsPanel() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4 lg:sticky lg:top-4 lg:self-start">
        <LivePreview />
        <EffectControls />
        <PalettePicker />
      </div>
      <EffectList />
    </div>
  )
}

function EffectControls() {
  const seg = useFocusSegment()
  const effect = useCurrentEffect()
  const inputLevel = useDevice((s) => s.state?.inputLevel)
  if (!seg || !effect) return null
  return (
    <Card title="Effect">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="truncate text-xl font-semibold">{effect.name}</h3>
        <Badges effect={effect} />
      </div>
      {effect.sliders.length === 0 && <p className="text-sm text-muted">This effect has no adjustable parameters.</p>}
      <div className="grid gap-1">
        {effect.sliders.map((s) => (
          <Slider key={s.key} label={s.label} value={seg[s.key] ?? 128} onChange={(v) => send({ seg: { [s.key]: v } })} />
        ))}
        {effect.audio && inputLevel !== undefined && (
          // SR-only: global audio gain/squelch level ("inputLevel" in the state)
          <Slider label="Sound sensitivity" value={inputLevel} onChange={(v) => send({ inputLevel: v })} />
        )}
      </div>
    </Card>
  )
}

function PalettePicker() {
  const seg = useFocusSegment()
  const effect = useCurrentEffect()
  const palettes = useDevice((s) => s.palettes)
  const paletteData = useDevice((s) => s.paletteData)
  const loadPaletteData = useDevice((s) => s.loadPaletteData)
  useEffect(() => void loadPaletteData(), [loadPaletteData])

  if (!seg || !effect?.palette.show) return null
  return (
    <Card title={effect.palette.label === 'Palette' ? 'Palette' : `Palette · ${effect.palette.label}`}>
      <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {palettes.map((name, id) => {
          const bg = paletteGradient(paletteData[id], seg.col)
          const active = seg.pal === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => send({ seg: { pal: id } })}
              className={cx('rounded-2xl border p-1.5 text-left transition-colors', active ? 'border-fg bg-surface-2' : 'border-line hover:border-muted')}
            >
              <span className="block h-6 rounded-xl bg-surface-2" style={bg ? { background: bg } : undefined} />
              <span className="mt-1 block truncate px-1 text-xs">{name.replace(/^\* /, "")}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function EffectList() {
  const effects = useDevice((s) => s.effects)
  const somp = useDevice((s) => s.info?.leds.somp ?? 0)
  const seg = useFocusSegment()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const hasAudio = effects.some((e) => e.audio)
  const has2D = effects.some((e) => e.dimension !== '1D')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return effects
      .filter((e) => !e.hidden)
      .filter((e) => (filter === 'audio' ? e.audio : filter === '2d' ? e.dimension !== '1D' : true))
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : sortKey(a.name).localeCompare(sortKey(b.name))))
  }, [effects, query, filter])

  const choose = (e: EffectMeta) => send({ seg: { fx: e.id, ...effectDefaults(e) } })

  return (
    <Card title={`Effects · ${list.length}`}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search effects"
          className="w-full rounded-2xl border border-line bg-surface-2 py-2.5 pr-3 pl-9 text-sm outline-none focus:border-[rgb(var(--accent))]"
        />
      </div>
      {(hasAudio || has2D) && (
        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
          {hasAudio && (
            <Chip active={filter === 'audio'} onClick={() => setFilter('audio')}>
              <AudioLines className="mr-1 inline size-3.5 align-[-2px]" /> Sound reactive
            </Chip>
          )}
          {has2D && (
            <Chip active={filter === '2d'} onClick={() => setFilter('2d')}>
              <Grid3x3 className="mr-1 inline size-3.5 align-[-2px]" /> 2D / 3D{somp === 0 ? ' (matrix)' : ''}
            </Chip>
          )}
        </div>
      )}
      {list.length === 0 ? (
        <Empty title="No effects match" />
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {list.map((e) => {
            const active = seg?.fx === e.id
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => choose(e)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors',
                    active ? 'bg-[rgb(var(--accent)/0.2)] text-fg ring-1 ring-[rgb(var(--accent)/0.6)]' : 'bg-surface-2/60 hover:bg-surface-2',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <Badges effect={e} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Badges({ effect }: { effect: EffectMeta }) {
  return (
    <span className="flex shrink-0 gap-1">
      {effect.audio && (
        <span title={effect.audio === 'frequency' ? 'Reacts to frequencies' : 'Reacts to volume'} className="rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">
          {effect.audio === 'frequency' ? '♫' : '♪'}
        </span>
      )}
      {effect.dimension !== '1D' && <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">{effect.dimension}</span>}
    </span>
  )
}
