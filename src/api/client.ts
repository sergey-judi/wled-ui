import { httpBase, isSecurePage } from './config'
import type { PalettePage, PresetsFile, StatePatch, WledFull, WledInfo, WledState, WledStateInfo } from './types'

/**
 * Plain HTTP client for the WLED JSON API (0.13.x).
 *
 * The firmware adds `Access-Control-Allow-Origin: *` to every response and answers
 * OPTIONS preflights, so cross-origin calls work from any http:// origin.
 *
 * Note: the ESP's JSON buffer is shared. When two requests overlap, the second can be
 * dropped with no response, so callers should not fire requests in parallel.
 * WledConnection serialises them.
 */
export class WledHttpError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

const DEFAULT_TIMEOUT = 5000
/**
 * From an HTTPS page (hosted UI) the browser may hold the first request until the user answers
 * the "access devices on your local network" prompt, so the bootstrap call gets a long timeout.
 */
const BOOTSTRAP_TIMEOUT = isSecurePage() ? 60000 : 8000

/**
 * Chrome/Edge Local Network Access: tells the browser up front that this request targets the local
 * network, which exempts it from mixed-content blocking once the user grants permission. Private IP
 * literals and .local names are recognised automatically; this also covers other names like "lamp.lan".
 * Browsers that don't know the option ignore it.
 */
const LOCAL_NETWORK_INIT = isSecurePage() ? ({ targetAddressSpace: 'local' } as RequestInit) : {}

export class WledClient {
  readonly base: string
  constructor(host: string) {
    this.base = httpBase(host)
  }

  private async request<T>(path: string, init: RequestInit = {}, timeout = DEFAULT_TIMEOUT): Promise<T> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(this.base + path, { ...LOCAL_NETWORK_INIT, ...init, signal: ctrl.signal, cache: 'no-store' })
      if (!res.ok) throw new WledHttpError(`${init.method ?? 'GET'} ${path} → HTTP ${res.status}`, res.status)
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof WledHttpError) throw err
      if (ctrl.signal.aborted) throw new WledHttpError(`${path} timed out after ${timeout / 1000} s`)
      throw new WledHttpError(
        isSecurePage()
          ? `Cannot reach lamp at ${this.base}. The browser blocked the request or the lamp is offline (${(err as Error).message})`
          : `Cannot reach lamp at ${this.base} (${(err as Error).message})`,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  /** state + info + effect names + palette names in one call (used at startup). */
  getAll() {
    return this.request<WledFull>('/json', {}, BOOTSTRAP_TIMEOUT)
  }
  getStateInfo() {
    return this.request<WledStateInfo>('/json/si')
  }
  getState() {
    return this.request<WledState>('/json/state')
  }
  getInfo() {
    return this.request<WledInfo>('/json/info')
  }
  getEffects() {
    return this.request<string[]>('/json/eff')
  }
  getPalettes() {
    return this.request<string[]>('/json/pal')
  }
  /** Palette colour data, paginated (8 per page on ESP32, 5 on ESP8266). */
  getPalettePage(page: number) {
    return this.request<PalettePage>(`/json/palx?page=${page}`)
  }
  /** Raw presets file from the lamp's flash filesystem. Missing file → empty object. */
  async getPresets(): Promise<PresetsFile> {
    try {
      return await this.request<PresetsFile>('/presets.json')
    } catch (err) {
      if (err instanceof WledHttpError && err.status === 404) return {}
      throw err
    }
  }

  /**
   * Apply a partial state. With `v: true` WLED replies with the full new state;
   * otherwise with {"success":true}. The JSON handler only accepts application/json,
   * so this always triggers a (cacheable, 7200 s) CORS preflight when cross-origin.
   */
  postState(patch: StatePatch): Promise<WledState | { success: boolean }> {
    return this.request('/json/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }
}
