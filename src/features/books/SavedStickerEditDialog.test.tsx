import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SavedStickerEditDialog from './SavedStickerEditDialog'
import type { SavedStickerEditDialogProps } from './SavedStickerEditDialog'
import {
  SAVED_STICKER_EDIT_INELIGIBLE,
  SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG,
  SAVED_STICKER_EDIT_MAX_LENGTH,
  SAVED_STICKER_EDIT_PENDING_GENERATE,
  SAVED_STICKER_EDIT_PENDING_SAVE,
  SAVED_STICKER_EDIT_SAVE_RETRY,
  SAVED_STICKER_EDIT_SOURCE_CHANGED,
  SAVED_STICKER_EDIT_SOURCE_GONE,
  SAVED_STICKER_EDIT_UNAVAILABLE,
} from './savedStickerEditSession'
import type { ImageCallFailure } from '../../core/ai/useAI'
import type { Sticker } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'

/**
 * Editing a picture that is already saved, as the component actually behaves
 * (SAVED-STICKER-EDITOR-003).
 *
 * Every race is driven by a deferred promise rather than a timer: the three
 * things that can go wrong here — spending after a cancel, displaying in the
 * wrong session, and writing a second library row for one preview — only happen
 * in the window between a call starting and finishing, so that window is held
 * open and the assertions are made inside it.
 */

// ── Mocks ─────────────────────────────────────────────────────────

const enhanceSketchMock = vi.fn()
const imageFailureRef: { current: ImageCallFailure | null } = { current: null }
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: enhanceSketchMock, imageFailureRef }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  stickerLibraryCollection: (familyId: string) => ({ familyId }),
}))

const getDocMock = vi.fn()
const setDocMock = vi.fn()
let allocated = 0
vi.mock('firebase/firestore', () => ({
  // An id-less `doc(collection)` allocates a NEW destination each call, which is
  // what lets these tests prove one preview allocates exactly one.
  doc: (collection: unknown, id?: string) => ({
    collection,
    id: id ?? `allocated-${(allocated += 1)}`,
  }),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}))

// ── Fixtures ──────────────────────────────────────────────────────

const SOURCE: Sticker = {
  id: 'ver-1',
  url: 'https://example.test/ver-1.png',
  storagePath: 'families/f1/sketches/ver-1.png',
  label: 'Wolf',
  category: StickerCategory.Custom,
  childId: 'child-1',
  childProfile: 'lincoln',
  tags: ['animal'],
  sourceDrawingId: 'group-1',
  theme: 'fantasy',
  createdAt: '2026-06-20T00:00:00.000Z',
}

/** The stored row, as the preflight read sees it. */
const STORED_ROW: Record<string, unknown> = {
  url: SOURCE.url,
  storagePath: SOURCE.storagePath,
  label: SOURCE.label,
  category: 'custom',
  childId: 'child-1',
  childProfile: 'lincoln',
  tags: ['animal'],
  sourceDrawingId: 'group-1',
  theme: 'fantasy',
  createdAt: SOURCE.createdAt,
}

const GOOD_IMAGE = {
  url: 'https://example.test/edited.png',
  storagePath: 'families/f1/sketches/edited.png',
}

function snapshot(row?: Record<string, unknown>) {
  return { exists: () => !!row, data: () => row }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Drain the awaits a resolved deferred unblocks, effects included. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await Promise.resolve() })
  }
}

function renderDialog(props: Partial<SavedStickerEditDialogProps> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const base: SavedStickerEditDialogProps = {
    source: SOURCE,
    familyId: 'f1',
    contextKey: 'ctx-1',
    onClose,
    onSaved,
    ...props,
  }
  const utils = render(<SavedStickerEditDialog {...base} />)
  return {
    ...utils,
    onClose,
    onSaved,
    update: (next: Partial<SavedStickerEditDialogProps>) =>
      utils.rerender(<SavedStickerEditDialog {...base} {...next} />),
  }
}

const generateButton = () => screen.getByRole('button', { name: /make the change/i })
const saveButton = () => screen.getByRole('button', { name: /save as new version/i })
const cancelButton = () => screen.getByRole('button', { name: /^cancel$/i })

async function typeInstruction(
  user: ReturnType<typeof userEvent.setup>,
  text = 'take the hat off',
) {
  await user.type(screen.getByLabelText(/what should change/i), text)
}

