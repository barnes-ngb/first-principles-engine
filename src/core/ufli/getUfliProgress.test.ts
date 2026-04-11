import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_UFLI_PROGRESS } from './getUfliProgress'

// Mock firebase/firestore to avoid real Firestore calls in tests
vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
  getFirestore: vi.fn(() => ({})),
}))

vi.mock('../firebase/firebase', () => ({
  app: {},
}))

describe('DEFAULT_UFLI_PROGRESS', () => {
  it('starts at lesson 1', () => {
    expect(DEFAULT_UFLI_PROGRESS.currentLesson).toBe(1)
  })

  it('has empty mastered lessons', () => {
    expect(DEFAULT_UFLI_PROGRESS.masteredLessons).toEqual([])
  })

  it('has null encoding score', () => {
    expect(DEFAULT_UFLI_PROGRESS.lastEncodingScore).toBeNull()
  })

  it('has null encoding date', () => {
    expect(DEFAULT_UFLI_PROGRESS.lastEncodingDate).toBeNull()
  })

  it('has empty nonsense word fluency history', () => {
    expect(DEFAULT_UFLI_PROGRESS.nonsenseWordFluency).toEqual([])
  })
})

describe('getUfliProgress', () => {
  it('returns defaults when doc does not exist', async () => {
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never)

    const { getUfliProgress } = await import('./getUfliProgress')
    const result = await getUfliProgress('family1', 'child1')
    expect(result).toEqual(DEFAULT_UFLI_PROGRESS)
  })

  it('returns stored progress when doc exists', async () => {
    const stored = {
      currentLesson: 62,
      masteredLessons: [1, 2, 3],
      lastEncodingScore: 85,
      lastEncodingDate: '2026-04-01',
      nonsenseWordFluency: [
        { date: '2026-04-01', correctWords: 17, totalWords: 20, score: 85 },
      ],
    }

    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => stored,
    } as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never)

    const { getUfliProgress } = await import('./getUfliProgress')
    const result = await getUfliProgress('family1', 'lincoln')
    expect(result).toEqual(stored)
  })
})
