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
  useCatalogProductsMock,
  createProductMock,
} = vi.hoisted(() => ({
  useKitRostersMock: vi.fn(),
  useChildrenMock: vi.fn(),
  createRosterMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'kit-new'),
  updateRosterMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  useCatalogProductsMock: vi.fn(),
  createProductMock: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'prod-new'),
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

// Stub the catalog form so the section test stays focused; echo the pre-fill.
vi.mock('./CatalogProductForm', () => ({
  default: ({
    initial,
    onSave,
    onCancel,
  }: {
    initial?: { title?: string; sourceRef?: { kind: string; id: string }; madeBy?: string[] }
    onSave: (body: unknown) => Promise<void>
    onCancel: () => void
  }) => (
    <div data-testid="catalog-form">
      <span data-testid="cf-title">{initial?.title ?? 'none'}</span>
      <span data-testid="cf-source">{initial?.sourceRef?.id ?? 'none'}</span>
      <span data-testid="cf-madeby">{(initial?.madeBy ?? []).join(',')}</span>
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
  }: {
    childId: string
    roster?: KitRoster
    onSave: (body: unknown, id?: string) => Promise<void>
    onCancel: () => void
  }) => (
    <div data-testid="form">
      <span data-testid="form-childId">{childId}</span>
      <span data-testid="form-rosterId">{roster?.id ?? 'none'}</span>
      <button onClick={() => onSave({ vaultName: 'X' }, roster?.id)}>stub-save</button>
      <button onClick={onCancel}>stub-cancel</button>
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
    getRoster: vi.fn(),
  })
}

beforeEach(() => {
  createRosterMock.mockClear()
  updateRosterMock.mockClear()
  createProductMock.mockClear()
  useCatalogProductsMock.mockReturnValue({ createProduct: createProductMock })
  useChildrenMock.mockReturnValue({ children: [{ id: 'lincoln', name: 'Lincoln' }] })
})

describe('KitBuilderSection', () => {
  it('renders the empty state and a New kit button', () => {
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" />)
    expect(screen.getByText(/No kits yet — make your first one/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument()
  })

  it('lists saved rosters with title, status chip, and made-by', () => {
    setRosters([
      roster({ id: 'kit-1', vaultName: 'The Seed Safe', status: 'Complete' }),
      roster({ id: 'kit-2', vaultName: '', status: 'InProgress' }),
    ])
    render(<KitBuilderSection activeChildId="lincoln" />)

    expect(screen.getByText('The Seed Safe')).toBeInTheDocument()
    expect(screen.getByText('Untitled kit')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getAllByText(/Made by Lincoln/i)).toHaveLength(2)
  })

  it('opens the form on New kit, seeding the active child', async () => {
    const user = userEvent.setup()
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" />)

    await user.click(screen.getByRole('button', { name: /new kit/i }))
    expect(screen.getByTestId('form')).toBeInTheDocument()
    expect(screen.getByTestId('form-childId')).toHaveTextContent('lincoln')
    expect(screen.getByTestId('form-rosterId')).toHaveTextContent('none')
  })

  it('saving a new kit calls createRoster then returns to the list', async () => {
    const user = userEvent.setup()
    setRosters([])
    render(<KitBuilderSection activeChildId="lincoln" />)

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
    render(<KitBuilderSection activeChildId="lincoln" />)

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
    render(<KitBuilderSection activeChildId="lincoln" />)

    await user.click(screen.getByRole('button', { name: /new kit/i }))
    await user.click(screen.getByRole('button', { name: 'stub-cancel' }))

    expect(screen.queryByTestId('form')).not.toBeInTheDocument()
    expect(createRosterMock).not.toHaveBeenCalled()
  })

  it('Add to catalog opens the pre-filled product form without editing the roster', async () => {
    const user = userEvent.setup()
    setRosters([roster({ id: 'kit-9', vaultName: 'The Seed Safe', status: 'Complete' })])
    render(<KitBuilderSection activeChildId="lincoln" />)

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
    render(<KitBuilderSection activeChildId="lincoln" />)

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
})
