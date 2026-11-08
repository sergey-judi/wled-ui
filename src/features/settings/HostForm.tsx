import { useState } from 'react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { useDevice } from '../../store/device'
import { DEFAULT_HOST, defaultHost, isLocalNetworkAddress, isSecurePage, normalizeHost, saveHost } from '../../api/config'
import { Button } from '../../components/ui'

export function HostForm() {
  const host = useDevice((s) => s.host)
  const connect = useDevice((s) => s.connect)
  const [value, setValue] = useState(host)
  const fallback = defaultHost()
  const secure = isSecurePage()
  const typed = normalizeHost(value)
  const unreachableFromHttps = secure && typed !== '' && !isLocalNetworkAddress(typed)

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (typed) connect(typed)
      }}
    >
      <label className="text-xs text-muted" htmlFor="host">
        Lamp address
      </label>
      <div className="flex gap-2">
        <input
          id="host"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={secure ? '192.168.1.106 or wled-xxxxxx.local' : DEFAULT_HOST}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[rgb(var(--accent))]"
        />
        <Button type="submit" variant="primary" disabled={!typed}>
          Connect
        </Button>
      </div>
      {unreachableFromHttps && (
        <p className="text-xs text-warn">
          Browsers only let an HTTPS page reach private addresses (192.168.x.x, 10.x.x.x, 172.16–31.x.x) or names ending in
          .local. {typed.startsWith('4.3.2.1') ? "4.3.2.1 (the lamp's own Wi-Fi) is not one of them." : 'This address will probably be blocked.'}
        </p>
      )}
      {fallback && host !== fallback && (
        <button
          type="button"
          className="justify-self-start text-xs text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setValue(fallback)
            connect(fallback)
            saveHost(null) // forget the override so build defaults apply again
          }}
        >
          Reset to {fallback}
        </button>
      )}
    </form>
  )
}

/** Shown on the HTTPS-hosted build: how the browser-to-lamp connection works there and where it doesn't. */
export function HostedNotice() {
  if (!isSecurePage()) return null
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 text-sm">
      <p className="flex gap-2">
        <ShieldCheck className="size-5 shrink-0 accent-text" />
        <span>
          Your browser talks to the lamp directly. Nothing goes through this website's server. When asked to{' '}
          <b>allow access to devices on your local network</b>, choose <b>Allow</b>.
        </span>
      </p>
      <p className="flex gap-2 text-muted">
        <TriangleAlert className="size-5 shrink-0 text-warn" />
        <span>
          Works in Chrome and Edge (desktop and Android) with the lamp on your home Wi-Fi. Safari and iPhone/iPad browsers block it, and
          so does the lamp's own Wi-Fi (4.3.2.1). There, open the copy installed on the lamp: <code>http://&lt;lamp&gt;/ui.htm</code>.
        </span>
      </p>
    </div>
  )
}
