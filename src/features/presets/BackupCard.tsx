import { useRef, useState } from 'react'
import { Download, HardDriveUpload, History } from 'lucide-react'
import { readPresetsBackup, useDevice } from '../../store/device'
import { Button, Card } from '../../components/ui'
import { downloadText } from '../../lib/storage'
import type { PresetsFile } from '../../api/types'

const count = (p: PresetsFile) => Object.entries(p).filter(([id, v]) => Number(id) > 0 && v && Object.keys(v).length > 0).length

function parsePresets(text: string): PresetsFile {
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not a presets file')
  for (const [id, v] of Object.entries(data)) {
    if (!/^\d+$/.test(id) || Number(id) > 255 || typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`Unexpected entry “${id}”`)
  }
  return data as PresetsFile
}

type Pending = { source: string; data: PresetsFile }

/** Download presets.json, restore it from a file, or from the copy this browser kept. */
export function BackupCard() {
  const presets = useDevice((s) => s.presets)
  const host = useDevice((s) => s.host)
  const name = useDevice((s) => s.info?.name ?? 'wled')
  const restorePresets = useDevice((s) => s.restorePresets)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const local = readPresetsBackup(host)
  // Only offer the browser copy when it differs from what the lamp has now.
  const localDiffers = local && JSON.stringify(local.data) !== JSON.stringify(presets)

  const download = () => {
    const date = new Date().toISOString().slice(0, 10)
    const safe = name.replace(/[^\w-]+/g, '_')
    downloadText(`${safe}-presets-${date}.json`, JSON.stringify(presets ?? {}))
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      setPending({ source: `file ${file.name}`, data: parsePresets(await file.text()) })
      setMessage(null)
    } catch (err) {
      setMessage({ ok: false, text: `Can't use ${file.name}: ${(err as Error).message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const restore = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await restorePresets(pending.data)
      setMessage({ ok: true, text: `Restored ${count(pending.data)} presets from ${pending.source}.` })
      setPending(null)
    } catch (err) {
      const text = (err as Error).message
      setMessage({ ok: false, text: /ota/i.test(text) ? 'The lamp refused: turn off “OTA lock” in WLED settings → Security & Updates.' : text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Backup">
      <div className="flex flex-wrap gap-2">
        <Button onClick={download} disabled={!presets || count(presets) === 0}>
          <Download className="size-4" /> Download
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <HardDriveUpload className="size-4" /> Restore from file
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {localDiffers && (
          <Button onClick={() => setPending({ source: `this browser's copy from ${new Date(local.at).toLocaleString()}`, data: local.data })}>
            <History className="size-4" /> Restore browser copy
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        This browser also keeps the last presets it saw from this lamp, in case the lamp's file gets lost or corrupted.
      </p>

      {pending && (
        <div className="mt-3 rounded-2xl bg-warn/10 p-3 text-sm">
          <p>
            Replace all presets on the lamp with {count(pending.data)} presets from {pending.source}? Presets not in the file are
            lost. Download a backup first if unsure.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => void restore()} disabled={busy}>
              {busy ? 'Restoring…' : 'Replace presets'}
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message && <p className={message.ok ? 'mt-3 text-sm text-ok' : 'mt-3 text-sm text-bad'}>{message.text}</p>}
    </Card>
  )
}
