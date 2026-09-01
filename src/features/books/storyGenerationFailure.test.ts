import { describe, expect, it } from 'vitest'

import {
  classifyStoryGenerationFailure,
  looksCutShort,
  STORY_GENERATION_FAILURE_MESSAGES,
  StoryGenerationFailure,
  storyGenerationFailureMessage,
} from './storyGenerationFailure'

const story = { title: 'T', pages: [] }
const storyJson = JSON.stringify({ title: 'T', pages: [{ pageNumber: 1, text: 'Hi.' }] })

describe('classifyStoryGenerationFailure (FEAT-169 — a failure that names itself)', () => {
  it('is null when a story parsed, whatever the stop reason said', () => {
    expect(classifyStoryGenerationFailure({ message: storyJson }, story)).toBeNull()
    expect(
      classifyStoryGenerationFailure({ message: storyJson, stopReason: 'max_tokens' }, story),
    ).toBeNull()
  })

  it('a call that returned nothing is "no-reply" — the network / timeout case', () => {
    expect(classifyStoryGenerationFailure(null, null)).toBe(StoryGenerationFailure.NoReply)
    expect(classifyStoryGenerationFailure(undefined, null)).toBe(StoryGenerationFailure.NoReply)
  })

  it('an empty reply with no max_tokens stop is "no-reply", not "cut short"', () => {
    expect(classifyStoryGenerationFailure({ message: '' }, null)).toBe(
      StoryGenerationFailure.NoReply,
    )
    expect(classifyStoryGenerationFailure({ message: '   ', stopReason: 'end_turn' }, null)).toBe(
      StoryGenerationFailure.NoReply,
    )
  })

  it('a max_tokens stop is "cut short" — even when the model emitted no visible text (reasoning ate the budget)', () => {
    expect(classifyStoryGenerationFailure({ message: '', stopReason: 'max_tokens' }, null)).toBe(
      StoryGenerationFailure.CutShort,
    )
    const truncated = storyJson.slice(0, storyJson.length - 20)
    expect(
      classifyStoryGenerationFailure({ message: truncated, stopReason: 'max_tokens' }, null),
    ).toBe(StoryGenerationFailure.CutShort)
  })

  it('falls back to the JSON shape when the reply carries no stopReason (older deploy)', () => {
    const truncated = storyJson.slice(0, storyJson.length - 20)
    expect(classifyStoryGenerationFailure({ message: truncated }, null)).toBe(
      StoryGenerationFailure.CutShort,
    )
  })

  it('a complete reply that is not a story is "unreadable"', () => {
    expect(
      classifyStoryGenerationFailure({ message: 'Sorry, I cannot do that.', stopReason: 'end_turn' }, null),
    ).toBe(StoryGenerationFailure.Unreadable)
    expect(classifyStoryGenerationFailure({ message: '{"title":"only"}' }, null)).toBe(
      StoryGenerationFailure.Unreadable,
    )
  })
})

describe('looksCutShort', () => {
  it('is true for a JSON object that opens and never closes', () => {
    expect(looksCutShort('{"title": "T", "pages": [{"pageNumber": 1, "te')).toBe(true)
    expect(looksCutShort('```json\n{"title": "T", "pages": [')).toBe(true)
  })

  it('is false for closed JSON and for prose', () => {
    expect(looksCutShort('{"title": "T"}')).toBe(false)
    expect(looksCutShort('```json\n{"a":1}\n```')).toBe(false)
    expect(looksCutShort('I had a thought about that story.')).toBe(false)
    expect(looksCutShort('')).toBe(false)
  })
})

describe('the three messages (house shape: what failed, nothing was lost, what to do)', () => {
  it('are three distinct strings — no two failures share a message', () => {
    const values = Object.values(STORY_GENERATION_FAILURE_MESSAGES)
    expect(new Set(values).size).toBe(3)
  })

  it.each(Object.values(StoryGenerationFailure))('%s says nothing was lost and what to do next', (kind) => {
    const msg = storyGenerationFailureMessage(kind)
    expect(msg).toMatch(/nothing was lost/i)
    expect(msg).toMatch(/yes, start my story/i)
  })

  it('the cut-short message suggests a shorter book; the no-reply message suggests the connection', () => {
    expect(storyGenerationFailureMessage(StoryGenerationFailure.CutShort)).toMatch(/short book/i)
    expect(storyGenerationFailureMessage(StoryGenerationFailure.NoReply)).toMatch(/connection/i)
    expect(storyGenerationFailureMessage(StoryGenerationFailure.Unreadable)).not.toMatch(/connection/i)
  })

  it('none of them is the old catch-all', () => {
    for (const msg of Object.values(STORY_GENERATION_FAILURE_MESSAGES)) {
      expect(msg).not.toBe('I had trouble writing that. Try again?')
    }
  })
})
