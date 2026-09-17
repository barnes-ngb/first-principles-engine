import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The picture on screen and the row written for it are ONE thing
 * (LOCAL-CLAUDE-PILOT-001).
 *
 * The reproduction these probes were written against: generate in Comic, tap
 * Watercolor without generating, tap Save Fancy — the library row carried the
 * comic image's URL and storage path beside `theme: 'cartoon'`, a row naming a
 * look its picture was never drawn in. The style chips and the note field under
 * a finished picture are a draft of the NEXT request; they are free, and free has
 * to mean the finished picture keeps its own look, its own explanation and its
 * own saved state until another picture actually arrives.
 *
 * The "Saved ✓" marker is part of that same one thing: there is one fancy slot,
 * and it names the picture on screen. So a save and a generation may not overlap
 * — the last four probes hold that in both orders, through the retry card, and
 * across a save that fails.
 *
 * So every assertion below pins an outcome — the document actually submitted to
 * `addDoc`, the request actually submitted to `enhanceSketch`, or the words on
 * screen — and never a state name or a call ordering inside the component.
 */
const { clean, upload, save, enhance, collection, record, imageFailureRef } = vi.hoisted(() => ({
  clean: vi.fn(),
  upload: vi.fn(),
  save: vi.fn(),
  enhance: vi.fn(),
  collection: vi.fn((familyId: string) => ({ familyId })),
  record: vi.fn(),
  imageFailureRef: { current: null as unknown },
}))

vi.mock('firebase/firestore', () => ({ addDoc: (...args: unknown[]) => save(...args) }))
vi.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  uploadBytes: (...args: unknown[]) => upload(...args),
  getDownloadURL: () => Promise.resolve('https://example.test/cleaned-upload.png'),
}))
vi.mock('../../../core/firebase/firestore', () => ({ stickerLibraryCollection: collection }))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: enhance, imageFailureRef }),
}))
// The real cleaner is canvas work; everything under test happens after it.
vi.mock('../cleanSketch', () => ({
  cleanSketchBackground: (...args: unknown[]) => clean(...args),
  DEFAULT_BORDER_INSET_FRACTION: 0.04,
  WHOLE_IMAGE_BORDER_INSET_FRACTION: 0.08,
}))
vi.mock('../SketchCropStage', () => ({ default: () => <div>Crop</div> }))

import SketchScanner from '../SketchScanner'

const picture = new File(['original'], 'drawing.png', { type: 'image/png' })
const cleaned = new File(['auto'], 'cleaned.png', { type: 'image/png' })

// The two looks whose labels are literals in `drawingStickerStyles.ts`, so a
// theme-table change cannot quietly rename what these tests are reading. They are
// also the exact pair in the reported reproduction.
const COMIC = '💥 Comic-book look'
const WATERCOLOR = '🎨 Watercolor look'
/** What the finished picture says it is — separate from the chips below it. */
const shownLook = (chip: string) => `This picture: ${chip}`

const COMIC_PICTURE = { url: 'https://example.test/comic.png', storagePath: 'families/f1/fancy/comic.png' }
const WATER_PICTURE = { url: 'https://example.test/water.png', storagePath: 'families/f1/fancy/water.png' }

const REFUSAL = {
  code: 'functions/invalid-argument',
  message: 'The sketch enhancement was blocked by the safety filter.',
  details: { failure: 'blocked' },
}

type User = ReturnType<typeof userEvent.setup>

function renderScanner(props: Partial<React.ComponentProps<typeof SketchScanner>> = {}) {
  return render(
    <SketchScanner
      open
      onClose={() => {}}
      familyId="f1"
      childName="Lincoln"
      childProfile="lincoln"
      recordGeneration={record}
      {...props}
    />,
  )
}

/** Capture a drawing and stand in front of the "Make it fancy" door. */
async function reachFancy(user: User) {
  await user.upload(
    document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement,
    picture,
  )
  await user.click(await screen.findByRole('button', { name: 'Use the whole picture' }))
  await user.click(await screen.findByRole('tab', { name: /Fancy/ }))
}

/** The redo button and the retry card's button share a label by design. */
const redoButtons = () => screen.getAllByRole('button', { name: 'Make it with this style' })
async function tapRedo(user: User) {
  await user.click(redoButtons()[0])
}

/** The one document this flow writes, as it was actually submitted. */
const submitted = (call = 0) => save.mock.calls[call][1]

