import { useMemo, useState } from 'react'
import { Bookmark, ListMusic, Pencil, Plus, RefreshCw, Square } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send } from '../../store/hooks'
import { Button, Card, Empty, cx } from '../../components/ui'
import type { StatePatch } from '../../api/types'
import { PlaylistEditor } from './PlaylistEditor'
import { BackupCard } from './BackupCard'
import { Field, QL_MAX, inputClass, nextFreeId, type PresetItem } from './fields'

/** Sorted, non-empty presets from presets.json. */
export function usePresetList(): PresetItem[] {
  const presets = useDevice((s) => s.presets)
  return useMemo(
    () =>
      Object.entries(presets ?? {})
        .map(([id, p]) => ({ ...p, id: Number(id) }))
        .filter((p) => p.id > 0 && Object.keys(p).length > 1)
        .sort((a, b) => a.id - b.id),
    [presets],
  )
}

type Editing = { kind: 'preset'; id: number } | { kind: 'playlist'; id: number | null } | null

export function PresetsPanel() {
  const presets = useDevice((s) => s.presets)
  const error = useDevice((s) => s.presetsError)
  const current = useDevice((s) => s.state?.ps ?? -1)
  const playlist = useDevice((s) => s.state?.pl ?? -1)
  const loadPresets = useDevice((s) => s.loadPresets)
  const list = usePresetList()
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)

  const open = (p: PresetItem) => setEditing(p.playlist ? { kind: 'playlist', id: p.id } : { kind: 'preset', id: p.id })
  const editedPreset = editing?.kind === 'preset' ? list.find((p) => p.id === editing.id) : undefined

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Card
          title={`Presets${list.length ? ` · ${list.length}` : ''}`}
          action={
            <div className="flex gap-1">
              {playlist >= 0 && (
                <Button variant="ghost" onClick={() => send({ playlist: {} })} title="Stop the running playlist">
                  <Square className="size-4" /> Stop playlist
                </Button>
              )}
              <Button variant="ghost" aria-label="Reload presets" onClick={() => void loadPresets()}>
                <RefreshCw className="size-4" />
              </Button>
              {list.length > 0 && (
                <Button variant="ghost" onClick={() => (setEditMode(!editMode), setEditing(null))}>
                  {editMode ? 'Done' : 'Edit'}
                </Button>
              )}
            </div>
          }
        >
          {error && !presets && <p className="mb-3 text-sm text-bad">Could not load presets: {error}</p>}
          {presets && list.length === 0 && (
            <Empty icon={<Bookmark className="size-8" />} title="No presets yet">
              Save the current look to create one.
            </Empty>
          )}
          {!presets && !error && <p className="text-sm text-muted">Loading…</p>}
          {editMode && list.length > 0 && <p className="mb-3 text-sm text-muted">Tap a preset or playlist to edit it.</p>}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((p) => {
              const active = current === p.id || playlist === p.id
              const isPlaylist = !!p.playlist
              const selected = editing && editing.id === p.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => (editMode ? open(p) : send({ ps: p.id }))}
                    className={cx(
                      'relative flex h-full w-full flex-col items-start gap-2 rounded-2xl p-3 text-left transition-colors',
                      active ? 'bg-[rgb(var(--accent)/0.2)] ring-1 ring-[rgb(var(--accent)/0.6)]' : 'bg-surface-2/70 hover:bg-surface-2',
                      selected && 'ring-2 ring-fg',
                    )}
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-bg/60 text-base">
                      {p.ql ? p.ql : isPlaylist ? <ListMusic className="size-4 text-muted" /> : <Bookmark className="size-4 text-muted" />}
                    </span>
                    <span className="w-full">
                      <span className="block truncate text-sm font-medium">{p.n || `Preset ${p.id}`}</span>
                      <span className="text-xs text-muted">
                        #{p.id}
                        {isPlaylist ? ` · playlist · ${p.playlist!.ps?.length ?? 0}` : ''}
                        {active ? ' · active' : ''}
                      </span>
                    </span>
                    {editMode && <Pencil className="absolute top-3 right-3 size-4 text-muted" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
        {editing?.kind === 'playlist' && (
          <PlaylistEditor key={editing.id ?? 'new'} id={editing.id} presets={list} onClose={() => setEditing(null)} />
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        {editedPreset && <PresetEditor key={editedPreset.id} preset={editedPreset} onClose={() => setEditing(null)} />}
        {presets && <SavePreset usedIds={list.map((p) => p.id)} />}
        {presets && editing?.kind !== 'playlist' && (
          <Card title="Playlists">
            <p className="mb-3 text-sm text-muted">Cycle through presets automatically, each for as long as you like.</p>
            <Button onClick={() => setEditing({ kind: 'playlist', id: null })} disabled={!list.some((p) => !p.playlist)}>
              <ListMusic className="size-4" /> New playlist
            </Button>
            {!list.some((p) => !p.playlist) && <p className="mt-2 text-xs text-muted">Save a preset first.</p>}
          </Card>
        )}
        {presets && <BackupCard />}
      </div>
    </div>
  )
}

function SavePreset({ usedIds }: { usedIds: number[] }) {
  const [name, setName] = useState('')
  const [ql, setQl] = useState('')
  const nextId = useMemo(() => nextFreeId(usedIds), [usedIds])

  const save = () => {
    if (!nextId) return
    // ib/sb: include brightness and segment layout, like the stock UI's defaults.
    send({ psave: nextId, n: name.trim() || `Preset ${nextId}`, ...(ql.trim() ? { ql: ql.trim() } : {}), ib: true, sb: true })
    setName('')
    setQl('')
  }

  return (
    <Card title="Save current look">
      <form
        className="grid grid-cols-[1fr_5rem] gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Name">
          <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder={nextId ? `Preset ${nextId}` : 'Preset storage full'} className={inputClass} />
        </Field>
        <Field label="Icon" hint="1–3 characters or an emoji">
          <input value={ql} maxLength={QL_MAX} onChange={(e) => setQl(e.target.value)} placeholder="★" className={cx(inputClass, 'text-center')} />
        </Field>
        <Button type="submit" variant="primary" disabled={!nextId} className="col-span-2">
          <Plus className="size-4" /> Save as preset #{nextId ?? '—'}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">Stores brightness, colours, effect and segments on the lamp.</p>
    </Card>
  )
}

/** Rename / relabel / overwrite / delete a regular preset. */
function PresetEditor({ preset, onClose }: { preset: PresetItem; onClose(): void }) {
  const [name, setName] = useState(preset.n ?? '')
  const [ql, setQl] = useState(preset.ql ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const label = { n: name.trim() || `Preset ${preset.id}`, ...(ql.trim() ? { ql: ql.trim() } : {}) }

  /** Re-store the preset's own content with the new name. The lamp applies a preset while saving it. */
  const saveLabels = () => {
    const { id, n: _n, ql: _ql, ...content } = preset
    void _n
    void _ql
    send({ ...(content as StatePatch), psave: id, ...label, o: true })
    onClose()
  }
  const overwrite = () => {
    send({ psave: preset.id, ...label, ib: true, sb: true })
    onClose()
  }

  return (
    <Card title={`Edit preset #${preset.id}`} action={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Field label="Name">
          <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Icon">
          <input value={ql} maxLength={QL_MAX} onChange={(e) => setQl(e.target.value)} className={cx(inputClass, 'text-center')} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={saveLabels}>Save name & icon</Button>
        <Button onClick={overwrite} title="Replace the stored look with what the lamp shows now">
          Overwrite with current look
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">Saving the name also switches the lamp to this preset.</p>
      <div className="mt-4 border-t border-line pt-3">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1">Delete “{preset.n || preset.id}”?</span>
            <Button variant="danger" onClick={() => (send({ pdel: preset.id }), onClose())}>Delete</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete preset</Button>
        )}
      </div>
    </Card>
  )
}
