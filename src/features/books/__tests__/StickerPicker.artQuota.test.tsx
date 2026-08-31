import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { generateImageMock, recordGenerationMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  recordGenerationMock: vi.fn(async () => undefined),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({
    generateImage: generateImageMock,
    loading: false,
    error: null,
  }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  stickerLibraryCollection: vi.fn(() => ({ __collection: 'stickerLibrary' })),
}))

vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'stk-new' })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(async () => undefined),
  getDownloadURL: vi.fn(async () => 'https://img/uploaded.png'),
}))

import { ART_QUOTA_MESSAGE } from '../../business/useArtQuota'
import StickerPicker from '../StickerPicker'

beforeEach(() => {
  generateImageMock.mockReset()
  generateImageMock.mockResolvedValue({ url: 'https://img/new.png', storagePath: 's/new.png' })
  recordGenerationMock.mockReset()
  recordGenerationMock.mockResolvedValue(undefined)
})

function renderPicker(props: Partial<React.ComponentProps<typeof StickerPicker>> = {}) {
  return render(
    <StickerPicker
      open
      onClose={vi.fn()}
      familyId="family-1"
      onSelectSticker={vi.fn()}
      {...props}
    />,
  )
}

describe('StickerPicker — daily art budget (FEAT-168)', () => {
  it('at the cap there is no Generate button, and the warm nudge takes its place', async () => {
    renderPicker({ capReached: true, recordGeneration: recordGenerationMock })

    await waitFor(() => expect(screen.queryByRole('button', { name: /generate/i })).toBeNull())
    expect(screen.getByText(ART_QUOTA_MESSAGE)).toBeTruthy()
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('free things stay free at the cap — Upload is still offered', async () => {
    renderPicker({ capReached: true, recordGeneration: recordGenerationMock })

    await waitFor(() => expect(screen.getByRole('button', { name: /upload/i })).toBeTruthy())
  })

  it('below the cap the door is open and a real image is counted exactly once', async () => {
    const user = userEvent.setup()
    renderPicker({ capReached: false, recordGeneration: recordGenerationMock })

    await user.click(await screen.findByRole('button', { name: /generate/i }))
    await user.type(screen.getByLabelText(/describe your sticker/i), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
    expect(recordGenerationMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(ART_QUOTA_MESSAGE)).toBeNull()
  })

  it('nothing came back → nothing counted', async () => {
    const user = userEvent.setup()
    generateImageMock.mockResolvedValue(null)
    renderPicker({ capReached: false, recordGeneration: recordGenerationMock })

    await user.click(await screen.findByRole('button', { name: /generate/i }))
    await user.type(screen.getByLabelText(/describe your sticker/i), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1))
    expect(recordGenerationMock).not.toHaveBeenCalled()
  })

  it('a counter that never settles does not wedge the door (FEAT-167 contract)', async () => {
    const user = userEvent.setup()
    // Offline: a Firestore write resolves only on server ack, so this stays
    // pending forever. The sticker preview must still appear.
    recordGenerationMock.mockImplementation(() => new Promise<undefined>(() => {}))
    renderPicker({ capReached: false, recordGeneration: recordGenerationMock })

    await user.click(await screen.findByRole('button', { name: /generate/i }))
    await user.type(screen.getByLabelText(/describe your sticker/i), 'a dragon')
    await user.click(screen.getByRole('button', { name: 'Create!' }))

    await waitFor(() => expect(screen.getByAltText('Generated sticker')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Use This' })).toBeTruthy()
  })

  it('the cap arriving while the create dialog is open replaces Create with the nudge (Codex P2, PR #1720)', async () => {
    const user = userEvent.setup()
    const { rerender } = renderPicker({ capReached: false, recordGeneration: recordGenerationMock })

    // Open the nested create dialog below the cap.
    await user.click(await screen.findByRole('button', { name: /generate/i }))
    expect(screen.getByRole('button', { name: 'Create!' })).toBeTruthy()

    // The generation that just landed spent the last of the day's budget.
    rerender(
      <StickerPicker
        open
        onClose={vi.fn()}
        familyId="family-1"
        onSelectSticker={vi.fn()}
        capReached
        recordGeneration={recordGenerationMock}
      />,
    )

    // No visible button that would silently do nothing.
    expect(screen.queryByRole('button', { name: 'Create!' })).toBeNull()
    expect(screen.queryByLabelText(/describe your sticker/i)).toBeNull()
    expect(screen.getAllByText(ART_QUOTA_MESSAGE).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it('uncapped by default — a mount that passes neither prop is unchanged', async () => {
    renderPicker()

    await waitFor(() => expect(screen.getByRole('button', { name: /generate/i })).toBeTruthy())
    expect(screen.queryByText(ART_QUOTA_MESSAGE)).toBeNull()
  })
})
