import { create } from 'zustand'
import { readJson, writeJson } from '../lib/storage'

/**
 * Favourite and recently used effects/palettes, kept in this browser only.
 * Stored by name rather than id, so they survive a lamp with a different effect list.
 */
interface Saved {
  effects: string[]
  palettes: string[]
  recentEffects: string[]
}

interface FavoritesStore extends Saved {
  toggleEffect(name: string): void
  togglePalette(name: string): void
  pushRecentEffect(name: string): void
}

const KEY = 'wled-ui.favorites'
const RECENT_MAX = 8

const load = (): Saved => {
  const v = readJson<Partial<Saved>>(KEY, {})
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  return { effects: arr(v.effects), palettes: arr(v.palettes), recentEffects: arr(v.recentEffects) }
}

const toggle = (list: string[], name: string) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name])

export const useFavorites = create<FavoritesStore>()((set, get) => {
  const save = (patch: Partial<Saved>) => {
    set(patch)
    const { effects, palettes, recentEffects } = get()
    writeJson(KEY, { effects, palettes, recentEffects })
  }
  return {
    ...load(),
    toggleEffect: (name) => save({ effects: toggle(get().effects, name) }),
    togglePalette: (name) => save({ palettes: toggle(get().palettes, name) }),
    pushRecentEffect: (name) => save({ recentEffects: [name, ...get().recentEffects.filter((n) => n !== name)].slice(0, RECENT_MAX) }),
  }
})
