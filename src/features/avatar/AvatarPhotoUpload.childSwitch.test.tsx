import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-331 — a staged photo must not seed the other boy's avatar.
 *
 * `handlePhotoTransform` reads the live `childId` prop, so a cropped preview
 * plus a child change plus *Transform!* wrote one boy's face into his brother's
 * `characterFeatures` and `photoUrl` — and spent one paid `extractFeatures`
 * call out of the shared weekly art budget doing it.
 *
 * The last case in each block is the positive control: with the render-time
 * reset removed, the preview survives the child change, *Transform!* is still
 * on screen and tapping it calls `extractFeatures` for the wrong boy — so those
 * assertions fail. That is what makes this evidence rather than description.
 *
 * Staging a photo means driving the real `handlePhotoSelect`, which runs
 * `FileReader` → `new Image()` → a canvas crop. jsdom performs none of the last
 * two, so both are stubbed below — the component's own code path is otherwise
 * untouched, so what is exercised here is the real branch.
 */

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const extractCallable = vi.fn(async () => ({ data: { features: { hair: 'brown' } } }))
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => extractCallable),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
}))

vi.mock('../../core/firebase/firebase', () => ({ app: {} }))
vi.mock('../../core/firebase/firestore', () => ({ avatarProfilesCollection: () => ({}) }))

const safeSetProfile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
vi.mock('./safeProfileWrite', () => ({
  safeSetProfile: (ref: unknown, data: unknown) => safeSetProfile(ref, data),
}))

vi.mock('./useAvatarArtQuota', () => ({
  useAvatarArtQuota: () => ({ atLimit: false, limit: 100, remaining: 100, recordGeneration: vi.fn() }),
  recordAvatarArtGeneration: vi.fn(),
}))

vi.mock('../books/ArtHelpSheet', () => ({
  default: () => <div />,
  ArtHelpButton: () => <button type="button">help</button>,
  GenerateHint: () => <div />,
}))

import AvatarPhotoUpload from './AvatarPhotoUpload'
import type { AvatarProfile } from '../../core/types'

const CHILDREN = [
  { id: 'lincoln', name: 'Lincoln' },
  { id: 'london', name: 'London' },
]

const PROFILE = { childId: 'lincoln', totalXp: 0 } as unknown as AvatarProfile
const STAGED_DATA_URL = 'data:image/jpeg;base64,AAAA'

const realImage = globalThis.Image
const realToDataUrl = HTMLCanvasElement.prototype.toDataURL
const realGetContext = HTMLCanvasElement.prototype.getContext

beforeEach(() => {
  safeSetProfile.mockClear()
  extractCallable.mockClear()
  mockUseActiveChild.mockReturnValue({ isChildProfile: false, children: CHILDREN })

  // `new Image()` never loads a data: URL in jsdom, so `img.onload` — where the
  // component crops and stages — would never fire. Fire it synchronously on the
  // `src` set instead.
  class StubImage {
    onload: (() => void) | null = null
    width = 400
    height = 400
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  globalThis.Image = StubImage as unknown as typeof Image
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => STAGED_DATA_URL) as never
})

afterEach(() => {
  globalThis.Image = realImage
  HTMLCanvasElement.prototype.toDataURL = realToDataUrl
  HTMLCanvasElement.prototype.getContext = realGetContext
})

function view(childId: string) {
  return (
    <AvatarPhotoUpload
      profile={PROFILE}
      familyId="fam-1"
      childId={childId}
      isLincoln
      accentColor="#7efc20"
      textColor="#fff"
    />
  )
}

/** Picks a file through the component's own hidden input and waits for staging. */
async function stagePhoto(container: HTMLElement) {
  const user = userEvent.setup()
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, new File(['bytes'], 'lincoln.jpg', { type: 'image/jpeg' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /transform!/i })).toBeInTheDocument())
}

describe('AvatarPhotoUpload — a child change drops the staged photo (UX-331)', () => {
  it('stages a picked photo and offers Transform!', async () => {
    const { container } = render(view('lincoln'))
    await stagePhoto(container)
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', STAGED_DATA_URL)
  })

  it('raises no notice when nothing was staged', () => {
    const { rerender } = render(view('lincoln'))
    rerender(view('london'))
    // A notice on every switch is one nobody reads by the time it matters.
    expect(screen.queryByText(/was cleared/i)).not.toBeInTheDocument()
  })

  it('clears the staged photo when the child changes', async () => {
    const { container, rerender } = render(view('lincoln'))
    await stagePhoto(container)

    rerender(view('london'))

    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /transform!/i })).not.toBeInTheDocument()
    expect(screen.getByText(/upload a photo/i)).toBeInTheDocument()
  })

  it('names both boys, and says the art budget was not spent', async () => {
    const { container, rerender } = render(view('lincoln'))
    await stagePhoto(container)

    rerender(view('london'))

    const notice = screen.getByText(/was cleared/i)
    expect(notice).toHaveTextContent('Lincoln')
    expect(notice).toHaveTextContent('London')
    expect(notice).toHaveTextContent(/nothing was spent/i)
  })

  it('POSITIVE CONTROL — the paid call for the new child is unreachable after a switch', async () => {
    const { container, rerender } = render(view('lincoln'))
    await stagePhoto(container)
    rerender(view('london'))

    // Without the reset, Transform! is still rendered here and a tap sends
    // Lincoln's cropped face with `childId: 'london'`. With it, the button does
    // not exist, so the wrong-child write and the paid call are unreachable
    // rather than merely unlikely.
    expect(screen.queryByRole('button', { name: /transform!/i })).not.toBeInTheDocument()
    expect(extractCallable).not.toHaveBeenCalled()
    expect(safeSetProfile).not.toHaveBeenCalled()
  })
})
