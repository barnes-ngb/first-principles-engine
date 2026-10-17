import { describe, expect, it } from 'vitest'

import { buildDataReviewExport, type DataReviewExportInput } from './dataReviewExport.logic'
import type { ProgramCompletionState } from '../../core/types/programCompletion'

/**
 * The export carries the PARENT-SIDE finished-program record, and reads only
 * ACTIVE evidence (FEAT-242).
 *
 * Two different claims: the learner-model section must not present a withdrawn
 * coverage ref as live support, and §2b must carry what the parent actually
 * asserted — which lives in `programCompletionEvents` / `programCompletionState`
 * and nowhere else.
 */

const CVC = 'reading.phonics.cvc'

function input(over: Partial<DataReviewExportInput> = {}): DataReviewExportInput {
  return {
    generatedAt: '2026-10-17T12:00:00.000Z',
    mode: 'full-history',
    child: { id: 'c1', name: 'Lincoln' },
    schoolYear: { start: '2026-07-01', end: '2027-06-30' },
    schoolYearStart: { month: 7, day: 1 },
    hoursRequirement: null,
    versions: {
      graph: 'reading@1+math@1',
      fastPhonicsBridge: 1,
      mathseedsBridge: 1,
      tgtbLa1Bridge: 1,
      tagConceptBridge: 1,
    },
    activityConfigs: [],
    workbookConfigs: [],
    learnerModel: null,
    skillSnapshot: null,
    sightWords: [],
    dayLogs: [],
    hoursEntries: [],
    hoursAdjustments: [],
    artifacts: [],
    dadLabReports: [],
    evaluationSessions: [],
    disposition: null,
    xpEvents: [],
    xpTotals: null,
    reads: [],
    ...over,
  }
}

const state = (over: Partial<ProgramCompletionState> = {}): ProgramCompletionState => ({
  id: 'c1__fastPhonics',
  childId: 'c1',
  program: 'fastPhonics',
  activeEntryKey: 'draft-key-0001',
  activeAssertion: {
    observedOn: '2026-10-01',
    source: 'programReport',
    assistance: 'unknown',
    reportedProgramVersion: 'unknown',
    reportObservationId: 'c1__r1',
    reportObservedOn: '2026-09-30',
    reportNativeNumber: 20,
    reportMeaning: 'completedThrough',
  },
  activeConfirmedAt: '2026-10-02T00:00:00.000Z',
  activeMappingVersion: 1,
  projection: {
    status: 'applied',
    appliedAt: '2026-10-02T00:00:00.000Z',
    appliedMappingVersion: 1,
    conceptIds: [CVC],
  },
  eventCount: 1,
  lastEventAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

describe('§2b — the finished-program record', () => {
  it('carries the assertion, its source, the unknowns and the citation', () => {
    const md = buildDataReviewExport(
      input({
        completion: {
          state: state(),
          events: [
            {
              id: 'c1__fastPhonics__draft-key-0001',
              childId: 'c1',
              program: 'fastPhonics',
              entryKey: 'draft-key-0001',
              kind: 'confirm',
              recordedAt: '2026-10-02T00:00:00.000Z',
              mappingVersion: 1,
              assertion: state().activeAssertion!,
            },
          ],
          readFailed: false,
          truncated: false,
        },
      }),
    )
    expect(md).toContain('## 2b. Finished programs (parent-confirmed)')
    expect(md).toContain('2026-10-01') // observed finished on
    expect(md).toContain('programReport')
    expect(md).toContain('unknown') // assistance + program version
    expect(md).toContain('c1__r1') // the citation
    expect(md).toContain('draft-key-0001')
    expect(md).toContain('confirm')
  })

  it('says a failed read FAILED, never "none recorded"', () => {
    const md = buildDataReviewExport(
      input({
        completion: { state: null, events: [], readFailed: true, truncated: false },
      }),
    )
    expect(md).toContain('could not be read')
    expect(md).not.toContain('No finished-program record for this child.')
  })

  it('says so when it was not loaded at all', () => {
    const md = buildDataReviewExport(input())
    expect(md).toContain('_Not loaded by this export run._')
  })

  it('reports an empty record as empty once it HAS been read', () => {
    const md = buildDataReviewExport(
      input({
        completion: { state: null, events: [], readFailed: false, truncated: false },
      }),
    )
    expect(md).toContain('No finished-program record for this child.')
  })
})

describe('§2a — withdrawn evidence is counted apart from live evidence', () => {
  it('excludes a superseded ref from the live count and names the effective state', () => {
    const md = buildDataReviewExport(
      input({
        learnerModel: {
          childId: 'c1',
          graphVersion: 'reading@1+math@1',
          status: 'seeded',
          conceptStates: {
            [CVC]: {
              state: 'forming',
              evidence: [
                {
                  kind: 'programCompletionCoverage',
                  sourceId: 'fastPhonics:draft-1',
                  note: 'withdrawn claim',
                  observedAt: '2026-10-01T00:00:00.000Z',
                  status: 'superseded',
                  supersededAt: '2026-10-05T00:00:00.000Z',
                  completionId: 'fastPhonics:draft-1',
                },
              ],
              completionReviewNeeded: true,
            },
          },
          modalityCalibration: {
            reading: { note: '' },
            writing: { note: '' },
            math: { note: '' },
          },
          whatMattersNext: [],
          changeFeed: [],
          openQuestions: [],
          seededAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-10-05T00:00:00.000Z',
        },
      }),
    )
    // The withdrawn ref is visible as withdrawn, not as support...
    expect(md).toMatch(/Withdrawn refs/)
    // ...and the effective state a consumer reads is named beside the stored one.
    expect(md).toMatch(/\*\*frontier\*\* \(stored forming\)/)
    expect(md).toMatch(/completionReviewNeeded/)
  })
})
