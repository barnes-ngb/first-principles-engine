import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { clean, upload, save, enhance, collection } = vi.hoisted(() => ({ clean: vi.fn(), upload: vi.fn(), save: vi.fn(), enhance: vi.fn(), collection: vi.fn((familyId: string) => ({ familyId })) }))
vi.mock('firebase/firestore', () => ({ addDoc: (...args: unknown[]) => save(...args) }))
vi.mock('firebase/storage', () => ({ ref: (_storage: unknown, path: string) => ({ path }), uploadBytes: (...args: unknown[]) => upload(...args), getDownloadURL: () => Promise.resolve('https://example.test/saved.png') }))
vi.mock('../../../core/firebase/firestore', () => ({ stickerLibraryCollection: collection }))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../../core/ai/useAI', () => ({ useAI: () => ({ enhanceSketch: enhance, imageFailureRef: { current: null } }) }))
vi.mock('../cleanSketch', () => ({ cleanSketchBackground: (...args: unknown[]) => clean(...args), DEFAULT_BORDER_INSET_FRACTION: 0.04, WHOLE_IMAGE_BORDER_INSET_FRACTION: 0.08 }))
vi.mock('../SketchCropStage', () => ({ default: () => <div>Crop</div> }))
vi.mock('../StickerCleanupEditor', () => ({ default: ({ onApply, onCancel }: { onApply: (file: File, edits: object, smallerCopy: boolean) => void; onCancel: () => void }) => <div role="dialog" aria-label="Test cleanup editor"><button onClick={() => onApply(new File(['fixed'], 'fixed.png'), { auto: false, strength: 60, marks: [] }, false)}>Use cleanup</button><button onClick={onCancel}>Discard cleanup</button></div> }))
import SketchScanner from '../SketchScanner'

const picture = new File(['original'], 'drawing.png', { type: 'image/png' })
const cleaned = new File(['auto'], 'cleaned.png', { type: 'image/png' })
async function capture(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement, picture)
  await user.click(screen.getByRole('button', { name: 'Use the whole picture' }))
}

