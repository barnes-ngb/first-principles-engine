import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { KitRoster } from '../../core/types/business'

// ── Hoisted mocks ───────────────────────────────────────────────

const {
  useKitRostersMock,
  useChildrenMock,
  createRosterMock,
  updateRosterMock,
  setRosterArtMock,
  useCatalogProductsMock,
  createProductMock,
  updateProductMock,
  generateImageMock,
} = vi.hoisted(() => ({
  useKitRostersMock: vi.fn(),
  useChildrenMock: vi.fn(),
  createRosterMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'kit-new'),
  updateRosterMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  setRosterArtMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  useCatalogProductsMock: vi.fn(),
  createProductMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'prod-new'),
  updateProductMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  generateImageMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    url: 'https://img/hero.png',
    storagePath: 'families/fam-1/generated-images/hero.png',
  })),
}))

vi.mock('./useKitRosters', () => ({
  useKitRosters: useKitRostersMock,
}))

vi.mock('./useCatalogProducts', () => ({
  useCatalogProducts: useCatalogProductsMock,
}))

vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: useChildrenMock,
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ generateImage: generateImageMock }),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

// Stub the catalog form so the section test stays focused; echo the pre-fill.
vi.mock('./CatalogProductForm', () => ({
  default: ({
    initial,
    onSave,
    onCancel,
  }: {
    initial?: {
      title?: string
      sourceRef?: { kind: string; id: string }
      madeBy?: string[]
      images?: Array<{ url: string; alt?: string }>
    }
    onSave: (body: unknown) => Promise<void>
    onCancel: () => void
  }) => (
    <div data-testid="catalog-form">
      <span data-testid="cf-title">{initial?.title ?? 'none'}</span>
      <span data-testid="cf-source">{initial?.sourceRef?.id ?? 'none'}</span>
      <span data-testid="cf-madeby">{(initial?.madeBy ?? []).join(',')}</span>
      <span data-testid="cf-images">{(initial?.images ?? []).map((i) => i.url).join(',')}</span>
      <button
        onClick={() =>
          onSave({
            title: initial?.title,
            type: 'StarterKit',
            description: '',
            priceCents: 0,
            images: [],
            sourceRef: initial?.sourceRef,
            madeBy: initial?.madeBy ?? [],
            status: 'draft',
          })
        }
      >
        cf-save
      </button>
      <button onClick={onCancel}>cf-cancel</button>
    </div>
  ),
}))

// Stub the form so the section test stays focused on list/mode behavior.
vi.mock('./KitBuilderForm', () => ({
  default: ({
    childId,
    roster,
    onSave,
    onCancel,
    canGenerateArt,
    onGenerateArt,
  }: {
    childId: string
    roster?: KitRoster
    onSave: (body: unknown, id?: string) => Promise<void>
    onCancel: () => void
    canGenerateArt?: boolean
    onGenerateArt?: (
      key: string,
      character: { name: string; descriptor: string },
    ) => Promise<unknown>
  }) => (
    <div data-testid="form">
      <span data-testid="form-childId">{childId}</span>
      <span data-testid="form-rosterId">{roster?.id ?? 'none'}</span>
      <span data-testid="form-canGenerateArt">{String(Boolean(canGenerateArt))}</span>
      <button onClick={() => onSave({ vaultName: 'X' }, roster?.id)}>stub-save</button>
      <button onClick={onCancel}>stub-cancel</button>
      {onGenerateArt && (
        <button
          onClick={() => void onGenerateArt('hero', { name: 'Zappy', descriptor: 'green pea' })}
        >
          gen-hero
        </button>
      )}
    </div>
  ),
}))

import KitBuilderSection from './KitBuilderSection'

const roster = (over: Partial<KitRoster>): KitRoster => ({
  id: 'kit-1',
  childId: 'lincoln',
  source: 'kitBuilder',
  status: 'InProgress',
  vaultName: 'The Vault',
  heroName: '',
  heroLook: '',
  heroMove: '',
  defenders: [],
  invaders: [],
  winCondition: '',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
  ...over,
})

function setRosters(rosters: KitRoster[], loading = false) {
  useKitRostersMock.mockReturnValue({
    rosters,
    loading,
    error: null,
    createRoster: createRosterMock,
    updateRoster: updateRosterMock,
    setRosterArt: setRosterArtMock,
    getRoster: vi.fn(),
  })
}

function setProducts(products: unknown[] = []) {
  useCatalogProductsMock.mockReturnValue({
    products,
    loading: false,
    error: null,
    createProduct: createProductMock,
    updateProduct: updateProductMock,
  })
}

