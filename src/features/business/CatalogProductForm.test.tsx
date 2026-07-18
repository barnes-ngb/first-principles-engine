import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NewCatalogProduct } from './useCatalogProducts'

const { useChildrenMock } = vi.hoisted(() => ({ useChildrenMock: vi.fn() }))
vi.mock('../../core/hooks/useChildren', () => ({ useChildren: useChildrenMock }))

// Spy on the download side-effect; keep the pure name-builders real (FEAT-93).
const downloadArtFilesMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
)
vi.mock('./stickerArtExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stickerArtExport')>()
  return { ...actual, downloadArtFiles: downloadArtFilesMock }
})

import CatalogProductForm from './CatalogProductForm'

beforeEach(() => {
  downloadArtFilesMock.mockClear()
  useChildrenMock.mockReturnValue({
    children: [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ],
  })
})

/** Bulk text entry via fireEvent.change (FEAT-80 lesson: userEvent.type is slow). */
function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('CatalogProductForm', () => {
  it('disables save until a title is entered', () => {
    render(<CatalogProductForm onSave={vi.fn()} onCancel={vi.fn()} />)
    const save = screen.getByRole('button', { name: /save product/i })
    expect(save).toBeDisabled()
    typeInto(/title/i, 'Seed Vault Kit')
    expect(save).toBeEnabled()
  })

  it('saves a manual draft: title, price→cents, type, made-by, status', async () => {
    const onSave = vi.fn<(b: NewCatalogProduct) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<CatalogProductForm onSave={onSave} onCancel={vi.fn()} />)

    typeInto(/title/i, 'Seed Vault Kit')
    typeInto(/price/i, '15')
    await user.click(screen.getByText('Party Kit'))
    await user.click(screen.getByText('Lincoln'))
    await user.click(screen.getByText('Listed'))
    await user.click(screen.getByRole('button', { name: /save product/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const body = onSave.mock.calls[0][0]
    expect(body).toMatchObject({
      title: 'Seed Vault Kit',
      type: 'PartyKit',
      priceCents: 1500,
      madeBy: ['Lincoln'],
      status: 'listed',
      images: [],
    })
    expect('sourceRef' in body).toBe(false)
  })

  it('treats a blank price as unpriced (0)', async () => {
    const onSave = vi.fn<(b: NewCatalogProduct) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(<CatalogProductForm onSave={onSave} onCancel={vi.fn()} />)

    typeInto(/title/i, 'Freebie')
    await user.click(screen.getByRole('button', { name: /save product/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].priceCents).toBe(0)
  })

  it('pre-fills from a promoted source and carries sourceRef + images through verbatim', async () => {
    const onSave = vi.fn<(b: NewCatalogProduct) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(
      <CatalogProductForm
        initial={{
          title: 'The Seed Safe',
          type: 'StarterKit',
          madeBy: ['Lincoln'],
          images: [],
          sourceRef: { kind: 'kitRoster', id: 'kit-7' },
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/title/i)).toHaveValue('The Seed Safe')
    await user.click(screen.getByRole('button', { name: /save product/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const body = onSave.mock.calls[0][0]
    expect(body.title).toBe('The Seed Safe')
    expect(body.sourceRef).toEqual({ kind: 'kitRoster', id: 'kit-7' })
    expect(body.madeBy).toEqual(['Lincoln'])
    // Kid-set fields preserved; parent-set price stays unpriced by default.
    expect(body.priceCents).toBe(0)
    expect(body.status).toBe('draft')
  })

  it('offers the preview toggle only for book-sourced products (default off)', async () => {
    const onSave = vi.fn<(b: NewCatalogProduct) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(
      <CatalogProductForm
        initial={{
          title: "Tom Tom the Crab's Big Quest",
          type: 'Book',
          madeBy: ['Lincoln'],
          images: [{ url: 'https://cdn/cover.png' }],
          sourceRef: { kind: 'book', id: 'book-9' },
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    // Toggle is present for a book; default OFF ⇒ nothing persisted yet.
    const toggle = screen.getByLabelText(/peek inside/i)
    expect(toggle).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: /save product/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].includePreview).toBe(false)
  })

  it('persists includePreview + a capped page count when turned on', async () => {
    const onSave = vi.fn<(b: NewCatalogProduct) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(
      <CatalogProductForm
        initial={{
          title: 'A Book',
          type: 'Book',
          madeBy: ['London'],
          images: [],
          sourceRef: { kind: 'book', id: 'book-1' },
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText(/peek inside/i))
    // Over the cap → clamped to the max (5).
    typeInto(/preview pages/i, '99')
    await user.click(screen.getByRole('button', { name: /save product/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const body = onSave.mock.calls[0][0]
    expect(body.includePreview).toBe(true)
    expect(body.previewPageCount).toBe(5)
  })

  it('never offers a preview for a non-book product', () => {
    render(
      <CatalogProductForm
        initial={{
          title: 'A Sticker',
          type: 'StickerSheet',
          madeBy: [],
          images: [{ url: 'https://cdn/s.png' }],
          sourceRef: { kind: 'sticker', id: 's-1' },
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/peek inside/i)).toBeNull()
  })

  // ── Download image(s) (FEAT-93) ───────────────────────────────

  it('downloads the product images named from the live title, zip-named, writing nothing', async () => {
    const onSave = vi.fn<(b: NewCatalogProduct) => Promise<void>>(async () => undefined)
    const user = userEvent.setup()
    render(
      <CatalogProductForm
        initial={{
          title: 'Steven the Sticker',
          type: 'StickerSheet',
          madeBy: ['Lincoln'],
          images: [{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }],
          sourceRef: { kind: 'sticker', id: 's-1' },
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /download image/i }))

    await waitFor(() => expect(downloadArtFilesMock).toHaveBeenCalledTimes(1))
    const [files, zipName] = downloadArtFilesMock.mock.calls[0] as [
      Array<{ url: string; filename: string }>,
      string,
    ]
    expect(files).toEqual([
      { url: 'https://cdn/1.png', filename: 'steven-the-sticker-1.png' },
      { url: 'https://cdn/2.png', filename: 'steven-the-sticker-2.png' },
    ])
    expect(zipName).toBe('steven-the-sticker-stickers.zip')
    // Downloading never saves the product.
    expect(onSave).not.toHaveBeenCalled()
  })

  it('names downloads from the edited (unsaved) title', async () => {
    const user = userEvent.setup()
    render(
      <CatalogProductForm
        initial={{
          title: 'Old Name',
          type: 'StickerSheet',
          madeBy: [],
          images: [{ url: 'https://cdn/1.png' }],
          sourceRef: { kind: 'sticker', id: 's-1' },
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    typeInto(/title/i, 'New Name')
    await user.click(screen.getByRole('button', { name: /download image/i }))

    await waitFor(() => expect(downloadArtFilesMock).toHaveBeenCalledTimes(1))
    const [files, zipName] = downloadArtFilesMock.mock.calls[0] as [
      Array<{ filename: string }>,
      string,
    ]
    expect(files[0].filename).toBe('new-name-1.png')
    expect(zipName).toBe('new-name-stickers.zip')
  })

  it('hides Download image(s) when the product has no images', () => {
    render(
      <CatalogProductForm
        initial={{ title: 'No Art', type: 'Other', madeBy: [], images: [] }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /download image/i })).toBeNull()
  })
})
