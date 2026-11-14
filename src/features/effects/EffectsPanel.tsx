import { useEffect, useMemo, useState } from 'react'
import { AudioLines, Clock, Grid3x3, Pause, Search, Shuffle, Star } from 'lucide-react'
import { useDevice } from '../../store/device'
import { useFavorites } from '../../store/favorites'
import { send, useCurrentEffect, useFocusSegment } from '../../store/hooks'
import { effectDefaults, type EffectMeta } from '../../api/effects'
import { paletteGradient } from '../../api/palettes'
import { pickRandom } from '../../lib/color'
import { Button, Card, Chip, Empty, Slider, cx } from '../../components/ui'
import { LivePreview } from '../../components/LivePreview'
import type { Segment } from '../../api/types'

type Filter = 'all' | 'fav' | 'audio' | '2d'

/** Ignore leading emoji/symbols ("🎉 audio Popcorn") when sorting. */
const sortKey = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()

/** Apply an effect with its metadata defaults. Picking an effect also un-freezes the segment. */
function chooseEffect(e: EffectMeta, seg: Segment | undefined) {
  send({ seg: { fx: e.id, ...effectDefaults(e), ...(seg?.frz ? { frz: false } : {}) } })
  useFavorites.getState().pushRecentEffect(e.name)
}

/** Effects a random pick may land on: visible ones, and 2D only when the lamp is a matrix. */
function useRandomPool(filter: Filter = 'all') {
  const effects = useDevice((s) => s.effects)
  const somp = useDevice((s) => s.info?.leds.somp ?? 0)
  const favs = useFavorites((s) => s.effects)
  return useMemo(() => {
    const base = effects.filter((e) => !e.hidden && e.id !== 0 && (somp > 0 || e.dimension === '1D'))
    const narrowed =
      filter === 'fav' ? base.filter((e) => favs.includes(e.name)) : filter === 'audio' ? base.filter((e) => e.audio) : filter === '2d' ? base.filter((e) => e.dimension !== '1D') : base
    return narrowed.length ? narrowed : base
  }, [effects, somp, favs, filter])
}

export function EffectsPanel() {
  const [filter, setFilter] = useState<Filter>('all')
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4 lg:sticky lg:top-4 lg:self-start">
        <LivePreview />
        <EffectControls filter={filter} />
        <PalettePicker />
      </div>
      <EffectList filter={filter} setFilter={setFilter} />
    </div>
  )
}

