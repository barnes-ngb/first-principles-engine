import { describe, expect, it } from 'vitest'

import type { DadLabReport, HoursAdjustment } from '../../core/types'
import { DadLabStatus, DadLabType, LearningLocation, SubjectBucket } from '../../core/types/enums'
import {
  ROUTING_AUDIT_SOURCE,
  buildHoursRoutingAudit,
  buildRoutingAdjustments,
} from './hoursRoutingAudit'

const CHILD_IDS = ['lincoln', 'london']

/** Minimal completed-report factory — only the fields the audit reads. */
function report(over: Partial<DadLabReport>): DadLabReport {
  return {
    id: 'r1',
    date: '2026-03-15',
    weekKey: '2026-W11',
    title: 'Volcano',
    labType: DadLabType.Science,
    question: '',
    description: '',
    status: DadLabStatus.Complete,
    childReports: {},
    subjectTags: [],
    totalMinutes: 60,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...over,
  }
}

describe('buildHoursRoutingAudit — selector', () => {
  it('flags a completed empty-tags report as the headline tier with full delta', () => {
    const r = report({ id: 'empty-1', labType: DadLabType.Science, totalMinutes: 60, subjectTags: [] })
    const audit = buildHoursRoutingAudit([r], [], CHILD_IDS)

    expect(audit.emptyTags).toHaveLength(1)
    expect(audit.informational).toHaveLength(0)
    const row = audit.emptyTags[0]
    expect(row.tier).toBe('empty-tags')
    expect(row.impliedTags).toEqual([SubjectBucket.Science])
    expect(row.writtenMinutesPerChild).toBe(0)
    // Science → 1 subject, round(60/1)=60 per child.
    expect(row.impliedMinutesPerChild).toBe(60)
    expect(row.deltaMinutesPerChild).toBe(60)
    expect(row.resolved).toBe(false)
    expect(audit.unroutedMinutesPerChild).toBe(60)
  })

  it('splits multi-subject implied minutes exactly as the sync would (round per subject)', () => {
    // Engineering → [Science, PracticalArts]; 60/2 = 30 each → 60 per child.
    const r = report({ id: 'eng-1', labType: DadLabType.Engineering, totalMinutes: 60, subjectTags: [] })
    const audit = buildHoursRoutingAudit([r], [], CHILD_IDS)
    expect(audit.emptyTags[0].impliedTags).toEqual([SubjectBucket.Science, SubjectBucket.PracticalArts])
    expect(audit.emptyTags[0].impliedMinutesPerChild).toBe(60)
  })

  it('classifies a routed report whose tags differ from the mapping as informational (no write path)', () => {
    // Science lab that was manually tagged Math — it DID route, just differently.
    const r = report({
      id: 'info-1',
      labType: DadLabType.Science,
      totalMinutes: 45,
      subjectTags: [SubjectBucket.Math],
    })
    const audit = buildHoursRoutingAudit([r], [], CHILD_IDS)

    expect(audit.emptyTags).toHaveLength(0)
    expect(audit.informational).toHaveLength(1)
    const row = audit.informational[0]
    expect(row.tier).toBe('informational')
    expect(row.currentTags).toEqual([SubjectBucket.Math])
    expect(row.impliedTags).toEqual([SubjectBucket.Science])
    expect(row.writtenMinutesPerChild).toBe(45)
    expect(row.impliedMinutesPerChild).toBe(45)
    // Informational never contributes to the unrouted (empty-tags) headline.
    expect(audit.unroutedMinutesPerChild).toBe(0)
  })

  it('does NOT flag a routed report whose tags already match the mapping', () => {
    const r = report({
      id: 'ok-1',
      labType: DadLabType.Science,
      totalMinutes: 60,
      subjectTags: [SubjectBucket.Science],
    })
    const audit = buildHoursRoutingAudit([r], [], CHILD_IDS)
    expect(audit.emptyTags).toHaveLength(0)
    expect(audit.informational).toHaveLength(0)
  })

  it('ignores non-completed reports (only completed labs sync hours)', () => {
    const planned = report({ id: 'p1', status: DadLabStatus.Planned, subjectTags: [] })
    const active = report({ id: 'a1', status: DadLabStatus.Active, subjectTags: [] })
    const audit = buildHoursRoutingAudit([planned, active], [], CHILD_IDS)
    expect(audit.emptyTags).toHaveLength(0)
    expect(audit.informational).toHaveLength(0)
  })

  it('marks a row resolved when this audit already wrote a correction for it (idempotence guard)', () => {
    const r = report({ id: 'empty-2', labType: DadLabType.Science, totalMinutes: 60, subjectTags: [] })
    const prior: HoursAdjustment[] = [
      {
        childId: 'both',
        date: '2026-03-15',
        minutes: 60,
        reason: 'Dad Lab routing audit 2026-07 — report empty-2 …',
        subjectBucket: SubjectBucket.Science,
        source: ROUTING_AUDIT_SOURCE,
        labReportId: 'empty-2',
      },
    ]
    const audit = buildHoursRoutingAudit([r], prior, CHILD_IDS)
    expect(audit.emptyTags[0].resolved).toBe(true)
    // Resolved rows drop out of the unrouted headline.
    expect(audit.unroutedMinutesPerChild).toBe(0)
  })

  it('does not treat an unrelated adjustment (different source or report) as a correction', () => {
    const r = report({ id: 'empty-3', totalMinutes: 60, subjectTags: [] })
    const unrelated: HoursAdjustment[] = [
      { childId: 'both', date: '2026-03-15', minutes: 60, reason: 'manual', source: 'backfill', labReportId: 'other' },
      { childId: 'both', date: '2026-03-15', minutes: 60, reason: 'manual', source: ROUTING_AUDIT_SOURCE, labReportId: 'nope' },
    ]
    const audit = buildHoursRoutingAudit([r], unrelated, CHILD_IDS)
    expect(audit.emptyTags[0].resolved).toBe(false)
  })

  it('sorts flagged rows newest-first', () => {
    const older = report({ id: 'old', date: '2026-01-01', subjectTags: [] })
    const newer = report({ id: 'new', date: '2026-05-01', subjectTags: [] })
    const audit = buildHoursRoutingAudit([older, newer], [], CHILD_IDS)
    expect(audit.emptyTags.map((r) => r.reportId)).toEqual(['new', 'old'])
  })
})

