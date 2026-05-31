import { describe, it, expect } from 'vitest'
import { parseFollowUps } from './parseFollowups'

describe('parseFollowUps', () => {
  it('returns the text unchanged when there are no markers', () => {
    const { cleanText, followUps } = parseFollowUps('Just a normal reply.\nSecond line.')
    expect(cleanText).toBe('Just a normal reply.\nSecond line.')
    expect(followUps).toEqual([])
  })

  it('extracts a single [FOLLOWUP] marker and strips it from the body', () => {
    const input = 'Here is some advice.\n[FOLLOWUP] What about reading?'
    const { cleanText, followUps } = parseFollowUps(input)
    expect(cleanText).toBe('Here is some advice.')
    expect(followUps).toEqual(['What about reading?'])
  })

  it('extracts multiple markers in order', () => {
    const input = [
      'Body line one.',
      'Body line two.',
      '[FOLLOWUP] First suggestion',
      '[FOLLOWUP] Second suggestion',
    ].join('\n')
    const { cleanText, followUps } = parseFollowUps(input)
    expect(cleanText).toBe('Body line one.\nBody line two.')
    expect(followUps).toEqual(['First suggestion', 'Second suggestion'])
  })

  it('caps follow-ups at three', () => {
    const input = [
      'Body.',
      '[FOLLOWUP] One',
      '[FOLLOWUP] Two',
      '[FOLLOWUP] Three',
      '[FOLLOWUP] Four',
    ].join('\n')
    const { followUps } = parseFollowUps(input)
    expect(followUps).toEqual(['One', 'Two', 'Three'])
  })

  it('trims whitespace around the suggestion text', () => {
    const { followUps } = parseFollowUps('Body.\n[FOLLOWUP]    spaced out   ')
    expect(followUps).toEqual(['spaced out'])
  })

  it('handles markers interleaved with content, preserving body order', () => {
    const input = [
      'Intro paragraph.',
      '[FOLLOWUP] Mid suggestion',
      'Closing paragraph.',
    ].join('\n')
    const { cleanText, followUps } = parseFollowUps(input)
    expect(cleanText).toBe('Intro paragraph.\nClosing paragraph.')
    expect(followUps).toEqual(['Mid suggestion'])
  })

  it('ignores a [FOLLOWUP] marker with no text after it', () => {
    // The regex requires at least one captured char, so an empty marker is left in the body.
    const input = 'Body.\n[FOLLOWUP]'
    const { cleanText, followUps } = parseFollowUps(input)
    expect(followUps).toEqual([])
    expect(cleanText).toBe('Body.\n[FOLLOWUP]')
  })

  it('trims trailing whitespace/newlines from the clean text', () => {
    const input = 'Body.\n[FOLLOWUP] A suggestion\n'
    const { cleanText } = parseFollowUps(input)
    expect(cleanText).toBe('Body.')
  })

  it('returns empty clean text when the whole message is markers', () => {
    const input = '[FOLLOWUP] Only a suggestion'
    const { cleanText, followUps } = parseFollowUps(input)
    expect(cleanText).toBe('')
    expect(followUps).toEqual(['Only a suggestion'])
  })

  it('handles an empty string', () => {
    const { cleanText, followUps } = parseFollowUps('')
    expect(cleanText).toBe('')
    expect(followUps).toEqual([])
  })
})
