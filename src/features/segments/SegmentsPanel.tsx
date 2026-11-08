import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send } from '../../store/hooks'
import { Button, Card, Slider, Toggle, cx } from '../../components/ui'
import { rgbCss } from '../../lib/color'
import type { Segment } from '../../api/types'

export function SegmentsPanel() {
  const segs = useDevice((s) => s.state?.seg ?? [])
  const info = useDevice((s) => s.info)
  const ledCount = info?.leds.count ?? 0
  const maxSeg = info?.leds.maxseg ?? 1
  const ids = new Set(segs.map((s) => s.id))
  let freeId: number | null = null
  for (let i = 0; i < maxSeg; i++) if (!ids.has(i)) { freeId = i; break }

  const add = () => {
    if (freeId === null) return
    const lastStop = Math.max(0, ...segs.map((s) => s.stop))
    const start = lastStop < ledCount ? lastStop : 0
    send({ seg: { id: freeId, start, stop: ledCount, on: true } })
  }

  /** Select exactly one segment: the Colors and Effects tabs then control it. */
  const focus = (id: number) => send({ seg: segs.map((s) => ({ id: s.id, sel: s.id === id })) })

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title={`Segments · ${segs.length}/${maxSeg}`}
        action={
          <Button onClick={add} disabled={freeId === null}>
            <Plus className="size-4" /> Add
          </Button>
        }
      >
        <p className="mb-4 text-sm text-muted">
          Segments split the {ledCount} LEDs into zones with their own colours and effects. Colors and Effects apply to the
          selected segments.
        </p>
        <ul className="grid grid-cols-1 gap-3">
          {segs.map((s) => (
            <SegmentCard key={s.id} seg={s} ledCount={ledCount} canDelete={segs.length > 1} onFocus={() => focus(s.id)} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function SegmentCard({ seg, ledCount, canDelete, onFocus }: { seg: Segment; ledCount: number; canDelete: boolean; onFocus(): void }) {
  const [open, setOpen] = useState(false)
  const effects = useDevice((s) => s.effects)
  const [range, setRange] = useState({ start: seg.start, stop: seg.stop })
  const patch = (p: Partial<Segment>) => send({ seg: { id: seg.id, ...p } })
  const field = 'w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm tabular-nums outline-none focus:border-[rgb(var(--accent))]'
  const rangeValid = range.start >= 0 && range.stop > range.start && range.stop <= ledCount

  return (
    <li className={cx('rounded-2xl border p-3 transition-colors', seg.sel ? 'border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.08)]' : 'border-line bg-surface-2/50')}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onFocus} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Control this segment">
          <span className="flex shrink-0 -space-x-1.5">
            {seg.col.map((c, i) => (
              <span key={i} className="size-5 rounded-full ring-2 ring-surface" style={{ background: rgbCss(c) }} />
            ))}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{seg.n || `Segment ${seg.id}`}</span>
            <span className="block truncate text-xs text-muted">
              LEDs {seg.start}–{seg.stop - 1} · {effects[seg.fx]?.name ?? `FX ${seg.fx}`}
              {seg.sel ? ' · selected' : ''}
            </span>
          </span>
        </button>
        <Toggle label={`Segment ${seg.id} power`} checked={seg.on} onChange={(on) => patch({ on })} />
        <button type="button" aria-label="Details" onClick={() => setOpen(!open)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2">
          <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3">
          <Slider label="Segment brightness" min={1} value={seg.bri} onChange={(bri) => patch({ bri })} format={(v) => `${Math.round((v / 255) * 100)}%`} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-muted">
              Start LED
              <input className={field} type="number" min={0} max={ledCount - 1} value={range.start} onChange={(e) => setRange({ ...range, start: Number(e.target.value) })} />
            </label>
            <label className="text-xs text-muted">
              Stop LED (exclusive)
              <input className={field} type="number" min={1} max={ledCount} value={range.stop} onChange={(e) => setRange({ ...range, stop: Number(e.target.value) })} />
            </label>
            <label className="text-xs text-muted">
              Grouping
              <input className={field} type="number" min={1} max={255} value={seg.grp} onChange={(e) => patch({ grp: Math.max(1, Number(e.target.value)) })} />
            </label>
            <label className="text-xs text-muted">
              Spacing
              <input className={field} type="number" min={0} max={255} value={seg.spc} onChange={(e) => patch({ spc: Math.max(0, Number(e.target.value)) })} />
            </label>
          </div>
          {(range.start !== seg.start || range.stop !== seg.stop) && (
            <div className="flex items-center gap-2">
              <Button variant="primary" disabled={!rangeValid} onClick={() => patch(range)}>
                Apply range
              </Button>
              <Button variant="ghost" onClick={() => setRange({ start: seg.start, stop: seg.stop })}>
                Reset
              </Button>
              {!rangeValid && <span className="text-xs text-bad">Range must be within 0–{ledCount}.</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <Toggle label="Reverse" checked={seg.rev} onChange={(rev) => patch({ rev })} /> Reverse
            </label>
            <label className="flex items-center gap-2">
              <Toggle label="Mirror" checked={seg.mi} onChange={(mi) => patch({ mi })} /> Mirror
            </label>
            {canDelete && (
              <Button variant="danger" className="ml-auto" onClick={() => patch({ stop: 0 })}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