/** Type an instruction and start one generation, leaving `image` pending. */
async function startGeneration(
  user: ReturnType<typeof userEvent.setup>,
  image: Deferred<unknown>,
  read: Deferred<unknown> = deferred(),
) {
  getDocMock.mockReturnValue(read.promise)
  enhanceSketchMock.mockReturnValue(image.promise)
  await typeInstruction(user)
  await user.click(generateButton())
  read.resolve(snapshot(STORED_ROW))
  await settle()
}

/** Type an instruction and complete one generation, leaving a usable preview. */
async function makePreview(user: ReturnType<typeof userEvent.setup>) {
  const image = deferred<unknown>()
  await startGeneration(user, image)
  image.resolve(GOOD_IMAGE)
  await settle()
  await screen.findByAltText('New Wolf')
}

beforeEach(() => {
  enhanceSketchMock.mockReset()
  getDocMock.mockReset()
  setDocMock.mockReset()
  setDocMock.mockResolvedValue(undefined)
  imageFailureRef.current = null
  allocated = 0
})

// ── The request ───────────────────────────────────────────────────

describe('the request a saved-picture edit sends', () => {
  it('carries the shared edit field and none of the legacy look fields', async () => {
    const user = userEvent.setup()
    renderDialog()
    await makePreview(user)

    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
    const [request] = enhanceSketchMock.mock.calls[0]
    expect(request).toEqual({
      familyId: 'f1',
      sketchStoragePath: SOURCE.storagePath,
      savedStickerEdit: {
        sourceStickerId: 'ver-1',
        sourceLookId: 'fantasy',
        instruction: 'take the hat off',
      },
    })
    // The preview is labelled with the instruction it was actually made for.
    expect(screen.getByText(/New picture for/)).toHaveTextContent('take the hat off')
  })

  it('refuses an instruction the shared rule would not use verbatim', async () => {
    const user = userEvent.setup()
    renderDialog()
    // Two sentences: the server keeps only the first, so the second would be
    // silently dropped — the client refuses instead of sending it.
    await typeInstruction(user, 'remove the hat. keep the dog')
    await user.click(generateButton())
    expect(
      await screen.findByText(/one short sentence/i),
    ).toBeInTheDocument()
    expect(getDocMock).not.toHaveBeenCalled()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('keeps every pasted word and refuses to send one that is too long', async () => {
    const user = userEvent.setup()
    renderDialog()
    // The shape the old 160-character input ate: the words that qualify the
    // change sit at the END, so a truncated paste asks for something else.
    const pasted = `remove the hat ${'and the scarf and the boots '.repeat(6)}but keep the dog`
    expect(pasted.length).toBeGreaterThan(SAVED_STICKER_EDIT_MAX_LENGTH)

    const field = screen.getByLabelText(/what should change/i)
    await user.click(field)
    await user.paste(pasted)

    expect(field).toHaveValue(pasted)
    await user.click(generateButton())

    expect(
      await screen.findByText(SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG),
    ).toBeInTheDocument()
    // Still every word, including the tail, for the person to shorten.
    expect(field).toHaveValue(pasted)
    expect(getDocMock).not.toHaveBeenCalled()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('does not open on an original, an unknown look or a row with no id', () => {
    for (const bad of [
      { ...SOURCE, isOriginal: true },
      { ...SOURCE, theme: 'no-such-look' },
      { ...SOURCE, theme: undefined },
      { ...SOURCE, id: undefined },
    ] as Sticker[]) {
      const { unmount } = renderDialog({ source: bad })
      expect(screen.getByText(SAVED_STICKER_EDIT_INELIGIBLE)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /make the change/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /save as new version/i })).toBeNull()
      unmount()
    }
  })
})

// ── Generation races ──────────────────────────────────────────────

describe('one tap, one generation', () => {
  it('ignores a duplicate Generate in the same tick', async () => {
    const user = userEvent.setup()
    const image = deferred<unknown>()
    const read = deferred<unknown>()
    getDocMock.mockReturnValue(read.promise)
    enhanceSketchMock.mockReturnValue(image.promise)
    renderDialog()
    await typeInstruction(user)

    const button = generateButton()
    await act(async () => {
      button.click()
      button.click()
    })
    // The latch is synchronous, so the second tap never reaches the read.
    expect(getDocMock).toHaveBeenCalledTimes(1)

    read.resolve(snapshot(STORED_ROW))
    await settle()
    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
  })

  it('spends nothing when the session closes while the preflight read is pending', async () => {
    const user = userEvent.setup()
    const read = deferred<unknown>()
    getDocMock.mockReturnValue(read.promise)
    const { update } = renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())

    update({ source: null })
    read.resolve(snapshot(STORED_ROW))
    await settle()

    // The read did happen — this is the window, not a tap that never landed.
    expect(getDocMock).toHaveBeenCalledTimes(1)
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('spends nothing when the child/family context changes while the read is pending', async () => {
    const user = userEvent.setup()
    const read = deferred<unknown>()
    getDocMock.mockReturnValue(read.promise)
    const { update } = renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())

    update({ contextKey: 'ctx-2' })
    read.resolve(snapshot(STORED_ROW))
    await settle()

    expect(getDocMock).toHaveBeenCalledTimes(1)
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('refuses before the paid call when the source is gone', async () => {
    const user = userEvent.setup()
    getDocMock.mockResolvedValue(snapshot(undefined))
    renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())

    expect(await screen.findByText(SAVED_STICKER_EDIT_SOURCE_GONE)).toBeInTheDocument()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('refuses before the paid call when the source changed under it', async () => {
    const user = userEvent.setup()
    getDocMock.mockResolvedValue(
      snapshot({ ...STORED_ROW, storagePath: 'families/f1/sketches/other.png' }),
    )
    renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())

    expect(
      await screen.findByText(SAVED_STICKER_EDIT_SOURCE_CHANGED),
    ).toBeInTheDocument()
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })
})

// ── Getting out ───────────────────────────────────────────────────

describe('cancelling a pending request', () => {
  it('is offered during the preflight read, and spends nothing', async () => {
    const user = userEvent.setup()
    const read = deferred<unknown>()
    getDocMock.mockReturnValue(read.promise)
    const { onClose } = renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())

    expect(screen.getByText(SAVED_STICKER_EDIT_PENDING_GENERATE)).toBeInTheDocument()
    expect(cancelButton()).toBeEnabled()
    await user.click(cancelButton())
    expect(onClose).toHaveBeenCalledTimes(1)

    // The host here does nothing with `onClose`, so this is the dialog's own
    // invalidation: the read resolves into a session that is already over.
    read.resolve(snapshot(STORED_ROW))
    await settle()
    expect(getDocMock).toHaveBeenCalledTimes(1)
    expect(enhanceSketchMock).not.toHaveBeenCalled()
  })

  it('is offered after the call has gone out: counted, never shown, never saved', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn(async () => {})
    const image = deferred<unknown>()
    const { onClose, onSaved } = renderDialog({ recordGeneration })
    await startGeneration(user, image)

    await user.click(cancelButton())
    expect(onClose).toHaveBeenCalledTimes(1)
    image.resolve(GOOD_IMAGE)
    await settle()

    // The request could not be called back, so it is counted for the actor who
    // sent it — and it reaches nothing else.
    expect(recordGeneration).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('New Wolf')).toBeNull()
    expect(setDocMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('starts and writes nothing more once dismissed, even on the retry shortcut', async () => {
    const user = userEvent.setup()
    const { onClose, onSaved } = renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    setDocMock.mockRejectedValueOnce(new Error('ack lost'))

    // A save that was submitted and did not come back…
    await user.click(saveButton())
    expect(await screen.findByText(SAVED_STICKER_EDIT_SAVE_RETRY)).toBeInTheDocument()
    expect(setDocMock).toHaveBeenCalledTimes(1)

    // …then Close, with a host that does not unmount the dialog…
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)

    // …and the retry path, which takes no preflight await, still writes nothing.
    setDocMock.mockResolvedValue(undefined)
    await user.click(saveButton())
    await settle()
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()

    // Nor may a dismissed session start another generation.
    await user.click(generateButton())
    await settle()
    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
  })

  it('says a pending save may already have landed, and does not refresh after it', async () => {
    const user = userEvent.setup()
    const write = deferred<void>()
    const { onClose, onSaved } = renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    setDocMock.mockReturnValue(write.promise)

    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))
    expect(screen.getByText(SAVED_STICKER_EDIT_PENDING_SAVE)).toBeInTheDocument()

    await user.click(cancelButton())
    write.resolve()
    await settle()

    // One write, which stands; no second attempt and no stale refresh.
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })
})

// ── Session identity ──────────────────────────────────────────────

/** The same document id, holding a different picture. */
const SAME_ID_REDRAWN: Sticker = {
  ...SOURCE,
  url: 'https://example.test/ver-1-redrawn.png',
  storagePath: 'families/f1/sketches/ver-1-redrawn.png',
}

describe('what counts as the same session', () => {
  it('replaces the session when the same id arrives with a different picture mid-preflight', async () => {
    const user = userEvent.setup()
    const read = deferred<unknown>()
    getDocMock.mockReturnValue(read.promise)
    const { update } = renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())

    update({ source: SAME_ID_REDRAWN })
    read.resolve(snapshot(STORED_ROW))
    await settle()

    expect(getDocMock).toHaveBeenCalledTimes(1)
    expect(enhanceSketchMock).not.toHaveBeenCalled()
    // A fresh session on the picture now in the library.
    expect(screen.getByLabelText(/what should change/i)).toHaveValue('')
    expect(screen.getByAltText('Wolf')).toHaveAttribute('src', SAME_ID_REDRAWN.url)
  })

  it.each([
    ['a different picture', { url: SAME_ID_REDRAWN.url, storagePath: SAME_ID_REDRAWN.storagePath }],
    ['a different look', { theme: 'comic' }],
    ['a different group', { sourceDrawingId: 'group-2' }],
    ['a different owner', { childId: 'child-2' }],
    ['a different name', { label: 'Fox' }],
  ])('drops the preview when the same id arrives with %s', async (_what, patch) => {
    const user = userEvent.setup()
    const { update } = renderDialog()
    await makePreview(user)

    update({ source: { ...SOURCE, ...patch } as Sticker })

    // The preview was made from the picture that was there before, so it is not
    // a version of this one and there is nothing to save.
    expect(screen.queryByAltText('New Wolf')).toBeNull()
    expect(saveButton()).toBeDisabled()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('replaces the session when the family changes under the same context key', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn(async () => {})
    const image = deferred<unknown>()
    const { update, onSaved } = renderDialog({ recordGeneration })
    await startGeneration(user, image)

    // Same `contextKey` on purpose: the family is not the caller's to remember.
    update({ familyId: 'f2' })
    image.resolve(GOOD_IMAGE)
    await settle()

    expect(recordGeneration).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('New Wolf')).toBeNull()
    expect(screen.getByLabelText(/what should change/i)).toHaveValue('')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('writes to the family the session started in, not the one that replaced it', async () => {
    const user = userEvent.setup()
    const write = deferred<void>()
    const { update } = renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    setDocMock.mockReturnValue(write.promise)

    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))
    update({ familyId: 'f2' })
    write.resolve()
    await settle()

    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(setDocMock.mock.calls[0][0].collection).toEqual({ familyId: 'f1' })
  })
})

