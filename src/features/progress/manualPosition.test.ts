import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import {
  MAX_POSITION,
  parsePositionInput,
  positionFailureNotice,
  positionFieldHint,
  positionFieldLabel,
  positionSavedNotice,
} from './manualPosition'

/**
 * UX-314 — the by-hand route to a workbook position.
 *
 * The property that carries the feature: a parent may move a row BACKWARDS.
 * Scans are advance-only on purpose, and that rule must not also stop a person
 * correcting a number they can see is wrong.
 */

const book = (over: Partial<ActivityConfig> = {}) =>
  ({
    name: 'Math K',
    currentPosition: 14,
    totalUnits: 60,
    ...over,
  }) as ActivityConfig

describe('parsePositionInput', () => {
  it('reads a whole number', () => {
    expect(parsePositionInput('14', book())).toEqual({ ok: true, position: 14 })
  })

  it('ignores surrounding whitespace', () => {
    expect(parsePositionInput('  9 ', book())).toEqual({ ok: true, position: 9 })
  })

  it('accepts a position BELOW the current one — a correction may go backwards', () => {
    // The whole point. `syncScanToConfig` writes only when
    // `lessonNumber > current`, which stops a stale PHOTO rewinding a record;
    // it must not stop a person fixing it.
    expect(parsePositionInput('3', book({ currentPosition: 40 }))).toEqual({
      ok: true,
      position: 3,
    })
  })

  it('accepts the last unit of the book', () => {
    expect(parsePositionInput('60', book())).toEqual({ ok: true, position: 60 })
  })

  it('refuses a blank field, without shouting', () => {
    const out = parsePositionInput('   ', book())
    expect(out.ok).toBe(false)
    expect(out).toMatchObject({ error: expect.stringMatching(/type the number/i) })
  })

  it('refuses anything that is not a whole number', () => {
    for (const raw of ['14.5', '-3', 'fourteen', '1e3', '12a', '+5']) {
      expect(parsePositionInput(raw, book()).ok).toBe(false)
    }
  })

  it('refuses zero — a position is where you ARE, and there is no lesson 0', () => {
    expect(parsePositionInput('0', book()).ok).toBe(false)
  })

  it('refuses a position past the end of a book that knows its length', () => {
    const out = parsePositionInput('61', book())
    expect(out.ok).toBe(false)
    // Names the total AND offers the thing she probably meant.
    expect(out).toMatchObject({ error: expect.stringContaining('60') })
    expect(out).toMatchObject({ error: expect.stringMatching(/mark it complete/i) })
  })

  it('allows any position on a book with no stated total', () => {
    expect(parsePositionInput('300', book({ totalUnits: undefined })).ok).toBe(true)
  })

  it('still refuses a typo-sized number with no total', () => {
    const out = parsePositionInput(String(MAX_POSITION + 1), book({ totalUnits: undefined }))
    expect(out.ok).toBe(false)
  })

  it("uses the row's own unit word when refusing", () => {
    const out = parsePositionInput('99', book({ totalUnits: 20, unitLabel: 'chapter' }))
    expect(out).toMatchObject({ error: expect.stringContaining('chapters') })
  })
})

describe('what the field is called', () => {
  it('says lesson by default', () => {
    expect(positionFieldLabel(book())).toBe('Current lesson')
  })

  it("uses the row's own unit label", () => {
    expect(positionFieldLabel(book({ unitLabel: 'chapter' }))).toBe('Current chapter')
  })

  it('falls back when the stored label is blank', () => {
    expect(positionFieldLabel(book({ unitLabel: '   ' }))).toBe('Current lesson')
  })

  it('names the total in the hint when the row knows one', () => {
    expect(positionFieldHint(book())).toContain('60')
  })

  it('promises no total it does not have', () => {
    expect(positionFieldHint(book({ totalUnits: undefined }))).not.toMatch(/\d/)
  })
})

describe('what she reads afterwards', () => {
  it('shows BOTH numbers, because she is overriding what the app believed', () => {
    expect(positionSavedNotice(book({ currentPosition: 8 }), 14)).toBe('Math K: lesson 8 → 14.')
  })

  it('shows one number when there was nothing to move from', () => {
    expect(positionSavedNotice(book({ currentPosition: undefined }), 14)).toBe(
      'Math K is at lesson 14.',
    )
  })

  it('does not draw an arrow when nothing moved', () => {
    expect(positionSavedNotice(book({ currentPosition: 14 }), 14)).not.toContain('→')
  })

  it("says the row is STILL WHERE IT WAS when the write failed", () => {
    // The failure to avoid is her believing a correction was recorded.
    expect(positionFailureNotice(book())).toMatch(/still where it was/i)
  })
})
