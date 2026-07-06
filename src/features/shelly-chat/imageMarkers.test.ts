import { describe, expect, it } from 'vitest'
import { buildImageMarkers, buildImageMessageContent, MAX_UPLOAD_FILES } from './imageMarkers'

describe('shelly image markers (FEAT-59 multi-upload)', () => {
  it('builds N markers from N URLs', () => {
    const urls = ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']
    expect(buildImageMarkers(urls)).toBe(
      '[IMAGE_URL:https://x/a.jpg][IMAGE_URL:https://x/b.jpg][IMAGE_URL:https://x/c.jpg]',
    )
  })

  it('a single URL is identical to the prior single-image marker', () => {
    expect(buildImageMessageContent(['https://x/a.jpg'], 'these are Fast Phonics')).toBe(
      '[IMAGE_URL:https://x/a.jpg]\nthese are Fast Phonics',
    )
  })

  it('N images share ONE trailing context line (one context covers the batch)', () => {
    const content = buildImageMessageContent(
      ['https://x/1.jpg', 'https://x/2.jpg'],
      'both are Lincoln Fast Phonics screens',
    )
    // exactly N markers, then a single newline + the one context line
    const markerCount = (content.match(/\[IMAGE_URL:/g) ?? []).length
    expect(markerCount).toBe(2)
    expect(content).toBe(
      '[IMAGE_URL:https://x/1.jpg][IMAGE_URL:https://x/2.jpg]\nboth are Lincoln Fast Phonics screens',
    )
  })

  it('no URLs → plain text (unchanged path)', () => {
    expect(buildImageMessageContent([], 'just a question')).toBe('just a question')
    expect(buildImageMarkers([])).toBe('')
  })

  it('caps at a sensible batch size', () => {
    expect(MAX_UPLOAD_FILES).toBe(6)
  })
})
