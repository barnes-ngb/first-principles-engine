import { describe, expect, it } from 'vitest'

import {
  BOOTSTRAP_FAILED_LINE,
  bootstrapRunningLine,
  emptyFoundationsLines,
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

describe('bootstrap copy', () => {
  it('names the child while the map is being set up', () => {
    expect(bootstrapRunningLine('Lincoln')).toContain('Lincoln')
  })

  it('says a failure changed nothing', () => {
    expect(BOOTSTRAP_FAILED_LINE).toMatch(/nothing was changed/i)
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