beforeEach(() => {
  createRosterMock.mockClear()
  updateRosterMock.mockClear()
  setRosterArtMock.mockClear()
  createProductMock.mockClear()
  updateProductMock.mockClear()
  generateImageMock.mockClear()
  generateImageMock.mockResolvedValue({
    url: 'https://img/hero.png',
    storagePath: 'families/fam-1/generated-images/hero.png',
  })
  setProducts([])
  useChildrenMock.mockReturnValue({ children: [{ id: 'lincoln', name: 'Lincoln' }] })
})

describe('KitBuilderSection', () => {
  it('renders the empty state and a New kit button', () => {
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)
    expect(screen.getByText(/No kits yet — make your first one/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument()
  })

  it('lists saved rosters with title, status chip, and made-by', () => {
    setRosters([
      roster({ id: 'kit-1', vaultName: 'The Seed Safe', status: 'Complete' }),
      roster({ id: 'kit-2', vaultName: '', status: 'InProgress' }),
    ])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    expect(screen.getByText('The Seed Safe')).toBeInTheDocument()
    expect(screen.getByText('Untitled kit')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getAllByText(/Made by Lincoln/i)).toHaveLength(2)
  })

  it('opens the form on New kit, seeding the active child', async () => {
    const user = userEvent.setup()
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /new kit/i }))
    expect(screen.getByTestId('form')).toBeInTheDocument()
    expect(screen.getByTestId('form-childId')).toHaveTextContent('lincoln')
    expect(screen.getByTestId('form-rosterId')).toHaveTextContent('none')
  })

  it('saving a new kit calls createRoster then returns to the list', async () => {
    const user = userEvent.setup()
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /new kit/i }))
    await user.click(screen.getByRole('button', { name: 'stub-save' }))

    await waitFor(() => expect(createRosterMock).toHaveBeenCalledTimes(1))
    expect(updateRosterMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument()
  })

  it('tapping a roster opens edit and saving calls updateRoster with its id', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-7', vaultName: 'Editable' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByText('Editable'))
    expect(screen.getByTestId('form-rosterId')).toHaveTextContent('kit-7')

    await user.click(screen.getByRole('button', { name: 'stub-save' }))
    await waitFor(() => expect(updateRosterMock).toHaveBeenCalledTimes(1))
    expect(updateRosterMock.mock.calls[0][0]).toBe('kit-7')
    expect(createRosterMock).not.toHaveBeenCalled()
  })

  it('cancel returns to the list without writing', async () => {
    const user = userEvent.setup()
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /new kit/i }))
    await user.click(screen.getByRole('button', { name: 'stub-cancel' }))

    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
    expect(createRosterMock).not.toHaveBeenCalled()
  })

  it('hides the Add to catalog affordance for a non-parent (kids never price/publish — §6)', () => {
    setRosters([roster({ id: 'kit-9', vaultName: 'The Seed Safe' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit={false} />)
    // Kids can still see and edit the roster itself…
    expect(screen.getByText('The Seed Safe')).toBeInTheDocument()
    // …but not promote it into a priced/published catalog product.
    expect(screen.queryByRole('button', { name: /add to catalog/i })).not.toBeInTheDocument()
  })

  it('Add to catalog opens the pre-filled product form without editing the roster', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-9', vaultName: 'The Seed Safe', status: 'Complete' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /add to catalog/i }))

    // Catalog form (not the roster form) opens, pre-filled from the roster.
    expect(screen.getByTestId('catalog-form')).toBeInTheDocument()
    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
    expect(screen.getByTestId('cf-title')).toHaveTextContent('The Seed Safe')
    expect(screen.getByTestId('cf-source')).toHaveTextContent('kit-9')
    expect(screen.getByTestId('cf-madeby')).toHaveTextContent('Lincoln')
    // Read-only of the roster — no roster write triggered by opening promote.
    expect(updateRosterMock).not.toHaveBeenCalled()
  })

  it('saving a promoted product calls createProduct (roster untouched) and returns to the list', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-9', vaultName: 'The Seed Safe' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /add to catalog/i }))
    await user.click(screen.getByRole('button', { name: 'cf-save' }))

    await waitFor(() => expect(createProductMock).toHaveBeenCalledTimes(1))
    const body = createProductMock.mock.calls[0][0] as { sourceRef?: { kind: string; id: string } }
    expect(body.sourceRef).toEqual({ kind: 'kitRoster', id: 'kit-9' })
    // Promote never mutates the roster.
    expect(createRosterMock).not.toHaveBeenCalled()
    expect(updateRosterMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('catalog-form')).not.toBeInTheDocument()
  })

  // ── Art pipeline (FEAT-88) ────────────────────────────────────

  it('never auto-generates: no image call on render', () => {
    setRosters([roster({ id: 'kit-1', vaultName: 'The Vault' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('offers art generation only on a saved roster for a parent', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-7', vaultName: 'Editable' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    // New (unsaved) roster → no persisted target → no generation.
    await user.click(screen.getByRole('button', { name: /new kit/i }))
    expect(screen.getByTestId('form-canGenerateArt')).toHaveTextContent('false')
    expect(screen.queryByRole('button', { name: 'gen-hero' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'stub-cancel' }))

    // Saved roster in edit mode → generation offered.
    await user.click(screen.getByText('Editable'))
    expect(screen.getByTestId('form-canGenerateArt')).toHaveTextContent('true')
  })

  it('a kid (non-parent) is never offered art generation', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-7', vaultName: 'Editable' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit={false} />)
    await user.click(screen.getByText('Editable'))
    expect(screen.getByTestId('form-canGenerateArt')).toHaveTextContent('false')
  })

  it('generating writes the art ref atomically per-key via setRosterArt (book-sticker, verbatim prompt)', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-7', vaultName: 'Editable' })])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByText('Editable'))
    await user.click(screen.getByRole('button', { name: 'gen-hero' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
    const genArg = generateImageMock.mock.calls[0][0] as {
      familyId: string
      prompt: string
      style: string
      size: string
    }
    expect(genArg.familyId).toBe('fam-1')
    expect(genArg.style).toBe('book-sticker')
    expect(genArg.size).toBe('1024x1024')
    // Kid's words drive the prompt, verbatim.
    expect(genArg.prompt).toContain('Zappy, green pea.')

    // Atomic per-key write: setRosterArt(id, key, ref) — never a whole-map
    // replacement, so concurrent generations can't clobber each other.
    await waitFor(() => expect(setRosterArtMock).toHaveBeenCalledTimes(1))
    const [id, key, ref] = setRosterArtMock.mock.calls[0] as [
      string,
      string,
      { url: string; storagePath: string; generatedAt: string },
    ]
    expect(id).toBe('kit-7')
    expect(key).toBe('hero')
    expect(ref.url).toBe('https://img/hero.png')
    // The whole-map updateRoster path is NOT used for art.
    expect(updateRosterMock).not.toHaveBeenCalled()
  })

  it('"Use as product image" sets the product images and touches ONLY the catalog', async () => {
    const user = userEvent.setup()
    const r = roster({
      id: 'kit-9',
      vaultName: 'The Seed Safe',
      heroName: 'Zappy',
      art: {
        hero: { url: 'https://img/hero.png', storagePath: 'p', generatedAt: '2026-07-18T00:00:00.000Z' },
      },
    })
    setRosters([r])
    setProducts([
      { id: 'prod-1', title: 'The Seed Safe', sourceRef: { kind: 'kitRoster', id: 'kit-9' }, images: [] },
    ])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /use as product image/i }))

    await waitFor(() => expect(updateProductMock).toHaveBeenCalledTimes(1))
    const [prodId, patch] = updateProductMock.mock.calls[0] as [
      string,
      { images: Array<{ url: string; alt?: string }> },
    ]
    expect(prodId).toBe('prod-1')
    expect(patch.images[0]).toEqual({ url: 'https://img/hero.png', alt: 'Zappy' })
    // Only the catalog product is written — no roster / no product creation.
    expect(updateRosterMock).not.toHaveBeenCalled()
    expect(createRosterMock).not.toHaveBeenCalled()
    expect(createProductMock).not.toHaveBeenCalled()
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('hides "Use as product image" when the roster has no promoted product', () => {
    const r = roster({
      id: 'kit-9',
      vaultName: 'The Seed Safe',
      art: {
        hero: { url: 'https://img/hero.png', storagePath: 'p', generatedAt: '2026-07-18T00:00:00.000Z' },
      },
    })
    setRosters([r])
    setProducts([]) // nothing promoted yet
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)
    expect(screen.queryByRole('button', { name: /use as product image/i })).not.toBeInTheDocument()
  })

  it('promoting a roster with art pre-fills the product images (hero first)', async () => {
    const user = userEvent.setup()
    setRosters([
      roster({
        id: 'kit-9',
        vaultName: 'The Seed Safe',
        heroName: 'Zappy',
        art: {
          hero: { url: 'https://img/hero.png', storagePath: 'p', generatedAt: '2026-07-18T00:00:00.000Z' },
        },
      }),
    ])
    render(<KitBuilderSection activeChildId="lincoln" canEdit />)

    await user.click(screen.getByRole('button', { name: /add to catalog/i }))
    // The promote form is pre-filled with the roster's art as product images.
    expect(screen.getByTestId('cf-images')).toHaveTextContent('https://img/hero.png')
  })
})
