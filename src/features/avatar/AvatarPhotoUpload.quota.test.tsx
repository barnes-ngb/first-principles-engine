import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AvatarProfile } from '../../core/types'

// ── FEAT-184 (audit #7): the Hero Hub's "Transform!" is a paid image call ──
//
// It used to spend `extractFeatures` with no cap and no word about cost, on
// the surface built for London. Now one read counts one against the shared
// weekly counter, the tap says so before it happens, and at the cap the
// button stands down for the warm message. No new confirm dialog.

const { quota, actor, extractFn } = vi.hoisted(() => ({
  quota: {
    value: {
      count: 0,
      limit: 100,
      remaining: 100,
      atLimit: false,
      recordGeneration: vi.fn(async () => undefined),
    },
  },
  actor: { value: { activeChild: { id: 'child-a' }, isChildProfile: true } },
  extractFn: vi.fn(async () => ({ data: { features: { hair: 'brown' } } })),
}))

vi.mock('../business/useArtQuota', () => ({
  useArtQuota: () => quota.value,
  ART_QUOTA_MESSAGE: "That's a lot of art this week! Ask a grown-up if you need more. 🎨",
}))
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => actor.value,
}))
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => extractFn,
}))
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
}))
vi.mock('../../core/firebase/firebase', () => ({ app: {} }))
vi.mock('../../core/firebase/firestore', () => ({ avatarProfilesCollection: () => ({}) }))
const safeSetProfile = vi.fn(async () => undefined)
vi.mock('./safeProfileWrite', () => ({ safeSetProfile: (...args: unknown[]) => (safeSetProfile as (...a: unknown[]) => Promise<undefined>)(...args) }))

import AvatarPhotoUpload from './AvatarPhotoUpload'

const profile = { childId: 'child-a' } as unknown as AvatarProfile

function renderPanel() {
  return render(
    <AvatarPhotoUpload
      profile={profile}
      familyId="fam-1"
      childId="child-a"
      isLincoln={false}
      accentColor="#e8a0bf"
      textColor="#333"
    />,
  )
}

/** Put the panel into its "photo picked" state without a real FileReader/Image round-trip. */
async function pickPhoto() {
  // The component crops via canvas after an <img> load; jsdom has neither, so
  // drive the same state through the file input with the reader stubbed.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
}

beforeEach(() => {
  quota.value = { count: 0, limit: 100, remaining: 100, atLimit: false, recordGeneration: vi.fn(async () => undefined) }
  actor.value = { activeChild: { id: 'child-a' }, isChildProfile: true }
  extractFn.mockClear()
  safeSetProfile.mockClear()

  // Stub the crop pipeline: FileReader → data URL, Image → immediate load,
  // canvas → a data URL. The component only needs `photoPreviewUrl` set.
  class FakeReader {
    onload: ((ev: { target: { result: string } }) => void) | null = null
    readAsDataURL() {
      this.onload?.({ target: { result: 'data:image/jpeg;base64,QUJD' } })
    }
  }
  vi.stubGlobal('FileReader', FakeReader)
  class FakeImage {
    onload: (() => void) | null = null
    width = 100
    height = 100
    set src(_v: string) {
      this.onload?.()
    }
  }
  vi.stubGlobal('Image', FakeImage)
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => undefined })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,QUJD'
})

describe('AvatarPhotoUpload — the photo read is capped and counted (FEAT-184)', () => {
  it('says what the tap spends, in kid words for a kid profile', async () => {
    renderPanel()
    await pickPhoto()
    expect(screen.getByText('Reads your photo. Uses 1 art.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transform!' })).toBeEnabled()
  })

  it('says it in parent words for a parent, with no budget claim', async () => {
    actor.value = { activeChild: { id: 'child-a' }, isChildProfile: false }
    renderPanel()
    await pickPhoto()
    expect(screen.getByText(/Reads one photo into your hero's look · 1 paid image call/)).toBeInTheDocument()
  })

  it('counts one against the week after a real read, and never before', async () => {
    renderPanel()
    await pickPhoto()
    expect(quota.value.recordGeneration).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Transform!' }))
    })
    expect(extractFn).toHaveBeenCalledTimes(1)
    expect(quota.value.recordGeneration).toHaveBeenCalledTimes(1)
    expect(safeSetProfile).toHaveBeenCalledTimes(1)
  })

  it('at the cap: the warm message replaces the hint, the button stands down, nothing is spent', async () => {
    quota.value = { ...quota.value, remaining: 0, atLimit: true }
    renderPanel()
    await pickPhoto()
    expect(screen.getByText(/That's a lot of art this week!/)).toBeInTheDocument()
    expect(screen.queryByText('Reads your photo. Uses 1 art.')).toBeNull()
    const button = screen.getByRole('button', { name: 'Transform!' })
    expect(button).toBeDisabled()
    await act(async () => {
      fireEvent.click(button)
    })
    expect(extractFn).not.toHaveBeenCalled()
    expect(quota.value.recordGeneration).not.toHaveBeenCalled()
  })

  it('has one "?" that opens the help for this surface', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'How this works' }))
    expect(await screen.findByText('How your photo works')).toBeInTheDocument()
  })
})
