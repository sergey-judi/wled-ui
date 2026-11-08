import { WledClient } from './client'
import { wsUrl } from './config'
import { mergePatches } from './patch'
import type { StatePatch, WledFull, WledInfo, WledState } from './types'

/**
 * Keeps one lamp in sync, modelled on the stock 0.13 UI:
 *
 *  1. GET /json once for state + info + effect/palette names.
 *  2. If info.ws > -1, open ws://<host>/ws. The lamp pushes {state, info} on connect
 *     and after every change (from any client, button, preset or sync).
 *     Commands go over the socket; long ones (>1000 bytes) over HTTP, since the
 *     firmware rejects fragmented WS frames.
 *  3. Without a socket, commands are POSTed to /json/state and /json/si is
 *     polled to pick up changes made elsewhere.
 *
 * Commands are queued and coalesced (latest slider value wins) and HTTP calls run
 * one at a time, because the firmware drops concurrent JSON requests.
 */

export type ConnectionStatus = 'connecting' | 'online' | 'offline'
export type Transport = 'websocket' | 'http'

export interface LiveFrame {
  /** 0 = strip, 1 = matrix, 2 = 3D (SR only, else 0). */
  layout: number
  width: number
  height: number
  /** Packed RGB triplets. */
  pixels: Uint8Array
}

export interface ConnectionHandlers {
  onFull(full: WledFull): void
  onState(state: WledState, info?: WledInfo): void
  onStatus(status: ConnectionStatus, transport: Transport | null, error?: string): void
  onLiveFrame?(frame: LiveFrame): void
}

