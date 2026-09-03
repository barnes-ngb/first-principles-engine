import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ chat: chatMock, loading: false, error: null }),
  TaskType: { GenerateStory: 'generateStory' },
}))

import { useStoryGenerator } from './useStoryGenerator'

const STORY = {
  title: 'The Cat',
  pages: [
    { pageNumber: 1, text: 'The cat sat.', sightWordsOnPage: ['the'] },
    { pageNumber: 2, text: 'The cat ran to the castle.', sightWordsOnPage: ['the', 'to'] },
  ],
  allSightWordsUsed: ['the', 'to'],
  missedWords: [],
}

function hook() {
  return renderHook(() => useStoryGenerator()).result.current
}

beforeEach(() => {
  chatMock.mockReset()
})

// UX-117 — `JSON.parse` ran outside any `try` and `handleGenerate` had no
// `catch`, so a reply cut short by the output budget — the exact failure Shelly
// hit twice — became an unhandled rejection. The button un-spun, `genError`
// stayed null, and the screen was unchanged.

describe('UX-117 — a failed generation names itself', () => {
  it('names a reply that ran out of room, not a generic error', async () => {
    chatMock.mockResolvedValue({ message: '{"title":"The Cat","pages":[{"pageN', stopReason: 'max_tokens' })
    const { generateStory } = hook()
    await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.toThrow(
      /ran out of room/i,
    )
  })

  it('names a reply that never arrived', async () => {
    chatMock.mockResolvedValue(null)
    const { generateStory } = hook()
    await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.toThrow(
      /didn't come back/i,
    )
  })

  it('names a thrown call', async () => {
    chatMock.mockRejectedValue(new Error('network'))
    const { generateStory } = hook()
    await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.toThrow(
      /didn't come back/i,
    )
  })

  it('names a reply it cannot read', async () => {
    chatMock.mockResolvedValue({ message: 'Sure! Here is a lovely story about a cat.' })
    const { generateStory } = hook()
    await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.toThrow(
      /shape I couldn't read/i,
    )
  })

  it('points at THIS screen\'s button, never the chat\'s', async () => {
    chatMock.mockResolvedValue({ message: 'not json' })
    const { generateStory } = hook()
    await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.toThrow(
      /"Make the story"/,
    )
    await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.not.toThrow(
      /Yes, start my story/,
    )
  })

  it('every message says nothing was lost', async () => {
    for (const reply of [null, { message: '' }, { message: 'nope' }, { message: '{"a', stopReason: 'max_tokens' }]) {
      chatMock.mockResolvedValue(reply)
      const { generateStory } = hook()
      await expect(generateStory('f1', 'c1', ['the'], 'cats', 6)).rejects.toThrow(
        /Nothing was lost: your words are still here/,
      )
    }
  })
})

describe('UX-117 — the honest line reaches this surface too', () => {
  it('carries the server\'s measurement through instead of dropping it', async () => {
    const readability = {
      passed: false,
      levelSource: 'age' as const,
      phonicsLevel: 2,
      hardWords: [{ page: 2, word: 'castle' }],
      hardWordCount: 1,
      revised: false,
    }
    chatMock.mockResolvedValue({ message: JSON.stringify(STORY), readability })
    const { generateStory } = hook()
    const result = await generateStory('f1', 'c1', ['the'], 'cats', 6)
    expect(result.readability).toEqual(readability)
  })

  it('leaves readability undefined when the server did not measure', async () => {
    chatMock.mockResolvedValue({ message: JSON.stringify(STORY) })
    const { generateStory } = hook()
    const result = await generateStory('f1', 'c1', ['the'], 'cats', 6)
    expect(result.readability).toBeUndefined()
    expect(result.title).toBe('The Cat')
  })

  it('reads a story wrapped in markdown fences, as it always did', async () => {
    chatMock.mockResolvedValue({ message: '```json\n' + JSON.stringify(STORY) + '\n```' })
    const { generateStory } = hook()
    expect((await generateStory('f1', 'c1', ['the'], 'cats', 6)).title).toBe('The Cat')
  })
})
