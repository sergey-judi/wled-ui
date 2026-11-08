import { useEffect, useState, type ComponentType } from 'react'
import { Bookmark, House, Layers, Loader2, Palette, Power, Settings2, Sparkles, WifiOff } from 'lucide-react'
import { useDevice } from './store/device'
import { send, useFocusSegment } from './store/hooks'
import { isBlack } from './lib/color'
import { cx } from './components/ui'
import { Dashboard } from './features/dashboard/Dashboard'
import { ColorsPanel } from './features/colors/ColorsPanel'
import { EffectsPanel } from './features/effects/EffectsPanel'
import { PresetsPanel } from './features/presets/PresetsPanel'
import { SegmentsPanel } from './features/segments/SegmentsPanel'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { HostForm, HostedNotice } from './features/settings/HostForm'

const TABS = [
  { id: 'home', label: 'Home', icon: House, Panel: Dashboard },
  { id: 'color', label: 'Color', icon: Palette, Panel: ColorsPanel },
  { id: 'effects', label: 'Effects', icon: Sparkles, Panel: EffectsPanel },
  { id: 'presets', label: 'Presets', icon: Bookmark, Panel: PresetsPanel },
  { id: 'segments', label: 'Segments', icon: Layers, Panel: SegmentsPanel },
  { id: 'settings', label: 'Settings', icon: Settings2, Panel: SettingsPanel },
] as const satisfies readonly { id: string; label: string; icon: ComponentType<{ className?: string }>; Panel: ComponentType }[]

type TabId = (typeof TABS)[number]['id']

function useHashTab(): [TabId, (t: TabId) => void] {
  const read = () => (TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'home') as TabId
  const [tab, setTab] = useState<TabId>(read)
  useEffect(() => {
    const on = () => setTab(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return [tab, (t) => (location.hash = t)]
}

/** Tint the whole UI with the lamp's current primary colour. */
function useAccent() {
  const seg = useFocusSegment()
  const on = useDevice((s) => s.state?.on)
  useEffect(() => {
    const c = seg?.col[0]
    const accent = on && c && !isBlack(c) ? `${Math.min(255, c[0] + (c[3] ?? 0))} ${Math.min(255, c[1] + (c[3] ?? 0))} ${Math.min(255, c[2] + (c[3] ?? 0))}` : '139 92 246'
    document.documentElement.style.setProperty('--accent', accent)
  }, [seg, on])
}

export default function App() {
  const connect = useDevice((s) => s.connect)
  const ready = useDevice((s) => !!s.state && !!s.info)
  const [tab, setTab] = useHashTab()
  useAccent()
  useEffect(() => connect(), [connect])

  const Panel = TABS.find((t) => t.id === tab)!.Panel

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl">
      <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 p-4 md:flex">
        <div className="mb-6 px-3 pt-2 text-lg font-semibold tracking-tight">
          wled<span className="accent-text">·</span>ui
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            disabled={!ready && t.id !== 'settings'}
            className={cx(
              'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors disabled:opacity-40',
              tab === t.id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
            )}
          >
            <t.icon className="size-5" /> {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-4 pt-2 pb-28 sm:px-6 md:pb-8">
          {ready ? <Panel /> : tab === 'settings' ? <SettingsPanel /> : <ConnectScreen />}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-lg md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              disabled={!ready && t.id !== 'settings'}
              className={cx('flex flex-col items-center gap-1 py-2 text-[11px] transition-colors disabled:opacity-40', tab === t.id ? 'text-fg' : 'text-muted')}
            >
              <t.icon className={cx('size-5', tab === t.id && 'accent-text')} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Header() {
  const info = useDevice((s) => s.info)
  const state = useDevice((s) => s.state)
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg/70 px-4 py-3 backdrop-blur-lg sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">{info?.name ?? 'WLED lamp'}</h1>
        <StatusLine />
      </div>
      {state && (
        <button
          type="button"
          onClick={() => send({ on: !state.on })}
          aria-label={state.on ? 'Turn off' : 'Turn on'}
          className={cx(
            'grid size-11 place-items-center rounded-full transition-colors',
            state.on ? 'bg-[rgb(var(--accent))] text-white shadow-[0_0_24px_rgb(var(--accent)/0.5)]' : 'border border-line bg-surface-2 text-muted',
          )}
        >
          <Power className="size-5" />
        </button>
      )}
    </header>
  )
}

function StatusLine() {
  const status = useDevice((s) => s.status)
  const transport = useDevice((s) => s.transport)
  const host = useDevice((s) => s.host)
  const dot = status === 'online' ? (transport === 'websocket' ? 'bg-ok' : 'bg-warn') : status === 'connecting' ? 'bg-warn animate-pulse' : 'bg-bad'
  const text =
    status === 'online' ? (transport === 'websocket' ? 'Connected · live' : 'Connected · polling') : status === 'connecting' ? 'Connecting…' : 'Offline'
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted" role="status">
      <span className={cx('size-2 rounded-full', dot)} />
      {text}{host ? ` · ${host}` : ''}
    </p>
  )
}

function ConnectScreen() {
  const status = useDevice((s) => s.status)
  const error = useDevice((s) => s.error)
  const host = useDevice((s) => s.host)

  const title = !host ? 'Connect to your lamp' : status === 'connecting' ? `Looking for the lamp at ${host}…` : 'Lamp not reachable'
  return (
    <div className="mx-auto grid max-w-md gap-4 pt-8">
      <div className="flex flex-col items-center gap-3 text-center">
        {status === 'connecting' ? <Loader2 className="size-10 animate-spin text-muted" /> : <WifiOff className={cx('size-10', host ? 'text-bad' : 'text-muted')} />}
        <h2 className="text-xl font-semibold">{title}</h2>
        {status === 'offline' && host && error && <p className="text-sm break-words text-muted">{error}</p>}
      </div>

      <HostedNotice />

      <div className="rounded-3xl border border-line bg-surface/80 p-4">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Be on the same Wi-Fi as the lamp (its own network or your home network).</li>
          <li>Enter the lamp's address: 4.3.2.1 on its own Wi-Fi, otherwise the IP your router gave it.</li>
          <li>Keep this page open. It reconnects automatically.</li>
        </ol>
        <HostForm />
      </div>
    </div>
  )
}
