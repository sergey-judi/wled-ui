import { useEffect, useRef } from 'react'
import { Activity } from 'lucide-react'
import { useDevice } from '../store/device'
import { Card, Toggle } from './ui'

/**
 * Real-time LED colours streamed by the lamp over the WebSocket ({"lv":true}).
 * The firmware streams to a single client at a time, so this is opt-in.
 *
 * Used on several tabs. The on/off choice lives in the store, so it survives tab switches,
 * while the stream itself only runs while a LivePreview is mounted.
 */
export function LivePreview() {
  const on = useDevice((s) => s.liveWanted)
  const setOn = useDevice((s) => s.setLiveWanted)
  const frame = useDevice((s) => s.liveFrame)
  const setLive = useDevice((s) => s.setLive)
  const transport = useDevice((s) => s.transport)
  const wsAvailable = useDevice((s) => (s.info?.ws ?? -1) > -1)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    setLive(on)
    return () => setLive(false)
  }, [on, setLive])

  useEffect(() => {
    const c = canvas.current
    if (!c || !frame) return
    const { width, height, pixels } = frame
    const count = Math.min(pixels.length / 3, width * height)
    if (c.width !== width || c.height !== height) {
      c.width = width
      c.height = height
    }
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(width, height)
    for (let i = 0; i < count; i++) {
      img.data[i * 4] = pixels[i * 3]
      img.data[i * 4 + 1] = pixels[i * 3 + 1]
      img.data[i * 4 + 2] = pixels[i * 3 + 2]
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [frame])

  // Firmware built without WebSockets (info.ws = -1) can't stream LED colours.
  if (!wsAvailable) return null

  const matrix = frame && frame.height > 1
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Activity className="size-4" /> Live view
        </span>
      }
      action={<Toggle label="Live view" checked={on} onChange={setOn} disabled={transport !== 'websocket'} />}
    >
      {on && frame ? (
        <canvas
          ref={canvas}
          className="w-full rounded-xl [image-rendering:pixelated]"
          style={{ height: matrix ? 'auto' : '2.5rem', aspectRatio: matrix ? `${frame.width}/${frame.height}` : undefined, filter: 'saturate(1.2) blur(0.4px)' }}
        />
      ) : (
        <p className="text-sm text-muted">
          {transport === 'websocket'
            ? on
              ? 'Waiting for the first frame…'
              : 'Mirror the LED output in real time.'
            : 'Needs a WebSocket connection to the lamp.'}
        </p>
      )}
    </Card>
  )
}
