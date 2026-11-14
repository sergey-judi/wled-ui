import { describe, expect, it } from 'vitest'
import { fromDraft, savePlaylistCommand, toDraft } from './playlist'

describe('playlist conversion', () => {
  it('expands single-number durations and transitions', () => {
    const d = toDraft({ ps: [1, 2, 3], dur: 300, transition: 7, repeat: 2, end: 4 }, 7)
    expect(d.entries).toEqual([
      { ps: 1, dur: 30, tr: 0.7 },
      { ps: 2, dur: 30, tr: 0.7 },
      { ps: 3, dur: 30, tr: 0.7 },
    ])
    expect(d).toMatchObject({ repeat: 2, end: 4, shuffle: false })
  })

  it('repeats the last array value for missing entries, like playlist.cpp', () => {
    const d = toDraft({ ps: [1, 2, 3], dur: [50, 80], transition: [] }, 10)
    expect(d.entries.map((e) => e.dur)).toEqual([5, 8, 8])
    expect(d.entries.map((e) => e.tr)).toEqual([1, 1, 1])
  })

  it('round-trips and only stores an end preset for finite playlists', () => {
    const pl = { ps: [5, 6], dur: [100, 250], transition: [0, 20], repeat: 3, end: 5, r: true }
    expect(fromDraft(toDraft(pl, 7))).toEqual(pl)
    expect(fromDraft({ ...toDraft(pl, 7), repeat: 0 })).not.toHaveProperty('end')
  })

  it('clamps durations the lamp would replace with 10 s', () => {
    expect(fromDraft({ entries: [{ ps: 1, dur: 0, tr: -1 }], repeat: 0, end: 0, shuffle: false }).dur).toEqual([2])
  })

  it('saves verbatim with "o" so the lamp does not capture the current state', () => {
    const cmd = savePlaylistCommand(9, 'Evening', { entries: [{ ps: 1, dur: 10, tr: 1 }], repeat: 0, end: 0, shuffle: false }, '🌙')
    expect(cmd).toMatchObject({ psave: 9, n: 'Evening', ql: '🌙', o: true, on: true, playlist: { ps: [1] } })
  })
})
