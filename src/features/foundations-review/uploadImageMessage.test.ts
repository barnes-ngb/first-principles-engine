import { describe, expect, it } from 'vitest'
import {
  buildUploadMessageContent,
  parseImageMarkers,
  stripImageMarkers,
} from './uploadImageMessage'

describe('buildUploadMessageContent', () => {
  it('wraps a single URL as a leading marker before the context text', () => {
    const result = buildUploadMessageContent(
      ['https://storage.example.com/img1.jpg'],
      'Fast Phonics page 42',
    )
    expect(result).toBe(
      '[IMAGE_URL:https://storage.example.com/img1.jpg]\nFast Phonics page 42',
    )
  })

  it('concatenates multiple URL markers without separators', () => {
    const result = buildUploadMessageContent(
      ['https://a.com/1.jpg', 'https://b.com/2.png'],
      'Two pages of handwriting',
    )
    expect(result).toBe(
      '[IMAGE_URL:https://a.com/1.jpg][IMAGE_URL:https://b.com/2.png]\nTwo pages of handwriting',
    )
  })

  it('trims whitespace from the context text', () => {
    const result = buildUploadMessageContent(
      ['https://a.com/x.jpg'],
      '  leading and trailing spaces  ',
    )
    expect(result).toContain('\nleading and trailing spaces')
  })

  it('handles empty URL array — just the context text', () => {
    const result = buildUploadMessageContent([], 'No photos')
    expect(result).toBe('\nNo photos')
  })
})

describe('parseImageMarkers', () => {
  it('extracts a single image URL and returns the remaining text', () => {
    const input =
      '[IMAGE_URL:https://storage.example.com/img1.jpg]\nFast Phonics page 42'
    const { urls, text } = parseImageMarkers(input)
    expect(urls).toEqual(['https://storage.example.com/img1.jpg'])
    expect(text).toBe('Fast Phonics page 42')
  })

  it('extracts multiple image URLs in order', () => {
    const input =
      '[IMAGE_URL:https://a.com/1.jpg][IMAGE_URL:https://b.com/2.png]\nTwo pages'
    const { urls, text } = parseImageMarkers(input)
    expect(urls).toEqual(['https://a.com/1.jpg', 'https://b.com/2.png'])
    expect(text).toBe('Two pages')
  })

  it('returns empty urls array when no markers are present', () => {
    const { urls, text } = parseImageMarkers('Just plain text, no images')
    expect(urls).toEqual([])
    expect(text).toBe('Just plain text, no images')
  })

  it('round-trips with buildUploadMessageContent', () => {
    const originalUrls = [
      'https://firebasestorage.googleapis.com/v0/b/abc/o/photo1.jpg?alt=media',
      'https://firebasestorage.googleapis.com/v0/b/abc/o/photo2.jpg?alt=media',
    ]
    const originalContext = 'These are spelling dictation pages'
    const message = buildUploadMessageContent(originalUrls, originalContext)
    const { urls, text } = parseImageMarkers(message)
    expect(urls).toEqual(originalUrls)
    expect(text).toBe(originalContext)
  })
})

describe('stripImageMarkers', () => {
  it('removes all markers and trims the result', () => {
    const input =
      '[IMAGE_URL:https://a.com/1.jpg][IMAGE_URL:https://b.com/2.png]\nHello'
    expect(stripImageMarkers(input)).toBe('Hello')
  })

  it('returns the original text unchanged when no markers exist', () => {
    expect(stripImageMarkers('No markers here')).toBe('No markers here')
  })

  it('trims leading/trailing whitespace after marker removal', () => {
    const input = '  [IMAGE_URL:https://a.com/x.jpg]  \n  context  '
    const result = stripImageMarkers(input)
    expect(result).toBe('context')
  })
})
