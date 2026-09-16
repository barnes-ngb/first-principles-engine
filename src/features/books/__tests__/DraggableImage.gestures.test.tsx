import { StrictMode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DraggableImage from '../DraggableImage'
import type { PageImage } from '../../../core/types'

beforeAll(() => {
  class Pointer extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
  vi.stubGlobal('PointerEvent', Pointer)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})
afterEach(cleanup)

const p = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY })
const rect = { x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON() {} }
function setup(position: PageImage['position'] = { x: 30, y: 30, width: 40, height: 40 }) {
  const image: PageImage = { id: 's', type: 'sticker', url: 'synthetic.png', label: 'Synthetic', position }
  const onPositionChange = vi.fn()
  const ui = (next = image) => <StrictMode><div><DraggableImage image={next} selected onSelect={vi.fn()} onPositionChange={onPositionChange}/></div></StrictMode>
  const view = render(ui())
  const body = screen.getByAltText('Synthetic').parentElement!
  body.parentElement!.getBoundingClientRect = () => rect
  return { ...view, body, image, ui, onPositionChange }
}
function corner(from: [number, number], to: [number, number]) {
  const handle = screen.getByRole('button', { name: 'Resize' })
  fireEvent.pointerDown(handle, p(1, ...from))
  fireEvent.pointerMove(handle, p(1, ...to))
  fireEvent.pointerUp(handle, p(1, ...to))
}

describe('actual picture gestures', () => {
  it('grows on vertical corner movement and commits once in StrictMode', () => {
    const { onPositionChange } = setup()
    corner([210, 140], [210, 190])
    expect(onPositionChange).toHaveBeenCalledTimes(1)
    expect(onPositionChange.mock.calls[0][0].width).toBeGreaterThan(40)
  })
  it.each([
    { rotation: 90, flipH: false, flipV: false, from: [110, 160], to: [90, 190] },
    { rotation: 0, flipH: true, flipV: false, from: [90, 140], to: [60, 160] },
    { rotation: 90, flipH: true, flipV: true, from: [190, 40], to: [210, 10] },
  ])('grows outward with rotation/flip $rotation/$flipH/$flipV', ({ rotation, flipH, flipV, from, to }) => {
    const { onPositionChange } = setup({ x: 30, y: 30, width: 40, height: 40, rotation, flipH, flipV })
    corner(from as [number, number], to as [number, number])
    expect(onPositionChange.mock.calls[0][0].width).toBeCloseTo(60)
    expect(onPositionChange.mock.calls[0][0].height).toBeCloseTo(60)
  })
  it('preserves proportions at the maximum and remains visible when shrinking at an edge', () => {
    const a = setup({ x: -16, y: 10, width: 20, height: 60 })
    corner([12, 140], [500, 500])
    const large = a.onPositionChange.mock.calls[0][0]
    expect(large.height).toBe(100)
    expect(large.width).toBeCloseTo(100 / 3)
    a.unmount()
    const b = setup({ x: -32, y: 30, width: 40, height: 40 })
    corner([24, 140], [-100, 0])
    const small = b.onPositionChange.mock.calls[0][0]
    expect(small.width).toBe(10)
    expect(small.x + small.width).toBeGreaterThan(0)
  })
  it('uses the same minimum for pinch, ends on the first lift, and ignores later events', () => {
    const { body, onPositionChange } = setup()
    fireEvent.pointerDown(body, p(1, 100, 100))
    fireEvent.pointerDown(body, p(2, 200, 100))
    fireEvent.pointerMove(body, p(2, 101, 100))
    fireEvent.pointerUp(body, p(2, 101, 100))
    fireEvent.pointerMove(body, p(1, 250, 120))
    fireEvent.pointerUp(body, p(1, 250, 120))
    expect(onPositionChange).toHaveBeenCalledTimes(1)
    expect(onPositionChange.mock.calls[0][0]).toMatchObject({ width: 10, height: 10 })
  })
  it.each(['pointerCancel', 'lostPointerCapture'] as const)('%s abandons a gesture without a later stray write', (event) => {
    const { body, onPositionChange } = setup()
    fireEvent.pointerDown(body, p(1, 100, 100))
    fireEvent.pointerMove(body, p(1, 130, 100))
    fireEvent[event](body, p(1, 130, 100))
    fireEvent.pointerMove(body, p(1, 160, 100))
    fireEvent.pointerUp(body, p(1, 160, 100))
    expect(onPositionChange).not.toHaveBeenCalled()
    expect(getComputedStyle(body).left).toBe('30%')
  })
  it('renders same-ID restores while idle, and does not jump to stale props during a gesture', () => {
    const view = setup()
    view.rerender(view.ui({ ...view.image, position: { x: 5, y: 5, width: 80, height: 80 } }))
    expect(getComputedStyle(view.body).left).toBe('5%')
    fireEvent.pointerDown(view.body, p(1, 100, 100))
    fireEvent.pointerMove(view.body, p(1, 130, 100))
    view.rerender(view.ui({ ...view.image, position: { x: 5, y: 5, width: 80, height: 80 } }))
    expect(getComputedStyle(view.body).left).toBe('15%')
    fireEvent.pointerCancel(view.body, p(1, 130, 100))
    expect(getComputedStyle(view.body).left).toBe('5%')
  })
  it('a selection-only tap creates no transform write', () => {
    const { body, onPositionChange } = setup()
    fireEvent.pointerDown(body, p(1, 100, 100))
    fireEvent.pointerUp(body, p(1, 100, 100))
    expect(onPositionChange).not.toHaveBeenCalled()
  })
  it.each([{ width: 100, height: 5 }, { width: 5, height: 100 }])('extreme proportions can shrink and grow without distorting: $width x $height', ({ width, height }) => {
    const view = setup({ x: 0, y: 0, width, height })
    fireEvent.pointerDown(view.body, p(1, 100, 100))
    fireEvent.pointerDown(view.body, p(2, 200, 100))
    fireEvent.pointerMove(view.body, p(2, 150, 100))
    fireEvent.pointerUp(view.body, p(2, 150, 100))
    const smaller = view.onPositionChange.mock.calls[0][0]
    expect(smaller.width).toBe(width / 2)
    expect(smaller.height).toBe(height / 2)
    view.rerender(view.ui({ ...view.image, position: smaller }))
    fireEvent.pointerDown(view.body, p(1, 100, 100))
    fireEvent.pointerDown(view.body, p(2, 150, 100))
    fireEvent.pointerMove(view.body, p(2, 200, 100))
    fireEvent.pointerUp(view.body, p(2, 200, 100))
    expect(view.onPositionChange.mock.calls[1][0]).toMatchObject({ width, height })
  })
})
