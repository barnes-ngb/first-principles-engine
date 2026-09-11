import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectKidLine } from '../../test/kidReadability'

/**
 * UX-359, Codex round 1 (P2) — **a half-save is not a no-save.**
 *
 * This form creates the artifact document and *then* uploads the file and writes
 * the `uri`. The first cut of this fix reported one sentence for both halves:
 * *"That did not save. Try again."* Over an upload failure that is false — the
 * document exists — and the retry it recommends would have created a **second**
 * artifact, leaving the first orphaned with no picture on it.
 *
 * So the two failures are kept apart, and the retry **reuses** the document the
 * first attempt created rather than adding another.
 *
 * POSITIVE CONTROL: collapse the two branches back onto one message and the
 * first test fails; drop `createdArtifactIdRef` and the second fails (`addDoc`
 * is called twice).
 */

const addDoc = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>()
const updateDoc = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
const uploadArtifactFile = vi.fn<(...args: unknown[]) => Promise<{ downloadUrl: string }>>()

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  doc: (col: unknown, id: string) => ({ col, id }),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({ kind: 'artifacts' }),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: () => 'shot.jpg',
  uploadArtifactFile: (...args: unknown[]) => uploadArtifactFile(...args),
}))

async function renderForm(onSave = vi.fn()) {
  const KidCaptureForm = (await import('./KidCaptureForm')).default
  render(
    <KidCaptureForm
      type="photo"
      familyId="fam-1"
      childId="lincoln"
      today="2026-09-11"
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  )
  return onSave
}

/** Put a file on the form's picker so Save becomes tappable. */
async function attachPhoto(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['bytes'], 'build.jpg', { type: 'image/jpeg' })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, file)
}

beforeEach(() => {
  vi.clearAllMocks()
  addDoc.mockResolvedValue({ id: 'art-1' })
  uploadArtifactFile.mockResolvedValue({ downloadUrl: 'https://example.test/art-1.jpg' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the two halves of a kid capture fail differently', () => {
  it('says the record exists but the picture does not, when the upload fails', async () => {
    const user = userEvent.setup()
    uploadArtifactFile.mockRejectedValueOnce(new Error('storage/unauthorized'))
    const onSave = await renderForm()
    await attachPhoto(user)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const line = await screen.findByText(/no picture/i)
    expect(line).toBeTruthy()
    expectKidLine(line.textContent ?? '', 'partial-save notice')
    // It does not claim nothing saved, because something did.
    expect(screen.queryByText('That did not save. Try again.')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reuses the document it already created, so a retry adds no duplicate', async () => {
    const user = userEvent.setup()
    uploadArtifactFile.mockRejectedValueOnce(new Error('storage/unauthorized'))
    const onSave = await renderForm()
    await attachPhoto(user)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/no picture/i)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    // One artifact for one photo, however many times he taps Save.
    expect(addDoc).toHaveBeenCalledTimes(1)
    expect(uploadArtifactFile).toHaveBeenCalledTimes(2)
    expect(updateDoc).toHaveBeenCalledTimes(1)
  })

  it('does not re-upload a photo that already landed (Codex round 3, P2)', async () => {
    const user = userEvent.setup()
    // The upload succeeds; only the `uri` write fails. A retry that re-uploads
    // leaves the first Storage object permanently unreferenced.
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))
    const onSave = await renderForm()
    await attachPhoto(user)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/no picture/i)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    // One document, ONE upload, two attempts at the step that actually failed.
    expect(addDoc).toHaveBeenCalledTimes(1)
    expect(uploadArtifactFile).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledTimes(2)
    // And the retry wrote the URL the first upload produced.
    expect(updateDoc.mock.calls[1][1]).toEqual({
      uri: 'https://example.test/art-1.jpg',
    })
  })

  it('says nothing saved when the record itself could not be written', async () => {
    const user = userEvent.setup()
    addDoc.mockRejectedValueOnce(new Error('permission-denied'))
    const onSave = await renderForm()
    await attachPhoto(user)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const line = await screen.findByText('That did not save. Try again.')
    expectKidLine(line.textContent ?? '', 'no-save notice')
    expect(uploadArtifactFile).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says nothing at all when it works', async () => {
    const user = userEvent.setup()
    const onSave = await renderForm()
    await attachPhoto(user)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/did not save/i)).toBeNull()
    expect(screen.queryByText(/no picture/i)).toBeNull()
  })
})