const POLL_MS = 4000
const PING_MS = 10000
const PONG_TIMEOUT_MS = 4000
const WS_SEND_GAP_MS = 40
/** Ignore pushed state this long after our last command, to stop sliders jumping back. */
const QUIET_MS = 350
const SETTLE_MS = 450
const MAX_WS_FRAME = 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class WledConnection {
  readonly client: WledClient
  private readonly host: string
  private readonly h: ConnectionHandlers
  private ws: WebSocket | null = null
  private wsSupported = false
  private wsRetry = 0
  private wsEverOpened = false
  private isSR = false
  private live = false

  private queue: StatePatch[] = []
  private pumping = false
  private lastSendAt = 0
  private httpChain: Promise<unknown> = Promise.resolve()

  private status: ConnectionStatus = 'connecting'
  private startRetry = 0
  private stopped = false
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private pollTimer?: ReturnType<typeof setTimeout>
  private settleTimer?: ReturnType<typeof setTimeout>
  private pingTimer?: ReturnType<typeof setInterval>
  private pongTimer?: ReturnType<typeof setTimeout>

  constructor(host: string, handlers: ConnectionHandlers) {
    this.host = host
    this.h = handlers
    this.client = new WledClient(host)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  // ---------- lifecycle ----------

  async start(): Promise<void> {
    if (this.stopped) return
    this.setStatus('connecting', null)
    try {
      const full = await this.exclusive(() => this.client.getAll())
      if (this.stopped) return
      this.startRetry = 0
      this.isSR = full.info.leds.somp !== undefined || full.info.rel !== undefined
      this.wsSupported = full.info.ws > -1
      this.h.onFull(full)
      this.setStatus('online', 'http')
      if (this.wsSupported) this.openWs()
      this.schedulePoll()
    } catch (err) {
      this.fail(err)
    }
  }

  stop() {
    this.stopped = true
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.timers.forEach(clearTimeout)
    clearTimeout(this.pollTimer)
    clearTimeout(this.settleTimer)
    clearInterval(this.pingTimer)
    clearTimeout(this.pongTimer)
    this.closeWs()
  }

  /** Run HTTP calls one at a time: the firmware drops overlapping JSON requests. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.httpChain.then(fn, fn)
    this.httpChain = run.catch(() => undefined)
    return run
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }

  private setStatus(status: ConnectionStatus, transport: Transport | null, error?: string) {
    this.status = status
    this.h.onStatus(status, transport, error)
  }

  private fail(err: unknown) {
    if (this.stopped) return
    this.closeWs()
    clearTimeout(this.pollTimer)
    this.queue = []
    this.setStatus('offline', null, (err as Error)?.message ?? String(err))
    const delay = Math.min(10000, 1500 * 2 ** this.startRetry++)
    this.later(() => this.start(), delay)
  }

  private onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.stopped) return
    // Mobile browsers freeze sockets in the background. Resync on return.
    if (this.status === 'offline') return void this.start()
    if (this.wsSupported && !this.wsOpen()) this.openWs()
    this.refresh()
  }

  // ---------- WebSocket ----------

  private wsOpen() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private openWs() {
    if (this.ws || this.stopped || !this.wsSupported) return
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl(this.host))
    } catch {
      // e.g. ws:// from an HTTPS page in a browser without a local-network exemption: HTTP polling only
      this.wsSupported = false
      return
    }
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    let opened = false

    ws.onopen = () => {
      opened = true
      this.wsEverOpened = true
      this.wsRetry = 0
      this.setStatus('online', 'websocket')
      clearTimeout(this.pollTimer)
      if (this.live) ws.send('{"lv":true}')
      clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => this.ping(), PING_MS)
    }
    ws.onmessage = (ev) => this.onWsMessage(ev)
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      clearInterval(this.pingTimer)
      clearTimeout(this.pongTimer)
      if (this.stopped) return
      if (this.status !== 'offline') this.setStatus('online', 'http')
      this.schedulePoll(0)
      // A socket that never opened after several attempts is being blocked (browser policy, proxy…):
      // stop retrying and stay on HTTP polling, which works wherever plain requests do.
      if (!opened && !this.wsEverOpened && this.wsRetry >= 3) {
        this.wsSupported = false
        return
      }
      const delay = Math.min(15000, 1000 * 2 ** this.wsRetry++)
      this.later(() => this.status !== 'offline' && this.openWs(), delay)
    }
  }

  private closeWs() {
    const ws = this.ws
    this.ws = null
    clearInterval(this.pingTimer)
    clearTimeout(this.pongTimer)
    if (ws) {
      ws.onclose = null
      ws.close()
    }
  }

  private ping() {
    if (!this.wsOpen()) return
    this.ws!.send('p') // app-level heartbeat, firmware answers "pong"
    clearTimeout(this.pongTimer)
    this.pongTimer = setTimeout(() => {
      // Socket looks dead (common after Wi-Fi roaming). Drop it and fall back to HTTP.
      const ws = this.ws
      if (ws) ws.close()
      ws?.onclose?.(new CloseEvent('close'))
    }, PONG_TIMEOUT_MS)
  }

  private onWsMessage(ev: MessageEvent) {
    clearTimeout(this.pongTimer)
    if (ev.data instanceof ArrayBuffer) return this.onLiveData(new Uint8Array(ev.data))
    if (typeof ev.data !== 'string' || ev.data === 'pong') return
    let msg: { state?: WledState; info?: WledInfo; error?: number }
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.state && this.isQuiet()) this.h.onState(msg.state, msg.info)
  }

  // ---------- live view ----------

  setLive(on: boolean) {
    this.live = on
    if (this.wsOpen()) this.ws!.send(JSON.stringify({ lv: on }))
  }

  private onLiveData(b: Uint8Array) {
    if (b[0] !== 0x4c /* 'L' */ || !this.h.onLiveFrame) return
    // SR 0.13.4 header: L, ver, layout, width, height, depth, preset, playlist (8 bytes).
    // Upstream 0.13 header: L, ver (2 bytes).
    const header = this.isSR ? 8 : 2
    const pixels = b.subarray(header, header + Math.floor((b.length - header) / 3) * 3)
    const layout = this.isSR ? b[2] : 0
    const count = pixels.length / 3
    const width = this.isSR && layout > 0 ? b[3] : count
    const height = this.isSR && layout > 0 ? b[4] : 1
    this.h.onLiveFrame({ layout, width, height, pixels })
  }

  // ---------- commands ----------

  send(patch: StatePatch) {
    if (this.status === 'offline') return // UI shows offline; the state resyncs on reconnect
    const last = this.queue[this.queue.length - 1]
    const merged = last ? mergePatches(last, patch) : null
    if (merged) this.queue[this.queue.length - 1] = merged
    else this.queue.push(patch)
    void this.pump()
  }

  private isQuiet() {
    return !this.pumping && this.queue.length === 0 && Date.now() - this.lastSendAt > QUIET_MS
  }

  private async pump() {
    if (this.pumping || this.status === 'offline') return
    this.pumping = true
    try {
      while (this.queue.length) {
        const patch = { ...this.queue.shift()!, v: true }
        const body = JSON.stringify(patch)
        if (this.wsOpen() && body.length <= MAX_WS_FRAME) {
          this.ws!.send(body)
          this.lastSendAt = Date.now()
          await sleep(WS_SEND_GAP_MS)
        } else {
          const res = await this.exclusive(() => this.client.postState(patch))
          this.lastSendAt = Date.now()
          // The reply to the last queued command is authoritative.
          if (this.queue.length === 0 && 'seg' in res) this.h.onState(res)
        }
      }
    } catch (err) {
      this.pumping = false
      return this.fail(err)
    }
    this.pumping = false
    this.scheduleSettle()
  }

  /** Shortly after the last command, fetch the confirmed state once. */
  private scheduleSettle() {
    clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(() => {
      if (!this.isQuiet()) return this.scheduleSettle()
      this.refresh()
    }, SETTLE_MS)
  }

  /** Ask the lamp for its current state; the answer flows through onState. */
  refresh() {
    if (this.status === 'offline') return
    if (this.wsOpen()) {
      this.ws!.send('{"v":true}')
      return
    }
    this.exclusive(() => this.client.getStateInfo())
      .then((si) => this.isQuiet() && this.h.onState(si.state, si.info))
      .catch((err) => this.fail(err))
  }

  /** HTTP polling, only while there is no WebSocket. Doubles as the heartbeat. */
  private schedulePoll(delay = POLL_MS) {
    clearTimeout(this.pollTimer)
    this.pollTimer = setTimeout(() => {
      if (this.stopped || this.wsOpen() || this.status === 'offline') return
      if (document.visibilityState === 'visible') this.refresh()
      this.schedulePoll()
    }, delay)
  }
}
