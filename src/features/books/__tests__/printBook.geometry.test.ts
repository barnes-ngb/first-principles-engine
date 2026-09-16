import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../core/types'
const m = vi.hoisted(() => ({ addImage: vi.fn(), save: vi.fn() }))
vi.mock('jspdf', () => ({ jsPDF: class {
  internal = { scaleFactor: 1, pageSize: { getHeight: () => 215.9 }, write: vi.fn() }
  addImage = m.addImage
  save = m.save
  setFillColor() {} roundedRect() {} rect() {} setTextColor() {} setFont() {} setFontSize() {}
  saveGraphicsState() {} restoreGraphicsState() {} text() {} addPage() {}
} }))
vi.mock('../imageDataUri', () => ({ fetchAsDataUri: async () => 'data:image/png;base64,synthetic' }))
import { printBook } from '../printBook'
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('printBook shares the editor image geometry contract', () => {
  it('prints positionless background, placed photo and sticker at their respective default bounds', async () => {
    vi.stubGlobal('Image', class {
      width = 300; height = 200; naturalWidth = 300; naturalHeight = 200
      onload: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    const book = { title: 'Synthetic geometry', pages: [{ id: 'p', pageNumber: 1, text: '', layout: 'image-top', images: [
      { id: 'bg', type: 'photo', url: 'bg.png' },
      { id: 'photo', type: 'photo', layerType: 'element', url: 'photo.png' },
      { id: 'sticker', type: 'sticker', url: 'sticker.png' },
    ] }] } as Book
    await printBook(book, { childName: 'Synthetic', isLincoln: false, settings: { pageSize: 'half-letter', background: 'white', sightWordStyle: 'highlighted', trimMarks: false, includeCover: false, includePageNumbers: false, includeAuthor: false, includeBackCover: false } })
    expect(m.addImage).toHaveBeenCalledTimes(3)
    const images = m.addImage.mock.calls.map((call) => call[0])
    const w = 139.7 - 25.4
    const h = w / 1.5
    for (const [index, geometry] of [[0, [0, 0, 1, 1]], [1, [0.1, 0.1, 0.4, 0.4]], [2, [0.25, 0.15, 0.3, 0.3]]] as const) {
      expect(images[index].x).toBeCloseTo(12.7 + geometry[0] * w)
      expect(images[index].y).toBeCloseTo(12.7 + geometry[1] * h)
      expect(images[index].width).toBeCloseTo(geometry[2] * w)
      expect(images[index].height).toBeCloseTo(geometry[3] * h)
    }
    expect(m.save).toHaveBeenCalledWith('synthetic-geometry.pdf')
  })
})
