import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  enhance: vi.fn(),
  upload: vi.fn(),
  clean: vi.fn(),
  record: vi.fn(),
  save: vi.fn(),
  failure: { current: null as unknown },
  capped: false,
  childId: 'child-origin',
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(), useParams: () => ({ bookId: 'book-test' }),
}))
vi.mock('/src/core/auth/useAuth', () => ({ useFamilyId: () => 'family-test' }))
vi.mock('/src/core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: boundary.childId, name: 'Test Child' },
    children: [{ id: boundary.childId, name: 'Test Child' }], isChildProfile: true,
  }),
}))
vi.mock('/src/core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'child-origin', themeMode: 'family', canEdit: true }),
}))
vi.mock('/src/core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: boundary.enhance, generateImage: vi.fn(), imageFailureRef: boundary.failure }),
}))
vi.mock('../useBookArtQuota', async (importOriginal) => ({
  ...await importOriginal<typeof import('../useBookArtQuota')>(),
  useBookArtQuota: () => ({ atLimit: boundary.capped, remaining: 1, limit: 25, recordGeneration: boundary.record }),
}))
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => boundary.save(...args),
  getDocs: vi.fn(async () => ({ docs: [] })), query: vi.fn(), orderBy: vi.fn(),
}))
vi.mock('/src/core/firebase/firestore', () => ({
  stickerLibraryCollection: (familyId: string) => `${familyId}/stickers`,
  artifactsCollection: (familyId: string) => `${familyId}/artifacts`,
}))
vi.mock('../cleanSketch', () => ({ cleanSketchBackground: (...args: unknown[]) => boundary.clean(...args) }))
vi.mock('../useBook', () => ({
  useBook: () => ({
    book: {
      id: 'book-test', childId: 'child-origin', title: 'Test Book', status: 'draft', theme: 'fantasy',
      pages: [{ id: 'page-test', pageNumber: 1, text: 'A test.', images: [], layout: 'text-only' }],
      subjectBuckets: [],
    },
    loading: false, saveState: 'idle', saveErrorMessage: null,
    updatePage: vi.fn(), addPage: vi.fn(), deletePage: vi.fn(), updateBookMeta: vi.fn(),
    addImageToPage: vi.fn(), removeImageFromPage: vi.fn(), uploadAudio: vi.fn(),
    addAiImageToPage: vi.fn(), addStickerToPage: vi.fn(), addStickerFileToPage: vi.fn(),
    updateImagePosition: vi.fn(), reorderPages: vi.fn(), addSketchToPage: boundary.upload,
    applySketchEnhancement: vi.fn(), restoreImageVersion: vi.fn(),
  }),
}))
vi.mock('/src/components/Page', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('/src/components/CreativeTimer', () => ({ default: () => null }))
vi.mock('/src/components/AudioRecorder', () => ({ default: () => null }))
vi.mock('/src/components/SaveIndicator', () => ({ default: () => null }))
vi.mock('/src/components/PhotoCapture', () => ({
  default: ({ onCapture }: { onCapture: (file: File) => void }) => (
    <button onClick={() => onCapture(rawDrawing)}>Capture test drawing</button>
  ),
}))
vi.mock('../PageEditor', () => ({ default: () => null }))
vi.mock('../StickerPicker', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

import BookEditorPage from '../BookEditorPage'
import DrawingChoiceDialog from '../DrawingChoiceDialog'
import { reimagineCaption } from '../reimagineCaptions'
import { ART_QUOTA_MESSAGE } from '../../business/useArtQuota'
import { generateHint } from '../artHelpContent'

const rawDrawing = new File(['raw'], 'drawing.png', { type: 'image/png' })
const cleanedDrawing = new File(['cleaned'], 'cleaned.png', { type: 'image/png' })
const paths = ['raw', 'sticker', 'picture'] as const
type Path = typeof paths[number]

beforeEach(() => {
  vi.clearAllMocks()
  boundary.capped = false
  boundary.childId = 'child-origin'
  boundary.failure.current = null
  boundary.enhance.mockResolvedValue({ url: 'https://example.test/result.png', storagePath: 'result.png' })
  boundary.upload.mockResolvedValue({ imageId: 'image-test', storagePath: 'sketch-test.png' })
  boundary.clean.mockResolvedValue(cleanedDrawing)
  boundary.record.mockResolvedValue(undefined)
  boundary.save.mockResolvedValue({ id: 'saved-test' })
  URL.createObjectURL = vi.fn((value) => value === cleanedDrawing ? 'blob:cleaned' : 'blob:raw')
  URL.revokeObjectURL = vi.fn()
})

async function openLookChoice(user: ReturnType<typeof userEvent.setup>, path: Path) {
  await user.click(screen.getByRole('button', { name: /add a drawing/i }))
  await user.click(screen.getByRole('button', { name: 'Capture test drawing' }))
  if (path === 'raw') {
    await user.click(screen.getByText('Reimagine'))
  } else {
    await user.click(screen.getByText('Clean up'))
    await user.click(await screen.findByText(path === 'sticker' ? 'Reimagine as sticker' : 'Reimagine as a picture'))
  }
}

// Real dialog, editor callbacks, caption resolver and
// background hook. Only capture/cleanup, persistence, quota reads and AI are fake.
describe('UX-161b: each offered look sends its named style', () => {
  it.each(paths.flatMap((path) => [
    { path, label: 'Watercolor look', intensity: 50, style: 'storybook', words: /watercolor/ },
    { path, label: 'Comic-book look', intensity: 100, style: 'comic', words: /comic-book/ },
  ]))(
    '$path: $label', async ({ path, label, intensity, style, words }) => {
      const user = userEvent.setup()
      render(<BookEditorPage />)
      await openLookChoice(user, path)
      expect(screen.getByRole('radiogroup', { name: 'Choose a look' })).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(2)
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Watercolor look' })).toBeChecked()
      await user.click(screen.getByRole('radio', { name: label }))
      expect(boundary.enhance).not.toHaveBeenCalled()
      expect(boundary.upload).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Make it' }))
      await waitFor(() => expect(boundary.enhance).toHaveBeenCalledTimes(1))
      expect(boundary.enhance).toHaveBeenCalledWith({
        familyId: 'family-test', sketchStoragePath: 'sketch-test.png',
        style, caption: reimagineCaption(intensity),
        theme: 'fantasy', transparent: path === 'sticker',
      })
      expect(boundary.enhance.mock.calls[0][0].caption).toMatch(words)
      expect(boundary.upload).toHaveBeenCalledWith('page-test', path === 'raw' ? rawDrawing : cleanedDrawing)
      expect(boundary.record).toHaveBeenCalledTimes(1)
      expect(await screen.findByText('Drawing reimagined!')).toBeInTheDocument()
      expect(boundary.save).toHaveBeenCalledWith('family-test/stickers', expect.objectContaining({ childId: 'child-origin' }))
      expect(boundary.save).toHaveBeenCalledWith('family-test/artifacts', expect.objectContaining({ childId: 'child-origin' }))
    },
  )

  it.each(paths)('%s keeps the default request and lets the user change transparency', async (path) => {
    const user = userEvent.setup()
    render(<BookEditorPage />)
    await openLookChoice(user, path)
    const transparent = screen.getByRole('switch', { name: 'Keep transparent background (for stickers)' })
    expect(transparent).toHaveProperty('checked', path === 'sticker')
    await user.click(transparent)
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => expect(boundary.enhance).toHaveBeenCalledTimes(1))
    expect(boundary.enhance.mock.calls[0][0]).toMatchObject({
      style: 'storybook', caption: reimagineCaption(50), transparent: path !== 'sticker',
    })
  })

  it.each(paths)('%s Back and Cancel spend nothing, and reopening resets the look', async (path) => {
    const user = userEvent.setup()
    render(<BookEditorPage />)
    await openLookChoice(user, path)
    await user.click(screen.getByRole('radio', { name: 'Comic-book look' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(boundary.upload).not.toHaveBeenCalled()
    expect(boundary.enhance).not.toHaveBeenCalled()
    await openLookChoice(user, path)
    expect(screen.getByRole('radio', { name: 'Watercolor look' })).toBeChecked()
    expect(screen.getByRole('switch')).toHaveProperty('checked', path === 'sticker')
  })

  it.each(paths)('%s refuses before upload if the budget runs out while choosing', async (path) => {
    const user = userEvent.setup()
    const view = render(<BookEditorPage />)
    await openLookChoice(user, path)
    await user.click(screen.getByRole('radio', { name: 'Comic-book look' }))
    boundary.capped = true
    view.rerender(<BookEditorPage />)
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    expect(boundary.upload).not.toHaveBeenCalled()
    expect(boundary.enhance).not.toHaveBeenCalled()
    expect(boundary.record).not.toHaveBeenCalled()
  })

  it('keeps a pending result owned by the child who started it', async () => {
    let finish!: (value: { url: string; storagePath: string }) => void
    boundary.enhance.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    const view = render(<BookEditorPage />)
    await openLookChoice(user, 'sticker')
    await user.click(screen.getByRole('radio', { name: 'Comic-book look' }))
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    expect(await screen.findByText('Reimagining...')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it' })).not.toBeInTheDocument()
    expect(boundary.record).not.toHaveBeenCalled()
    boundary.childId = 'child-other'
    view.rerender(<BookEditorPage />)
    await act(async () => finish({ url: 'https://example.test/done.png', storagePath: 'done.png' }))
    expect(await screen.findByText('Drawing reimagined!')).toBeInTheDocument()
    expect(boundary.enhance).toHaveBeenCalledTimes(1)
    expect(boundary.record).toHaveBeenCalledTimes(1)
    expect(boundary.save).toHaveBeenCalledTimes(2)
    for (const [, payload] of boundary.save.mock.calls) expect(payload.childId).toBe('child-origin')
  })

  it.each([false, true])('keeps refusal alternatives and their quota guard (capped retry: %s)', async (cappedRetry) => {
    boundary.enhance.mockImplementationOnce(async () => {
      boundary.failure.current = { details: { failure: 'blocked', alternatives: ['A small blue bird'] } }
      return null
    })
    const user = userEvent.setup()
    const view = render(<BookEditorPage />)
    await openLookChoice(user, 'picture')
    await user.click(screen.getByRole('radio', { name: 'Comic-book look' }))
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    expect(await screen.findByText('The picture maker said no to that.')).toBeInTheDocument()
    expect(boundary.record).not.toHaveBeenCalled()
    expect(boundary.save).not.toHaveBeenCalled()
    boundary.capped = cappedRetry
    view.rerender(<BookEditorPage />)
    await user.click(screen.getByRole('button', { name: 'A small blue bird' }))
    if (cappedRetry) {
      expect(boundary.enhance).toHaveBeenCalledTimes(1)
      expect(boundary.record).not.toHaveBeenCalled()
    } else {
      await waitFor(() => expect(boundary.enhance).toHaveBeenCalledTimes(2))
      expect(boundary.enhance.mock.calls[1][0]).toMatchObject({
        style: 'comic', caption: 'A small blue bird', transparent: false, familyId: 'family-test',
      })
      expect(boundary.record).toHaveBeenCalledTimes(1)
    }
    // Retry reuses the uploaded source instead of uploading a second sketch.
    expect(boundary.upload).toHaveBeenCalledTimes(1)
  })
})

describe('look controls retain the surrounding dialog behavior', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof DrawingChoiceDialog>> = {}) {
    return render(<DrawingChoiceDialog
      open capturedFile={rawDrawing} capturedPreviewUrl="blob:raw"
      onClose={vi.fn()} onChoose={vi.fn()} processing={false} {...props}
    />)
  }

  it.each(['kid', 'parent'] as const)('keeps %s hint and help; selecting a look is not confirmation', async (artAudience) => {
    const onOpenArtHelp = vi.fn()
    const onChoose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ artAudience, onOpenArtHelp, onChoose })
    await user.click(screen.getByText('Reimagine'))
    expect(screen.getByText(generateHint('makeItFancy', artAudience))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'How this works' }))
    expect(onOpenArtHelp).toHaveBeenCalledTimes(1)
    const watercolor = screen.getByRole('radio', { name: 'Watercolor look' })
    watercolor.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Comic-book look' })).toBeChecked()
    expect(onChoose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Make it' }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('reimagine', 100, false)
  })

  it('the processing view offers no additional confirmation', () => {
    renderDialog({ processing: true, processingLabel: 'Preparing drawing...' })
    expect(screen.getByText('Preparing drawing...')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it' })).not.toBeInTheDocument()
  })

  it('a capped dialog retains the free routes and replaces paid choices with the existing message', () => {
    renderDialog({ capReached: true })
    expect(screen.queryByText('Reimagine')).not.toBeInTheDocument()
    expect(screen.getByText(ART_QUOTA_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText('Use as-is')).toBeInTheDocument()
    expect(screen.getByText('Clean up')).toBeInTheDocument()
    expect(screen.getByText('Make a sticker')).toBeInTheDocument()
  })
})
