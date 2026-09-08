import { describe, expect, it } from 'vitest'

import {
  SCAN_MEDIA_TYPES,
  describeImageFormat,
  isScanMediaType,
  unsupportedFormatMessage,
} from './scanImageFormat'

describe('scanImageFormat — UX-278', () => {
  it('accepts exactly the four formats the vision call declares', () => {
    // Mirrors `callClaudeWithVision`'s mediaType union in
    // functions/src/ai/chatTypes.ts — if that widens, this fails first.
    expect([...SCAN_MEDIA_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ])
  })

  it('recognises the supported types, case-insensitively', () => {
    for (const t of SCAN_MEDIA_TYPES) expect(isScanMediaType(t)).toBe(true)
    expect(isScanMediaType('IMAGE/PNG')).toBe(true)
  })

  it('never treats an unrecognised type as supported', () => {
    for (const t of [
      'image/heic',
      'image/heif',
      'image/avif',
      'image/bmp',
      'image/svg+xml',
      'application/pdf',
      '',
      null,
      undefined,
    ]) {
      expect(isScanMediaType(t)).toBe(false)
    }
  })

  it('names the format for the refusal sentence', () => {
    expect(describeImageFormat('image/heic')).toBe('HEIC')
    expect(describeImageFormat('image/heic-sequence')).toBe('HEIC')
    expect(describeImageFormat('image/svg+xml')).toBe('SVG')
    expect(describeImageFormat('image/avif')).toBe('AVIF')
  })

  it('falls back to the extension when the picker sent no type', () => {
    expect(describeImageFormat('', 'IMG_0042.HEIC')).toBe('HEIC')
    expect(describeImageFormat(null, 'scan.avif')).toBe('AVIF')
  })

  it('names nothing rather than printing an empty label', () => {
    expect(describeImageFormat('', 'noextension')).toBeNull()
    expect(describeImageFormat(null, null)).toBeNull()
    expect(unsupportedFormatMessage(null, null)).toContain('does not recognise')
  })

  it('the refusal names the format, what works, and one thing to do', () => {
    const msg = unsupportedFormatMessage('image/heic', 'IMG_0042.heic')
    expect(msg).toContain('HEIC')
    expect(msg).toContain('JPEG')
    expect(msg).toMatch(/camera/i)
    // Never the sentence that told the owner nothing.
    expect(msg).not.toMatch(/try again\.?$/i)
  })

  it('carries no file name, path or URL into the message', () => {
    const msg = unsupportedFormatMessage('image/heic', 'lincoln-math-page.heic')
    expect(msg).not.toContain('lincoln')
    expect(msg).not.toContain('.heic')
  })
})
