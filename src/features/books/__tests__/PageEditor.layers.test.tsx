import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PageEditor from '../PageEditor'
import type { BookPage, PageImage } from '../../../core/types'

const image = (id: string, overrides: Partial<PageImage> = {}): PageImage => ({ id, type: 'photo', url: `${id}.png`, label: id, ...overrides })
function setup(images: PageImage[]) {
  const page: BookPage = { id: 'p', pageNumber: 1, text: '', images, layout: 'image-top', createdAt: '', updatedAt: '' }
  const onRemoveImage = vi.fn()
  const onChangeBackground = vi.fn()
  const onSelectedImageChange = vi.fn()
  render(<PageEditor page={page} onUpdate={vi.fn()} onAddImage={vi.fn()} onRemoveImage={onRemoveImage} onChangeBackground={onChangeBackground} onSelectedImageChange={onSelectedImageChange} childName="Synthetic"/>)
  return { onRemoveImage, onChangeBackground, onSelectedImageChange }
}
describe('background targeting and placed-photo editing', () => {
  it('gives placed photos transform handles without treating them as backgrounds', () => {
    const { onSelectedImageChange } = setup([image('placed', { layerType: 'element' })])
    fireEvent.click(screen.getByRole('img'))
    expect(screen.getByRole('button', { name: 'Resize' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Background options' })).not.toBeInTheDocument()
    expect(onSelectedImageChange.mock.calls.at(-1)).toEqual(['placed', 'element'])
  })
  it('removes the rendered top background rather than the last array entry', () => {
    const { onRemoveImage } = setup([
      image('top', { position: { x: 0, y: 0, width: 100, height: 100, zIndex: 5 } }),
      image('bottom', { position: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 } }),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Background options' }))
    fireEvent.click(screen.getByText('Remove picture'))
    expect(onRemoveImage).toHaveBeenCalledWith('top')
  })
  it('changes the selected background even when it is below another picture', () => {
    const { onChangeBackground } = setup([image('bottom'), image('top')])
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Background options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change picture' }))
    expect(onChangeBackground).toHaveBeenCalledWith('bottom')
  })
})
