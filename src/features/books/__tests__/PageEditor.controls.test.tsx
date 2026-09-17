import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BookPage, PageImage } from '../../../core/types'
import PageEditor from '../PageEditor'

const image = (id: string, extra: Partial<PageImage> = {}): PageImage => ({ id, label: id, url: `${id}.png`, type: 'sticker', position: { x: 30, y: 30, width: 40, height: 40 }, ...extra })
const page = (images: PageImage[]): BookPage => ({ id: 'p', pageNumber: 1, text: '', layout: 'image-top', createdAt: '', updatedAt: '', images })
function setup(images: PageImage[]) {
  const change = vi.fn()
  const reorder = vi.fn()
  const props = { page: page(images), onUpdate: vi.fn(), onAddImage: vi.fn(), onRemoveImage: vi.fn(), onImagePositionChange: change, onReorderImage: reorder, childName: 'Synthetic' }
  const view = render(<PageEditor {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
  return { ...view, props, change, reorder }
}
describe('reachable selection action contract', () => {
  it('keeps lower-layer controls outside the artwork stacking and rotation context', () => {
    const { change } = setup([
      image('Lower art', { position: { x: -20, y: -15, width: 40, height: 40, rotation: 75, flipH: true, zIndex: 1 } }),
      image('Upper art', { position: { x: 0, y: 0, width: 100, height: 100, zIndex: 2 } }),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Select Lower art' }))
    const controls = screen.getByRole('group', { name: 'Selected picture controls' })
    const art = screen.getAllByAltText('Lower art').find((node) => getComputedStyle(node.parentElement!).position === 'absolute')!
    expect(art.parentElement!.contains(controls)).toBe(false)
    expect(controls).toHaveTextContent('Lower art')
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(within(controls).getByRole('button', { name: 'Rotate right 15°' }))
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0]).toMatchObject(['Lower art', { rotation: 90, flipH: true, zIndex: 1 }])
  })
  it('selects a single saved off-page element and explicitly centers it without changing size, flip or rotation', () => {
    const { change } = setup([image('Lost photo', { type: 'photo', layerType: 'element', position: { x: 170, y: -130, width: 40, height: 30, rotation: 75, flipV: true, zIndex: 4 } })])
    fireEvent.click(screen.getByRole('button', { name: 'Select Lost photo' }))
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Center on page' }))
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0]).toEqual(['Lost photo', { x: 30, y: 35, width: 40, height: 30, rotation: 75, flipH: false, flipV: true, zIndex: 4 }])
  })
  it('keeps the selected ID and operable controls when its stack order changes', () => {
    const images = [image('Lower art', { position: { x: 30, y: 30, width: 40, height: 40, zIndex: 1 } }), image('Upper art', { position: { x: 30, y: 30, width: 40, height: 40, zIndex: 2 } })]
    const { props, rerender, change } = setup(images)
    fireEvent.click(screen.getByRole('button', { name: 'Select Lower art' }))
    rerender(<PageEditor {...props} page={page(images.map((item) => ({ ...item, position: { ...item.position!, zIndex: item.id === 'Lower art' ? 2 : 1 } })))} />)
    const controls = screen.getByRole('group', { name: 'Selected picture controls' })
    expect(controls).toHaveTextContent('Lower art')
    fireEvent.click(within(controls).getByRole('button', { name: 'Larger' }))
    expect(change.mock.calls[0][0]).toBe('Lower art')
    expect(change.mock.calls[0][1].zIndex).toBe(2)
    expect(change.mock.calls[0][1].width).toBeGreaterThan(40)
  })
  it('keeps backgrounds distinct from element transforms and exposes clear layer toggle wording', () => {
    setup([image('Scene', { type: 'photo' }), image('Sticker')])
    expect(screen.getByRole('button', { name: 'Hide layers' })).toHaveTextContent('Hide layers')
    fireEvent.click(screen.getByRole('button', { name: 'Select Scene' }))
    expect(screen.queryByRole('group', { name: 'Selected picture controls' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Center on page' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Background options' })).toBeInTheDocument()
  })
  it('lets the next action receive its tap while a neighboring tooltip is visible', async () => {
    const { change } = setup([image('Lower art'), image('Upper art')])
    fireEvent.click(screen.getByRole('button', { name: 'Select Lower art' }))
    const controls = screen.getByRole('group', { name: 'Selected picture controls' })
    fireEvent.mouseOver(within(controls).getByRole('button', { name: 'Move left' }))
    const tooltip = await screen.findByRole('tooltip')
    // jsdom cannot prove hit geometry. Pin the actual rendered hit-test policy;
    // the accompanying browser regression taps Smaller under this same hint.
    const popper = tooltip.closest('[data-popper-placement]')!
    expect(getComputedStyle(popper).pointerEvents).toBe('none')
    fireEvent.click(within(controls).getByRole('button', { name: 'Smaller' }))
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0][1].width).toBeCloseTo(40 / 1.1)
  })
})
