import { useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import { loadCleanupSource, encodeCleanup } from './cleanupImage'
import {
  applyCleanupMark, cleanupPoint, INITIAL_CLEANUP, MAX_CLEANUP_MARKS, MAX_STROKE_POINTS, renderCleanup,
  type CleanupEdits, type CleanupMark, type CleanupSource, type CleanupPoint,
} from './cleanupMask'

interface Props {
  file: File
  borderInsetFraction: number
  /** The accepted edit state lives with the scanner, not in the saved sticker. */
  initialEdits?: CleanupEdits
  initialSmallerCopy?: boolean
  onApply: (file: File, edits: CleanupEdits, smallerCopy: boolean) => void
  onCancel: () => void
}

export default function StickerCleanupEditor({ file, borderInsetFraction, initialEdits, initialSmallerCopy = false, onApply, onCancel }: Props) {
  const [source, setSource] = useState<CleanupSource | null>(null)
  const [edits, setEdits] = useState(initialEdits ?? INITIAL_CLEANUP)
  const [history, setHistory] = useState<CleanupEdits[]>([])
  const [tool, setTool] = useState<'tap' | 'keep' | 'remove'>('tap')
  const [strength, setStrength] = useState(edits.strength)
  const [brushSize, setBrushSize] = useState(28)
  const [zoom, setZoom] = useState(1)
  const [panning, setPanning] = useState(false)
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tooLarge, setTooLarge] = useState(false)
  const [allowSmallerCopy, setAllowSmallerCopy] = useState(initialSmallerCopy)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pixels = useRef<Uint8ClampedArray | null>(null)
  const stroke = useRef<{ id: number; mark: Extract<CleanupMark, { points: CleanupPoint[] }> } | null>(null)
  const active = useRef(true)
  // Stroke commits never repeat the expensive paper analysis/blur. Only Auto,
  // strength or a new source changes this base; strokes remain compact vectors.
  const automatic = useMemo(() => source ? renderCleanup(source, { auto: edits.auto, strength: edits.strength, marks: [] }, borderInsetFraction) : null, [source, edits.auto, edits.strength, borderInsetFraction])

  useEffect(() => {
    active.current = true
    let cancelled = false
    loadCleanupSource(file, allowSmallerCopy).then(value => { if (!cancelled) { setSource(value); setError(null); setTooLarge(false) } }).catch(reason => {
      if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Could not open this picture.'); setTooLarge(reason instanceof Error && reason.name === 'PictureTooLarge') }
    })
    return () => { cancelled = true; active.current = false }
  }, [file, allowSmallerCopy])

  const draw = (data: Uint8ClampedArray) => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const image = context.createImageData(element.width, element.height)
    image.data.set(data)
    context.putImageData(image, 0, 0)
  }

  useEffect(() => {
    if (!source || !automatic) return
    pixels.current = new Uint8ClampedArray(automatic)
    for (const mark of edits.marks) if (mark.kind === 'tap') applyCleanupMark(pixels.current, source, mark, edits.strength)
    for (const mark of edits.marks) if (mark.kind !== 'tap') applyCleanupMark(pixels.current, source, mark, edits.strength)
    draw(compare ? source.data : pixels.current)
  }, [source, automatic, edits.marks, edits.strength, compare])

  const commit = (next: CleanupEdits) => {
    setHistory(previous => [...previous.slice(-39), edits])
    setEdits(next)
    setError(null)
  }
  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => source
    ? cleanupPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), source.width, source.height)
    : null

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!source || busy || compare || panning || stroke.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    const point = pointAt(event)
    if (!point) return
    if (edits.marks.length >= MAX_CLEANUP_MARKS) {
      setError('This picture has many edits. Undo a mark or Reset to original to keep editing.')
      return
    }
    event.preventDefault()
    if (tool === 'tap') {
      commit({ ...edits, marks: [...edits.marks, { kind: 'tap', point }] })
      return
    }
    const radius = brushSize / 2 * source.width / event.currentTarget.getBoundingClientRect().width
    const mark = { kind: tool, points: [point], radius }
    stroke.current = { id: event.pointerId, mark }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pixels.current) { applyCleanupMark(pixels.current, source, mark, edits.strength); draw(pixels.current) }
  }
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = stroke.current
    if (!current || current.id !== event.pointerId || !source || !pixels.current) return
    const point = pointAt(event)
    if (!point) return
    if (current.mark.points.length >= MAX_STROKE_POINTS) {
      finishStroke(event)
      setError('That stroke is long. Lift your finger, then start another stroke to continue.')
      return
    }
    const last = current.mark.points[current.mark.points.length - 1]
    if (Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return
    current.mark.points.push(point)
    applyCleanupMark(pixels.current, source, { ...current.mark, points: [last, point] }, edits.strength)
    draw(pixels.current)
  }
  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const current = stroke.current
    if (!current || current.id !== event.pointerId) return
    stroke.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (cancelled && source) {
      pixels.current = renderCleanup(source, edits, borderInsetFraction)
      draw(pixels.current)
    } else commit({ ...edits, marks: [...edits.marks, current.mark] })
  }
  const accept = async () => {
    if (!source || busy || stroke.current || !pixels.current) return
    setBusy(true)
    try {
      const result = await encodeCleanup(source, pixels.current, file.name)
      if (active.current) onApply(result, edits, source.smallerCopy ?? false)
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Could not save this preview.')
    } finally { if (active.current) setBusy(false) }
  }
  const cancel = () => { active.current = false; onCancel() }

  return (
    <Dialog open onClose={cancel} maxWidth="md" fullWidth>
      <DialogTitle>Adjust cleanup</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2">Tap the background to clear one area. Use Keep to bring back part of your picture.</Typography>
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
            <Button disabled={!source || busy} onClick={() => commit({ ...edits, auto: true })} sx={{ minHeight: 44 }}>Auto cleanup</Button>
            <Button disabled={!source || busy || history.length === 0} onClick={() => {
              const previous = history[history.length - 1]
              setEdits(previous); setStrength(previous.strength); setHistory(history.slice(0, -1)); setError(null)
            }} sx={{ minHeight: 44 }}>Undo</Button>
            <Button disabled={!source || busy} onClick={() => { commit({ auto: false, strength: 60, marks: [] }); setStrength(60) }} sx={{ minHeight: 44 }}>Reset to original</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">Auto works best on drawings on plain paper. Keep and Remove can fix its mistakes.</Typography>
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} role="group" aria-label="Cleanup tools">
            {(['tap', 'keep', 'remove'] as const).map(value => <Button key={value} disabled={busy || !source} aria-pressed={tool === value && !panning} variant={tool === value && !panning ? 'contained' : 'outlined'} onClick={() => { setTool(value); setCompare(false); setPanning(false) }} sx={{ minHeight: 44 }}>{value === 'tap' ? 'Tap background' : value === 'keep' ? 'Keep' : 'Remove'}</Button>)}
            <Button disabled={busy || !source} aria-pressed={panning} variant={panning ? 'contained' : 'outlined'} onClick={() => setPanning(!panning)} sx={{ minHeight: 44 }}>Move picture</Button>
          </Stack>
          {tool === 'tap' ? <Box sx={{ px: 1 }}>
            <Typography id="cleanup-strength" variant="body2">Color match: {strength}</Typography>
            <Slider aria-labelledby="cleanup-strength" min={0} max={150} value={strength} disabled={busy || !source} onChange={(_, value) => setStrength(value as number)} onChangeCommitted={(_, value) => commit({ ...edits, strength: value as number })} />
            <Typography variant="caption" color="text.secondary">Higher clears more similar colors. Your Keep and Remove marks stay.</Typography>
          </Box> : <Box sx={{ px: 1 }}><Typography id="cleanup-brush" variant="body2">Brush size</Typography><Slider aria-labelledby="cleanup-brush" min={8} max={80} value={brushSize} disabled={busy} onChange={(_, value) => setBrushSize(value as number)} /></Box>}
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
            <Button disabled={!source || busy} aria-pressed={compare} onClick={() => setCompare(!compare)} sx={{ minHeight: 44 }}>{compare ? 'Show result' : 'Compare original'}</Button>
            <Button disabled={!source || busy} aria-pressed={zoom === 2} onClick={() => setZoom(zoom === 1 ? 2 : 1)} sx={{ minHeight: 44 }}>{zoom === 1 ? 'Zoom in' : 'Fit picture'}</Button>
          </Stack>
          {compare && <Typography variant="caption">Original — choose Show result to keep editing.</Typography>}
          {source?.smallerCopy && <Alert severity="info">Editing a smaller copy. Reset and Keep restore this copy; your full-size original stays unchanged.</Alert>}
          {!source && !error && <CircularProgress aria-label="Opening picture" />}
          {source && <Box sx={{ overflow: 'auto', maxHeight: '52vh', border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ width: `${zoom * 100}%`, background: CHECKERBOARD_BG }}>
              <canvas ref={canvas} width={source.width} height={source.height} role="img" aria-label={compare ? 'Original for comparison' : 'Cleanup preview — use Tap background, Keep or Remove'} style={{ display: 'block', width: '100%', height: 'auto', touchAction: compare || panning ? 'auto' : 'none', cursor: compare || panning ? 'default' : 'crosshair' }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => finishStroke(event)} onPointerCancel={event => finishStroke(event, true)} onLostPointerCapture={event => finishStroke(event, true)} />
            </Box>
          </Box>}
          <Typography variant="caption">Choose Move picture to scroll without making marks.</Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          {tooLarge && !allowSmallerCopy && <Button variant="outlined" onClick={() => { setAllowSmallerCopy(true); setTooLarge(false); setError(null) }} sx={{ minHeight: 44 }}>Use smaller editable copy</Button>}
          <Typography variant="caption" color="text.secondary">Changes stay here until you choose Use cleanup, then Save Cleaned.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={cancel} sx={{ minHeight: 44 }}>Cancel</Button><Button variant="contained" disabled={!source || busy || compare} onClick={() => { void accept() }} sx={{ minHeight: 44 }}>{busy ? 'Preparing…' : 'Use cleanup'}</Button></DialogActions>
    </Dialog>
  )
}
