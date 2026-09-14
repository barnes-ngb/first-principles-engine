import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FAMILY_TIME_ZONE, formatClockTime } from './clockTime'

describe('formatClockTime (UX-431)', () => {
  it('reads a stamp in the family zone, not the runtime zone', () => {
    // 2026-09-14T14:05:00Z is 9:05 AM in America/Chicago (CDT, UTC−5).
    expect(formatClockTime('2026-09-14T14:05:00Z')).toBe('9:05 AM')
  })

  it('reads a named zone rather than the runtime one', () => {
    // The answer is a property of the ARGUMENT and the named zone, never of
    // `process.env.TZ`. Asserted two ways so the claim cannot pass by accident:
    // a second named zone gives a second answer, and the default answer is the
    // family's whatever zone this runtime happens to be in.
    expect(formatClockTime('2026-09-14T14:05:00Z', 'Asia/Tokyo')).toBe('11:05 PM')
    expect(formatClockTime('2026-09-14T14:05:00Z')).toBe('9:05 AM')
  })

  it('POSITIVE CONTROL — the pattern it replaces DOES move with the runtime zone', () => {
    // `new Date(v).toLocaleTimeString(...)` is the shape copied into four files
    // today. Where the runtime is not the family's zone it gives a different
    // clock; where it happens to be, the two agree and there is nothing to
    // prove, so that case is stated rather than silently passing.
    const runtimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    const bare = new Date('2026-09-14T14:05:00Z').toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    if (runtimeZone === FAMILY_TIME_ZONE) {
      expect(bare).toBe('9:05 AM')
    } else {
      expect(bare).not.toBe('9:05 AM')
      expect(formatClockTime('2026-09-14T14:05:00Z')).toBe('9:05 AM')
    }
  })

  it('keeps midnight and noon on the right side of the meridiem', () => {
    // 05:00Z = 12:00 AM Chicago; 17:00Z = 12:00 PM Chicago.
    expect(formatClockTime('2026-09-14T05:00:00Z')).toBe('12:00 AM')
    expect(formatClockTime('2026-09-14T17:00:00Z')).toBe('12:00 PM')
  })

  it('answers null for a stamp it cannot read, rather than "Invalid Date"', () => {
    expect(formatClockTime('')).toBeNull()
    expect(formatClockTime(undefined)).toBeNull()
    expect(formatClockTime(null)).toBeNull()
    expect(formatClockTime('not a date')).toBeNull()
  })

  it('answers null for a zone the runtime does not know, never a second clock', () => {
    expect(formatClockTime('2026-09-14T14:05:00Z', 'Mars/Olympus_Mons')).toBeNull()
  })
})

// ── The Cloud Function constant this one mirrors ────────────────────────────

describe('FAMILY_TIME_ZONE stays in step with the Cloud Function', () => {
  // `DEFAULT_FAMILY_TIME_ZONE` cannot be imported here: `familyClock.ts` is not
  // in `functions/src/shared/`, the one directory both projects compile. So it
  // is read as SOURCE — the `weekHours.REVIEW_SAVE_TIME_ZONE` precedent, which
  // is this repo's standing answer where the project boundary makes one
  // definition impossible: a hand-kept copy with a test on it, never alone.
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'functions', 'src', 'ai', 'familyClock.ts'),
    'utf8',
  )
  const declared =
    /export const DEFAULT_FAMILY_TIME_ZONE = "([^"]+)"/.exec(source)?.[1] ?? ''

  it('finds the Cloud Function’s constant at all', () => {
    expect(declared).not.toBe('')
  })

  it('mirrors it', () => {
    expect(FAMILY_TIME_ZONE).toBe(declared)
  })
})
