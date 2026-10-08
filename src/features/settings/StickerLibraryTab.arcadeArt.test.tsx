import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StickerLibraryTab from './StickerLibraryTab'
import type { Sticker } from '../../core/types'

/**
 * The library's door into game art (FEAT-239).
 *
 * What only the host can be asked: that the door opens on the exact version
 * tapped, that it is absent where it was not asked for, and — the part a direct
 * dialog rerender cannot see — that a row the host has already OBSERVED to have
 * changed, moved or gone retires the session rather than being substituted.
 */

const state = vi.hoisted(() => ({ familyId: 'family-1' }))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => state.familyId,
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  stickerLibraryCollection: (familyId: string) => ({ familyId }),
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: vi.fn(), imageFailureRef: { current: null } }),
}))

/**
 * The dialog as a stub that reports its props.
 *
 * Deliberately not the real one: what is under test here is which source the
 * host hands over and when it takes it back, and the real dialog would bring a
 * canvas and a network read along with it.
 */
const dialogProps = vi.fn()
vi.mock('../books/ArcadeArtDialog', () => ({
  default: (props: {
    source: Sticker | null
    familyId: string
    contextKey: string
    nonce: number
  }) => {
    dialogProps(props)
    if (!props.source) return null
    return (
      <div data-testid="arcade-dialog">
        <span data-testid="arcade-url">{props.source.url}</span>
        <span data-testid="arcade-id">{props.source.id}</span>
        <span data-testid="arcade-nonce">{String(props.nonce)}</span>
        <span data-testid="arcade-context">{props.contextKey}</span>
      </div>
    )
  },
}))

const getDocsMock = vi.fn()
vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  orderBy: () => 'orderBy',
  doc: () => ({}),
  updateDoc: vi.fn(),
  writeBatch: () => ({ update: vi.fn(), commit: vi.fn() }),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────

const original: Sticker = {
  id: 'orig',
  url: 'https://example.test/orig.png',
  storagePath: 'families/family-1/stickers/orig.png',
  label: 'Wolf',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'both',
  sourceDrawingId: 'g1',
  isOriginal: true,
  createdAt: '2026-06-01',
}

const comicVersion: Sticker = {
  ...original,
  id: 'v-comic',
  url: 'https://example.test/comic.png',
  storagePath: 'families/family-1/stickers/comic.png',
  isOriginal: undefined,
  theme: 'comic',
  createdAt: '2026-06-03',
}

/** A standalone sticker with no group and no look. */
const legacy: Sticker = {
  id: 'legacy',
  url: 'https://example.test/legacy.png',
  storagePath: 'families/family-1/stickers/legacy.png',
  label: 'Dino',
  category: 'custom',
  tags: ['animal'],
  childProfile: 'both',
  createdAt: '2026-05-01',
}

const LIBRARY = [comicVersion, original, legacy]

const snapshotOf = (rows: Sticker[]) => ({
  docs: rows.map((s) => ({ id: s.id, data: () => s })),
})

beforeEach(() => {
  state.familyId = 'family-1'
  dialogProps.mockReset()
  getDocsMock.mockReset()
  getDocsMock.mockResolvedValue(snapshotOf(LIBRARY))
})

const ENABLED = {
  groupByDrawing: true,
  enableGameArt: true,
  gameArtContextKey: 'family-1|parents|child-1',
} as const

const openPreview = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) => {
  await screen.findByText(/sticker/)
  await user.click(await screen.findByRole('button', { name }))
}

const doorName = /make game art/i

// ── Tests ─────────────────────────────────────────────────────────────────

