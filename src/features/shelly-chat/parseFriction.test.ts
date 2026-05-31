import { describe, expect, it } from 'vitest'
import { parseFriction } from './parseFriction'

describe('parseFriction', () => {
  it('extracts a valid friction block and strips the tag', () => {
    const raw =
      'Here are some ideas.\n<friction>{"quote": "I wish I could see all his missed words in one place", "interpretedWant": "A single view of all missed sight words"}</friction>'
    const { friction, cleanText } = parseFriction(raw)
    expect(friction).toEqual({
      quote: 'I wish I could see all his missed words in one place',
      interpretedWant: 'A single view of all missed sight words',
    })
    expect(cleanText).toBe('Here are some ideas.')
    expect(cleanText).not.toContain('<friction>')
  })

  it('parses a block wrapped in markdown fences via sanitizeAndParseJson', () => {
    const raw =
      '<friction>```json\n{"quote": "ugh", "interpretedWant": "reorder the checklist",}\n```</friction>'
    const { friction } = parseFriction(raw)
    expect(friction).toEqual({ quote: 'ugh', interpretedWant: 'reorder the checklist' })
  })

  it('returns null friction (but strips the tag) when quote is missing', () => {
    const raw = '<friction>{"interpretedWant": "something"}</friction>after'
    const { friction, cleanText } = parseFriction(raw)
    expect(friction).toBeNull()
    expect(cleanText).toBe('after')
    expect(cleanText).not.toContain('<friction>')
  })

  it('returns null friction when interpretedWant is missing', () => {
    const raw = '<friction>{"quote": "I wish..."}</friction>'
    const { friction } = parseFriction(raw)
    expect(friction).toBeNull()
  })

  it('returns null friction when quote is empty/whitespace', () => {
    const raw = '<friction>{"quote": "   ", "interpretedWant": "x"}</friction>'
    expect(parseFriction(raw).friction).toBeNull()
  })

  it('returns null friction when interpretedWant is empty/whitespace', () => {
    const raw = '<friction>{"quote": "x", "interpretedWant": "  "}</friction>'
    expect(parseFriction(raw).friction).toBeNull()
  })

  it('returns null without throwing on malformed JSON, still cleans text', () => {
    const raw = 'Oops:\n<friction>{ not valid json }</friction>\nbut here is the reply.'
    let result: ReturnType<typeof parseFriction> | undefined
    expect(() => {
      result = parseFriction(raw)
    }).not.toThrow()
    expect(result?.friction).toBeNull()
    expect(result?.cleanText).toContain('Oops:')
    expect(result?.cleanText).toContain('but here is the reply.')
    expect(result?.cleanText).not.toContain('<friction>')
  })

  it('returns { friction: null, cleanText: raw } when there is no block', () => {
    const raw = 'Just a normal reply, no friction here.'
    const { friction, cleanText } = parseFriction(raw)
    expect(friction).toBeNull()
    expect(cleanText).toBe('Just a normal reply, no friction here.')
  })

  it('strips a non-object payload block but returns null friction', () => {
    const raw = 'reply <friction>"just a string"</friction>'
    const { friction, cleanText } = parseFriction(raw)
    expect(friction).toBeNull()
    expect(cleanText).toBe('reply')
  })

  it('only captures the first block but strips all of them', () => {
    const raw =
      '<friction>{"quote": "a", "interpretedWant": "first"}</friction> mid <friction>{"quote": "b", "interpretedWant": "second"}</friction>'
    const { friction, cleanText } = parseFriction(raw)
    expect(friction).toEqual({ quote: 'a', interpretedWant: 'first' })
    expect(cleanText).not.toContain('<friction>')
    expect(cleanText).toContain('mid')
  })
})
