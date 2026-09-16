import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CleanupSource } from './cleanupMask'
import { MAX_CLEANUP_MARKS, MAX_STROKE_POINTS } from './cleanupMask'

const { load, encode } = vi.hoisted(() => ({ load: vi.fn(), encode: vi.fn() }))
vi.mock('./cleanupImage', () => ({ loadCleanupSource: load, encodeCleanup: encode }))
import StickerCleanupEditor from './StickerCleanupEditor'

const fixture = (): CleanupSource => ({ width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4).fill(255) })
const sourceFile = new File(['original'], 'source.png', { type: 'image/png' })
const outputFile = new File(['corrected'], 'corrected.png', { type: 'image/png' })

class TestPointer extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'touch'
  }
}

function setup() {
  const onApply = vi.fn(), onCancel = vi.fn()
  const view = render(<StickerCleanupEditor file={sourceFile} borderInsetFraction={0.04} onApply={onApply} onCancel={onCancel} />)
  return { ...view, onApply, onCancel, user: userEvent.setup() }
}

describe('cleanup editor user actions', () => {
  beforeEach(() => {
    load.mockReset().mockResolvedValue(fixture())
    encode.mockReset().mockResolvedValue(outputFile)
    vi.stubGlobal('PointerEvent', TestPointer)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: vi.fn(),
    }) as unknown as CanvasRenderingContext2D)
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
    HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true)
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200, width: 200, height: 200, right: 300, bottom: 400, x: 100, y: 200, toJSON: () => ({}) })
  })

  it('Reset restores source, Undo restores Auto, and only explicit acceptance encodes', async () => {
    const { user, onApply } = setup()
    await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Reset to original' }))
    expect(encode).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    const pixels = encode.mock.calls[0][1] as Uint8ClampedArray
    expect(pixels[3]).toBe(0)
    expect(onApply.mock.calls[0][0]).toBe(outputFile)
  })

  it('touch Keep restores the displayed source location; Auto keeps the manual mark', async () => {
    const { user } = setup()
    const canvas = await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: 'touch', clientX: 205, clientY: 305 })
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: 'touch', clientX: 205, clientY: 305 })
    await user.click(screen.getByRole('button', { name: 'Auto cleanup' }))
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(1))
    const pixels = encode.mock.calls[0][1] as Uint8ClampedArray
    expect(pixels[(10 * 20 + 10) * 4 + 3]).toBe(255)
    expect(pixels[3]).toBe(0)
  })

  it('lost pointer capture discards the partial stroke and allows acceptance', async () => {
    const { user, onApply } = setup()
    const canvas = await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.pointerDown(canvas, { pointerId: 7, clientX: 205, clientY: 305 })
    fireEvent.lostPointerCapture(canvas, { pointerId: 7 })
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(encode.mock.calls[0][1][(10 * 20 + 10) * 4 + 3]).toBe(0)
  })

  it('Compare cannot confirm unseen result pixels, and Reset accepts exact source', async () => {
    const { user } = setup()
    await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Compare original' }))
    expect(screen.getByRole('button', { name: 'Use cleanup' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Show result' }))
    await user.click(screen.getByRole('button', { name: 'Reset to original' }))
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(1))
    expect(encode.mock.calls[0][1]).toEqual(fixture().data)
  })

  it('Cancel invalidates a pending encoding without applying it', async () => {
    let resolve!: (file: File) => void
    encode.mockImplementation(() => new Promise<File>(done => { resolve = done }))
    const { user, onApply, onCancel } = setup()
    await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => resolve(outputFile))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('large pictures require explicit smaller-copy consent and label its limits', async () => {
    const error = new Error('This picture is large. Use a smaller editable copy?')
    error.name = 'PictureTooLarge'
    load.mockRejectedValueOnce(error).mockResolvedValueOnce({ ...fixture(), smallerCopy: true })
    const { user, onApply } = setup()
    await user.click(await screen.findByRole('button', { name: 'Use smaller editable copy' }))
    expect(load).toHaveBeenLastCalledWith(sourceFile, true)
    await screen.findByText(/Editing a smaller copy/)
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(outputFile, expect.anything(), true))
  })

  it('Move picture permits touch scrolling without adding a mark', async () => {
    const { user, onApply } = setup()
    const canvas = await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Move picture' }))
    expect(canvas.style.touchAction).toBe('auto')
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 205, clientY: 305 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 250, clientY: 350 })
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 250, clientY: 350 })
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(onApply.mock.calls[0][1].marks).toHaveLength(0)
  })

  it('the mark limit explains the refusal and leaves the accepted state intact', async () => {
    const onApply = vi.fn(), user = userEvent.setup()
    const marks = Array.from({ length: MAX_CLEANUP_MARKS }, () => ({ kind: 'tap' as const, point: { x: 0, y: 0 } }))
    render(<StickerCleanupEditor file={sourceFile} borderInsetFraction={0.04} initialEdits={{ auto: false, strength: 60, marks }} onApply={onApply} onCancel={() => {}} />)
    const canvas = await screen.findByRole('img')
    fireEvent.pointerDown(canvas, { pointerId: 3, clientX: 205, clientY: 305 })
    expect(screen.getByText(/This picture has many edits/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(onApply.mock.calls[0][1].marks).toHaveLength(MAX_CLEANUP_MARKS)
  })

  it('a long stroke stops visibly at the point limit and remains saveable', async () => {
    const { user, onApply } = setup()
    const canvas = await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.pointerDown(canvas, { pointerId: 8, clientX: 205, clientY: 305 })
    for (let i = 0; i < MAX_STROKE_POINTS; i++) fireEvent.pointerMove(canvas, { pointerId: 8, clientX: i % 2 === 0 ? 220 : 205, clientY: 305 })
    expect(screen.getByText(/That stroke is long/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(onApply.mock.calls[0][1].marks[0].points).toHaveLength(MAX_STROKE_POINTS)
  })
})
