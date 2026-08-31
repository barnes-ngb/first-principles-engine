import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { enhanceSketchMock, recordGenerationMock } = vi.hoisted(() => ({
  enhanceSketchMock: vi.fn(),
  recordGenerationMock: vi.fn(async () => undefined),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ enhanceSketch: enhanceSketchMock }),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __collection: 'artifacts' })),
  stickerLibraryCollection: vi.fn(() => ({ __collection: 'stickerLibrary' })),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'doc-1' })),
}))

import { useBackgroundReimagine } from '../useBackgroundReimagine'

const baseOpts = {
  familyId: 'family-1',
  childId: 'child-lincoln',
  childName: 'Lincoln',
  onReplaceBackground: vi.fn(),
  onAddSticker: vi.fn(),
}

beforeEach(() => {
  enhanceSketchMock.mockReset()
  enhanceSketchMock.mockResolvedValue({ url: 'https://img/fancy.png', storagePath: 's/fancy.png' })
  recordGenerationMock.mockReset()
  recordGenerationMock.mockResolvedValue(undefined)
})

/** Fire the hook's reimagine with the arg shape the editor uses. */
async function startReimagine(result: { current: ReturnType<typeof useBackgroundReimagine> }) {
  await act(async () => {
    await result.current.startReimagine('img-1', 'page-1', 's/sketch.png', 'blob:src', 50, 'caption', false)
  })
}

describe('useBackgroundReimagine — daily art budget (FEAT-168)', () => {
  it('at the cap the paid call never goes out, and no job spins', async () => {
    const { result } = renderHook(() =>
      useBackgroundReimagine({ ...baseOpts, capReached: true, recordGeneration: recordGenerationMock }),
    )

    await startReimagine(result)

    expect(enhanceSketchMock).not.toHaveBeenCalled()
    expect(recordGenerationMock).not.toHaveBeenCalled()
    expect(result.current.job).toBeNull()
  })

  it('below the cap a real transform is counted exactly once', async () => {
    const { result } = renderHook(() =>
      useBackgroundReimagine({ ...baseOpts, capReached: false, recordGeneration: recordGenerationMock }),
    )

    await startReimagine(result)

    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
    expect(recordGenerationMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.job?.status).toBe('done'))
  })

  it('no image back → nothing counted', async () => {
    enhanceSketchMock.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useBackgroundReimagine({ ...baseOpts, capReached: false, recordGeneration: recordGenerationMock }),
    )

    await startReimagine(result)

    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
    expect(recordGenerationMock).not.toHaveBeenCalled()
  })

  it('a counter that never settles does not wedge the job (FEAT-167 contract)', async () => {
    recordGenerationMock.mockImplementation(() => new Promise<undefined>(() => {}))
    const { result } = renderHook(() =>
      useBackgroundReimagine({ ...baseOpts, capReached: false, recordGeneration: recordGenerationMock }),
    )

    await startReimagine(result)

    await waitFor(() => expect(result.current.job?.status).toBe('done'))
    expect(result.current.job?.resultUrl).toBe('https://img/fancy.png')
  })

  it('uncapped by default — a caller that passes neither option is unchanged', async () => {
    const { result } = renderHook(() => useBackgroundReimagine(baseOpts))

    await startReimagine(result)

    expect(enhanceSketchMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.job?.status).toBe('done'))
  })
})