describe('the game-art door', () => {
  it('is absent on the default Settings host', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing />)
    await openPreview(user, /Preview Wolf.*Comic/)

    expect(screen.getByRole('button', { name: /make more versions/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: doorName })).toBeNull()
  })

  it('is absent when the host opts in without supplying its context identity', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab groupByDrawing enableGameArt />)
    await openPreview(user, /Preview Wolf.*Comic/)

    expect(screen.queryByRole('button', { name: doorName })).toBeNull()
  })

  it('opens on the version that was actually tapped, not the representative', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)

    await user.click(screen.getByRole('button', { name: doorName }))

    const dialog = await screen.findByTestId('arcade-dialog')
    expect(within(dialog).getByTestId('arcade-id')).toHaveTextContent('v-comic')
    expect(within(dialog).getByTestId('arcade-url')).toHaveTextContent(comicVersion.url)
    expect(within(dialog).getByTestId('arcade-context')).toHaveTextContent(
      'family-1|parents|child-1',
    )
  })

  /**
   * The eligibility rule the saved-version editor must NOT lend: that one is
   * about redrawing an existing look, and a child's own cleaned drawing is
   * exactly the picture they want as a sprite.
   */
  it('is offered on the group ORIGINAL and on a look-less sticker', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab {...ENABLED} />)

    await openPreview(user, /Preview Wolf Original/)
    expect(screen.getByRole('button', { name: doorName })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Preview Dino' }))
    expect(screen.getByRole('button', { name: doorName })).toBeInTheDocument()
  })

  it('counts each opening as its own session', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab {...ENABLED} />)

    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: doorName }))
    expect(await screen.findByTestId('arcade-nonce')).toHaveTextContent('1')
    // MUI keeps the preview's paper mounted through its exit transition.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Reopen on the identical picture.
    await user.click(screen.getByRole('button', { name: 'Preview Wolf Comic-book look' }))
    await user.click(screen.getByRole('button', { name: doorName }))
    await waitFor(() =>
      expect(screen.getByTestId('arcade-nonce')).toHaveTextContent('2'),
    )
  })

  it('retires an open session when the actor identity changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: doorName }))
    await screen.findByTestId('arcade-dialog')
    expect(dialogProps.mock.calls.at(-1)?.[0].familyId).toBe('family-1')

    rerender(
      <StickerLibraryTab {...ENABLED} gameArtContextKey="family-1|lincoln|child-2" />,
    )

    await waitFor(() => expect(screen.queryByTestId('arcade-dialog')).toBeNull())
  })

  /**
   * The big preview is where BOTH keyed doors get their source, so clearing only
   * the session targets left a picture resolved under the old identity on
   * screen, ready to open a freshly-keyed session on the next tap.
   */
  it('retires the big PREVIEW when the actor identity changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    rerender(
      <StickerLibraryTab {...ENABLED} gameArtContextKey="family-1|lincoln|child-2" />,
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('a source the host has already seen change', () => {
  it('RETIRES the session when the same id is re-pointed at different bytes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: doorName }))
    expect(await screen.findByTestId('arcade-url')).toHaveTextContent(comicVersion.url)

    // A refresh brings back the same row id pointing at a different image.
    const replaced: Sticker = {
      ...comicVersion,
      url: 'https://example.test/comic-v2.png',
      storagePath: 'families/family-1/stickers/comic-v2.png',
    }
    getDocsMock.mockResolvedValue(snapshotOf([replaced, original, legacy]))
    rerender(<StickerLibraryTab {...ENABLED} refreshSignal={1} />)

    await waitFor(() => expect(screen.queryByTestId('arcade-dialog')).toBeNull())
    // Not substituted: the grid on screen was made from bytes that are gone,
    // and exporting the new picture under the old session would be a lie.
    expect(screen.queryByText('https://example.test/comic-v2.png')).toBeNull()
  })

  it('RETIRES the session when the row is deleted from the library', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: doorName }))
    await screen.findByTestId('arcade-dialog')

    getDocsMock.mockResolvedValue(snapshotOf([original, legacy]))
    rerender(<StickerLibraryTab {...ENABLED} refreshSignal={1} />)

    await waitFor(() => expect(screen.queryByTestId('arcade-dialog')).toBeNull())
  })

  it('leaves a live session alone when a refresh returns the same row', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: doorName }))
    await screen.findByTestId('arcade-dialog')

    rerender(<StickerLibraryTab {...ENABLED} refreshSignal={1} />)

    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('arcade-url')).toHaveTextContent(comicVersion.url)
  })

  /**
   * A failed read is not an observation. Nothing is known to have changed, so a
   * converted grid is not thrown away over an unrelated query failure — but the
   * list is no longer vouched for, which the next test is about.
   */
  it('leaves a live session alone when the refresh FAILS', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await openPreview(user, /Preview Wolf.*Comic/)
    await user.click(screen.getByRole('button', { name: doorName }))
    await screen.findByTestId('arcade-dialog')

    getDocsMock.mockRejectedValue(new Error('offline'))
    rerender(<StickerLibraryTab {...ENABLED} refreshSignal={1} />)

    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('arcade-url')).toHaveTextContent(comicVersion.url)
  })
})

describe('provenance of the list a session may start from', () => {
  it('opens no door at all after a failed first read', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'))
    render(<StickerLibraryTab {...ENABLED} />)

    // The legacy behaviour is untouched — a failed read leaves the list as it
    // was — and nothing vouches for it, so there is no door to tap.
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: doorName })).toBeNull()
  })

  it('opens the door once a read has actually vouched for the list', async () => {
    const user = userEvent.setup()
    render(<StickerLibraryTab {...ENABLED} />)

    await openPreview(user, /Preview Wolf.*Comic/)
    expect(screen.getByRole('button', { name: doorName })).toBeInTheDocument()
  })

  it('shuts the door on rows that are not in the vouched list at all', async () => {
    // The family changes and its read fails: the previous family's rows are
    // still rendered by the legacy list, and no session may start from one.
    const user = userEvent.setup()
    const { rerender } = render(<StickerLibraryTab {...ENABLED} />)
    await screen.findByText(/sticker/)

    state.familyId = 'family-2'
    getDocsMock.mockRejectedValue(new Error('offline'))
    rerender(
      <StickerLibraryTab
        {...ENABLED}
        gameArtContextKey="family-2|parents|child-9"
      />,
    )

    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2))
    await user.click(await screen.findByRole('button', { name: /Preview Wolf.*Comic/ }))
    expect(screen.queryByRole('button', { name: doorName })).toBeNull()
  })
})