describe('SketchScanner — the saved fancy sticker is the picture that was made', () => {
  beforeEach(() => {
    clean.mockReset().mockResolvedValue(cleaned)
    upload.mockReset().mockResolvedValue({ ref: {} })
    save.mockReset().mockResolvedValue({ id: 'saved' })
    enhance.mockReset().mockResolvedValue(COMIC_PICTURE)
    record.mockReset().mockResolvedValue(undefined)
    collection.mockClear()
    imageFailureRef.current = null
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('saves the look the picture was drawn in, not one tapped afterwards', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    expect(enhance.mock.calls[0][0]).toMatchObject({ style: 'comic', transparent: true })

    // The reproduction: change the pending look, generate nothing, save.
    await user.click(screen.getByText(WATERCOLOR))
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
    // And the row went to this family's library, unchanged in shape.
    expect(save.mock.calls[0][0]).toEqual({ familyId: 'f1' })
    // Tapping a look is not a generation.
    expect(enhance).toHaveBeenCalledTimes(1)
  })

  it('says which look the finished picture is, apart from the looks on offer', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    expect(screen.getByText(/picking is free/i)).toBeInTheDocument()

    // A pending choice changes the offer, never the statement about the picture.
    await user.click(screen.getByText(WATERCOLOR))
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    expect(screen.queryByText(shownLook(WATERCOLOR))).toBeNull()
  })

  it('picking a look or typing a note costs nothing, before or after a picture', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByText('➕ My own look'))
    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), 'a cape')
    expect(enhance).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    await user.click(screen.getByText(WATERCOLOR))
    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), ' and boots')
    expect(enhance).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
  })

  it('moves the picture, its look and its saved row together on a second generation', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())
    expect(enhance.mock.calls[1][0]).toMatchObject({ style: 'storybook' })

    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({ theme: 'cartoon', ...WATER_PICTURE })
  })

  it('makes a new picture saveable again, and each save writes its own picture', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()

    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())

    const saveAgain = await screen.findByRole('button', { name: 'Save Fancy' })
    expect(saveAgain).toBeEnabled()
    await user.click(saveAgain)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(submitted(0)).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
    expect(submitted(1)).toMatchObject({ theme: 'cartoon', ...WATER_PICTURE })
    // Two versions of one drawing, still one group.
    expect(submitted(1).sourceDrawingId).toBe(submitted(0).sourceDrawingId)
  })

  it('keeps a saved picture through a failed redo and cannot write it a second time', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    imageFailureRef.current = REFUSAL
    enhance.mockResolvedValueOnce(null)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()

    // The picture the kid is looking at is untouched, still its own look, and
    // the person is told where it stands.
    expect(screen.getByAltText('Fancy version')).toBeInTheDocument()
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    expect(screen.getByText(/already saved in your sticker library/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()
    expect(save).toHaveBeenCalledTimes(1)
    // A picture that never came back is not counted.
    expect(record).toHaveBeenCalledTimes(1)

    // A retry that works replaces it, and the new one is saveable on its own.
    imageFailureRef.current = null
    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await tapRedo(user)
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())
    expect(screen.queryByText(/already saved in your sticker library/i)).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(submitted(1)).toMatchObject({ theme: 'cartoon', ...WATER_PICTURE })
  })

  it('a failed redo on an unsaved picture still saves the picture that exists, in its own look', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    imageFailureRef.current = REFUSAL
    enhance.mockResolvedValueOnce(null)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()
    expect(screen.getByText(/you can still save it/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
  })

  it('leaves a first-try failure in its normal retry state — nothing to keep, nothing to save', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    imageFailureRef.current = REFUSAL
    enhance.mockResolvedValueOnce(null)
    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()

    expect(screen.queryByAltText('Fancy version')).toBeNull()
    expect(screen.queryByText(shownLook(COMIC))).toBeNull()
    expect(screen.queryByText(/hasn’t changed/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save Fancy' })).toBeDisabled()
    expect(record).not.toHaveBeenCalled()

    // The ordinary retry still works, and the picture it makes is the one saved.
    // (The button and the retry card's own button share a label here too.)
    imageFailureRef.current = null
    enhance.mockResolvedValueOnce(COMIC_PICTURE)
    await user.click(screen.getAllByRole('button', { name: 'Make it fancy' })[0])
    await screen.findByAltText('Fancy version')
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
  })

  it('keeps what the picture maker was asked for while the next note is being typed', async () => {
    const user = userEvent.setup()
    enhance.mockResolvedValue({ ...COMIC_PICTURE, revisedNote: 'a sparkly blue ice dress' })
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByText('➕ My own look'))
    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), 'an Elsa dress')
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    expect(screen.getByText('Drawn as: a sparkly blue ice dress')).toBeInTheDocument()

    // Drafting the next request re-describes nothing about this picture.
    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), ' and a crown')
    await user.click(screen.getByText(WATERCOLOR))
    expect(screen.getByText('Drawn as: a sparkly blue ice dress')).toBeInTheDocument()
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()

    // Nor does a redo that never arrives.
    imageFailureRef.current = REFUSAL
    enhance.mockResolvedValueOnce(null)
    await tapRedo(user)
    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()
    expect(screen.getByText('Drawn as: a sparkly blue ice dress')).toBeInTheDocument()
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
  })

  it('always redraws the captured original, never the version it just generated', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(2))

    // One upload of the captured drawing, and both calls read that same source.
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][1]).toBe(picture)
    const source = enhance.mock.calls[0][0].sketchStoragePath
    expect(source).toMatch(/^families\/f1\/sketches\/\d+_drawing\.png$/)
    expect(enhance.mock.calls[1][0].sketchStoragePath).toBe(source)
  })

  it('keeps the captured child, the group anchor and the counted generation through a header switch', async () => {
    const user = userEvent.setup()
    const view = renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1))

    view.rerender(
      <SketchScanner
        open
        onClose={() => {}}
        familyId="f1"
        childName="London"
        childProfile="london"
        recordGeneration={record}
      />,
    )
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({
      theme: 'comic',
      ...COMIC_PICTURE,
      childProfile: 'lincoln',
      label: "Lincoln's drawing",
      sourceDrawingId: expect.any(String),
    })
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('Retake drops the finished picture, its look and the pending choice', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    await user.click(screen.getByRole('button', { name: 'Retake' }))

    await reachFancy(user)
    expect(screen.queryByAltText('Fancy version')).toBeNull()
    expect(screen.queryByText(shownLook(COMIC))).toBeNull()

    // The next drawing starts from the default look, not the last one tapped.
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(2))
    expect(enhance.mock.calls[1][0]).toMatchObject({ style: 'storybook' })
  })

  it('counts a generation that lands after Retake, and shows its picture to nobody', async () => {
    let complete!: (value: typeof COMIC_PICTURE) => void
    enhance.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Retake' }))
    await act(async () => complete(COMIC_PICTURE))

    // The paid request still belongs to its originating quota callback...
    expect(record).toHaveBeenCalledTimes(1)
    // ...and its picture belongs to a session that is over.
    expect(screen.queryByAltText('Fancy version')).toBeNull()
    expect(screen.getByRole('button', { name: 'Upload a picture' })).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('a family change discards the stale picture rather than saving it', async () => {
    const user = userEvent.setup()
    const view = renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    view.rerender(
      <SketchScanner open onClose={() => {}} familyId="f2" childName="Lincoln" childProfile="lincoln" />,
    )

    expect(screen.queryByAltText('Fancy version')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save Fancy' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Upload a picture' })).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('closing discards the picture, and reopening starts from capture', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const view = renderScanner({ onClose })
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    view.rerender(
      <SketchScanner open={false} onClose={onClose} familyId="f1" childName="Lincoln" childProfile="lincoln" />,
    )
    view.rerender(
      <SketchScanner open onClose={onClose} familyId="f1" childName="Lincoln" childProfile="lincoln" />,
    )

    expect(screen.getByRole('button', { name: 'Upload a picture' })).toBeInTheDocument()
    expect(screen.queryByAltText('Fancy version')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('at the cap the door is closed and the finished picture keeps its own look and save', async () => {
    const user = userEvent.setup()
    const view = renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    view.rerender(
      <SketchScanner
        open
        onClose={() => {}}
        familyId="f1"
        childName="Lincoln"
        childProfile="lincoln"
        recordGeneration={record}
        capReached
      />,
    )

    expect(screen.queryByRole('button', { name: 'Make it with this style' })).toBeNull()
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
    expect(enhance).toHaveBeenCalledTimes(1)
  })

  /**
   * The saved marker belongs to the displayed result, and there is one fancy
   * slot holding it. Left overlapping, the two orders below each moved the
   * marker onto a picture that was never written: the save adds `'fancy'` when
   * its write lands, and a generation that finished in between had already
   * replaced the picture and cleared it. Neither order is reachable now — a save
   * and a generation refuse each other — so these probes assert what was
   * written, what is on screen, and that both doors come back when the pending
   * operation settles.
   */
  it('refuses a generation while a fancy save is in flight — the marker stays with the picture that was written', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    // The write is on its way and has not come back.
    let finishSave!: (value: { id: string }) => void
    save.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    // Picking the next look is still free...
    await user.click(screen.getByText(WATERCOLOR))
    // ...but the picture it would make cannot start underneath the save.
    expect(redoButtons()[0]).toBeDisabled()
    expect(enhance).toHaveBeenCalledTimes(1)

    await act(async () => { finishSave({ id: 'saved' }) })

    // One row was written, and it is the picture wearing the marker.
    expect(save).toHaveBeenCalledTimes(1)
    expect(submitted()).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()

    // The door reopens the moment the save settles, and the picture it makes is
    // unsaved — it can wear the marker only by being written itself.
    expect(redoButtons()[0]).toBeEnabled()
    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await tapRedo(user)
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())
    expect(save).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Save Fancy' })).toBeEnabled()
  })

  it('refuses a fancy save while a generation is in flight — a new picture never inherits the old marker', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    let completeSecond!: (value: typeof WATER_PICTURE) => void
    enhance.mockImplementationOnce(() => new Promise(resolve => { completeSecond = resolve }))
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(2))

    // The comic picture is behind the spinner and on its way out, so it is not
    // on offer: a row written now would hand its marker to whatever arrives.
    expect(screen.queryByAltText('Fancy version')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save Fancy' })).toBeDisabled()
    expect(save).not.toHaveBeenCalled()

    await act(async () => completeSecond(WATER_PICTURE))

    // What arrives is unsaved, saveable on its own, and written as itself.
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())
    const saveNew = await screen.findByRole('button', { name: 'Save Fancy' })
    expect(saveNew).toBeEnabled()
    await user.click(saveNew)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(submitted()).toMatchObject({ theme: 'cartoon', ...WATER_PICTURE })
  })

  it('a retry-card tap cannot start a generation underneath a save in flight', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    // A failed redo leaves the comic picture and a retry card. The card's button
    // is not the one the controls disable — it calls the generator directly, so
    // the refusal has to live in the generator itself.
    imageFailureRef.current = REFUSAL
    enhance.mockResolvedValueOnce(null)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    expect(await screen.findByText(/wouldn't draw that one/i)).toBeInTheDocument()
    expect(screen.getByText(/you can still save it/i)).toBeInTheDocument()

    let finishSave!: (value: { id: string }) => void
    save.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    imageFailureRef.current = null
    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await user.click(redoButtons()[1])
    // Still the first two calls: the tap reached the generator and was refused.
    expect(enhance).toHaveBeenCalledTimes(2)

    await act(async () => { finishSave({ id: 'saved' }) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(submitted()).toMatchObject({ theme: 'comic', ...COMIC_PICTURE })
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()

    // And the same tap works once the save has settled.
    await user.click(redoButtons()[1])
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())
    expect(enhance).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Save Fancy' })).toBeEnabled()
  })

  it('a save that fails releases the door again, with nothing marked and nothing lost', async () => {
    const user = userEvent.setup()
    renderScanner()
    await reachFancy(user)

    await user.click(screen.getByText(COMIC))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')

    let failSave!: (reason: Error) => void
    save.mockImplementationOnce(() => new Promise((_resolve, reject) => { failSave = reject }))
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(redoButtons()[0]).toBeDisabled()

    await act(async () => { failSave(new Error('offline')) })
    expect(await screen.findByText('Failed to save sticker. Please try again.')).toBeInTheDocument()

    // Nothing was written, so nothing is marked, the picture is still its own
    // look, and both doors are open again.
    expect(screen.getByAltText('Fancy version')).toBeInTheDocument()
    expect(screen.getByText(shownLook(COMIC))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Fancy' })).toBeEnabled()
    expect(redoButtons()[0]).toBeEnabled()

    // The redo the failed save had been refusing. The look is picked BEFORE the
    // paid tap, because that tap is what fixes the request — asking for
    // Watercolor means tapping the chip, not mocking a watercolor URL.
    enhance.mockResolvedValueOnce(WATER_PICTURE)
    await user.click(screen.getByText(WATERCOLOR))
    await tapRedo(user)
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(2))
    expect(enhance.mock.calls[1][0]).toMatchObject({ style: 'storybook', transparent: true })
    await waitFor(() => expect(screen.getByText(shownLook(WATERCOLOR))).toBeInTheDocument())
    // The save that failed wrote nothing, and this picture inherits no marker.
    expect(save).toHaveBeenCalledTimes(1)

    // It is saveable as itself, and the row written is the picture on screen.
    await user.click(await screen.findByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(submitted(1)).toMatchObject({ theme: 'cartoon', ...WATER_PICTURE })
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()
  })
})
