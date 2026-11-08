import { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { useDevice } from '../../store/device'
import { Card, Toggle } from '../../components/ui'

/**
 * Real-time LED colours streamed by the lamp over the WebSocket ({"lv":true}).
 * The firmware streams to a single client at a time, so this is opt-in.
 */
export function LivePreview() {
  const [on, setOn] = useState(false)
  const frame = useDevice((s) => s.liveFrame)
  const setLive = useDevice((s) => s.setLive)
  const transport = useDevice((s) => s.transport)
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
