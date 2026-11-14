import { useCallback, useEffect, useState } from 'react'
import { ArrowRightLeft, RefreshCw, Router } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send } from '../../store/hooks'
import { Button, Card, Empty, Toggle } from '../../components/ui'
import type { WledNode } from '../../api/types'

/** UDP sync with other WLED lamps (state.udpn). */
export function SyncCard() {
  const udpn = useDevice((s) => s.state?.udpn)
  if (!udpn) return null
  return (
    <Card title="Sync with other lamps">
      <div className="grid gap-3 text-sm">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block">Send changes</span>
            <span className="text-xs text-muted">Other lamps follow what you do here</span>
          </span>
          <Toggle label="Send sync" checked={udpn.send} onChange={(v) => send({ udpn: { send: v } })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block">Receive changes</span>
            <span className="text-xs text-muted">This lamp follows other lamps</span>
          </span>
          <Toggle label="Receive sync" checked={udpn.recv} onChange={(v) => send({ udpn: { recv: v } })} />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">
        Lamps sync over the local network on the UDP port set in WLED settings → Sync. These switches last until the lamp
        restarts, unless you save them there.
      </p>
    </Card>
  )
}

const chip = (type: number) => (type === 32 ? 'ESP32' : type === 82 ? 'ESP8266' : `type ${type}`)

/** Other WLED devices this lamp has discovered (/json/nodes), with a one-tap switch. */
export function NodesCard() {
  const ndc = useDevice((s) => s.info?.ndc ?? -1)
  const fetchNodes = useDevice((s) => s.fetchNodes)
  const connect = useDevice((s) => s.connect)
  const host = useDevice((s) => s.host)
  const [nodes, setNodes] = useState<WledNode[] | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setNodes((await fetchNodes()).sort((a, b) => a.name.localeCompare(b.name)))
      setError(undefined)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [fetchNodes])

  useEffect(() => {
    if (ndc >= 0) void load()
  }, [ndc, load])

  return (
    <Card
      title="Other lamps"
      action={
        ndc >= 0 && (
          <Button variant="ghost" aria-label="Refresh lamp list" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
          </Button>
        )
      }
    >
      {ndc < 0 ? (
        <p className="text-sm text-muted">
          Turn on <span className="text-fg">“Enable instance list”</span> in WLED settings → Sync Interfaces to see the
          other lamps here.
        </p>
      ) : error ? (
        <p className="text-sm text-bad">Could not load the list: {error}</p>
      ) : nodes && nodes.length === 0 ? (
        <Empty icon={<Router className="size-8" />} title="No other lamps found">
          Lamps announce themselves on the sync port. The others need “Make this instance discoverable” turned on in WLED
          settings → Sync Interfaces.
        </Empty>
      ) : (
        <ul className="grid gap-2">
          {(nodes ?? []).map((n) => (
            <li key={n.ip} className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{n.name}</span>
                <span className="block truncate text-xs text-muted">
                  {n.ip} · {chip(n.type)} · build {n.vid}
                </span>
              </span>
              <Button className="px-3 py-1.5" disabled={n.ip === host} onClick={() => connect(n.ip)}>
                <ArrowRightLeft className="size-4" /> {n.ip === host ? 'Current' : 'Control'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