// ── Accounting ────────────────────────────────────────────────────

describe('what the weekly counter is told', () => {
  it('counts a usable success once, for the actor who started it, even after a switch', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn(async () => {})
    const image = deferred<unknown>()
    const { update } = renderDialog({ recordGeneration })
    await startGeneration(user, image)

    // Away before the picture arrives: it must not display, and the call that
    // already happened must still be counted against the actor who made it.
    update({ contextKey: 'ctx-2' })
    image.resolve(GOOD_IMAGE)
    await settle()

    expect(recordGeneration).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('New Wolf')).toBeNull()
  })

  it('keeps the recorder captured at THIS Generate when the hook re-binds later', async () => {
    const user = userEvent.setup()
    const firstWeek = vi.fn(async () => {})
    const nextWeek = vi.fn(async () => {})
    const image = deferred<unknown>()
    const { update } = renderDialog({ recordGeneration: firstWeek })
    await startGeneration(user, image)

    // A week rollover swaps the callback while the call is in flight.
    update({ recordGeneration: nextWeek })
    image.resolve(GOOD_IMAGE)
    await settle()

    expect(firstWeek).toHaveBeenCalledTimes(1)
    expect(nextWeek).not.toHaveBeenCalled()
  })

  it('counts nothing for a refused, empty or malformed result', async () => {
    const user = userEvent.setup()
    const recordGeneration = vi.fn(async () => {})
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    // `enhanceSketch` returns null on a callable rejection, then a response with
    // only half a receipt — neither is a usable success.
    enhanceSketchMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ url: GOOD_IMAGE.url, storagePath: '' })
    renderDialog({ recordGeneration })
    await typeInstruction(user)

    await user.click(generateButton())
    await settle()
    await user.click(generateButton())
    await settle()

    expect(enhanceSketchMock).toHaveBeenCalledTimes(2)
    expect(recordGeneration).not.toHaveBeenCalled()
    expect(screen.queryByAltText('New Wolf')).toBeNull()
  })

  it('shows the picture even when the counter rejects or never settles', async () => {
    const user = userEvent.setup()
    const rejects = vi.fn(async () => { throw new Error('offline') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderDialog({ recordGeneration: rejects })
    await makePreview(user)
    expect(saveButton()).toBeEnabled()
    unmount()

    const pending = vi.fn(() => new Promise<void>(() => {}))
    renderDialog({ recordGeneration: pending })
    const user2 = userEvent.setup()
    await makePreview(user2)
    // A counter write that never settles cannot hold the preview or the save.
    expect(saveButton()).toBeEnabled()
  })
})

