import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NewCatalogProduct } from './useCatalogProducts'

const { useChildrenMock } = vi.hoisted(() => ({ useChildrenMock: vi.fn() }))
vi.mock('../../core/hooks/useChildren', () => ({ useChildren: useChildrenMock }))

import CatalogProductForm from './CatalogProductForm'

beforeEach(() => {
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
})
