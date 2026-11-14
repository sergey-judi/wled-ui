import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Brush, Eraser, ImageUp, PaintBucket, Play, Save, Send } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send, useFocusSegment } from '../../store/hooks'
import { Button, Card, Empty, cx } from '../../components/ui'
import { LivePreview } from '../../components/LivePreview'
import { changeCommands, drawingPreset, fullFrameCommands, MAX_PRESET_PIXELS, toHex, virtualLength, type Hex } from '../../api/pixels'
import { readJson, writeJson } from '../../lib/storage'
import { nextFreeId } from '../presets/fields'
import type { StatePatch } from '../../api/types'

const BLACK: Hex = '000000'
const PALETTE: Hex[] = ['FFFFFF', 'FF0000', 'FF6A00', 'FFC800', '5CFF00', '00FF6A', '00E5FF', '0050FF', '7A00FF', 'FF00C8', 'FF7AA8', 'FFB070']
const FLUSH_MS = 50

type Tool = 'brush' | 'eraser'

const sendAll = (cmds: StatePatch[]) => cmds.forEach((c) => send(c))

/** Draw on the LEDs one by one (segment "i" API), or turn a picture into LED colours. */
export function PaintPanel() {
  const seg = useFocusSegment()
  const host = useDevice((s) => s.host)
  const frame = useDevice((s) => s.liveFrame)
  const presets = useDevice((s) => s.presets)
  const n = seg ? virtualLength(seg) : 0

  const storeKey = seg ? `wled-ui.paint:${host}:${seg.id}:${n}` : ''
  const colsKey = `wled-ui.paint-cols:${host}`
  const [pixels, setPixels] = useState<Hex[]>([])
  const [cols, setCols] = useState(() => readJson<number>(colsKey, 0))
  const [color, setColor] = useState<Hex>('FF6A00')
  const [tool, setTool] = useState<Tool>('brush')
  const [presetName, setPresetName] = useState('')
  const [notice, setNotice] = useState<string>()

  // Load this segment's last drawing (kept in the browser), or start black.
  useEffect(() => {
    if (!storeKey) return
    const saved = readJson<Hex[]>(storeKey, [])
    setPixels(saved.length === n ? saved : Array(n).fill(BLACK))
  }, [storeKey, n])
  useEffect(() => {
    if (storeKey && pixels.length === n) writeJson(storeKey, pixels)
  }, [storeKey, pixels, n])

  // Default columns: the matrix width when the live view reports one, else up to 20 per row.
  const matrixWidth = frame && frame.layout > 0 && seg?.start === 0 && seg.grp === 1 && seg.spc === 0 ? frame.width : 0
  const columns = Math.max(1, Math.min(n || 1, cols || matrixWidth || Math.min(n, 20)))
  const rows = Math.ceil(n / columns)
  const setColumns = (c: number) => {
    setCols(c)
    writeJson(colsKey, c)
  }

  // Batched writes while dragging.
  const pending = useRef(new Map<number, Hex>())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pixelsRef = useRef(pixels)
  pixelsRef.current = pixels
  const flush = useCallback(() => {
    timer.current = undefined
    if (!seg || pending.current.size === 0) return
    const changes = pending.current
    pending.current = new Map()
    // The first write to an unfrozen segment blanks it on the lamp, so send the whole picture.
    sendAll(seg.frz ? changeCommands(seg.id, changes) : fullFrameCommands(seg.id, pixelsRef.current))
  }, [seg])

  const paintAt = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= n) return
      const c = tool === 'eraser' ? BLACK : color
      const px = pixelsRef.current
      if (px[idx] === c) return
      const next = [...px]
      next[idx] = c
      pixelsRef.current = next
      setPixels(next)
      pending.current.set(idx, c)
      timer.current ??= setTimeout(flush, FLUSH_MS)
    },
    [n, tool, color, flush],
  )
  useEffect(() => () => clearTimeout(timer.current), [])

  const gridRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const indexAt = (e: ReactPointerEvent) => {
    const r = gridRef.current!.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * columns)
    const y = Math.floor(((e.clientY - r.top) / r.height) * rows)
    if (x < 0 || x >= columns || y < 0 || y >= rows) return -1
    return y * columns + x
  }
  const onDown = (e: ReactPointerEvent) => {
    drawing.current = true
    gridRef.current?.setPointerCapture(e.pointerId)
    paintAt(indexAt(e))
  }
  const onMove = (e: ReactPointerEvent) => drawing.current && paintAt(indexAt(e))
  const onUp = () => {
    drawing.current = false
  }

  const pushAll = (px: Hex[]) => {
    if (!seg) return
    clearTimeout(timer.current)
    timer.current = undefined
    pending.current = new Map()
    setPixels(px)
    pixelsRef.current = px
    sendAll(fullFrameCommands(seg.id, px))
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const importImage = async (file: File | undefined) => {
    if (!file) return
    try {
      const px = await imageToPixels(file, columns, rows, n)
      pushAll(px)
      setNotice(undefined)
    } catch {
      setNotice(`Couldn't read ${file.name} as an image.`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const usedIds = useMemo(() => Object.keys(presets ?? {}).map(Number).filter((id) => id > 0 && Object.keys(presets![id] ?? {}).length > 0), [presets])
  const presetId = nextFreeId(usedIds)
  const savePreset = () => {
    if (!seg || presetId === null) return
    send(drawingPreset(presetId, presetName.trim() || `Drawing ${presetId}`, seg.id, pixels))
    setPresetName('')
    setNotice(`Saved as preset #${presetId}.`)
  }

  if (!seg) return <Empty title="No active segment" />
  if (n === 0) return <Empty title="This segment has no LEDs" />

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Card
          title={`Paint · ${seg.n || `Segment ${seg.id}`} · ${n} LEDs`}
          action={
            seg.frz && (
              <Button variant="ghost" onClick={() => send({ seg: { id: seg.id, frz: false } })} title="Unfreeze and go back to the effect">
                <Play className="size-4" /> Resume effect
              </Button>
            )
          }
        >
          <div
            ref={gridRef}
            role="img"
            aria-label="LED canvas. Drag to paint."
            className="grid touch-none gap-px overflow-hidden rounded-xl bg-line select-none"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {Array.from({ length: rows * columns }, (_, i) => (
              <span key={i} className="aspect-square" style={{ background: i < n ? `#${pixels[i] ?? BLACK}` : 'transparent' }} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            LEDs run left to right, top to bottom, in the order the lamp numbers them. Painting pauses the effect on this segment.
          </p>
        </Card>
        <LivePreview />
      </div>

      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Card title="Brush">
          <div className="mb-3 flex gap-2">
            <ToolBtn active={tool === 'brush'} onClick={() => setTool('brush')} label="Brush">
              <Brush className="size-4" />
            </ToolBtn>
            <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Eraser">
              <Eraser className="size-4" />
            </ToolBtn>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted">Custom</span>
              <input
                type="color"
                value={`#${color.toLowerCase()}`}
                onChange={(e) => (setColor(e.target.value.slice(1).toUpperCase()), setTool('brush'))}
                className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour #${c}`}
                onClick={() => (setColor(c), setTool('brush'))}
                className={cx('aspect-square rounded-xl border border-white/10', color === c && tool === 'brush' && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')}
                style={{ background: `#${c}` }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => pushAll(Array(n).fill(color))}>
              <PaintBucket className="size-4" /> Fill all
            </Button>
            <Button onClick={() => pushAll(Array(n).fill(BLACK))}>Clear</Button>
            <Button onClick={() => fileRef.current?.click()}>
              <ImageUp className="size-4" /> Picture…
            </Button>
            <Button variant="ghost" onClick={() => pushAll(pixels)} title="Send the whole drawing to the lamp again">
              <Send className="size-4" /> Resend
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void importImage(e.target.files?.[0])} />
          </div>
        </Card>

        <Card title="Layout">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="block">LEDs per row</span>
              <span className="text-xs text-muted">{matrixWidth ? `Matrix width from the lamp: ${matrixWidth}` : 'Match your lamp to make pictures line up'}</span>
            </span>
            <input
              type="number"
              min={1}
              max={n}
              value={columns}
              onChange={(e) => setColumns(Math.max(1, Math.min(n, Number(e.target.value) || 1)))}
              className="w-20 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm tabular-nums outline-none focus:border-[rgb(var(--accent))]"
            />
          </label>
        </Card>

        <Card title="Keep this drawing">
          {n > MAX_PRESET_PIXELS ? (
            <p className="text-sm text-muted">This segment has too many LEDs ({n}) to store a drawing as a preset (max {MAX_PRESET_PIXELS}).</p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                savePreset()
              }}
            >
              <input
                value={presetName}
                maxLength={32}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={presetId ? `Drawing ${presetId}` : 'Preset storage full'}
                className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[rgb(var(--accent))]"
              />
              <Button type="submit" variant="primary" disabled={presetId === null}>
                <Save className="size-4" /> Save
              </Button>
            </form>
          )}
          <p className="mt-2 text-xs text-muted">Loading the preset redraws the picture on this segment. The drawing is also kept in this browser.</p>
          {notice && <p className="mt-2 text-sm">{notice}</p>}
        </Card>
      </div>
    </div>
  )
}

function ToolBtn({ active, onClick, label, children }: { active: boolean; onClick(): void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm', active ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface-2')}
    >
      {children} {label}
    </button>
  )
}

/** Scale a picture to cols × rows (cropped to fill, like CSS object-fit: cover) and read the colours. */
async function imageToPixels(file: File, cols: number, rows: number, n: number): Promise<Hex[]> {
  const img = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  const scale = Math.max(cols / img.width, rows / img.height)
  const sw = cols / scale
  const sh = rows / scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, cols, rows)
  img.close()
  const data = ctx.getImageData(0, 0, cols, rows).data
  return Array.from({ length: n }, (_, i) => toHex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))
}
