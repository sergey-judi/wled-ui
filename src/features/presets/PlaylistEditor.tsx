import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Play, Plus, Square, Trash2 } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send } from '../../store/hooks'
import { Button, Card, Toggle, cx } from '../../components/ui'
import { fromDraft, savePlaylistCommand, toDraft, totalSeconds, type PlaylistDraft, type PlaylistEntry } from '../../api/playlist'
import { Field, QL_MAX, inputClass, nextFreeId, type PresetItem } from './fields'

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`
}

/** Create or edit a playlist (stored as a preset with a "playlist" object). */
export function PlaylistEditor({ id, presets, onClose }: { id: number | null; presets: PresetItem[]; onClose(): void }) {
  const transition = useDevice((s) => s.state?.transition ?? 7)
  const running = useDevice((s) => s.state?.pl ?? -1)
  const existing = id !== null ? presets.find((p) => p.id === id) : undefined
  // Sub-playlists aren't supported by the 0.13 firmware: only plain presets can be entries.
  const choices = useMemo(() => presets.filter((p) => !p.playlist), [presets])
  const saveId = id ?? nextFreeId(presets.map((p) => p.id))

  const [name, setName] = useState(existing?.n ?? '')
  const [ql, setQl] = useState(existing?.ql ?? '')
  const [draft, setDraft] = useState<PlaylistDraft>(() =>
    existing?.playlist
      ? toDraft(existing.playlist, transition)
      : { entries: choices.slice(0, 2).map((p) => ({ ps: p.id, dur: 30, tr: transition / 10 })), repeat: 0, end: 0, shuffle: false },
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setEntry = (i: number, patch: Partial<PlaylistEntry>) =>
    setDraft((d) => ({ ...d, entries: d.entries.map((e, k) => (k === i ? { ...e, ...patch } : e)) }))
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const entries = [...d.entries]
      const j = i + by
      if (j < 0 || j >= entries.length) return d
      ;[entries[i], entries[j]] = [entries[j], entries[i]]
      return { ...d, entries }
    })
  const remove = (i: number) => setDraft((d) => ({ ...d, entries: d.entries.filter((_, k) => k !== i) }))
  const add = () =>
    setDraft((d) => ({
      ...d,
      entries: [...d.entries, { ps: choices[0]?.id ?? 1, dur: d.entries.at(-1)?.dur ?? 30, tr: d.entries.at(-1)?.tr ?? transition / 10 }],
    }))

  const valid = draft.entries.length > 0 && draft.entries.every((e) => choices.some((p) => p.id === e.ps)) && saveId !== null
  const save = () => {
    if (!valid || saveId === null) return
    send(savePlaylistCommand(saveId, name.trim() || `Playlist ${saveId}`, draft, ql.trim() || undefined))
    onClose()
  }

  return (
    <Card
      title={existing ? `Edit playlist #${existing.id}` : `New playlist #${saveId ?? '—'}`}
      action={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Field label="Name">
          <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder={`Playlist ${saveId ?? ''}`} className={inputClass} />
        </Field>
        <Field label="Icon">
          <input value={ql} maxLength={QL_MAX} onChange={(e) => setQl(e.target.value)} placeholder="▶" className={cx(inputClass, 'text-center')} />
        </Field>
      </div>

      <h3 className="mt-4 mb-2 flex items-baseline justify-between text-xs text-muted">
        <span>Steps · {draft.entries.length}</span>
        <span>One round: {fmt(totalSeconds(draft))}</span>
      </h3>
      <ol className="grid gap-2">
        {draft.entries.map((e, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-end gap-x-2 gap-y-1 rounded-2xl bg-surface-2/50 p-2 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto]">
            <span className="pb-2 text-center text-xs text-muted tabular-nums">{i + 1}</span>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem]">
              <Field label="Preset" className="col-span-2 sm:col-span-1">
                <select value={e.ps} onChange={(ev) => setEntry(i, { ps: Number(ev.target.value) })} className={inputClass}>
                  {!choices.some((p) => p.id === e.ps) && <option value={e.ps}>#{e.ps} (missing)</option>}
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ql ? `${p.ql} ` : ''}
                      {p.n || `Preset ${p.id}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Show (s)">
                <input type="number" min={0.2} max={6553} step={1} value={e.dur} onChange={(ev) => setEntry(i, { dur: Number(ev.target.value) })} className={inputClass} />
              </Field>
              <Field label="Fade (s)">
                <input type="number" min={0} max={65} step={0.1} value={e.tr} onChange={(ev) => setEntry(i, { tr: Number(ev.target.value) })} className={inputClass} />
              </Field>
            </div>
            <div className="col-start-2 flex justify-end pb-0.5 sm:col-start-3">
              <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-4" />
              </IconBtn>
              <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === draft.entries.length - 1}>
                <ArrowDown className="size-4" />
              </IconBtn>
              <IconBtn label="Remove step" onClick={() => remove(i)}>
                <Trash2 className="size-4" />
              </IconBtn>
            </div>
          </li>
        ))}
      </ol>
      <Button className="mt-2" onClick={add} disabled={choices.length === 0}>
        <Plus className="size-4" /> Add step
      </Button>

      <div className="mt-4 grid gap-3 border-t border-line pt-3 text-sm">
        <label className="flex items-center justify-between gap-4">
          <span>Shuffle order after each round</span>
          <Toggle label="Shuffle" checked={draft.shuffle} onChange={(shuffle) => setDraft({ ...draft, shuffle })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>Repeat forever</span>
          <Toggle label="Repeat forever" checked={draft.repeat === 0} onChange={(v) => setDraft({ ...draft, repeat: v ? 0 : 1 })} />
        </label>
        {draft.repeat > 0 && (
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
            <Field label="Rounds">
              <input type="number" min={1} max={127} value={draft.repeat} onChange={(e) => setDraft({ ...draft, repeat: Math.max(1, Math.min(127, Number(e.target.value) || 1)) })} className={inputClass} />
            </Field>
            <Field label="Then switch to">
              <select value={draft.end} onChange={(e) => setDraft({ ...draft, end: Number(e.target.value) })} className={inputClass}>
                <option value={0}>Stay on the last step</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.n || `Preset ${p.id}`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} disabled={!valid}>
          Save playlist
        </Button>
        {running >= 0 ? (
          <Button onClick={() => send({ playlist: {} })}>
            <Square className="size-4" /> Stop
          </Button>
        ) : (
          <Button onClick={() => send({ playlist: fromDraft(draft), on: true })} disabled={!valid}>
            <Play className="size-4" /> Try it
          </Button>
        )}
        {existing &&
          (confirmDelete ? (
            <span className="ml-auto flex items-center gap-2">
              <Button variant="danger" onClick={() => (send({ pdel: existing.id }), onClose())}>Delete</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </span>
          ) : (
            <Button variant="danger" className="ml-auto" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          ))}
      </div>
      <p className="mt-2 text-xs text-muted">Saving also starts the playlist on the lamp. Changing the effect or loading a preset by hand stops it.</p>
    </Card>
  )
}

function IconBtn({ label, children, ...rest }: { label: string; children: React.ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30">
      {children}
    </button>
  )
}