describe('scanner correction/save session boundaries', () => {
  beforeEach(() => {
    clean.mockReset().mockResolvedValue(cleaned)
    upload.mockReset().mockResolvedValue({ ref: {} })
    save.mockReset().mockResolvedValue({ id: 'saved' })
    enhance.mockReset().mockResolvedValue({ url: 'https://example.test/fancy.png', storagePath: 'families/f1/fancy.png' })
    collection.mockClear()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  })

  it('Use cleanup updates only preview; Save writes corrected bytes once and locks the anchor', async () => {
    const user = userEvent.setup()
    render(<SketchScanner open familyId="f1" childProfile="lincoln" childName="Lincoln" onClose={() => {}} />)
    await capture(user)
    await user.click(await screen.findByRole('button', { name: 'Adjust cleanup' }))
    await user.click(screen.getByRole('button', { name: 'Use cleanup' }))
    expect(upload).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save Cleaned' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(upload.mock.calls[0][1].name).toBe('fixed.png')
    expect(save.mock.calls[0][1]).toMatchObject({ isOriginal: true, childProfile: 'lincoln', label: "Lincoln's drawing" })
    expect(screen.queryByRole('button', { name: 'Adjust cleanup' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: /Fancy/ }))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await waitFor(() => expect(enhance).toHaveBeenCalledTimes(1))
    // Fancy still uploads original working source, never the edited cutout.
    expect(upload.mock.calls[1][1]).toBe(picture)
  })

  it('a header child switch preserves the captured label/For and a paid result', async () => {
    const user = userEvent.setup()
    const view = render(<SketchScanner open familyId="f1" childProfile="lincoln" childName="Lincoln" onClose={() => {}} />)
    await capture(user)
    await user.click(await screen.findByRole('tab', { name: /Fancy/ }))
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    await screen.findByAltText('Fancy version')
    view.rerender(<SketchScanner open familyId="f1" childProfile="london" childName="London" onClose={() => {}} />)
    expect(screen.getByAltText('Fancy version')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Sticker label' })).toHaveValue("Lincoln's drawing")
    await user.click(screen.getByRole('button', { name: 'Save Fancy' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][1]).toMatchObject({ childProfile: 'lincoln', label: "Lincoln's drawing" })
  })

  it('closing a pending cleanup cannot reopen or repopulate a new capture', async () => {
    let complete!: (file: File) => void
    clean.mockImplementationOnce(() => new Promise<File>(resolve => { complete = resolve }))
    const user = userEvent.setup(), onClose = vi.fn()
    render(<SketchScanner open familyId="f1" onClose={onClose} />)
    await capture(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => complete(cleaned))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Upload a picture' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Cleaned' })).toBeNull()
  })

  it('family replacement during upload prevents the old sticker document write', async () => {
    let complete!: (value: { ref: object }) => void
    upload.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const user = userEvent.setup()
    const view = render(<SketchScanner open familyId="f1" onClose={() => {}} />)
    await capture(user)
    await user.click(await screen.findByRole('button', { name: 'Save Cleaned' }))
    view.rerender(<SketchScanner open familyId="f2" onClose={() => {}} />)
    await act(async () => complete({ ref: {} }))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Upload a picture' })).toBeInTheDocument()
  })

  it('rapid save taps share a single captured group and write', async () => {
    let complete!: (value: { ref: object }) => void
    upload.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const user = userEvent.setup()
    render(<SketchScanner open familyId="f1" onClose={() => {}} />)
    await capture(user)
    const button = await screen.findByRole('button', { name: 'Save Cleaned' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(upload).toHaveBeenCalledTimes(1)
    await act(async () => complete({ ref: {} }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual({ familyId: 'f1' })
    expect(save.mock.calls[0][1].sourceDrawingId).toEqual(expect.any(String))
  })

  it.each([['Cleaned', false], ['Fancy', false], ['Fancy', true]] as const)('keeps pending Save %s visible (already saved cleaned: %s)', async (version, alreadySavedCleaned) => {
    let complete!: (value: { id: string }) => void
    const user = userEvent.setup(), onClose = vi.fn(), onSaved = vi.fn()
    render(<SketchScanner open familyId="f1" onClose={onClose} onSaved={onSaved} />)
    await capture(user)
    const priorSaves = alreadySavedCleaned ? 1 : 0
    if (alreadySavedCleaned) {
      await user.click(await screen.findByRole('button', { name: 'Save Cleaned' }))
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    }
    if (version === 'Fancy') {
      await user.click(await screen.findByRole('tab', { name: /Fancy/ }))
      await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
      await screen.findByAltText('Fancy version')
    }
    save.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await user.click(await screen.findByRole('button', { name: `Save ${version}` }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(priorSaves + 1))
    const cancel = screen.getByRole('button', { name: alreadySavedCleaned ? 'Done' : 'Cancel' })
    expect(cancel).toBeDisabled()
    fireEvent.click(cancel)
    await user.keyboard('{Escape}')
    // Dialog's backdrop handler is reached through its actual container.
    const container = screen.getByRole('dialog').parentElement!
    fireEvent.mouseDown(container)
    fireEvent.click(container)
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledTimes(priorSaves)
    await act(async () => complete({ id: 'saved' }))
    expect(onSaved).toHaveBeenCalledTimes(priorSaves + 1)
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(priorSaves + 1)
  })

  it('allows Cancel again after a failed document save', async () => {
    let reject!: (error: Error) => void
    save.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const user = userEvent.setup(), onClose = vi.fn()
    render(<SketchScanner open familyId="f1" onClose={onClose} />)
    await capture(user)
    await user.click(await screen.findByRole('button', { name: 'Save Cleaned' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await act(async () => reject(new Error('offline')))
    expect(screen.getByText('Failed to save sticker. Please try again.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
