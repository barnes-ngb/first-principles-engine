import { describe, expect, it } from 'vitest'

import { buildWorkbookScanReport, dominantFailure } from './workbookScanReport'
import type { WorkbookPageOutcome, WorkbookScanFailure } from './workbookScanReport'

const ok = (position: number | null = 12, configName = 'GATB Math'): WorkbookPageOutcome => ({
  ok: true,
  registration: { configName, position },
})
const bad = (reason: WorkbookScanFailure): WorkbookPageOutcome => ({ ok: false, reason })

describe('buildWorkbookScanReport — success lines are unchanged', () => {
  it('one page read → the existing single-page success line', () => {
    expect(buildWorkbookScanReport([ok(12)])).toEqual({
      text: 'Registered to GATB Math · Lesson 12',
      severity: 'success',
    })
  })

  it('every page read → the existing multi-page success line with the last position', () => {
    expect(buildWorkbookScanReport([ok(12), ok(13)])).toEqual({
      text: 'Registered 2 pages to GATB Math · Lesson 13',
      severity: 'success',
    })
  })

  it('drops the lesson suffix when the position is unknown', () => {
    expect(buildWorkbookScanReport([ok(null)])?.text).toBe('Registered to GATB Math')
  })

  it('returns null for an empty batch — nothing happened, so say nothing', () => {
    expect(buildWorkbookScanReport([])).toBeNull()
  })
})

describe('buildWorkbookScanReport — each failure kind says something different', () => {
  // The bug this fixes: all six of these produced the SAME red sentence.
  const cases: { reason: WorkbookScanFailure; expected: string }[] = [
    { reason: 'timeout', expected: 'The scan took too long. The photo is saved — try again.' },
    { reason: 'no-result', expected: "Couldn't read the workbook page. The photo is saved — try again." },
    {
      reason: 'not-a-worksheet',
      expected: 'That looks like a certificate, not a workbook page. The photo is saved.',
    },
    {
      reason: 'no-curriculum-detected',
      expected:
        "Couldn't find a workbook page in the photo. The photo is saved — try one page, flat and straight on, in good light.",
    },
    {
      reason: 'config-missing',
      expected:
        "This row isn't linked to a workbook any more, so there's nothing to register the page to. The photo is saved.",
    },
    { reason: 'error', expected: 'Something went wrong reading the page. The photo is saved — try again.' },
  ]

  for (const { reason, expected } of cases) {
    it(`${reason} → its own message, severity warning`, () => {
      expect(buildWorkbookScanReport([bad(reason)])).toEqual({ text: expected, severity: 'warning' })
    })
  }

  it('no two failure kinds share a message', () => {
    const texts = cases.map((c) => buildWorkbookScanReport([bad(c.reason)])!.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('a total failure is a warning, never an error — the photo is safely saved', () => {
    for (const { reason } of cases) {
      expect(buildWorkbookScanReport([bad(reason)])!.severity).toBe('warning')
    }
  })

  it('config-missing never tells the parent to retake or retry the photo', () => {
    const text = buildWorkbookScanReport([bad('config-missing')])!.text.toLowerCase()
    // No photo of any quality will register against a workbook that is gone.
    expect(text).not.toMatch(/try again|retake|another photo|good light|straight on/)
    expect(text).toContain("isn't linked to a workbook")
  })

  it('only the no-workbook-page-found case carries the photo hint', () => {
    expect(buildWorkbookScanReport([bad('no-curriculum-detected')])!.text).toContain(
      'one page, flat and straight on, in good light',
    )
    for (const { reason } of cases.filter((c) => c.reason !== 'no-curriculum-detected')) {
      expect(buildWorkbookScanReport([bad(reason)])!.text).not.toContain('good light')
    }
  })
})

describe('buildWorkbookScanReport — partial batches carry the count', () => {
  it('2 of 3 pages read → the count, what registered, and what happened to the rest', () => {
    const report = buildWorkbookScanReport([ok(12), ok(13), bad('no-curriculum-detected')])!
    expect(report.text).toContain('2 of 3 pages read')
    expect(report.text).toContain('GATB Math · Lesson 13')
    expect(report.text).toContain("1 page couldn't be matched to a lesson")
    expect(report.severity).toBe('warning')
  })

  it('pluralizes the failed-page tail', () => {
    const report = buildWorkbookScanReport([ok(12), bad('timeout'), bad('timeout')])!
    expect(report.text).toContain('1 of 3 pages read')
    expect(report.text).toContain('2 pages took too long to scan')
  })

  it('names the last successful position, not the first', () => {
    expect(buildWorkbookScanReport([ok(12), ok(20), bad('error')])!.text).toContain('Lesson 20')
  })
})

describe('buildWorkbookScanReport — mixed reasons lead with the count, then one reason', () => {
  it('a total failure across several pages leads with the count', () => {
    const report = buildWorkbookScanReport([bad('no-result'), bad('no-result'), bad('timeout')])!
    expect(report.text).toContain('None of the 3 pages read.')
    // The dominant reason only — never three stacked banners.
    expect(report.text).toContain("Couldn't read the workbook page")
    expect(report.text).not.toContain('took too long')
  })

  it('a partial failure with mixed reasons names only the dominant one', () => {
    const report = buildWorkbookScanReport([
      ok(12),
      bad('no-result'),
      bad('no-result'),
      bad('error'),
    ])!
    expect(report.text).toContain('1 of 4 pages read')
    // The tail covers ALL 3 unread pages under the dominant reason, so the
    // counts reconcile with the lead (1 read + 3 not = 4). The minority reason
    // is not stacked on as a second banner.
    expect(report.text).toContain("3 pages couldn't be read")
    expect(report.text).not.toContain('failed to read')
  })

  it('config-missing outranks a tie — the one reason where retrying is pointless', () => {
    expect(dominantFailure([bad('config-missing'), bad('no-result')])).toBe('config-missing')
    expect(buildWorkbookScanReport([bad('no-result'), bad('config-missing')])!.text).toContain(
      "isn't linked to a workbook",
    )
  })

  it('a strict majority beats the priority order', () => {
    expect(dominantFailure([bad('config-missing'), bad('timeout'), bad('timeout')])).toBe('timeout')
  })

  it('dominantFailure is null when nothing failed', () => {
    expect(dominantFailure([ok(1), ok(2)])).toBeNull()
  })
})