// ── Preview truthfulness ──────────────────────────────────────────

describe('what the preview claims', () => {
  it('keeps the previous picture and its instruction when a new attempt fails', async () => {
    const user = userEvent.setup()
    renderDialog()
    await makePreview(user)

    imageFailureRef.current = { code: 'functions/unavailable', message: 'Server says no' }
    enhanceSketchMock.mockResolvedValue(null)
    const field = screen.getByLabelText(/what should change/i)
    await user.clear(field)
    await user.type(field, 'add a cape')
    await user.click(generateButton())
    await settle()

    // The old picture is still the old picture, still labelled with the
    // instruction that made it — never relabelled as the new request.
    expect(screen.getByAltText('New Wolf')).toHaveAttribute('src', GOOD_IMAGE.url)
    expect(screen.getByText(/New picture for/)).toHaveTextContent('take the hat off')
    // The typed words survive the failure.
    expect(field).toHaveValue('add a cape')
    // The server's own sentence, not a reworded-prompt card.
    expect(screen.getByText('Server says no')).toBeInTheDocument()
    expect(screen.queryByText(/try one of these/i)).toBeNull()
  })

  it('says only what it knows when the call throws', async () => {
    const user = userEvent.setup()
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    enhanceSketchMock.mockRejectedValue(new Error('take the hat off: prompt rejected'))
    renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())
    await settle()

    expect(await screen.findByText(SAVED_STICKER_EDIT_UNAVAILABLE)).toBeInTheDocument()
  })

  it('clears the instruction only on close, not on failure', async () => {
    const user = userEvent.setup()
    getDocMock.mockResolvedValue(snapshot(undefined))
    const { update } = renderDialog()
    await typeInstruction(user)
    await user.click(generateButton())
    await settle()
    expect(screen.getByLabelText(/what should change/i)).toHaveValue('take the hat off')

    update({ source: null })
    update({ source: SOURCE })
    expect(screen.getByLabelText(/what should change/i)).toHaveValue('')
    expect(screen.queryByAltText('New Wolf')).toBeNull()
  })

  it('never displays a picture that arrives after a close and reopen', async () => {
    const user = userEvent.setup()
    const image = deferred<unknown>()
    const { update } = renderDialog()
    await startGeneration(user, image)

    update({ source: null })
    update({ source: SOURCE })
    image.resolve(GOOD_IMAGE)
    await settle()

    // The picture really did come back — into a session that no longer exists.
    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('New Wolf')).toBeNull()
    expect(saveButton()).toBeDisabled()
  })
})

