import { describe, expect, it } from 'vitest'

import {
  BOOTSTRAP_FAILED_LINE,
  bootstrapRunningLine,
  emptyFoundationsLines,
  REPROJECTION_FAILED_LINE,
  resolveFoundationsBootstrapMode,
  shouldBootstrapLearnerModel,
} from './foundationsBootstrap'
import type { BootstrapDecisionInput } from './foundationsBootstrap'
import type { LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-09-09T12:00:00.000Z'

const someModel = (): LearnerModel => ({
  childId: 'c1',
  graphVersion: 'reading@1+math@1',
  status: 'no-data',
  conceptStates: {},
  modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
  whatMattersNext: [],
  changeFeed: [],
  openQuestions: [],
  seededAt: NOW,
  updatedAt: NOW,
})

/** The one case that should fire: resolved, absent, a parent, a child selected. */
function fires(over: Partial<BootstrapDecisionInput> = {}): BootstrapDecisionInput {
  return {
    canEdit: true,
    loading: false,
    model: null,
    familyId: 'fam-1',
    childId: 'c1',
    alreadyAttempted: false,
    ...over,
  }
}

describe('shouldBootstrapLearnerModel (UX-286)', () => {
  it('fires when the snapshot resolved and the document is absent', () => {
    expect(shouldBootstrapLearnerModel(fires())).toBe(true)
  })

  it('does not fire while the snapshot is still loading', () => {
    // `model === null` during load means "not yet known", not "absent" — acting on
    // it would seed over a model that is simply in flight.
    expect(shouldBootstrapLearnerModel(fires({ loading: true }))).toBe(false)
  })

  it('does not fire when a model already exists', () => {
    // The seeder recomputes derived states and logs no change line; it must never
    // become something that runs on a page view.
    expect(shouldBootstrapLearnerModel(fires({ model: someModel() }))).toBe(false)
  })

  it('does not fire for a profile that may not write', () => {
    // `/progress` is not behind RequireParent — a kid lands here with their own
    // activeChildId populated. Capability, never a name.
    expect(shouldBootstrapLearnerModel(fires({ canEdit: false }))).toBe(false)
  })

  it('does not fire twice for the same child', () => {
    expect(shouldBootstrapLearnerModel(fires({ alreadyAttempted: true }))).toBe(false)
  })

  it('does not fire without a family or a selected child', () => {
    expect(shouldBootstrapLearnerModel(fires({ familyId: undefined }))).toBe(false)
    expect(shouldBootstrapLearnerModel(fires({ childId: undefined }))).toBe(false)
  })
})

describe('resolveFoundationsBootstrapMode (UX-291)', () => {
  const base = {
    canEdit: true,
    loading: false,
    familyId: 'fam-1',
    childId: 'c1',
    alreadyAttempted: false,
  }
  const stored = {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded' as const,
    conceptStates: {},
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-07-06T12:55:33.000Z',
    updatedAt: '2026-07-06T12:55:33.000Z',
  }

  it('creates when the snapshot resolved and the document is absent', () => {
    expect(resolveFoundationsBootstrapMode({ ...base, model: null })).toBe('create-only')
  })

  it('re-projects when the document is there', () => {
    expect(resolveFoundationsBootstrapMode({ ...base, model: stored })).toBe('reproject')
  })

  it('never returns reseed — a page view may not recompute the whole layer', () => {
    for (const model of [null, stored]) {
      expect(resolveFoundationsBootstrapMode({ ...base, model })).not.toBe('reseed')
    }
  })

  it('shares every guard with the create decision', () => {
    for (const model of [null, stored]) {
      expect(resolveFoundationsBootstrapMode({ ...base, model, canEdit: false })).toBeNull()
      expect(resolveFoundationsBootstrapMode({ ...base, model, loading: true })).toBeNull()
      expect(resolveFoundationsBootstrapMode({ ...base, model, familyId: undefined })).toBeNull()
      expect(resolveFoundationsBootstrapMode({ ...base, model, childId: undefined })).toBeNull()
      expect(
        resolveFoundationsBootstrapMode({ ...base, model, alreadyAttempted: true }),
      ).toBeNull()
    }
  })

  it('is the ONE definition shouldBootstrapLearnerModel delegates to', () => {
    for (const model of [null, stored]) {
      for (const canEdit of [true, false]) {
        for (const loading of [true, false]) {
          const input = { ...base, model, canEdit, loading }
          expect(shouldBootstrapLearnerModel(input)).toBe(
            resolveFoundationsBootstrapMode(input) === 'create-only',
          )
        }
      }
    }
  })
})

describe('bootstrap copy', () => {
  it('names the child while the map is being set up', () => {
    expect(bootstrapRunningLine('Lincoln')).toContain('Lincoln')
  })

  it('says a failure changed nothing', () => {
    expect(BOOTSTRAP_FAILED_LINE).toMatch(/nothing was changed/i)
  })

  it('says a failed re-projection is showing what was last recorded, not nothing', () => {
    // The map on screen is real. A line implying it is empty would be the
    // "failed read rendered as a result" defect this repo keeps out of records.
    expect(REPROJECTION_FAILED_LINE).toMatch(/last recorded/i)
    expect(REPROJECTION_FAILED_LINE).toMatch(/try again/i)
    expect(REPROJECTION_FAILED_LINE).not.toMatch(/nothing (has been|was) recorded/i)
  })
})

describe('emptyFoundationsLines (UX-287)', () => {
  it('never names a route that cannot work', () => {
    const text = emptyFoundationsLines('Lincoln', true).join(' ')
    // A Mine session can only answer concepts already queued, so on an empty map
    // it moves nothing — naming it was the original defect.
    expect(text).not.toMatch(/knowledge mine/i)
  })

  it('names the Foundations Review card, which is on this page and does work', () => {
    expect(emptyFoundationsLines('Lincoln', true).join(' ')).toMatch(
      /Foundations Review card/,
    )
  })

  it('asserts nothing about the child — only about the record', () => {
    const text = emptyFoundationsLines('Lincoln', true).join(' ')
    expect(text).toMatch(/Nothing has been recorded/)
    expect(text).not.toMatch(/can't|cannot|not able|struggl|behind/i)
  })

  it('gives a kid the neutral line and none of the parent routes', () => {
    const kid = emptyFoundationsLines('Lincoln', false)
    expect(kid).toHaveLength(1)
    expect(kid[0]).toContain('Lincoln')
    expect(kid.join(' ')).not.toMatch(/Foundations Review card|evaluation/i)
  })
})
