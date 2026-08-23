import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore mocked at the boundary so the lane's two invariants — one report
// write, zero hours writes — are assertable directly.
const addDoc = vi.fn()
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
}))

const dadLabReportsCollection = vi.fn()
const hoursCollection = vi.fn()
vi.mock('../../core/firebase/firestore', () => ({
  dadLabReportsCollection: (...args: unknown[]) => dadLabReportsCollection(...args),
  hoursCollection: (...args: unknown[]) => hoursCollection(...args),
}))

import { DadLabStatus } from '../../core/types/enums'
import { subjectsForLabType } from './labTypeSubjects'
import { buildPlannedLabReport, createPlannedLab, getNextSaturday } from './plannedLab'

// A Wednesday, so "next Saturday" is unambiguous.
const WEDNESDAY = new Date('2026-08-19T12:00:00')

beforeEach(() => {
  vi.clearAllMocks()
  addDoc.mockResolvedValue({ id: 'lab-new' })
  dadLabReportsCollection.mockReturnValue({ __collection: 'dadLabReports' })
  hoursCollection.mockReturnValue({ __collection: 'hours' })
})

describe('getNextSaturday', () => {
  it('finds the coming Saturday from a weekday, and keeps a Saturday as itself', () => {
    expect(getNextSaturday(WEDNESDAY).getDay()).toBe(6)
    const saturday = new Date('2026-08-22T12:00:00')
    expect(getNextSaturday(saturday).toDateString()).toBe(saturday.toDateString())
  })
})

describe('buildPlannedLabReport — the one definition of a backlog entry (FEAT-157)', () => {
  it('builds the exact shape the suggestion flow built inline — Planned, dated next Saturday, subject tags stamped', () => {
    const report = buildPlannedLabReport(
      { title: 'Make a bulb light up', labType: 'science', question: 'Why?' },
      WEDNESDAY,
    )
    expect(report.status).toBe(DadLabStatus.Planned)
    expect(report.date).toBe('2026-08-22')
    expect(report.title).toBe('Make a bulb light up')
    expect(report.question).toBe('Why?')
    // FEAT-55: tags stamped at creation so a completed lab never lands with
    // empty tags (the silent zero-hours path).
    expect(report.subjectTags).toEqual(subjectsForLabType('science'))
    expect(report.subjectTags.length).toBeGreaterThan(0)
    expect(report.childReports).toEqual({})
    expect(report.childRoles).toEqual({})
    expect(report.totalMinutes).toBe(60)
  })

  it('the status is hardcoded — no input can produce an Active or Complete lab', () => {
    const report = buildPlannedLabReport(
      { title: 'X', labType: 'science', status: 'active' } as never,
      WEDNESDAY,
    )
    expect(report.status).toBe(DadLabStatus.Planned)
  })

  it('carries an arc link only when an arcId is given, and a step index only alongside it', () => {
    const linked = buildPlannedLabReport(
      { title: 'X', labType: 'science', arcId: 'arc_elec', arcStepIndex: 1 },
      WEDNESDAY,
    )
    expect(linked).toMatchObject({ arcId: 'arc_elec', arcStepIndex: 1 })

    const unlinked = buildPlannedLabReport({ title: 'X', labType: 'science' }, WEDNESDAY)
    expect(unlinked).not.toHaveProperty('arcId')
    expect(unlinked).not.toHaveProperty('arcStepIndex')

    const orphanIndex = buildPlannedLabReport(
      { title: 'X', labType: 'science', arcStepIndex: 1 },
      WEDNESDAY,
    )
    expect(orphanIndex).not.toHaveProperty('arcStepIndex')
  })
})

describe('createPlannedLab — one report write, zero hours writes (FEAT-157)', () => {
  it('writes exactly one document, to dadLabReports, and never touches the hours collection', async () => {
    const id = await createPlannedLab('fam-1', { title: 'Volcano', labType: 'science' })
    expect(id).toBe('lab-new')
    expect(addDoc).toHaveBeenCalledTimes(1)
    expect(dadLabReportsCollection).toHaveBeenCalledWith('fam-1')
    expect(addDoc.mock.calls[0][0]).toEqual({ __collection: 'dadLabReports' })
    expect((addDoc.mock.calls[0][1] as { status: string }).status).toBe(DadLabStatus.Planned)
    // Labs feed compliance only on completion — a planned lab records no time.
    expect(hoursCollection).not.toHaveBeenCalled()
  })
})
