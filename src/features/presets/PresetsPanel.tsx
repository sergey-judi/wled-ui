import { useMemo, useState } from 'react'
import { Bookmark, ListMusic, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send } from '../../store/hooks'
import { Button, Card, Empty, cx } from '../../components/ui'

/** Preset ids 1–250 are stored in /presets.json on the lamp; 0 is a filler entry. */
const MAX_PRESET_ID = 250

export function PresetsPanel() {
  const presets = useDevice((s) => s.presets)
  const error = useDevice((s) => s.presetsError)
  const current = useDevice((s) => s.state?.ps ?? -1)
  const playlist = useDevice((s) => s.state?.pl ?? -1)
  const loadPresets = useDevice((s) => s.loadPresets)
  const [editing, setEditing] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const list = useMemo(
    () =>
      Object.entries(presets ?? {})
        .map(([id, p]) => ({ id: Number(id), ...p }))
        .filter((p) => p.id > 0 && Object.keys(p).length > 1)
        .sort((a, b) => a.id - b.id),
    [presets],
  )

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title={`Presets${list.length ? ` · ${list.length}` : ''}`}
        action={
          <div className="flex gap-1">
            <Button variant="ghost" aria-label="Reload presets" onClick={() => void loadPresets()}>
              <RefreshCw className="size-4" />
            </Button>
            {list.length > 0 && (
              <Button variant="ghost" onClick={() => (setEditing(!editing), setConfirmId(null))}>
                {editing ? 'Done' : 'Edit'}
              </Button>
            )}
          </div>
        }
      >
        {error && !presets && <p className="mb-3 text-sm text-bad">Could not load presets: {error}</p>}
        {presets && list.length === 0 && (
          <Empty icon={<Bookmark className="size-8" />} title="No presets yet">
            Save the current look below to create one.
          </Empty>
        )}
        {!presets && !error && <p className="text-sm text-muted">Loading…</p>}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const active = current === p.id || playlist === p.id
            const isPlaylist = !!p.playlist
            return (
              <li key={p.id} className="relative">
                <button
                  type="button"
                  disabled={editing}
                  onClick={() => send({ ps: p.id })}
                  className={cx(
                    'flex h-full w-full flex-col items-start gap-2 rounded-2xl p-3 text-left transition-colors',
                    active ? 'bg-[rgb(var(--accent)/0.2)] ring-1 ring-[rgb(var(--accent)/0.6)]' : 'bg-surface-2/70 hover:bg-surface-2',
                  )}
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-bg/60 text-base">
                    {p.ql ? p.ql : isPlaylist ? <ListMusic className="size-4 text-muted" /> : <Bookmark className="size-4 text-muted" />}
                  </span>
                  <span className="w-full">
                    <span className="block truncate text-sm font-medium">{p.n || `Preset ${p.id}`}</span>
                    <span className="text-xs text-muted">
                      #{p.id}
                      {isPlaylist ? ' · playlist' : ''}
                      {active ? ' · active' : ''}
                    </span>
                  </span>
                </button>
                {editing &&
                  (confirmId === p.id ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-bg/90 p-2">
                      <span className="text-xs">Delete “{p.n || p.id}”?</span>
                      <div className="flex gap-1">
                        <Button variant="danger" className="px-3 py-1.5" onClick={() => (send({ pdel: p.id }), setConfirmId(null))}>
                          Delete
                        </Button>
                        <Button className="px-3 py-1.5" onClick={() => setConfirmId(null)} aria-label="Cancel">
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${p.n || p.id}`}
                      onClick={() => setConfirmId(p.id)}
                      className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-bad/20 text-bad"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      </Card>
      {presets && <SavePreset usedIds={new Set(list.map((p) => p.id))} />}
    </div>
  )
}

function SavePreset({ usedIds }: { usedIds: Set<number> }) {
  const [name, setName] = useState('')
  const nextId = useMemo(() => {
    for (let i = 1; i <= MAX_PRESET_ID; i++) if (!usedIds.has(i)) return i
    return null
  }, [usedIds])

  const save = () => {
    if (!nextId) return
    // ib/sb: include brightness and segment layout, like the stock UI's defaults.
    send({ psave: nextId, n: name.trim() || `Preset ${nextId}`, ib: true, sb: true })
    setName('')
  }

  return (
    <Card title="Save current look">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          placeholder={nextId ? `Preset ${nextId}` : 'Preset storage full'}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[rgb(var(--accent))]"
        />
        <Button type="submit" variant="primary" disabled={!nextId}>
          <Plus className="size-4" /> Save
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">Stored on the lamp as preset #{nextId ?? '—'} (brightness, colours, effect and segments).</p>
    </Card>
  )
}
