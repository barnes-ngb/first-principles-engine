import { describe, expect, it } from 'vitest'

import { extractYouTubeId, isValidYouTubeId } from './youtubeId'

const ID = 'dQw4w9WgXcQ' // canonical 11-char sample

describe('isValidYouTubeId', () => {
  it('accepts exactly 11 chars of [A-Za-z0-9_-]', () => {
    expect(isValidYouTubeId(ID)).toBe(true)
    expect(isValidYouTubeId('_-Ab0123456')).toBe(true)
  })

  it('rejects wrong length and illegal chars', () => {
    expect(isValidYouTubeId('short')).toBe(false)
    expect(isValidYouTubeId('dQw4w9WgXcQextra')).toBe(false)
    expect(isValidYouTubeId('dQw4w9WgXc!')).toBe(false)
    expect(isValidYouTubeId('')).toBe(false)
  })
})

describe('extractYouTubeId', () => {
  it('accepts a bare id', () => {
    expect(extractYouTubeId(ID)).toBe(ID)
    expect(extractYouTubeId(`  ${ID}  `)).toBe(ID)
  })

  it('extracts from watch?v= urls (with extra params)', () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(extractYouTubeId(`https://youtube.com/watch?v=${ID}&t=42s`)).toBe(ID)
    expect(extractYouTubeId(`http://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('extracts from youtu.be short urls', () => {
    expect(extractYouTubeId(`https://youtu.be/${ID}`)).toBe(ID)
    expect(extractYouTubeId(`youtu.be/${ID}?si=abc`)).toBe(ID)
  })

  it('extracts from /embed/, /shorts/, /live/ urls', () => {
    expect(extractYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(extractYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(extractYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
  })

  it('extracts from youtube-nocookie.com', () => {
    expect(
      extractYouTubeId(`https://www.youtube-nocookie.com/embed/${ID}`),
    ).toBe(ID)
  })

  it('rejects non-YouTube hosts even with an 11-char segment', () => {
    expect(extractYouTubeId(`https://evil.com/watch?v=${ID}`)).toBeNull()
    expect(extractYouTubeId(`https://vimeo.com/${ID}`)).toBeNull()
    expect(extractYouTubeId(`https://notyoutube.com/embed/${ID}`)).toBeNull()
  })

  it('rejects garbage, empty, and malformed input', () => {
    expect(extractYouTubeId('')).toBeNull()
    expect(extractYouTubeId('   ')).toBeNull()
    expect(extractYouTubeId(null)).toBeNull()
    expect(extractYouTubeId(undefined)).toBeNull()
    expect(extractYouTubeId('not a url at all')).toBeNull()
    expect(extractYouTubeId('https://www.youtube.com/watch?v=tooShort')).toBeNull()
    expect(extractYouTubeId('https://www.youtube.com/')).toBeNull()
    expect(extractYouTubeId('https://youtu.be/')).toBeNull()
  })
})