// ── Saving ────────────────────────────────────────────────────────

describe('saving a new version', () => {
  it('writes one new row that keeps the source metadata and never touches the source', async () => {
    const user = userEvent.setup()
    const { onSaved } = renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))

    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))

    const [ref, payload] = setDocMock.mock.calls[0] as [
      { id: string },
      Record<string, unknown>,
    ]
    // A freshly allocated destination — not the source's own document.
    expect(ref.id).toBe('allocated-1')
    expect(ref.id).not.toBe(SOURCE.id)
    expect(payload).toMatchObject({
      url: GOOD_IMAGE.url,
      storagePath: GOOD_IMAGE.storagePath,
      label: 'Wolf',
      category: 'custom',
      childId: 'child-1',
      childProfile: 'lincoln',
      tags: ['animal'],
      sourceDrawingId: 'group-1',
      theme: 'fantasy',
    })
    // No lineage invented, no original flag, and the instruction is not stored.
    expect(payload.isOriginal).toBeUndefined()
    expect(payload.prompt).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('take the hat off')
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('ignores a duplicate Save in the same tick', async () => {
    const user = userEvent.setup()
    renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))

    const button = saveButton()
    await act(async () => {
      button.click()
      button.click()
    })
    await settle()
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('refuses the FIRST save when the source changed, and writes nothing', async () => {
    const user = userEvent.setup()
    renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot({ ...STORED_ROW, theme: 'comic' }))

    await user.click(saveButton())
    expect(
      await screen.findByText(SAVED_STICKER_EDIT_SOURCE_CHANGED),
    ).toBeInTheDocument()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('retries a submitted save to the SAME place with the SAME row', async () => {
    const user = userEvent.setup()
    renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    setDocMock.mockRejectedValueOnce(new Error('ack lost'))

    await user.click(saveButton())
    expect(await screen.findByText(SAVED_STICKER_EDIT_SAVE_RETRY)).toBeInTheDocument()

    // The source is deleted between the lost acknowledgement and the retry. The
    // write may already have landed, so the retry resends rather than claiming
    // nothing was saved — and it cannot preflight its way into a second row.
    getDocMock.mockResolvedValue(snapshot(undefined))
    setDocMock.mockResolvedValue(undefined)
    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(2))

    expect(setDocMock.mock.calls[1][0]).toBe(setDocMock.mock.calls[0][0])
    expect(setDocMock.mock.calls[1][1]).toBe(setDocMock.mock.calls[0][1])
    // No second generation and no second count.
    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/saved as a new version/i)).toBeInTheDocument()
  })

  it('allocates a new destination for a new preview', async () => {
    const user = userEvent.setup()
    renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    setDocMock.mockRejectedValueOnce(new Error('ack lost'))
    await user.click(saveButton())
    await screen.findByText(SAVED_STICKER_EDIT_SAVE_RETRY)

    // A second picture is a different thing to save; it must not land on the
    // first one's destination.
    enhanceSketchMock.mockResolvedValue({
      url: 'https://example.test/second.png',
      storagePath: 'families/f1/sketches/second.png',
    })
    await user.click(generateButton())
    await settle()
    setDocMock.mockResolvedValue(undefined)
    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(2))

    expect(setDocMock.mock.calls[1][0]).not.toBe(setDocMock.mock.calls[0][0])
    expect(setDocMock.mock.calls[1][1]).toMatchObject({
      url: 'https://example.test/second.png',
    })
  })

  it('completes a save for the session it started in and refreshes nothing else', async () => {
    const user = userEvent.setup()
    const write = deferred<void>()
    const { update, onSaved } = renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))
    setDocMock.mockReturnValue(write.promise)

    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))
    // Switching after the write went out hides the result; it does not redirect
    // the write, and it must not refresh the library of the new context.
    update({ contextKey: 'ctx-2' })
    write.resolve()
    await settle()

    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(setDocMock.mock.calls[0][0].collection).toEqual({ familyId: 'f1' })
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('still saves a picture that is already made after the weekly cap is reached', async () => {
    const user = userEvent.setup()
    const { update } = renderDialog()
    await makePreview(user)
    getDocMock.mockResolvedValue(snapshot(STORED_ROW))

    // The cap arrives while the preview is on screen: no new generation, but the
    // picture that was already paid for can still be kept.
    update({ capReached: true })
    expect(screen.queryByRole('button', { name: /make the change/i })).toBeNull()
    expect(saveButton()).toBeEnabled()

    await user.click(saveButton())
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1))
  })

  it('offers no generation at all when the cap is already reached', async () => {
    renderDialog({ capReached: true })
    expect(screen.queryByRole('button', { name: /make the change/i })).toBeNull()
    expect(saveButton()).toBeDisabled()
  })
})
