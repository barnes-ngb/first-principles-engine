import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Firestore ─────────────────────────────────────────────
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockDoc = vi.fn((..._args: unknown[]) => `mock-doc-ref`)

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: (familyId: string) => `learnerModels-${familyId}`,
}))

// ── Mock questTargeting pure helpers ───────────────────────────
const mockComputeResults = vi.fn()
const mockApplyResults = vi.fn()

vi.mock('../../core/foundations/questTargeting', () => ({
  computeQuestConceptResults: (...args: unknown[]) => mockComputeResults(...args),
  applyQuestResultsToModel: (...args: unknown[]) => mockApplyResults(...args),
}))

import { syncQuestResultsToModel } from './questModelSync'

describe('syncQuestResultsToModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no-ops when allowedConceptIds is empty (no targets selected)', async () => {
    await syncQuestResultsToModel('fam-1', 'child-1', 'sess-1', [], [], '2026-07-01T00:00:00Z')

    expect(mockComputeResults).not.toHaveBeenCalled()
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('no-ops when computeQuestConceptResults returns empty (no probed concepts)', async () => {
    mockComputeResults.mockReturnValue([])

    const questions = [{ targetConceptId: 'reading.phonics.cvc', correct: true }]
    await syncQuestResultsToModel(
      'fam-1', 'child-1', 'sess-1',
      questions, ['reading.phonics.cvc'],
      '2026-07-01T00:00:00Z',
    )

    expect(mockComputeResults).toHaveBeenCalledWith(questions, ['reading.phonics.cvc'])
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('no-ops when the learner model doc does not exist yet', async () => {
    mockComputeResults.mockReturnValue([{ conceptId: 'reading.phonics.cvc', correct: 2, total: 3 }])
    mockGetDoc.mockResolvedValue({ exists: () => false })

    await syncQuestResultsToModel(
      'fam-1', 'child-1', 'sess-1',
      [{ targetConceptId: 'reading.phonics.cvc', correct: true }],
      ['reading.phonics.cvc'],
      '2026-07-01T00:00:00Z',
    )

    expect(mockGetDoc).toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('writes merged model when results and model exist', async () => {
    const existingModel = {
      childId: 'child-1',
      conceptStates: {},
      changeFeed: [],
    }
    const updatedModel = {
      childId: 'child-1',
      conceptStates: {
        'reading.phonics.cvc': { state: 'solid', evidence: [] },
      },
      changeFeed: [{ conceptId: 'reading.phonics.cvc' }],
    }

    mockComputeResults.mockReturnValue([{ conceptId: 'reading.phonics.cvc', correct: 3, total: 3 }])
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => existingModel })
    mockApplyResults.mockReturnValue({ model: updatedModel, changedConceptIds: ['reading.phonics.cvc'] })

    await syncQuestResultsToModel(
      'fam-1', 'child-1', 'sess-1',
      [{ targetConceptId: 'reading.phonics.cvc', correct: true }],
      ['reading.phonics.cvc'],
      '2026-07-01T00:00:00Z',
    )

    expect(mockApplyResults).toHaveBeenCalledWith(
      existingModel,
      [{ conceptId: 'reading.phonics.cvc', correct: 3, total: 3 }],
      'sess-1',
      '2026-07-01T00:00:00Z',
    )
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    // merge: true is always passed
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true })
  })

  it('sets synthesisStaleAt when concepts actually changed state', async () => {
    const model = { childId: 'child-1', conceptStates: {}, changeFeed: [] }
    const next = { childId: 'child-1', conceptStates: {}, changeFeed: [] }

    mockComputeResults.mockReturnValue([{ conceptId: 'reading.phonics.cvc', correct: 3, total: 3 }])
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => model })
    mockApplyResults.mockReturnValue({ model: next, changedConceptIds: ['reading.phonics.cvc'] })

    await syncQuestResultsToModel(
      'fam-1', 'child-1', 'sess-1',
      [{ targetConceptId: 'reading.phonics.cvc', correct: true }],
      ['reading.phonics.cvc'],
      '2026-07-01T12:00:00Z',
    )

    // The written model should have synthesisStaleAt set
    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData.synthesisStaleAt).toBe('2026-07-01T12:00:00Z')
  })

  it('does NOT set synthesisStaleAt when no concepts changed state (evidence-only append)', async () => {
    const model = { childId: 'child-1', conceptStates: {}, changeFeed: [] }
    const next = { childId: 'child-1', conceptStates: {}, changeFeed: [] }

    mockComputeResults.mockReturnValue([{ conceptId: 'reading.phonics.cvc', correct: 1, total: 3 }])
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => model })
    mockApplyResults.mockReturnValue({ model: next, changedConceptIds: [] })

    await syncQuestResultsToModel(
      'fam-1', 'child-1', 'sess-1',
      [{ targetConceptId: 'reading.phonics.cvc', correct: false }],
      ['reading.phonics.cvc'],
      '2026-07-01T12:00:00Z',
    )

    const writtenData = mockSetDoc.mock.calls[0][1]
    expect(writtenData.synthesisStaleAt).toBeUndefined()
  })

  it('strips undefined values via JSON round-trip (Firestore rejects undefined)', async () => {
    const model = { childId: 'child-1', conceptStates: {}, changeFeed: [] }
    const next = {
      childId: 'child-1',
      conceptStates: {},
      changeFeed: [],
      synthesis: undefined,
    }

    mockComputeResults.mockReturnValue([{ conceptId: 'math.placeValue', correct: 2, total: 2 }])
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => model })
    mockApplyResults.mockReturnValue({ model: next, changedConceptIds: [] })

    await syncQuestResultsToModel(
      'fam-1', 'child-1', 'sess-1',
      [{ targetConceptId: 'math.placeValue', correct: true }],
      ['math.placeValue'],
      '2026-07-01T00:00:00Z',
    )

    const writtenData = mockSetDoc.mock.calls[0][1]
    // JSON.parse(JSON.stringify(...)) drops undefined keys
    expect('synthesis' in writtenData).toBe(false)
  })

  it('never throws — catches errors and logs a warning', async () => {
    mockComputeResults.mockReturnValue([{ conceptId: 'reading.phonics.cvc', correct: 1, total: 1 }])
    mockGetDoc.mockRejectedValue(new Error('Firestore down'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      syncQuestResultsToModel(
        'fam-1', 'child-1', 'sess-1',
        [{ targetConceptId: 'reading.phonics.cvc', correct: true }],
        ['reading.phonics.cvc'],
        '2026-07-01T00:00:00Z',
      ),
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith(
      '[quest] Failed to write quest results back to learner model',
      expect.any(Error),
    )
    warnSpy.mockRestore()
  })

  it('passes allowedConceptIds to computeQuestConceptResults for attribution scoping', async () => {
    mockComputeResults.mockReturnValue([])

    const allowed = ['reading.phonics.cvc', 'math.placeValue']
    const questions = [
      { targetConceptId: 'reading.phonics.cvc', correct: true },
      { targetConceptId: 'math.placeValue', correct: false },
      { targetConceptId: 'science.unselected', correct: true },
    ]

    await syncQuestResultsToModel('fam-1', 'child-1', 'sess-1', questions, allowed, '2026-07-01T00:00:00Z')

    expect(mockComputeResults).toHaveBeenCalledWith(questions, allowed)
  })
})
