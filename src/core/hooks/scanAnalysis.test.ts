import { describe, expect, it } from 'vitest'

import {
  readScanAnalysis,
  ScanFailureKind,
  SCAN_FAILURE_MESSAGE,
} from './scanAnalysis'

/**
 * UX-311. The scan reply reader: tolerant about wrapping, strict about shape.
 *
 * The property that matters most is the pair — a fenced analysis must now be
 * READ, and a refusal must still be REFUSED. Widening the parse without keeping
 * the second half would store `results: null` and report success, which is worse
 * than the one sentence this replaces.
 */

const ANALYSIS = {
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: 'two-digit addition with regrouping',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
}

describe('readScanAnalysis — the wrapping it now forgives', () => {
  it('reads a clean analysis, unchanged', () => {
    const out = readScanAnalysis(JSON.stringify(ANALYSIS), 'end_turn')
    expect(out.results).toMatchObject({ pageType: 'worksheet', subject: 'math' })
    expect(out.kind).toBeUndefined()
    expect(out.message).toBeUndefined()
  })

  it('reads an analysis wrapped in a markdown fence', () => {
    const out = readScanAnalysis(
      '```json\n' + JSON.stringify(ANALYSIS) + '\n```',
      'end_turn',
    )
    expect(out.results).toMatchObject({ pageType: 'worksheet' })
    expect(out.kind).toBeUndefined()
  })

  it('reads an analysis behind a conversational preamble', () => {
    const out = readScanAnalysis(
      `Here is the analysis of the page:\n${JSON.stringify(ANALYSIS)}\nHope that helps!`,
      'end_turn',
    )
    expect(out.results).toMatchObject({ pageType: 'worksheet' })
  })

  it('reads a certificate page', () => {
    const out = readScanAnalysis(JSON.stringify({ pageType: 'certificate', level: '1' }))
    expect(out.results).toMatchObject({ pageType: 'certificate' })
  })

  it('keeps a complete analysis that merely stopped at the token budget', () => {
    // A reply can hit `max_tokens` on trailing prose and still carry whole JSON.
    // That is a usable analysis, not a failure — which is why truncation is
    // checked after the parse, not before it.
    const out = readScanAnalysis(JSON.stringify(ANALYSIS) + '\n\nOne more th', 'max_tokens')
    expect(out.results).toMatchObject({ pageType: 'worksheet' })
    expect(out.kind).toBeUndefined()
  })
})

describe('readScanAnalysis — the shape it still refuses', () => {
  it('refuses a refusal, and does not call it a parse failure', () => {
    const out = readScanAnalysis("I'm not able to help with analysing this image.", 'refusal')
    expect(out.results).toBeNull()
    expect(out.kind).toBe(ScanFailureKind.Refused)
    // The whole point: not "try that page again".
    expect(out.message).not.toMatch(/try that page again/i)
    expect(out.message).toMatch(/different photo/i)
  })

  it('refuses a POLITE refusal even though it is prose we could not parse anyway', () => {
    // Named by stop_reason before the text is examined, so a declined analysis
    // is never reported as an unreadable one.
    const out = readScanAnalysis('I cannot analyse pictures of children.', 'refusal')
    expect(out.kind).toBe(ScanFailureKind.Refused)
  })

  it("names a truncated reply as cut short, not unreadable", () => {
    const out = readScanAnalysis('{"pageType":"worksheet","subject":"ma', 'max_tokens')
    expect(out.results).toBeNull()
    expect(out.kind).toBe(ScanFailureKind.CutShort)
    expect(out.message).toMatch(/cut off/i)
  })

  it("names the CF's own error envelope as undelivered, and never as an analysis", () => {
    // The bug this closes: `{"error": …}` is valid JSON, and `isWorksheetScan`
    // is `pageType !== 'certificate'`, so it used to read as a worksheet and be
    // applied to the curriculum.
    const out = readScanAnalysis(JSON.stringify({ error: 'imageBase64 is required' }))
    expect(out.results).toBeNull()
    expect(out.kind).toBe(ScanFailureKind.NotDelivered)
    expect(out.message).toMatch(/connection/i)
  })

  it('refuses valid JSON that carries no pageType', () => {
    const out = readScanAnalysis(JSON.stringify({ subject: 'math', notes: 'hello' }))
    expect(out.results).toBeNull()
    expect(out.kind).toBe(ScanFailureKind.Unreadable)
  })

  it('refuses a pageType the app does not know', () => {
    const out = readScanAnalysis(JSON.stringify({ ...ANALYSIS, pageType: 'invoice' }))
    expect(out.results).toBeNull()
  })

  it('refuses an empty reply', () => {
    expect(readScanAnalysis('', 'end_turn').kind).toBe(ScanFailureKind.Unreadable)
    expect(readScanAnalysis(null).kind).toBe(ScanFailureKind.Unreadable)
    expect(readScanAnalysis(undefined).kind).toBe(ScanFailureKind.Unreadable)
  })

  it('reports an empty reply that ran out of budget as cut short', () => {
    const out = readScanAnalysis('', 'max_tokens')
    expect(out.kind).toBe(ScanFailureKind.CutShort)
  })

  it('refuses a bare JSON array', () => {
    const out = readScanAnalysis('[1,2,3]')
    expect(out.results).toBeNull()
  })
})

describe('readScanAnalysis — what it tells the parent and the log', () => {
  it('keeps FIX-214’s exact sentence for the case it was written for', () => {
    expect(SCAN_FAILURE_MESSAGE[ScanFailureKind.Unreadable]).toBe(
      "The analysis came back in a form the app couldn't read. Nothing was added to the curriculum — try that page again.",
    )
  })

  it('says nothing was added to the curriculum on every failure', () => {
    for (const kind of Object.values(ScanFailureKind)) {
      expect(SCAN_FAILURE_MESSAGE[kind]).toMatch(/nothing was (added|analysed)/i)
    }
  })

  it('gives every failure its own distinct sentence', () => {
    const messages = Object.values(ScanFailureKind).map((k) => SCAN_FAILURE_MESSAGE[k])
    expect(new Set(messages).size).toBe(messages.length)
  })

  it("never puts the model's own text in the message or the log detail", () => {
    // The reply may echo the child's page, so it stays on the scan record.
    const secret = 'Lincoln wrote his full name here and it is PRIVATE'
    for (const stop of ['refusal', 'max_tokens', 'end_turn', undefined]) {
      const out = readScanAnalysis(secret, stop)
      expect(out.message ?? '').not.toContain('PRIVATE')
      expect(out.detail ?? '').not.toContain('PRIVATE')
    }
  })

  it('treats an unknown stopReason as unknown, never as success', () => {
    const out = readScanAnalysis('not json at all', undefined)
    expect(out.results).toBeNull()
    expect(out.detail).toContain('unknown')
  })
})
