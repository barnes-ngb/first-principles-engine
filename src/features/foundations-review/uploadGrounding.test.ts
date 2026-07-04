import { describe, expect, it } from 'vitest'

import { groundCoveredProposals, parsePeakFromUnit } from './uploadGrounding'
import { applyReviewActionToModel } from './foundationsReviewActions'
import type { FoundationsReviewAction } from './foundationsReviewActions'
import type { LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-07-04T12:00:00.000Z'

function emptyModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

const covered = (conceptId: string, unit = 'Peak 13'): FoundationsReviewAction => ({
  kind: 'covered',
  childId: 'c1',
  conceptId,
  source: 'fastPhonics',
  unit,
})

describe('parsePeakFromUnit', () => {
  it('parses "Peak N" and bare numbers within 1–20', () => {
    expect(parsePeakFromUnit('Peak 13')).toBe(13)
    expect(parsePeakFromUnit('peak 8')).toBe(8)
    expect(parsePeakFromUnit('13')).toBe(13)
  })
  it('rejects out-of-range and empty', () => {
    expect(parsePeakFromUnit('Peak 21')).toBeNull()
    expect(parsePeakFromUnit('Unit 4 p.20')).toBe(4) // first 1–2 digit number
    expect(parsePeakFromUnit(undefined)).toBeNull()
    expect(parsePeakFromUnit('no number here')).toBeNull()
  })
})

describe('groundCoveredProposals — the bridge is the mapping authority', () => {
  it('keeps concepts the extracted Peak 13 covers, drops the ahead-of-frontier one', () => {
    const batch: FoundationsReviewAction[] = [
      covered('reading.phonics.digraphs'),
      covered('reading.phonics.vowelTeams'),
      covered('reading.phonics.rControlled'),
      covered('reading.phonics.diphthongs'),
      covered('reading.phonics.blends'),
      covered('reading.phonics.sightWords'),
      covered('reading.phonics.longVowels'), // Peak 18 — model over-reach, must drop
    ]
    const { kept, dropped } = groundCoveredProposals(batch)
    const keptIds = kept.map((a) => a.conceptId)
    expect(keptIds).toContain('reading.phonics.blends')
    expect(keptIds).toContain('reading.phonics.digraphs')
    expect(keptIds).not.toContain('reading.phonics.longVowels')
    expect(dropped.map((d) => d.action.conceptId)).toEqual(['reading.phonics.longVowels'])
  })

  it('takes the MAX peak across the batch as the position', () => {
    // A concept only unlocked at Peak 18 is kept when the batch names Peak 18.
    const batch = [covered('reading.phonics.longVowels', 'Peak 18')]
    expect(groundCoveredProposals(batch).kept).toHaveLength(1)
  })

  it('passes un-bridged sources through untouched (single generic covered)', () => {
    const generic: FoundationsReviewAction = {
      kind: 'covered',
      childId: 'c1',
      conceptId: 'reading.phonics.blends',
      source: 'Teach Your Monster',
    }
    expect(groundCoveredProposals([generic]).kept).toEqual([generic])
  })

  it('never ground-filters attest or queueTest', () => {
    const attest: FoundationsReviewAction = {
      kind: 'attest',
      childId: 'c1',
      conceptId: 'reading.phonics.longVowels',
      state: 'solid',
      note: 'work sample',
    }
    const queue: FoundationsReviewAction = {
      kind: 'queueTest',
      childId: 'c1',
      conceptId: 'reading.phonics.longVowels',
    }
    const { kept, dropped } = groundCoveredProposals([attest, queue])
    expect(kept).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })

  it('keeps a bridged covered with no parseable peak (cannot ground → do not drop)', () => {
    const noPeak = covered('reading.phonics.blends', 'recently')
    expect(groundCoveredProposals([noPeak]).kept).toHaveLength(1)
  })
})

// Amendment C — one upload flow, two evidence kinds; the §13 clamp bites exactly one.
describe('same photo flow → two evidence kinds, clamp on exactly one', () => {
  it('a work-sample attestation may reach solid; a curriculum-position covered is clamped', () => {
    // (B) Photo of the child's actual work → attest → attestation evidence, unclamped.
    const workSample: FoundationsReviewAction = {
      kind: 'attest',
      childId: 'c1',
      conceptId: 'reading.encoding.spellCvc',
      state: 'solid',
      note: 'work sample 7/4: spelled CVC and digraph words correctly',
    }
    // (A) Curriculum screenshot → covered → curriculumPosition evidence, clamped.
    const curriculum: FoundationsReviewAction = {
      kind: 'covered',
      childId: 'c1',
      conceptId: 'reading.phonics.blends',
      source: 'fastPhonics',
      unit: 'Peak 13',
      proposedState: 'solid', // the LLM over-claims on both
    }

    const afterWork = applyReviewActionToModel(emptyModel(), workSample, NOW).model
    const afterCurriculum = applyReviewActionToModel(emptyModel(), curriculum, NOW).model

    // Work sample: attestation reaches solid (parent-confirmed observation).
    const workEntry = afterWork.conceptStates['reading.encoding.spellCvc']
    expect(workEntry.state).toBe('solid')
    expect(workEntry.evidence.at(-1)?.kind).toBe('attestation')

    // Curriculum: clamped to forming despite the solid claim; curriculumPosition evidence.
    const curEntry = afterCurriculum.conceptStates['reading.phonics.blends']
    expect(curEntry.state).toBe('forming')
    expect(curEntry.evidence.at(-1)?.kind).toBe('curriculumPosition')
  })
})
