import { describe, expect, it } from 'vitest'

import { isLinkEvidenceType } from './linkEvidence.js'

describe('isLinkEvidenceType — link vs file evidence (UX-285)', () => {
  it('returns true for "video"', () => {
    expect(isLinkEvidenceType('video')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isLinkEvidenceType('Video')).toBe(true)
    expect(isLinkEvidenceType('VIDEO')).toBe(true)
  })

  it('tolerates leading/trailing whitespace', () => {
    expect(isLinkEvidenceType('  video  ')).toBe(true)
  })

  it('returns false for Photo', () => {
    expect(isLinkEvidenceType('Photo')).toBe(false)
  })

  it('returns false for Audio', () => {
    expect(isLinkEvidenceType('Audio')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isLinkEvidenceType('')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isLinkEvidenceType(undefined)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isLinkEvidenceType(null)).toBe(false)
  })
})
