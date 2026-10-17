import { describe, expect, it, vi } from 'vitest'

import type { LearnerModel } from '../types/learnerModel'

/**
 * The lost update this module exists to close (FEAT-242), as a contention test.
 *
 * `{ merge: true }` replaces an array wholesale, and every learner-model writer
 * sends arrays (`conceptStates.<id>.evidence`, `openQuestions`, `changeFeed`).
 * So the claim is not "it uses a transaction" — it is that the COMPUTATION
 * re-runs against the newer document, and the other writer's ref and question
 * are still there afterwards. A mock that never contends cannot show that, so
 * this one commits a competing write in the window and counts the recomputes.
 */
const mem = vi.hoisted(() => ({
  value: null as unknown,
  version: 0,
  interleave: null as null | (() => void),
}))

vi.mock('firebase/firestore', () => ({
  runTransaction: async (_db: unknown, body: (tx: unknown) => Promise<unknown>) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let readVersion = -1
      let wrote = false
      let merge: Record<string, unknown> | null = null
      const tx = {
        get: async () => {
          if (wrote) throw new Error('Firestore read after write')
          readVersion = mem.version
          const value = structuredClone(mem.value)
          return { exists: () => value != null, data: () => value }
        },
        set: (_ref: unknown, payload: Record<string, unknown>) => {
          wrote = true
          merge = payload
        },
      }
      const result = await body(tx)
      const interleave = mem.interleave
      mem.interleave = null
      interleave?.()
      // The commit is refused when anything read has moved — the callback runs
      // again against the newer document.
      if (readVersion !== mem.version) continue
      if (merge) {
        mem.value = { ...(mem.value as Record<string, unknown>), ...(merge as object) }
        mem.version += 1
      }
      return result
    }
    throw new Error('mock contention did not settle')
  },
}))
vi.mock('./firestore', () => ({ db: {} }))

import { updateLearnerModelInTransaction } from './modelTransaction'

const CVC = 'reading.phonics.cvc'

describe('updateLearnerModelInTransaction', () => {
  it('recomputes evidence and openQuestions after a contended model write', async () => {
    const base = {
      childId: 'child',
      graphVersion: 'reading@1+math@1',
      status: 'seeded',
      conceptStates: { [CVC]: { state: 'not-yet', evidence: [] } },
      openQuestions: [],
      whatMattersNext: [],
      changeFeed: [],
    } as unknown as LearnerModel
    mem.value = base
    mem.version = 1
    let computes = 0
    mem.interleave = () => {
      const concurrent = structuredClone(mem.value) as LearnerModel
      concurrent.conceptStates[CVC].evidence.push({ sourceId: 'other-writer' } as never)
      concurrent.openQuestions.push({ id: 'other-question' } as never)
      mem.value = concurrent
      mem.version += 1
    }

    const result = await updateLearnerModelInTransaction(
      { path: 'families/f/learnerModels/child' } as never,
      (model) => {
        computes += 1
        const next = structuredClone(model!)
        next.conceptStates[CVC].evidence.push({ sourceId: 'this-writer' } as never)
        next.openQuestions.push({ id: 'this-question' } as never)
        return {
          merge: { conceptStates: next.conceptStates, openQuestions: next.openQuestions },
          result: computes,
        }
      },
    )

    const final = mem.value as LearnerModel
    expect(computes).toBe(2)
    expect(result).toBe(2)
    // Both arrays carry BOTH writers: the recompute read the other's work.
    expect(final.conceptStates[CVC].evidence.map((ref) => ref.sourceId)).toEqual([
      'other-writer',
      'this-writer',
    ])
    expect(final.openQuestions.map((q) => (q as { id?: string }).id)).toEqual([
      'other-question',
      'this-question',
    ])
  })

  it('writes NOTHING when the computation declines', async () => {
    mem.value = { childId: 'child', conceptStates: {} } as unknown as LearnerModel
    mem.version = 1
    const result = await updateLearnerModelInTransaction(
      { path: 'families/f/learnerModels/child' } as never,
      () => ({ merge: null, result: 'declined' }),
    )
    expect(result).toBe('declined')
    expect(mem.version).toBe(1)
  })

  it('hands a MISSING model to the computation as null, never as an empty one', async () => {
    mem.value = null
    mem.version = 1
    const seen: Array<LearnerModel | null> = []
    await updateLearnerModelInTransaction(
      { path: 'families/f/learnerModels/child' } as never,
      (model) => {
        seen.push(model)
        return { result: null }
      },
    )
    expect(seen).toEqual([null])
  })
})
