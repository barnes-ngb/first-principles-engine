/**
 * UX-186 — an add must never reset a word the reader already carried.
 *
 * The defect this pins was invisible from the writer's own docblock, which
 * claimed `{ merge: true }` made a repeat add "a no-op-ish merge rather than a
 * progress reset". It did not: the payload set all nine fields of
 * `SightWordProgress`, and Firestore's merge only preserves fields a payload
 * OMITS. So the test is written against the WRITE the function performs — what
 * reached Firestore and with what options — because that is the only place the
 * bug was ever visible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDoc = vi.fn()
const setDoc = vi.fn()
const deleteDoc = vi.fn()
const doc = vi.fn((...args: unknown[]) => ({ __doc: args[1] }))

vi.mock('firebase/firestore', () => ({
  getDoc: (...args: unknown[]) => getDoc(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  doc: (...args: unknown[]) => doc(...args),
  getDocs: vi.fn(),
  query: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  sightWordProgressCollection: vi.fn(() => ({ __collection: true })),
  sightWordProgressDocId: (childId: string, word: string) => `${childId}_${word}`,
}))

import { addSightWord } from './useSightWordProgress'

/** Lincoln's "said": thirty encounters, mastered, confirmed by a parent. */
const MASTERED = {
  word: 'said',
  encounters: 30,
  selfReportedKnown: 12,
  helpRequested: 1,
  shellyConfirmed: true,
  masteryLevel: 'mastered',
  firstSeen: '2026-01-04T10:00:00.000Z',
  lastSeen: '2026-09-01T10:00:00.000Z',
  lastLevelChange: '2026-06-02T10:00:00.000Z',
}

beforeEach(() => {
  getDoc.mockReset()
  setDoc.mockReset()
  deleteDoc.mockReset()
})

describe('addSightWord (UX-186)', () => {
  it('writes nothing at all when the word is already tracked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => MASTERED })

    await addSightWord('fam', 'lincoln', 'said')

    // The whole finding in one assertion: the mastered record keeps its
    // encounters because no write is attempted against it.
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('is not fooled by the casing and padding a card can carry', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => MASTERED })

    await addSightWord('fam', 'lincoln', '  Said ')

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'lincoln_said')
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('seeds a fresh record when the word is genuinely new', async () => {
    getDoc.mockResolvedValue({ exists: () => false })

    await addSightWord('fam', 'lincoln', 'because')

    expect(setDoc).toHaveBeenCalledTimes(1)
    const [, payload] = setDoc.mock.calls[0]
    expect(payload).toMatchObject({
      word: 'because',
      encounters: 0,
      masteryLevel: 'new',
      shellyConfirmed: false,
    })
  })

  it('no longer relies on a merge that could not have preserved anything', async () => {
    getDoc.mockResolvedValue({ exists: () => false })

    await addSightWord('fam', 'lincoln', 'because')

    // A seed carrying every field of the type has nothing to merge WITH, so the
    // option was decorative. Its absence is what makes the guard above the only
    // thing standing between an add and an existing record — which is the point.
    const [, payload, options] = setDoc.mock.calls[0]
    expect(options).toBeUndefined()
    expect(Object.keys(payload as object)).toHaveLength(9)
  })

  it('reads nothing and writes nothing for an empty word or a missing child', async () => {
    await addSightWord('fam', 'lincoln', '   ')
    await addSightWord('fam', '', 'said')
    await addSightWord('', 'lincoln', 'said')

    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })
})
