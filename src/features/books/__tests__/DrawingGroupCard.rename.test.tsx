import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Sticker } from '../../../core/types'
import { StickerCategory } from '../../../core/types/enums'
import type { DrawingGroup } from '../stickerGrouping'

const { updateDocMock, deleteDocMock } = vi.hoisted(() => ({
  updateDocMock: vi.fn<(ref: { id: string }, patch: Record<string, unknown>) => Promise<void>>(),
  deleteDocMock: vi.fn<(ref: { id: string }) => Promise<void>>(),
}))

vi.mock('firebase/firestore', () => ({
  updateDoc: updateDocMock,
  deleteDoc: deleteDocMock,
  doc: vi.fn((_col: unknown, id: string) => ({ id })),
  collection: vi.fn(),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: vi.fn(() => ({})),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: vi.fn() }),
}))

import DrawingGroupCard from '../DrawingGroupCard'

function sticker(over: Partial<Sticker> & { id: string }): Sticker {
  return {
    url: 'https://example.test/s.png',
    storagePath: 'families/f1/stickers/s.png',
    label: 'My drawing',
    category: StickerCategory.Custom,
    createdAt: '2026-08-01T00:00:00.000Z',
    tags: ['object'],
    childProfile: 'both',
    sourceDrawingId: 'd1',
    ...over,
  }
}

function makeGroup(label = 'My drawing'): DrawingGroup {
  const original = sticker({ id: 'a', label, isOriginal: true })
  const fancy = sticker({ id: 'b', label, theme: 'fantasy' })
  return { sourceDrawingId: 'd1', representative: original, versions: [original, fancy] }
}

async function openRename(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Rename drawing' }))
  return screen.getByLabelText('Drawing name')
}

describe('DrawingGroupCard rename (FEAT-160)', () => {
  beforeEach(() => {
    updateDocMock.mockReset()
    updateDocMock.mockResolvedValue(undefined)
    deleteDocMock.mockReset()
  })

  it('renames every version of the drawing together', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<DrawingGroupCard group={makeGroup()} familyId="f1" onChanged={onChanged} />)

    const field = await openRename(user)
    await user.clear(field)
    await user.type(field, 'Ender dragon')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(updateDocMock).toHaveBeenCalledTimes(2)
    for (const call of updateDocMock.mock.calls) {
      expect(call[1]).toEqual({ label: 'Ender dragon' })
    }
    expect(updateDocMock.mock.calls.map((c) => c[0].id).sort()).toEqual(['a', 'b'])
  })

  it('seeds the dialog with the name already showing', async () => {
    const user = userEvent.setup()
    render(<DrawingGroupCard group={makeGroup('Rocket')} familyId="f1" onChanged={vi.fn()} />)
    const field = await openRename(user)
    expect(field).toHaveValue('Rocket')
  })

  it('a no-op is not a write: saving the same name writes nothing and claims nothing', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<DrawingGroupCard group={makeGroup('Rocket')} familyId="f1" onChanged={onChanged} />)

    await openRename(user)
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument(),
    )
    expect(updateDocMock).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('a failed rename says so and keeps the dialog open with the typed name', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    updateDocMock.mockRejectedValue(new Error('offline'))
    render(<DrawingGroupCard group={makeGroup()} familyId="f1" onChanged={onChanged} />)

    const field = await openRename(user)
    await user.clear(field)
    await user.type(field, 'Ender dragon')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(await screen.findByText('offline')).toBeInTheDocument()
    expect(screen.getByLabelText('Drawing name')).toHaveValue('Ender dragon')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('will not save a blank name', async () => {
    const user = userEvent.setup()
    render(<DrawingGroupCard group={makeGroup()} familyId="f1" onChanged={vi.fn()} />)
    const field = await openRename(user)
    await user.clear(field)
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('aria labels follow the drawing name', async () => {
    const onPreview = vi.fn()
    const { rerender } = render(
      <DrawingGroupCard
        group={makeGroup('My drawing')}
        familyId="f1"
        onChanged={vi.fn()}
        onPreview={onPreview}
      />,
    )
    expect(screen.getByRole('button', { name: 'Preview My drawing Original' })).toBeInTheDocument()

    // After a rename the reload hands the card the renamed group.
    rerender(
      <DrawingGroupCard
        group={makeGroup('Ender dragon')}
        familyId="f1"
        onChanged={vi.fn()}
        onPreview={onPreview}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Preview Ender dragon Original' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Preview My drawing Original' }),
    ).not.toBeInTheDocument()
  })

  it('the rename affordance is hidden in select-to-print mode', () => {
    render(
      <DrawingGroupCard
        group={makeGroup()}
        familyId="f1"
        onChanged={vi.fn()}
        selectMode
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Rename drawing' })).not.toBeInTheDocument()
  })
})