function EffectControls({ filter }: { filter: Filter }) {
  const seg = useFocusSegment()
  const effect = useCurrentEffect()
  const inputLevel = useDevice((s) => s.state?.inputLevel)
  const pool = useRandomPool(filter)
  if (!seg || !effect) return null
  const random = () => {
    const e = pickRandom(pool, effect)
    if (e) chooseEffect(e, seg)
  }
  return (
    <Card
      title="Effect"
      action={
        <Button variant="ghost" onClick={random} title={filter === 'all' ? 'Random effect' : 'Random effect from the current filter'}>
          <Shuffle className="size-4" /> Random
        </Button>
      }
    >
      {seg.frz && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-warn/10 px-3 py-2 text-sm">
          <Pause className="size-4 shrink-0 text-warn" />
          <span className="flex-1">This segment is frozen, so the effect isn't moving (e.g. after drawing on it).</span>
          <Button className="px-3 py-1.5" onClick={() => send({ seg: { id: seg.id, frz: false } })}>
            Resume
          </Button>
        </div>
      )}
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
  const favs = useFavorites((s) => s.palettes)
  const togglePalette = useFavorites((s) => s.togglePalette)
  useEffect(() => void loadPaletteData(), [loadPaletteData])

  // Favourites first, then the firmware order.
  const ordered = useMemo(() => {
    const all = palettes.map((name, id) => ({ id, name, fav: favs.includes(name) }))
    return [...all.filter((p) => p.fav), ...all.filter((p) => !p.fav)]
  }, [palettes, favs])

  if (!seg || !effect?.palette.show) return null
  const random = () => {
    const ids = palettes.map((_, id) => id)
    const id = pickRandom(ids, seg.pal)
    if (id !== undefined) send({ seg: { pal: id } })
  }
  return (
    <Card
      title={effect.palette.label === 'Palette' ? 'Palette' : `Palette · ${effect.palette.label}`}
      action={
        <Button variant="ghost" onClick={random} aria-label="Random palette">
          <Shuffle className="size-4" />
        </Button>
      }
    >
      <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ id, name, fav }) => {
          const bg = paletteGradient(paletteData[id], seg.col)
          const active = seg.pal === id
          const label = name.replace(/^\* /, '')
          return (
            <div key={id} className="relative">
              <button
                type="button"
                onClick={() => send({ seg: { pal: id } })}
                className={cx('w-full rounded-2xl border p-1.5 text-left transition-colors', active ? 'border-fg bg-surface-2' : 'border-line hover:border-muted')}
              >
                <span className="block h-6 rounded-xl bg-surface-2" style={bg ? { background: bg } : undefined} />
                <span className="mt-1 block truncate px-1 pr-6 text-xs">{label}</span>
              </button>
              <button
                type="button"
                aria-label={fav ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
                aria-pressed={fav}
                onClick={() => togglePalette(name)}
                className="absolute right-1 bottom-1 grid size-6 place-items-center rounded-full text-muted hover:text-fg"
              >
                <Star className={cx('size-3.5', fav && 'fill-amber-300 text-amber-300')} />
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function EffectList({ filter, setFilter }: { filter: Filter; setFilter(f: Filter): void }) {
  const effects = useDevice((s) => s.effects)
  const somp = useDevice((s) => s.info?.leds.somp ?? 0)
  const seg = useFocusSegment()
  const favs = useFavorites((s) => s.effects)
  const recent = useFavorites((s) => s.recentEffects)
  const toggleEffect = useFavorites((s) => s.toggleEffect)
  const [query, setQuery] = useState('')

  const hasAudio = effects.some((e) => e.audio)
  const has2D = effects.some((e) => e.dimension !== '1D')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return effects
      .filter((e) => !e.hidden)
      .filter((e) => (filter === 'fav' ? favs.includes(e.name) : filter === 'audio' ? e.audio : filter === '2d' ? e.dimension !== '1D' : true))
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : sortKey(a.name).localeCompare(sortKey(b.name))))
  }, [effects, query, filter, favs])

  const recentEffects = useMemo(() => {
    const byName = new Map(effects.filter((e) => !e.hidden).map((e) => [e.name, e]))
    return recent.map((n) => byName.get(n)).filter((e): e is EffectMeta => !!e)
  }, [effects, recent])

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
      <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
        <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
          <Star className="mr-1 inline size-3.5 align-[-2px]" /> Favourites{favs.length ? ` · ${favs.length}` : ''}
        </Chip>
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

      {!query && filter === 'all' && recentEffects.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
            <Clock className="size-3.5" /> Recent
          </h3>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {recentEffects.map((e) => (
              <Chip key={e.id} active={seg?.fx === e.id} onClick={() => chooseEffect(e, seg)}>
                {e.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        filter === 'fav' && !query ? (
          <Empty icon={<Star className="size-8" />} title="No favourites yet">
            Tap the star next to an effect to keep it here.
          </Empty>
        ) : (
          <Empty title="No effects match" />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {list.map((e) => {
            const active = seg?.fx === e.id
            const fav = favs.includes(e.name)
            return (
              <li
                key={e.id}
                className={cx(
                  'flex items-center rounded-2xl text-sm transition-colors',
                  active ? 'bg-[rgb(var(--accent)/0.2)] text-fg ring-1 ring-[rgb(var(--accent)/0.6)]' : 'bg-surface-2/60 hover:bg-surface-2',
                )}
              >
                <button type="button" onClick={() => chooseEffect(e, seg)} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 text-left">
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <Badges effect={e} />
                </button>
                <button
                  type="button"
                  aria-label={fav ? `Remove ${e.name} from favourites` : `Add ${e.name} to favourites`}
                  aria-pressed={fav}
                  onClick={() => toggleEffect(e.name)}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:text-fg"
                >
                  <Star className={cx('size-4', fav && 'fill-amber-300 text-amber-300')} />
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
