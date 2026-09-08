import { describe, expect, it } from 'vitest'

import { ScanDoor, scanFailureNote } from './scanFailureNote'
import { redactText } from '../observability/scrubError'

/**
 * UX-276 — what a reported scan failure carries. The rule: the SHAPE of the
 * picture, never the picture, and never anything naming a child.
 */
describe('scanFailureNote', () => {
  it('carries the door, the declared type, the size and what we sent', () => {
    const note = scanFailureNote(ScanDoor.Curriculum, {
      inputType: 'image/heic',
      sizeBytes: 2_200_000,
      converted: false,
      sentType: null,
    })
    expect(note).toContain('door=scan-curriculum')
    expect(note).toContain('in=image/heic')
    expect(note).toContain('2.10MB')
    expect(note).toContain('converted=no')
    expect(note).toContain('sent=none')
  })

  it('survives the scrubber intact — no quotes, URLs or long digit runs', () => {
    const note = scanFailureNote(ScanDoor.Capture, {
      inputType: 'image/png',
      sizeBytes: 3_456_789,
      converted: true,
      sentType: 'image/jpeg',
    })
    expect(redactText(note, ['Lincoln', 'London'])).toBe(note)
  })

  it('says so plainly when it does not know the size', () => {
    const note = scanFailureNote(ScanDoor.Certificate, { sizeBytes: null })
    expect(note).toContain('unknown')
    expect(note).toContain('in=none')
  })

  it('reduces an odd type to shape rather than passing it through', () => {
    const note = scanFailureNote(ScanDoor.Certificate, {
      inputType: 'image/"lincoln-math"',
    })
    expect(note).toContain('in=other')
    expect(note).not.toContain('lincoln')
  })

  it('reports bytes and KB without a four-digit run', () => {
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 500 })).toContain('500B')
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 200_000 })).toContain('195KB')
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1_040_000 })).toContain('0.99MB')
  })

  it('promotes the boundary sizes rather than printing four digits (round 3)', () => {
    // Choosing the unit before rounding printed "1000B".."1023B" and, just
    // under 1000 KiB, "1000KB" — both of which the scrubber eats as [num].
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1000 })).toContain('1KB')
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1023 })).toContain('1KB')
    // The last KB value that still fits in three digits, then the first that
    // would have printed "1000KB" and is promoted instead.
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1_023_487 })).toContain('999KB')
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1_024_000 })).toContain('0.98MB')
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1_048_575 })).toContain('1.00MB')
  })

  it('no size the helper can print is eaten by the scrubber', () => {
    // Every boundary, every decade, and the far end — the contract is that the
    // note survives `redactText` unchanged, so assert it over the range.
    const sizes = [
      0, 1, 999, 1000, 1023, 1024, 1025, 9999, 10_000, 511_999, 1_023_487, 1_048_575, 1_048_576,
      5_000_000, 25_000_000, 999_000_000, 1_073_741_824, 5_000_000_000,
    ]
    for (const sizeBytes of sizes) {
      const note = scanFailureNote(ScanDoor.Capture, { inputType: 'image/heic', sizeBytes })
      expect({ sizeBytes, note: redactText(note, ['Lincoln']) }).toEqual({ sizeBytes, note })
    }
  })
})
