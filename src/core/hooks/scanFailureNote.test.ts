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
    // 1000KB and up rolls to MB, so no "1023KB" four-digit run ever prints.
    expect(scanFailureNote(ScanDoor.Capture, { sizeBytes: 1_040_000 })).toContain('0.99MB')
  })
})
