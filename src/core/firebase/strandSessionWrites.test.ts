import { beforeEach, describe, expect, it, vi } from 'vitest'

const addDocMock = vi.fn<(col: unknown, data: unknown) => Promise<{ id: string }>>(
  async () => ({ id: 'artifact-1' }),
)
const updateDocMock = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(
  async () => undefined,
)
const incrementMock = vi.fn((n: number) => ({ __increment: n }))

const deleteDocMock = vi.fn<(ref: unknown) => Promise<void>>(async () => undefined)
/** The config document as the transaction sees it. */
let storedConfig: Record<string, unknown> | null = { recentTopics: [], type: 'strand' }
/** Set to make the final config update fail. */
let updateConfigThrows: Error | null = null

vi.mock('firebase/firestore', () => ({
  addDoc: (col: unknown, data: unknown) => addDocMock(col, data),
  updateDoc: (ref: unknown, data: unknown) => updateDocMock(ref, data),
  deleteDoc: (ref: unknown) => deleteDocMock(ref),
  doc: (_col: unknown, id: string) => ({ __doc: id }),
  increment: (n: number) => incrementMock(n),
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>
      update: (ref: unknown, data: unknown) => void
    }) => Promise<void>,
  ) =>
    fn({
      get: async () => ({
        exists: () => storedConfig !== null,
        data: () => storedConfig,
      }),
      update: (ref: unknown, data: unknown) => {
        if (updateConfigThrows) throw updateConfigThrows
        void updateDocMock(ref, data)
      },
    }),
}))

const deleteObjectMock = vi.fn<(ref: unknown) => Promise<void>>(async () => undefined)
vi.mock('firebase/storage', () => ({
  deleteObject: (ref: unknown) => deleteObjectMock(ref),
  ref: (_storage: unknown, path: string) => ({ __path: path }),
}))
vi.mock('./storage', () => ({ storage: { __storage: true } }))

vi.mock('./firestore', () => ({
  artifactsCollection: () => ({ __col: 'artifacts' }),
  activityConfigsCollection: () => ({ __col: 'activityConfigs' }),
  db: { __db: true },
}))

const uploadMock = vi.fn<
  (familyId: string, artifactId: string, file: unknown, filename: string) => Promise<{
    downloadUrl: string
    storagePath: string
  }>
>(async () => ({ downloadUrl: 'https://example/f.jpg', storagePath: 'p' }))
vi.mock('./upload', () => ({
  generateFilename: (ext: string) => `f.${ext}`,
  artifactStoragePath: (familyId: string, artifactId: string, filename: string) =>
    `families/${familyId}/artifacts/${artifactId}/${filename}`,
  uploadArtifactFile: (f: string, a: string, file: unknown, name: string) =>
    uploadMock(f, a, file, name),
}))

import type { ActivityConfig } from '../types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../types/enums'
import {
  logStrandSession,
  STRAND_SESSION_FAILED_PARTIAL,
  STRAND_SESSION_FINISHED_MESSAGE,
  StrandSessionGone,
  StrandSessionPartiallySaved,
  StrandSessionRefused,
} from './strandSessionWrites'

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
  deleteDocMock.mockClear()
  deleteDocMock.mockImplementation(async () => undefined)
  deleteObjectMock.mockClear()
  deleteObjectMock.mockImplementation(async () => undefined)
  updateConfigThrows = null
  uploadMock.mockImplementation(async () => ({
    downloadUrl: 'https://example/f.jpg',
    storagePath: 'p',
  }))
  // The live document a transaction reads. Carries `type` because the write
  // re-checks it there rather than trusting the caller's snapshot.
  storedConfig = { recentTopics: [], type: 'strand' }
  let n = 0
  addDocMock.mockImplementation(async () => ({ id: `artifact-${++n}` }))
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
    // The list is read from the STORED document, not from the caller's config
    // (Codex round 1) — a dialog held open while another device logged would
    // otherwise write back its own stale array.
    storedConfig = { recentTopics: ['The Pilgrims', 'Ancient Egypt'], type: 'strand' }
    await logStrandSession(args())
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