describe('buildRoutingAdjustments — proposal builder', () => {
  const CREATED_AT = '2026-07-04T12:00:00.000Z'

  it('builds one whole-family adjustment per implied subject with sync-identical minutes', () => {
    const r = report({ id: 'eng-x', labType: DadLabType.Engineering, totalMinutes: 60, subjectTags: [] })
    const [row] = buildHoursRoutingAudit([r], [], CHILD_IDS).emptyTags
    const adjustments = buildRoutingAdjustments(row, CREATED_AT)

    expect(adjustments).toHaveLength(2)
    expect(adjustments.map((a) => a.subjectBucket)).toEqual([
      SubjectBucket.Science,
      SubjectBucket.PracticalArts,
    ])
    for (const a of adjustments) {
      expect(a.childId).toBe('both') // DATA-04 whole-family
      expect(a.minutes).toBe(30) // round(60/2)
      expect(a.date).toBe('2026-03-15')
      expect(a.location).toBe(LearningLocation.Home)
      expect(a.source).toBe(ROUTING_AUDIT_SOURCE)
      expect(a.labReportId).toBe('eng-x')
      expect(a.createdAt).toBe(CREATED_AT)
    }
  })

  it('stamps the exact provenance reason string in every adjustment', () => {
    const r = report({ id: 'sci-x', labType: DadLabType.Science, title: 'Volcano', date: '2026-03-15', totalMinutes: 60, subjectTags: [] })
    const [row] = buildHoursRoutingAudit([r], [], CHILD_IDS).emptyTags
    const [adj] = buildRoutingAdjustments(row, CREATED_AT)
    expect(adj.reason).toBe(
      'Dad Lab routing audit 2026-07 — report sci-x (Volcano, 2026-03-15) had no subject tags; ' +
        '60m credited per LAB_TYPE_SUBJECTS[science]; whole-family per DATA-04.',
    )
  })

  it('returns [] for the informational tier (no write path this run)', () => {
    const r = report({ id: 'info-x', labType: DadLabType.Science, totalMinutes: 45, subjectTags: [SubjectBucket.Math] })
    const [row] = buildHoursRoutingAudit([r], [], CHILD_IDS).informational
    expect(buildRoutingAdjustments(row, CREATED_AT)).toEqual([])
  })

  it('returns [] for an already-resolved row (never proposes twice)', () => {
    const r = report({ id: 'done-x', labType: DadLabType.Science, totalMinutes: 60, subjectTags: [] })
    const prior: HoursAdjustment[] = [
      { childId: 'both', date: '2026-03-15', minutes: 60, reason: 'x', source: ROUTING_AUDIT_SOURCE, labReportId: 'done-x' },
    ]
    const [row] = buildHoursRoutingAudit([r], prior, CHILD_IDS).emptyTags
    expect(row.resolved).toBe(true)
    expect(buildRoutingAdjustments(row, CREATED_AT)).toEqual([])
  })

  it('reconstructs exactly what the original sync would have written (per-child parity)', () => {
    // syncComplianceHours: minutesPerSubject = round(total/len), written to each
    // child per subject. Sum of the proposal's minutes == that per-child credit.
    const r = report({ id: 'parity', labType: DadLabType.Adventure, totalMinutes: 50, subjectTags: [] })
    const [row] = buildHoursRoutingAudit([r], [], CHILD_IDS).emptyTags
    const adjustments = buildRoutingAdjustments(row, CREATED_AT)
    // Adventure → [Science, PE]; round(50/2)=25 each → 50 total per child.
    const perChildFromProposal = adjustments.reduce((acc, a) => acc + a.minutes, 0)
    expect(perChildFromProposal).toBe(row.impliedMinutesPerChild)
    expect(perChildFromProposal).toBe(50)
  })
})
