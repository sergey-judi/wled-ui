import { create } from 'zustand'
import { WledConnection, type ConnectionStatus, type LiveFrame, type Transport } from '../api/connection'
import { getHost, saveHost } from '../api/config'
import { parseEffects, type EffectMeta } from '../api/effects'
import { applyPatch } from '../api/patch'
import type { PaletteStop, PresetsFile, StatePatch, WledInfo, WledNode, WledState } from '../api/types'
import { readJson, writeJson } from '../lib/storage'

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
  /** User switched live view on (kept across tabs; streaming runs only while a live view is on screen). */
  liveWanted: boolean

  connect(host?: string): void
  send(patch: StatePatch): void
  loadPresets(): Promise<void>
  loadPaletteData(): Promise<void>
  /** Start/stop the lamp's LED stream (called by the LivePreview component). */
  setLive(on: boolean): void
  setLiveWanted(on: boolean): void
  /** Other WLED lamps on the network (/json/nodes). */
  fetchNodes(): Promise<WledNode[]>
  /** Replace presets.json on the lamp, then reload it. */
  restorePresets(file: PresetsFile): Promise<void>
}

export interface PresetsBackup {
  at: number
  name: string
  data: PresetsFile
}

/** The last non-empty presets.json seen from each lamp, kept in this browser as a safety net. */
export const presetsBackupKey = (host: string) => `wled-ui.presets-backup:${host}`
export const readPresetsBackup = (host: string) => readJson<PresetsBackup | null>(presetsBackupKey(host), null)

const hasPresets = (p: PresetsFile) => Object.entries(p).some(([id, v]) => Number(id) > 0 && v && Object.keys(v).length > 0)

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
  liveWanted: false,

  connect(host) {
    if (host !== undefined) saveHost(host)
    const target = host ?? get().host
    conn?.stop()
    presetsPmt = -1
    paletteLoad = null
    set({ host: target, status: 'connecting', error: undefined, state: null, info: null, presets: null, paletteData: {}, liveFrame: null })
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
      if (c !== conn) return
      set({ presets, presetsError: undefined })
      if (hasPresets(presets)) writeJson(presetsBackupKey(get().host), { at: Date.now(), name: get().info?.name ?? '', data: presets } satisfies PresetsBackup)
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

  async fetchNodes() {
    const c = conn
    if (!c) return []
    return c.exclusive(() => c.client.getNodes())
  },

  async restorePresets(file) {
    const c = conn
    if (!c) throw new Error('Not connected')
    const body = new Blob([JSON.stringify(file)], { type: 'application/json' })
    await c.exclusive(() => c.client.uploadFile('/presets.json', body))
    await get().loadPresets()
  },

  setLive(on) {
    conn?.setLive(on)
  },

  setLiveWanted(on) {
    // Keep the last frame while moving between tabs (no blank flash); drop it when switched off.
    set(on ? { liveWanted: true } : { liveWanted: false, liveFrame: null })
  },
}))