// ── Codex round 1 ────────────────────────────────────────────────────────────

describe('a failed attempt rolls back, so a retry cannot duplicate evidence', () => {
  it('deletes the artifacts it created when a later step fails', () => {
    // Without this, a failed upload left real artifact documents behind while
    // the caller said "Nothing was saved" and offered a retry.
    uploadMock.mockImplementation(async () => {
      throw new Error('upload failed')
    })
    return logStrandSession(
      args({
        evidence: {
          note: 'n',
          photos: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })],
        },
      }),
    ).catch(() => {
      // Both artifacts created before the failure are removed.
      expect(deleteDocMock).toHaveBeenCalledTimes(addDocMock.mock.calls.length)
      expect(incrementMock).not.toHaveBeenCalled()
    })
  })

  it('says evidence was left behind when the rollback itself fails', async () => {
    uploadMock.mockImplementation(async () => {
      throw new Error('upload failed')
    })
    deleteDocMock.mockImplementation(async () => {
      throw new Error('offline')
    })
    await expect(
      logStrandSession(
        args({ evidence: { photos: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })] } }),
      ),
    ).rejects.toBeInstanceOf(StrandSessionPartiallySaved)
    // Never invites a blind retry.
    expect(STRAND_SESSION_FAILED_PARTIAL).not.toMatch(/Nothing was saved/)
  })

  it('deletes nothing when the very first write fails', async () => {
    addDocMock.mockImplementation(async () => {
      throw new Error('offline')
    })
    await expect(logStrandSession(args())).rejects.toThrow('offline')
    expect(deleteDocMock).not.toHaveBeenCalled()
  })
})

describe('the topic merge reads the CURRENT stored value', () => {
  it('merges against Firestore, not against the caller stale config', async () => {
    // Another device recorded "The Pilgrims" since this dialog opened.
    storedConfig = { recentTopics: ['The Pilgrims'], type: 'strand' }
    await logStrandSession(
      args({ topic: 'Ancient Egypt', config: strand({ recentTopics: [] }) }),
    )
    expect(configUpdate()?.recentTopics).toEqual(['Ancient Egypt', 'The Pilgrims'])
  })

  it('still moves the count by an atomic increment inside the transaction', async () => {
    await logStrandSession(args())
    expect(incrementMock).toHaveBeenCalledWith(1)
    expect(typeof configUpdate()?.currentPosition).not.toBe('number')
  })

  it('refuses when the strand was deleted, rather than reporting a session', async () => {
    // It used to return quietly: the count never moved, the topic was never
    // filed, and the caller closed on "Session recorded." over artifacts
    // belonging to a row that no longer exists (Codex round 2).
    storedConfig = null
    await expect(logStrandSession(args())).rejects.toBeInstanceOf(StrandSessionGone)
    expect(configUpdate()).toBeUndefined()
    // ...and the evidence is rolled back with it.
    expect(deleteDocMock).toHaveBeenCalledTimes(addDocMock.mock.calls.length)
  })
})

describe('a captured link is readable, not only stored', () => {
  it('writes the URL to content as well as uri', async () => {
    await logStrandSession(args({ evidence: { videoUrl: ' https://example/watch ' } }))
    const [, artifact] = addDocMock.mock.calls[0]
    expect(artifact).toMatchObject({
      uri: 'https://example/watch',
      content: 'https://example/watch',
    })
  })
})

