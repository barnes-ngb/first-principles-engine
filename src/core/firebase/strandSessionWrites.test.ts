import { beforeEach, describe, expect, it, vi } from 'vitest'

const addDocMock = vi.fn<(col: unknown, data: unknown) => Promise<{ id: string }>>(
  async () => ({ id: 'artifact-1' }),
)
const updateDocMock = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(
  async () => undefined,
)
const incrementMock = vi.fn((n: number) => ({ __increment: n }))

vi.mock('firebase/firestore', () => ({
  addDoc: (col: unknown, data: unknown) => addDocMock(col, data),
  updateDoc: (ref: unknown, data: unknown) => updateDocMock(ref, data),
  doc: (_col: unknown, id: string) => ({ __doc: id }),
  increment: (n: number) => incrementMock(n),
}))

vi.mock('./firestore', () => ({
  artifactsCollection: () => ({ __col: 'artifacts' }),
  activityConfigsCollection: () => ({ __col: 'activityConfigs' }),
}))

const uploadMock = vi.fn<
  (familyId: string, artifactId: string, file: unknown, filename: string) => Promise<{
    downloadUrl: string
    storagePath: string
  }>
>(async () => ({ downloadUrl: 'https://example/f.jpg', storagePath: 'p' }))
vi.mock('./upload', () => ({
  generateFilename: (ext: string) => `f.${ext}`,
  uploadArtifactFile: (f: string, a: string, file: unknown, name: string) =>
    uploadMock(f, a, file, name),
}))

import type { ActivityConfig } from '../types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../types/enums'
import { logStrandSession, StrandSessionRefused } from './strandSessionWrites'

function strand(overrides: Partial<ActivityConfig> = {}): ActivityConfig {
  return {
    id: 's1',
    name: 'History',
    type: ActivityType.Strand,
    subjectBucket: SubjectBucket.SocialStudies,
    defaultMinutes: 30,
    frequency: ActivityFrequency.TwoPerWeek,
    childId: 'c1',
    sortOrder: 0,
    completed: false,
    scannable: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as ActivityConfig
}

const args = (overrides: Record<string, unknown> = {}) => ({
  familyId: 'fam',
  config: strand(),
  childId: 'c1',
  topic: 'Ancient Egypt',
  evidence: { note: 'London told me about the pyramids' },
  ...overrides,
})

/** The single `activityConfigs` update this writer makes. */
const configUpdate = () =>
  updateDocMock.mock.calls.find(
    (call) =>
      typeof call[1] === 'object' &&
      call[1] !== null &&
      'currentPosition' in (call[1] as object),
  )?.[1] as Record<string, unknown> | undefined

beforeEach(() => {
  addDocMock.mockClear()
  updateDocMock.mockClear()
  incrementMock.mockClear()
  uploadMock.mockClear()
  addDocMock.mockImplementation(async () => ({ id: 'artifact-1' }))
})

// ── The invariant this feature is built on (UX-282) ──────────────────────────
//
// The count only goes up. Not a checked rule — a rail: the write is an atomic
// `increment(1)`, so no caller can pass a smaller number because no caller
// passes a number at all.
describe('the count only goes up', () => {
  it('moves the position by an atomic increment of exactly 1', async () => {
    await logStrandSession(args())
    expect(incrementMock).toHaveBeenCalledWith(1)
    expect(incrementMock).toHaveBeenCalledTimes(1)
    expect(configUpdate()?.currentPosition).toEqual({ __increment: 1 })
  })

  it('never writes an absolute position, so nothing can lower it', async () => {
    await logStrandSession(args({ config: strand({ currentPosition: 14 }) }))
    const written = configUpdate()?.currentPosition
    expect(typeof written).not.toBe('number')
    // Every increment this module can ever request is positive.
    for (const [n] of incrementMock.mock.calls) expect(n).toBeGreaterThan(0)
  })

  it('does not read the stored count at all — a stale read cannot roll it back', async () => {
    // Two devices logging at once both land, rather than the second
    // overwriting the first with (stale + 1).
    await logStrandSession(args({ config: strand({ currentPosition: 3 }) }))
    await logStrandSession(args({ config: strand({ currentPosition: 3 }) }))
    expect(incrementMock.mock.calls).toEqual([[1], [1]])
  })

  it('touches exactly one activityConfigs document, and writes no total', async () => {
    await logStrandSession(args())
    const update = configUpdate()
    expect(Object.keys(update ?? {}).sort()).toEqual([
      'currentPosition',
      'recentTopics',
      'updatedAt',
    ])
    expect(update).not.toHaveProperty('totalUnits')
  })
})

describe('evidence is written before the count', () => {
  it('logs the artifact, then the increment', async () => {
    const order: string[] = []
    addDocMock.mockImplementation(async () => {
      order.push('artifact')
      return { id: 'artifact-1' }
    })
    incrementMock.mockImplementation((n: number) => {
      order.push('increment')
      return { __increment: n }
    })
    await logStrandSession(args())
    expect(order).toEqual(['artifact', 'increment'])
  })

  it('does not move the count when the evidence write fails', async () => {
    // The honest leftover is evidence with no count, never a count with no
    // record — `recentTopics` must never become the only trace of a topic.
    addDocMock.mockImplementation(async () => {
      throw new Error('offline')
    })
    await expect(logStrandSession(args())).rejects.toThrow('offline')
    expect(incrementMock).not.toHaveBeenCalled()
  })

  it('does not move the count when a photo upload fails', async () => {
    uploadMock.mockImplementation(async () => {
      throw new Error('upload failed')
    })
    await expect(
      logStrandSession(
        args({ evidence: { photos: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })] } }),
      ),
    ).rejects.toThrow('upload failed')
    expect(incrementMock).not.toHaveBeenCalled()
  })
})

