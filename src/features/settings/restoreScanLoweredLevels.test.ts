import { describe, expect, it } from 'vitest'

import type { LearnerModel } from '../../core/types/learnerModel'
import type { WorkingLevel } from '../../core/types/evaluation'
import { SkillLevel } from '../../core/types/enums'
import {
  parseScannedBookName,
  planWorkingLevelRestore,
  recordedLevelsForDomain,
  restoreEvidence,
  scanWouldStillWriteDomain,
} from './restoreScanLoweredLevels'
import { applyToSnapshot } from '../evaluate/skillSnapshotWrites'

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

describe('recordedLevelsForDomain', () => {
  it('reads every workingLevel ref for the domain, plus the projection watermark', () => {
    const model = modelWithPhonicsEvidence([5, 5, 2])
    model.projectedThrough = { phonics: 2, writing: null, math: 3 }
    expect(recordedLevelsForDomain(model, 'phonics').sort()).toEqual([2, 2, 5, 5])
    expect(recordedLevelsForDomain(model, 'math')).toEqual([3])
  })

  it('borrows nothing for a domain the model records no evidence for', () => {
    expect(recordedLevelsForDomain(modelWithPhonicsEvidence([5]), null)).toEqual([])
    expect(recordedLevelsForDomain(null, 'phonics')).toEqual([])
  })
})

describe('planWorkingLevelRestore (UX-383)', () => {
  it("restores London's phonics to the highest level his model recorded", () => {
    const plan = planWorkingLevelRestore({
      key: 'phonics',
      current: londonScanned,
      recordedLevels: recordedLevelsForDomain(modelWithPhonicsEvidence([5, 5, 2]), 'phonics'),
      at: AT,
    })
    expect(plan).toMatchObject({
      action: 'restore',
      key: 'phonics',
      from: 2,
      book: 'The Good and the Beautiful Handwriting',
      level: { level: 5, source: 'manual' },
    })
    if (plan.action !== 'restore') throw new Error('unreachable')
    expect(plan.level.evidence).toBe(
      restoreEvidence('The Good and the Beautiful Handwriting', 2, AT),
    )
    expect(plan.level.evidence).toContain('UX-383')
  })

  it("restores Lincoln's phonics the same way, off his own evidence", () => {
    const plan = planWorkingLevelRestore({
      key: 'phonics',
      current: lincolnScanned,
      recordedLevels: recordedLevelsForDomain(modelWithPhonicsEvidence([3, 3]), 'phonics'),
      at: AT,
    })
    expect(plan).toMatchObject({ action: 'restore', from: 2, level: { level: 3 } })
  })

  it('leaves a level a real phonics program set exactly where it is', () => {
    const legitimate: WorkingLevel = {
      level: 2,
      updatedAt: AT,
      source: 'curriculum',
      evidence: 'Scanned Fast Phonics Lesson 35',
    }
    expect(
      planWorkingLevelRestore({ key: 'phonics', current: legitimate, recordedLevels: [5], at: AT }),
    ).toEqual({ action: 'skip', key: 'phonics', reason: 'scan-still-valid' })
  })

  it('never invents a number — with no stored evidence it restores nothing', () => {
    expect(
      planWorkingLevelRestore({ key: 'phonics', current: londonScanned, recordedLevels: [], at: AT }),
    ).toEqual({ action: 'skip', key: 'phonics', reason: 'no-restore-evidence' })
  })

  it('never lowers — evidence at or below the standing level is no reason to write', () => {
    for (const recorded of [[2], [1, 2]]) {
      expect(
        planWorkingLevelRestore({
          key: 'phonics',
          current: londonScanned,
          recordedLevels: recorded,
          at: AT,
        }),
      ).toEqual({ action: 'skip', key: 'phonics', reason: 'nothing-to-raise' })
    }
  })

  it('touches nothing a scan did not write', () => {
    for (const source of ['quest', 'evaluation', 'manual'] as const) {
      expect(
        planWorkingLevelRestore({
          key: 'phonics',
          current: { level: 2, updatedAt: AT, source, evidence: 'whatever' },
          recordedLevels: [5],
          at: AT,
        }),
      ).toEqual({ action: 'skip', key: 'phonics', reason: 'not-scan-written' })
    }
  })

  it('is idempotent: what it wrote it will not rewrite', () => {
    const first = planWorkingLevelRestore({
      key: 'phonics',
      current: londonScanned,
      recordedLevels: [5],
      at: AT,
    })
    if (first.action !== 'restore') throw new Error('unreachable')
    const second = planWorkingLevelRestore({
      key: 'phonics',
      current: first.level,
      recordedLevels: [5],
      at: AT,
    })
    expect(second).toEqual({ action: 'skip', key: 'phonics', reason: 'not-scan-written' })
  })

  it('says which of the six refusals applied, for an empty slot and an unreadable line', () => {
    expect(
      planWorkingLevelRestore({ key: 'math', current: undefined, recordedLevels: [4], at: AT }),
    ).toEqual({ action: 'skip', key: 'math', reason: 'no-level-stored' })
    expect(
      planWorkingLevelRestore({
        key: 'math',
        current: { level: 1, updatedAt: AT, source: 'curriculum', evidence: 'no book here' },
        recordedLevels: [4],
        at: AT,
      }),
    ).toEqual({ action: 'skip', key: 'math', reason: 'evidence-unreadable' })
  })
})

describe('the restore write goes through the central writer, upgrade-only', () => {
  it('raises the one key and touches nothing else', () => {
    const level: WorkingLevel = { level: 5, updatedAt: AT, source: 'manual', evidence: 'restored' }
    const result = applyToSnapshot(
      {
        childId: 'c1',
        prioritySkills: [{ tag: 'phonics.cvc', label: 'CVC', level: SkillLevel.Emerging }],
        workingLevels: { phonics: londonScanned, math: { level: 3, updatedAt: AT, source: 'quest' } },
      },
      { masteredSkills: [], restoreWorkingLevel: { key: 'phonics', level }, at: AT },
    )
    expect(result.changed).toBe(true)
    expect(result.changedFields.workingLevel).toBe('phonics')
    expect(result.snapshot.workingLevels?.phonics).toEqual(level)
    expect(result.snapshot.workingLevels?.math?.level).toBe(3)
    expect(result.snapshot.prioritySkills).toHaveLength(1)
  })

  it('refuses to lower or to repeat itself', () => {
    const standing: WorkingLevel = { level: 5, updatedAt: AT, source: 'manual' }
    for (const proposed of [4, 5]) {
      const result = applyToSnapshot(
        { childId: 'c1', workingLevels: { phonics: standing } },
        {
          masteredSkills: [],
          restoreWorkingLevel: {
            key: 'phonics',
            level: { level: proposed, updatedAt: AT, source: 'manual' },
          },
          at: AT,
        },
      )
      expect(result.changed).toBe(false)
      expect(result.changedFields.workingLevel).toBe(false)
      expect(result.snapshot.workingLevels?.phonics).toEqual(standing)
    }
  })
})