describe('the rollback covers the WHOLE attempt (Codex round 2)', () => {
  it('undoes the evidence when the final config update fails', async () => {
    // The transaction used to sit outside the rollback try, so a failure here
    // left every artifact in place while the caller called it a clean failure
    // and invited a retry that would duplicate them all.
    updateConfigThrows = new Error('permission-denied')
    await expect(logStrandSession(args())).rejects.toThrow('permission-denied')
    expect(deleteDocMock).toHaveBeenCalledTimes(addDocMock.mock.calls.length)
  })

  it('deletes uploaded storage objects, not only the documents', async () => {
    // Deleting only Firestore left private evidence in Storage while the parent
    // was told nothing was saved, and leaked another copy on every retry.
    let calls = 0
    uploadMock.mockImplementation(async () => {
      calls += 1
      if (calls > 1) throw new Error('upload failed')
      return { downloadUrl: 'https://example/f.jpg', storagePath: 'families/fam/artifacts/a/0.jpg' }
    })
    await expect(
      logStrandSession(
        args({
          evidence: {
            photos: [
              new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
              new File(['y'], 'b.jpg', { type: 'image/jpeg' }),
            ],
          },
        }),
      ),
    ).rejects.toThrow('upload failed')
    // TWO, not one: the first photo's object, and the second's — whose path is
    // now registered BEFORE the await (Codex round 3), so an upload that lands
    // its bytes and then fails is cleaned up rather than orphaned.
    expect(deleteObjectMock).toHaveBeenCalledTimes(2)
  })

  it('reports the partial truth when a storage delete also fails', async () => {
    uploadMock.mockImplementation(async () => ({
      downloadUrl: 'https://example/f.jpg',
      storagePath: 'families/fam/artifacts/a/0.jpg',
    }))
    updateConfigThrows = new Error('offline')
    deleteObjectMock.mockImplementation(async () => {
      throw new Error('offline')
    })
    await expect(
      logStrandSession(
        args({ evidence: { photos: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } }),
      ),
    ).rejects.toBeInstanceOf(StrandSessionPartiallySaved)
  })
})

describe('the caller gets the artifacts back (Codex round 2)', () => {
  it('returns each artifact carrying its id, so a local list can show it', async () => {
    const result = await logStrandSession(
      args({ evidence: { note: 'we read a book', videoUrl: 'youtube.com/watch?v=abc' } }),
    )
    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts.map((a) => a.id)).toEqual(result.artifactIds)
    for (const artifact of result.artifacts) {
      expect(artifact.topic).toBe('Ancient Egypt')
      expect(artifact.activityConfigId).toBe('s1')
    }
  })

  it('stores the NORMALIZED link, not the bare domain she pasted', async () => {
    const result = await logStrandSession(
      args({ evidence: { videoUrl: 'youtube.com/watch?v=abc' } }),
    )
    expect(result.artifacts[0].uri).toBe('https://youtube.com/watch?v=abc')
    expect(result.artifacts[0].content).toBe('https://youtube.com/watch?v=abc')
  })
})

// ── Codex round 3 ────────────────────────────────────────────────────────────

describe('the returned artifacts carry what the renderer needs', () => {
  it('includes uri and mediaUrls on a photo, not just the pre-upload copy', async () => {
    // `record` copies before the follow-up write adds them, and TodayPage
    // prepends these objects straight into `todayArtifacts` — whose renderer
    // and the checklist's photo resolver both key on those fields.
    const result = await logStrandSession(
      args({ evidence: { photos: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } }),
    )
    expect(result.artifacts[0].uri).toBe('https://example/f.jpg')
    expect(result.artifacts[0].mediaUrls).toEqual(['https://example/f.jpg'])
  })

  it('includes them on audio too', async () => {
    const result = await logStrandSession(args({ evidence: { audio: new Blob(['a']) } }))
    expect(result.artifacts[0].uri).toBe('https://example/f.jpg')
  })
})

describe('the rollback covers an upload that half-succeeded', () => {
  it('deletes the object when the download-URL step is what failed', async () => {
    // `uploadArtifactFile` uploads and THEN fetches the URL. Registering the
    // path only on success left an object behind with nothing to clean up,
    // while the caller still said "Nothing was saved".
    uploadMock.mockImplementation(async () => {
      throw new Error('getDownloadURL failed')
    })
    await expect(
      logStrandSession(
        args({ evidence: { photos: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } }),
      ),
    ).rejects.toThrow('getDownloadURL failed')
    expect(deleteObjectMock).toHaveBeenCalledTimes(1)
  })
})