describe('a refused session writes nothing at all', () => {
  it('refuses with no topic', async () => {
    await expect(logStrandSession(args({ topic: '  ' }))).rejects.toBeInstanceOf(
      StrandSessionRefused,
    )
    expect(addDocMock).not.toHaveBeenCalled()
    expect(incrementMock).not.toHaveBeenCalled()
  })

  it('refuses with no evidence', async () => {
    await expect(logStrandSession(args({ evidence: {} }))).rejects.toBeInstanceOf(
      StrandSessionRefused,
    )
    expect(addDocMock).not.toHaveBeenCalled()
    expect(incrementMock).not.toHaveBeenCalled()
  })

  it('refuses a row that is not a strand', async () => {
    await expect(
      logStrandSession(args({ config: strand({ type: ActivityType.Workbook }) })),
    ).rejects.toBeInstanceOf(StrandSessionRefused)
    expect(incrementMock).not.toHaveBeenCalled()
  })
})

describe('the topic reaches the artifact, not only the cache', () => {
  it('stamps the join and the topic on every artifact it writes', async () => {
    await logStrandSession(
      args({
        evidence: { note: 'n', videoUrl: 'https://example/watch' },
      }),
    )
    expect(addDocMock).toHaveBeenCalledTimes(2)
    for (const [, artifact] of addDocMock.mock.calls) {
      expect(artifact).toMatchObject({
        activityConfigId: 's1',
        topic: 'Ancient Egypt',
        childId: 'c1',
      })
    }
  })

  it('moves a returning topic to the front of the suggestion cache', async () => {
    await logStrandSession(
      args({ config: strand({ recentTopics: ['The Pilgrims', 'Ancient Egypt'] }) }),
    )
    expect(configUpdate()?.recentTopics).toEqual(['Ancient Egypt', 'The Pilgrims'])
  })
})

describe('what a session deliberately does not write', () => {
  it('writes no hours, no day log, no XP — only artifacts and the one config', async () => {
    await logStrandSession(args({ evidence: { note: 'n' } }))
    // Every collection this writer touched.
    const collections = new Set<string>()
    for (const [col] of addDocMock.mock.calls) {
      collections.add((col as { __col: string }).__col)
    }
    expect([...collections]).toEqual(['artifacts'])
    // A strand session's minutes come from its checklist item on the day, the
    // ordinary hours path. A second route to a compliance figure is how two
    // numbers start disagreeing.
    for (const [, payload] of updateDocMock.mock.calls) {
      expect(payload).not.toHaveProperty('actualMinutes')
      expect(payload).not.toHaveProperty('estimatedMinutes')
    }
  })
})
