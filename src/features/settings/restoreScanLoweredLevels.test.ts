import { describe, expect, it } from 'vitest'

import type { LearnerModel } from '../../core/types/learnerModel'
import type { WorkingLevel } from '../../core/types/evaluation'
import {
  findScanLoweredLevel,
  isRestorableLevel,
  parseScannedBookName,
  recordedLevelsForDomain,
  restoreEvidence,
  scanWouldStillWriteDomain,
  type ScanLoweredLevel,
} from './restoreScanLoweredLevels'
import { planRestoredWorkingLevelWrite } from '../evaluate/skillSnapshotWrites'

const AT = '2026-09-11T12:00:00.000Z'

/** The level the handwriting scan wrote, verbatim from the 2026-09-11 exports. */
const londonScanned: WorkingLevel = {
  level: 2,
  updatedAt: '2026-09-10T22:02:14.000Z',
  source: 'curriculum',
  evidence: 'Scanned The Good and the Beautiful Handwriting Lesson 35',
}
const lincolnScanned: WorkingLevel = {
  level: 2,
  updatedAt: '2026-09-11T02:06:26.000Z',
  source: 'curriculum',
  evidence: 'Scanned The Good and the Beautiful Handwriting Level 3 Lesson 35',
}

function modelWithPhonicsEvidence(levels: number[]): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: Object.fromEntries(
      levels.map((level, i) => [
        `reading.node${i}`,
        {
          state: 'solid' as const,
          evidence: [
            {
              kind: 'workingLevel' as const,
              sourceId: 'skillSnapshot:c1',
              note: `At/Below phonics working level ${level}`,
              observedAt: '2026-07-06T12:55:33.000Z',
              domain: 'phonics',
              level,
            },
          ],
        },
      ]),
    ),
    modalityCalibration: {} as LearnerModel['modalityCalibration'],
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-07-06T12:55:33.000Z',
    updatedAt: '2026-07-06T12:55:33.000Z',
  }
}

describe('parseScannedBookName', () => {
  it('reads the book back out of a scan-written evidence line', () => {
    expect(parseScannedBookName(londonScanned.evidence)).toBe(
      'The Good and the Beautiful Handwriting',
    )
    expect(parseScannedBookName(lincolnScanned.evidence)).toBe(
      'The Good and the Beautiful Handwriting Level 3',
    )
  })

  it('refuses anything that is not a scan line, rather than guessing', () => {
    expect(parseScannedBookName(undefined)).toBeNull()
    expect(parseScannedBookName('')).toBeNull()
    expect(parseScannedBookName('Evaluation mastered: cvc → Level 3')).toBeNull()
    expect(parseScannedBookName('Scanned something')).toBeNull()
  })
})

describe('scanWouldStillWriteDomain', () => {
  it('says no for the handwriting book — the whole reason this one-shot exists', () => {
    expect(scanWouldStillWriteDomain('The Good and the Beautiful Handwriting', 'phonics')).toBe(false)
  })

  it('says yes for a real phonics program, so a legitimate level is left alone', () => {
    expect(scanWouldStillWriteDomain('Fast Phonics', 'phonics')).toBe(true)
    expect(scanWouldStillWriteDomain('The Good and the Beautiful Math K', 'math')).toBe(true)
  })
})

describe('recordedLevelsForDomain — context, never a decision', () => {
  it('reports each distinct level once, highest first, with when it was seen', () => {
    const model = modelWithPhonicsEvidence([5, 5, 2])
    model.projectedThrough = { phonics: 2, writing: null, math: 3 }
    expect(recordedLevelsForDomain(model, 'phonics').map((l) => l.level)).toEqual([5, 2])
    expect(recordedLevelsForDomain(model, 'math').map((l) => l.level)).toEqual([3])
  })

  it('borrows nothing for a domain the model records no evidence for', () => {
    expect(recordedLevelsForDomain(modelWithPhonicsEvidence([5]), null)).toEqual([])
    expect(recordedLevelsForDomain(null, 'phonics')).toEqual([])
  })
})