describe('a missing storage object is cleaned up, not a failure', () => {
  it('does not warn about retained evidence when the object never existed', async () => {
    // The path is registered BEFORE the upload is awaited, so an upload that
    // fails at `uploadBytes` leaves a registered path with no object. Storage
    // answers `storage/object-not-found`, and counting that as a failed cleanup
    // sent the parent looking for a file that does not exist (Codex).
    uploadMock.mockImplementation(async () => {
      throw new Error('upload failed')
    })
    deleteObjectMock.mockImplementation(async () => {
      const err = new Error('not found') as Error & { code?: string }
      err.code = 'storage/object-not-found'
      throw err
    })

    await expect(
      logStrandSession(
        args({ evidence: { photos: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } }),
      ),
    ).rejects.toThrow('upload failed')
  })

  it('still reports a genuine storage delete failure', async () => {
    uploadMock.mockImplementation(async () => ({
      downloadUrl: 'https://example/f.jpg',
      storagePath: 'families/fam/artifacts/a/0.jpg',
    }))
    updateConfigThrows = new Error('offline')
    deleteObjectMock.mockImplementation(async () => {
      const err = new Error('denied') as Error & { code?: string }
      err.code = 'storage/unauthorized'
      throw err
    })

    await expect(
      logStrandSession(
        args({ evidence: { photos: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } }),
      ),
    ).rejects.toBeInstanceOf(StrandSessionPartiallySaved)
  })

  it('still reports a failed DOCUMENT delete, whatever storage said', async () => {
    deleteDocMock.mockImplementation(async () => {
      throw new Error('offline')
    })
    deleteObjectMock.mockImplementation(async () => {
      const err = new Error('not found') as Error & { code?: string }
      err.code = 'storage/object-not-found'
      throw err
    })
    updateConfigThrows = new Error('offline')

    await expect(logStrandSession(args())).rejects.toBeInstanceOf(
      StrandSessionPartiallySaved,
    )
  })
})

// ── The live document decides, not the dialog's snapshot (Codex) ─────────────
//
// A capture dialog can be open for minutes. `planStrandSession` validated the
// config as it stood when it opened, so committing on that alone could add a
// session to a program another tab has since finished — and leave the evidence
// attached to a closed record.
describe('the strand is re-checked inside the transaction', () => {
  it('refuses when the program was finished while the dialog was open', async () => {
    storedConfig = { recentTopics: [], completed: true, type: 'strand' }
    await expect(logStrandSession(args())).rejects.toBeInstanceOf(StrandSessionGone)
    expect(incrementMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(addDocMock.mock.calls.length)
  })

  it('says it was finished, which is not the same as removed', async () => {
    // A retired program still exists and its record is intact, so "was removed"
    // would be false — and un-finishing is not something this app does, so the
    // sentence names what happened rather than suggesting a retry.
    storedConfig = { recentTopics: [], completed: true, type: 'strand' }
    await expect(logStrandSession(args())).rejects.toThrow(STRAND_SESSION_FINISHED_MESSAGE)
    expect(STRAND_SESSION_FINISHED_MESSAGE).not.toMatch(/removed/i)
  })

  it('refuses when the row is no longer a strand', async () => {
    storedConfig = { recentTopics: [], type: 'workbook' }
    await expect(logStrandSession(args())).rejects.toBeInstanceOf(StrandSessionGone)
    expect(incrementMock).not.toHaveBeenCalled()
  })

  it('commits normally for a live strand', async () => {
    storedConfig = { recentTopics: [], type: 'strand' }
    await logStrandSession(args())
    expect(incrementMock).toHaveBeenCalledWith(1)
  })
})
