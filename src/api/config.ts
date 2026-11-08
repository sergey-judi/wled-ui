/**
 * Resolves which lamp the UI talks to.
 *
 * Priority: ?host= query param > saved setting > build default.
 *  - Lamp build (VITE_SAME_ORIGIN): the page is served by the lamp, so use its own origin.
 *  - Hosted over HTTPS (e.g. Vercel): no default, the user enters the lamp's local address.
 *  - Otherwise: VITE_WLED_HOST (.env / .env.home), falling back to WLED's AP address 4.3.2.1.
 */
const STORAGE_KEY = 'wled-ui.host'
export const DEFAULT_HOST: string = import.meta.env.VITE_WLED_HOST || '4.3.2.1'
export const SAME_ORIGIN = import.meta.env.VITE_SAME_ORIGIN === 'true'

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function normalizeHost(input: string): string {
  return input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

/** Page served over HTTPS (Vercel etc.): the lamp is reachable only via the browser's local-network permission. */
export function isSecurePage(): boolean {
  return location.protocol === 'https:'
}

/** Address the user should land on when nothing is saved. Empty = ask the user. */
export function defaultHost(): string {
  if (SAME_ORIGIN) return location.host
  return isSecurePage() ? '' : DEFAULT_HOST
}

export function getHost(): string {
  const fromQuery = new URLSearchParams(location.search).get('host')
  if (fromQuery) return normalizeHost(fromQuery)
  return read() ?? defaultHost()
}

export function saveHost(host: string | null) {
  try {
    if (host) localStorage.setItem(STORAGE_KEY, normalizeHost(host))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: setting just won't persist */
  }
}

/**
 * True when browsers treat the address as "local network" up front: a private IPv4 literal
 * or a .local (mDNS) name. Only such addresses are exempt from mixed-content blocking
 * when an HTTPS page calls them (Chrome/Edge Local Network Access).
 * Note: 4.3.2.1, the lamp's own access-point address, is a PUBLIC IP, so it doesn't qualify.
 */
export function isLocalNetworkAddress(host: string): boolean {
  const name = host.replace(/:\d+$/, '').toLowerCase()
  if (name.endsWith('.local')) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

export function httpBase(host: string) {
  return `http://${host}`
}

export function wsUrl(host: string) {
  return `ws://${host}/ws`
}