describe('findScanLoweredLevel (UX-383)', () => {
  const onRecord = [{ level: 5, observedAt: '2026-07-06T12:55:33.000Z' }]

  it("offers London's phonics row, naming the book and what it wrote", () => {
    const finding = findScanLoweredLevel({ key: 'phonics', current: londonScanned, onRecord })
    expect(finding).toMatchObject({
      action: 'offer',
      key: 'phonics',
      standing: londonScanned,
      book: 'The Good and the Beautiful Handwriting',
      onRecord,
    })
  })

  it("offers Lincoln's row the same way", () => {
    expect(
      findScanLoweredLevel({ key: 'phonics', current: lincolnScanned, onRecord: [] }),
    ).toMatchObject({ action: 'offer', book: 'The Good and the Beautiful Handwriting Level 3' })
  })

  it('offers the row even when the model has nothing on record — a person still knows', () => {
    const finding = findScanLoweredLevel({ key: 'phonics', current: londonScanned, onRecord: [] })
    expect(finding.action).toBe('offer')
    if (finding.action !== 'offer') throw new Error('unreachable')
    expect(finding.onRecord).toEqual([])
  })

  it('decides no level at all — the only number it carries is the standing one', () => {
    // Codex round 2, P1: the pre-scan level is not recoverable from what this
    // repo stores, so nothing here may propose one. The offer's own shape is
    // the assertion — there is no derived level on it to be wrong.
    const finding = findScanLoweredLevel({
      key: 'phonics',
      current: londonScanned,
      onRecord: [{ level: 5, observedAt: '2026-07-06T12:55:33.000Z' }],
    })
    if (finding.action !== 'offer') throw new Error('unreachable')
    expect(finding.standing.level).toBe(2)
    expect(finding).not.toHaveProperty('level')
    expect(finding).not.toHaveProperty('restoreTo')
  })

  it('leaves a level a real phonics program set exactly where it is', () => {
    const legitimate: WorkingLevel = {
      level: 2,
      updatedAt: AT,
      source: 'curriculum',
      evidence: 'Scanned Fast Phonics Lesson 35',
    }
    expect(
      findScanLoweredLevel({ key: 'phonics', current: legitimate, onRecord }),
    ).toEqual({ action: 'skip', key: 'phonics', reason: 'scan-still-valid' })
  })

  it('touches nothing a scan did not write', () => {
    for (const source of ['quest', 'evaluation', 'manual'] as const) {
      expect(
        findScanLoweredLevel({
          key: 'phonics',
          current: { level: 2, updatedAt: AT, source, evidence: 'whatever' },
          onRecord,
        }),
      ).toEqual({ action: 'skip', key: 'phonics', reason: 'not-scan-written' })
    }
  })

  it('says which of the refusals applied, for an empty slot and an unreadable line', () => {
    expect(
      findScanLoweredLevel({ key: 'math', current: undefined, onRecord: [] }),
    ).toEqual({ action: 'skip', key: 'math', reason: 'no-level-stored' })
    expect(
      findScanLoweredLevel({
        key: 'math',
        current: { level: 1, updatedAt: AT, source: 'curriculum', evidence: 'no book here' },
        onRecord: [],
      }),
    ).toEqual({ action: 'skip', key: 'math', reason: 'evidence-unreadable' })
  })
})

describe('isRestorableLevel', () => {
  const offer = (() => {
    const finding = findScanLoweredLevel({ key: 'phonics', current: londonScanned, onRecord: [] })
    if (finding.action !== 'offer') throw new Error('unreachable')
    return finding as ScanLoweredLevel
  })()

  it('takes a whole level above the standing one and at or below the ceiling', () => {
    expect(isRestorableLevel(3, offer)).toBe(true)
    expect(isRestorableLevel(offer.maxLevel, offer)).toBe(true)
  })

  it('refuses a lower, equal, fractional, empty or over-ceiling level', () => {
    for (const bad of [1, 2, 2.5, Number.NaN, offer.maxLevel + 1]) {
      expect(isRestorableLevel(bad, offer), String(bad)).toBe(false)
    }
  })
})

describe('planRestoredWorkingLevelWrite — the confirmed write', () => {
  const evidence = restoreEvidence('The Good and the Beautiful Handwriting', 2, AT)

  it('writes the parent’s level, stamped manual with a sentence saying why', () => {
    const outcome = planRestoredWorkingLevelWrite(londonScanned, londonScanned, 5, AT, evidence)
    expect(outcome).toEqual({
      status: 'written',
      level: { level: 5, updatedAt: AT, source: 'manual', evidence },
    })
    expect(evidence).toContain('UX-383')
  })

  it('stands down when anything has written that slot since the survey', () => {
    // Codex round 2, P1. A quest raising the slot to 6, or writing a freshly
    // measured 3, between the survey and the tap must stand — the restore may
    // not replace it and pin a stale number as a parent's word.
    const questRaised: WorkingLevel = { level: 6, updatedAt: AT, source: 'quest' }
    expect(planRestoredWorkingLevelWrite(questRaised, londonScanned, 5, AT, evidence)).toEqual({
      status: 'refused',
      reason: 'slot-moved',
      stored: questRaised,
    })

    const questMeasured: WorkingLevel = { level: 3, updatedAt: AT, source: 'quest' }
    expect(planRestoredWorkingLevelWrite(questMeasured, londonScanned, 5, AT, evidence)).toMatchObject(
      { status: 'refused', reason: 'slot-moved' },
    )
  })

  it('checks identity, not just the number — a re-scan at the same level is still a move', () => {
    const rescanned: WorkingLevel = { ...londonScanned, updatedAt: '2026-09-11T09:00:00.000Z' }
    expect(planRestoredWorkingLevelWrite(rescanned, londonScanned, 5, AT, evidence)).toMatchObject({
      status: 'refused',
      reason: 'slot-moved',
    })
  })

  it('stands down when the slot is gone entirely', () => {
    expect(planRestoredWorkingLevelWrite(undefined, londonScanned, 5, AT, evidence)).toEqual({
      status: 'refused',
      reason: 'slot-moved',
      stored: undefined,
    })
  })

  it('only ever raises — lowering by hand is the Skill Snapshot stepper’s job', () => {
    for (const level of [1, 2]) {
      expect(
        planRestoredWorkingLevelWrite(londonScanned, londonScanned, level, AT, evidence),
      ).toMatchObject({ status: 'refused', reason: 'not-higher' })
    }
  })

  it('is idempotent: once restored, the slot no longer matches what was expected', () => {
    const first = planRestoredWorkingLevelWrite(londonScanned, londonScanned, 5, AT, evidence)
    if (first.status !== 'written') throw new Error('unreachable')
    expect(
      planRestoredWorkingLevelWrite(first.level, londonScanned, 5, AT, evidence),
    ).toMatchObject({ status: 'refused', reason: 'slot-moved' })
  })
})
