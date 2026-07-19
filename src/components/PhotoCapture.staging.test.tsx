import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PhotoCapture from './PhotoCapture'

// Controllable image compression: each call parks a resolver so the test can
// hold a shot "in flight" and assert Save stays disabled until it settles.
const mockCompressResolvers: Array<(b: Blob) => void> = []
vi.mock('../core/utils/compressImage', () => ({
  compressIfNeeded: vi.fn(
    () => new Promise<Blob>((resolve) => { mockCompressResolvers.push(resolve) }),
  ),
}))

// `compressToJpeg` awaits a dynamic import before calling `compressIfNeeded`,
// so the resolver is registered a few microtasks after the change event —
// wait for it to appear, then resolve it.
async function resolveNextCompression() {
  await waitFor(() => expect(mockCompressResolvers.length).toBeGreaterThan(0))
  const resolve = mockCompressResolvers.shift()
  resolve?.(new Blob(['x'], { type: 'image/jpeg' }))
}

beforeEach(() => {
  mockCompressResolvers.length = 0
  let urlSeq = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${urlSeq++}`),
    revokeObjectURL: vi.fn(),
  })
})

function stageFile(input: HTMLInputElement, name: string) {
  const file = new File([name], name, { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('PhotoCapture staging mode (FEAT-109) — no lost in-flight shot', () => {
  it('keeps Save disabled until an in-flight camera shot finishes staging, then commits every shot', async () => {
    const onCaptureBatch = vi.fn()
    const { container } = render(<PhotoCapture multiple onCaptureBatch={onCaptureBatch} />)
    const cameraInput = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement

    // First shot → stage it.
    stageFile(cameraInput, 'p1.png')
    await resolveNextCompression()
    await screen.findByRole('button', { name: /save 1 photo/i })

    // Second shot arrives while its compression is still in flight.
    stageFile(cameraInput, 'p2.png')

    // Save must not fire against the stale (1-photo) set — it shows Processing
    // and is disabled until the late shot lands in the staging tray.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()
    })

    // Finish the second compression → both photos staged, Save re-enabled.
    await resolveNextCompression()
    const saveBtn = await screen.findByRole('button', { name: /save 2 photos/i })
    expect(saveBtn).toBeEnabled()

    // Committing now emits ONE batch carrying both files — nothing dropped.
    fireEvent.click(saveBtn)
    expect(onCaptureBatch).toHaveBeenCalledTimes(1)
    expect(onCaptureBatch.mock.calls[0][0]).toHaveLength(2)
  })
})
