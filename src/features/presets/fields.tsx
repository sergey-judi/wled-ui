import type { ReactNode } from 'react'
import type { Preset } from '../../api/types'

/** Preset ids 1–250 are stored in /presets.json on the lamp; 0 is a filler entry. */
export const MAX_PRESET_ID = 250

export type PresetItem = Preset & { id: number }

export function nextFreeId(used: Iterable<number>): number | null {
  const set = new Set(used)
  for (let i = 1; i <= MAX_PRESET_ID; i++) if (!set.has(i)) return i
  return null
}

/** Quick-load label length: SR's stock UI allows 3 characters; emoji take 2 code units each. */
export const QL_MAX = 4

export const inputClass =
  'w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm tabular-nums outline-none focus:border-[rgb(var(--accent))]'

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-xs text-muted ${className ?? ''}`} title={hint}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  )
}
