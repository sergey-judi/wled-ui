import { useDevice } from './device'
import { focusSegment } from '../api/patch'
import { LC_CCT, LC_RGB, LC_WHITE } from '../api/types'

/** The segment whose values the Colors/Effects panels show. */
export function useFocusSegment() {
  return useDevice((s) => (s.state ? focusSegment(s.state) : undefined))
}

export function useLightCaps() {
  const seg = useFocusSegment()
  const info = useDevice((s) => s.info)
  const lc = (seg && info?.leds.seglc?.[seg.id]) ?? info?.leds.lc ?? LC_RGB
  return { rgb: !!(lc & LC_RGB), white: !!(lc & LC_WHITE), cct: !!(lc & LC_CCT) }
}

export function useCurrentEffect() {
  const seg = useFocusSegment()
  const effects = useDevice((s) => s.effects)
  return seg ? effects[seg.fx] : undefined
}

export const send = (...args: Parameters<ReturnType<typeof useDevice.getState>['send']>) => useDevice.getState().send(...args)
