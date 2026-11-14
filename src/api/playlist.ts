import type { Playlist, StatePatch } from './types'

/** One editable row of a playlist; times in seconds for the UI. */
export interface PlaylistEntry {
  ps: number
  /** seconds the preset stays on */
  dur: number
  /** seconds to fade into it */
  tr: number
}

export interface PlaylistDraft {
  entries: PlaylistEntry[]
  /** 0 = forever */
  repeat: number
  /** preset applied when finished, 0 = stay on the last one */
  end: number
  shuffle: boolean
}

const at = (v: number[] | number | undefined, i: number, fallback: number) =>
  Array.isArray(v) ? (v[i] ?? v[v.length - 1] ?? fallback) : (v ?? fallback)

/** Firmware → editor. Missing durations fall back like playlist.cpp does (last value, else 10 s). */
export function toDraft(pl: Playlist | undefined, defaultTransition: number): PlaylistDraft {
  if (!pl) return { entries: [], repeat: 0, end: 0, shuffle: false }
  return {
    entries: (pl.ps ?? []).map((ps, i) => ({
      ps,
      dur: at(pl.dur, i, 100) / 10,
      tr: at(pl.transition, i, defaultTransition) / 10,
    })),
    repeat: pl.repeat ?? 0,
    end: pl.end ?? 0,
    shuffle: !!pl.r,
  }
}

/** Editor → firmware. Durations of 0 or 0.1 s are treated as 10 s by the lamp, so 0.2 s is the minimum. */
export function fromDraft(d: PlaylistDraft): Playlist {
  const pl: Playlist = {
    ps: d.entries.map((e) => e.ps),
    dur: d.entries.map((e) => Math.max(2, Math.round(e.dur * 10))),
    transition: d.entries.map((e) => Math.max(0, Math.round(e.tr * 10))),
    repeat: Math.max(0, Math.min(127, Math.round(d.repeat))),
    r: d.shuffle,
  }
  if (pl.repeat) pl.end = d.end
  return pl
}

/** Save a playlist as preset `id`. Like the stock UI, the lamp also starts it right away. */
export function savePlaylistCommand(id: number, name: string, draft: PlaylistDraft, ql?: string): StatePatch {
  return { psave: id, n: name, ...(ql ? { ql } : {}), o: true, on: true, playlist: fromDraft(draft) }
}

export const totalSeconds = (d: PlaylistDraft) => d.entries.reduce((s, e) => s + e.dur, 0)
