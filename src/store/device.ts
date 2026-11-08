import { create } from 'zustand'
import { WledConnection, type ConnectionStatus, type LiveFrame, type Transport } from '../api/connection'
import { getHost, saveHost } from '../api/config'
import { parseEffects, type EffectMeta } from '../api/effects'
import { applyPatch } from '../api/patch'
import type { PaletteStop, PresetsFile, StatePatch, WledInfo, WledState } from '../api/types'

/**
 * Single source of truth for the UI. Components read from here and call the
 * actions. They never talk to the network directly.
 */
interface DeviceStore {
  host: string
  status: ConnectionStatus
  transport: Transport | null
  error?: string
  lastSeen?: number

  state: WledState | null
  info: WledInfo | null
  effects: EffectMeta[]
  palettes: string[]
  /** id → colour stops from /json/palx (loaded lazily). */
  paletteData: Record<number, PaletteStop[]>
  presets: PresetsFile | null
  presetsError?: string
  liveFrame: LiveFrame | null

  connect(host?: string): void
  send(patch: StatePatch): void
  loadPresets(): Promise<void>
  loadPaletteData(): Promise<void>
  setLive(on: boolean): void
}

let conn: WledConnection | null = null
let presetsPmt = -1
let paletteLoad: Promise<void> | null = null

const PAL_CACHE_KEY = 'wled-ui.palx'

export const useDevice = create<DeviceStore>()((set, get) => ({
  host: getHost(),
  status: 'connecting',
  transport: null,
  state: null,
  info: null,
  effects: [],
  palettes: [],
  paletteData: {},
  presets: null,
  liveFrame: null,

  connect(host) {
    if (host !== undefined) saveHost(host)
    const target = host ?? get().host
    conn?.stop()
    presetsPmt = -1
    paletteLoad = null
    set({ host: target, status: 'connecting', error: undefined, state: null, info: null, presets: null, paletteData: {} })
    if (!target) {
      // Hosted (HTTPS) build on first visit: wait for the user to enter the lamp's address.
      conn = null
      set({ status: 'offline' })
      return
    }
    conn = new WledConnection(target, {
      onFull(full) {
        set({
          state: full.state,
          info: full.info,
          effects: parseEffects(full.effects),
          palettes: full.palettes,
          lastSeen: Date.now(),
        })
        void get().loadPresets()
      },
      onState(state, info) {
        set((s) => ({ state, info: info ?? s.info, lastSeen: Date.now() }))
        // The firmware bumps fs.pmt whenever presets.json changes.
        if (info && info.fs.pmt !== presetsPmt) void get().loadPresets()
      },
      onStatus(status, transport, error) {
        set({ status, transport, error })
      },
      onLiveFrame(frame) {
        set({ liveFrame: frame })
      },
    })
    void conn.start()
  },

  send(patch) {
    const { state } = get()
    if (state) set({ state: applyPatch(state, patch) }) // optimistic
    conn?.send(patch)
    // Saving/deleting presets changes presets.json: reload it once the lamp has written it.
    if (patch.psave !== undefined || patch.pdel !== undefined) setTimeout(() => void get().loadPresets(), 600)
  },

  async loadPresets() {
    if (!conn) return
    const c = conn
    presetsPmt = get().info?.fs.pmt ?? -1
    try {
      const presets = await c.exclusive(() => c.client.getPresets())
      if (c === conn) set({ presets, presetsError: undefined })
    } catch (err) {
      if (c === conn) set({ presetsError: (err as Error).message })
    }
  },

  /** Fetch every /json/palx page sequentially; cached per firmware build. */
  loadPaletteData() {
    if (paletteLoad) return paletteLoad
    const c = conn
    const info = get().info
    if (!c || !info) return Promise.resolve()
    const cacheKey = `${info.vid}:${info.palcount}`
    try {
      const cached = JSON.parse(localStorage.getItem(PAL_CACHE_KEY) ?? 'null')
      if (cached?.key === cacheKey) {
        set({ paletteData: cached.data })
        return (paletteLoad = Promise.resolve())
      }
    } catch {
      /* ignore broken cache */
    }
    paletteLoad = (async () => {
      const data: Record<number, PaletteStop[]> = {}
      let page = 0
      let maxPage = 0
      do {
        const res = await c.exclusive(() => c.client.getPalettePage(page))
        if (c !== conn) return
        maxPage = res.m
        for (const [id, stops] of Object.entries(res.p)) data[Number(id)] = stops
        set({ paletteData: { ...data } })
      } while (++page <= maxPage)
      try {
        localStorage.setItem(PAL_CACHE_KEY, JSON.stringify({ key: cacheKey, data }))
      } catch {
        /* storage full or unavailable */
      }
    })().catch(() => {
      paletteLoad = null // retry next time the panel is opened
    })
    return paletteLoad
  },

  setLive(on) {
    conn?.setLive(on)
    if (!on) set({ liveFrame: null })
  },
}))
