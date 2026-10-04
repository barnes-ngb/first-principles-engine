import { describe, expect, it } from 'vitest'

import {
  ALTERNATIVE_COST_NOTE,
  ALTERNATIVES_HEADING,
  CHAT_ALTERNATIVES_LEAD,
  FREE_EXITS_HEADING,
  ImageGenerationFailure,
  ImageRetryDoor,
  blockedTips,
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  imageFailureChatMessage,
  imageFailureMessage,
  offersAlternatives,
} from './imageGenerationFailure'
import type { ImageErrorShape } from './imageGenerationFailure'

// --- classifyImageGenerationFailure ---

describe('classifyImageGenerationFailure', () => {
  it('reads a declared failure kind from details', () => {
    const err: ImageErrorShape = {
      code: 'functions/invalid-argument',
      message: 'something',
      details: { failure: 'blocked' },
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Blocked)
  })

  it('reads every declared kind', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      const err: ImageErrorShape = { details: { failure: kind } }
      expect(classifyImageGenerationFailure(err)).toBe(kind)
    }
  })

  it('ignores unknown declared kinds and falls through', () => {
    const err: ImageErrorShape = {
      details: { failure: 'some-future-kind' },
      message: 'rate limit exceeded',
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
  })

  it('ignores non-string declared kinds', () => {
    const err: ImageErrorShape = {
      details: { failure: 42 },
      message: 'safety filter blocked',
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Blocked)
  })

  it('classifies resource-exhausted as Busy', () => {
    const err: ImageErrorShape = { code: 'functions/resource-exhausted' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
  })

  it('classifies failed-precondition as NotConfigured', () => {
    const err: ImageErrorShape = { code: 'functions/failed-precondition' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NotConfigured)
  })

  it('classifies unavailable as Offline', () => {
    const err: ImageErrorShape = { code: 'functions/unavailable' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Offline)
  })

  it('classifies deadline-exceeded as Offline', () => {
    const err: ImageErrorShape = { code: 'functions/deadline-exceeded' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Offline)
  })

  it('classifies cancelled as Offline', () => {
    const err: ImageErrorShape = { code: 'functions/cancelled' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Offline)
  })

  it('classifies invalid-argument with blocked message as Blocked', () => {
    const err: ImageErrorShape = {
      code: 'functions/invalid-argument',
      message: 'The content was blocked by safety filter',
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Blocked)
  })

  it('classifies invalid-argument without blocked message as NoImage', () => {
    const err: ImageErrorShape = {
      code: 'functions/invalid-argument',
      message: 'Missing required field',
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NoImage)
  })

  it('falls through to message text for blocked patterns', () => {
    expect(
      classifyImageGenerationFailure({ message: 'content policy violation' }),
    ).toBe(ImageGenerationFailure.Blocked)
    expect(
      classifyImageGenerationFailure({ message: 'blocked by safety' }),
    ).toBe(ImageGenerationFailure.Blocked)
    expect(
      classifyImageGenerationFailure({ message: 'content_policy_violation' }),
    ).toBe(ImageGenerationFailure.Blocked)
  })

  it('falls through to message text for rate limit patterns', () => {
    expect(
      classifyImageGenerationFailure({ message: 'rate limit exceeded' }),
    ).toBe(ImageGenerationFailure.Busy)
    expect(
      classifyImageGenerationFailure({ message: '429 Too Many Requests' }),
    ).toBe(ImageGenerationFailure.Busy)
    expect(
      classifyImageGenerationFailure({ message: 'service is busy' }),
    ).toBe(ImageGenerationFailure.Busy)
  })

  it('falls through to message text for not-configured patterns', () => {
    expect(
      classifyImageGenerationFailure({ message: 'api key not found' }),
    ).toBe(ImageGenerationFailure.NotConfigured)
    expect(
      classifyImageGenerationFailure({ message: 'organization not verified' }),
    ).toBe(ImageGenerationFailure.NotConfigured)
  })

  it('falls through to message text for offline patterns', () => {
    expect(
      classifyImageGenerationFailure({ message: 'network error' }),
    ).toBe(ImageGenerationFailure.Offline)
    expect(
      classifyImageGenerationFailure({ message: 'Failed to fetch' }),
    ).toBe(ImageGenerationFailure.Offline)
    expect(
      classifyImageGenerationFailure({ message: 'no internet connection' }),
    ).toBe(ImageGenerationFailure.Offline)
  })

  it('returns NoImage for an unrecognised message', () => {
    expect(
      classifyImageGenerationFailure({ message: 'something went wrong' }),
    ).toBe(ImageGenerationFailure.NoImage)
  })

  it('handles null', () => {
    expect(classifyImageGenerationFailure(null)).toBe(ImageGenerationFailure.NoImage)
  })

  it('handles undefined', () => {
    expect(classifyImageGenerationFailure(undefined)).toBe(ImageGenerationFailure.NoImage)
  })

  it('handles a plain Error', () => {
    expect(classifyImageGenerationFailure(new Error('boom'))).toBe(
      ImageGenerationFailure.NoImage,
    )
  })

  it('handles a plain Error with a blocked message', () => {
    expect(classifyImageGenerationFailure(new Error('blocked by safety'))).toBe(
      ImageGenerationFailure.Blocked,
    )
  })

  it('strips functions/ prefix from code', () => {
    const err: ImageErrorShape = { code: 'resource-exhausted' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
  })

  it('is case-insensitive on code', () => {
    const err: ImageErrorShape = { code: 'FUNCTIONS/RESOURCE-EXHAUSTED' }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
  })

  it('declared kind takes precedence over code', () => {
    const err: ImageErrorShape = {
      code: 'functions/resource-exhausted',
      details: { failure: 'offline' },
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Offline)
  })

  it('ignores array details', () => {
    const err: ImageErrorShape = {
      details: ['blocked'] as unknown,
      message: 'rate limit',
    }
    expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
  })
})

// --- imageFailureAlternatives ---

describe('imageFailureAlternatives', () => {
  it('returns alternatives from details', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['try this', 'or this', 'or that'] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['try this', 'or this', 'or that'])
  })

  it('trims and filters empty strings', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['  hello  ', '', '  ', 'world'] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['hello', 'world'])
  })

  it('caps at 3', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['a', 'b', 'c', 'd', 'e'] },
    }
    expect(imageFailureAlternatives(err)).toHaveLength(3)
  })

  it('filters non-string array elements', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['good', 42, null, 'also good'] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['good', 'also good'])
  })

  it('returns empty for missing alternatives', () => {
    expect(imageFailureAlternatives({ details: {} })).toEqual([])
  })

  it('returns empty for non-array alternatives', () => {
    expect(imageFailureAlternatives({ details: { alternatives: 'nope' } })).toEqual([])
  })

  it('returns empty for null error', () => {
    expect(imageFailureAlternatives(null)).toEqual([])
  })

  it('returns empty for undefined error', () => {
    expect(imageFailureAlternatives(undefined)).toEqual([])
  })
})

// --- offersAlternatives ---

describe('offersAlternatives', () => {
  it('returns true only for Blocked', () => {
    expect(offersAlternatives(ImageGenerationFailure.Blocked)).toBe(true)
  })

  it('returns false for every other kind', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      if (kind !== ImageGenerationFailure.Blocked) {
        expect(offersAlternatives(kind)).toBe(false)
      }
    }
  })
})

// --- imageFailureMessage ---

describe('imageFailureMessage', () => {
  it('returns a non-empty string for every kind × audience', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      for (const audience of ['parent', 'kid'] as const) {
        const msg = imageFailureMessage(kind, audience)
        expect(msg).toBeTruthy()
        expect(typeof msg).toBe('string')
      }
    }
  })

  it('kid messages are shorter than parent messages', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      const parent = imageFailureMessage(kind, 'parent')
      const kid = imageFailureMessage(kind, 'kid')
      expect(kid.length).toBeLessThan(parent.length)
    }
  })
})

// --- blockedTips ---

describe('blockedTips', () => {
  it('returns non-empty tips for every door × audience', () => {
    for (const door of Object.values(ImageRetryDoor)) {
      for (const audience of ['parent', 'kid'] as const) {
        const tips = blockedTips(door, audience)
        expect(tips.length).toBeGreaterThan(0)
        for (const tip of tips) {
          expect(typeof tip).toBe('string')
          expect(tip.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// --- imageFailureChatMessage ---

describe('imageFailureChatMessage', () => {
  it('for a non-blocked kind, returns just the failure message', () => {
    const msg = imageFailureChatMessage(ImageGenerationFailure.Busy, [], 'parent')
    expect(msg).toBe(imageFailureMessage(ImageGenerationFailure.Busy, 'parent'))
  })

  it('for Blocked with alternatives, includes the lead and bullet points', () => {
    const alts = ['try a forest', 'try a garden']
    const msg = imageFailureChatMessage(ImageGenerationFailure.Blocked, alts, 'parent')
    expect(msg).toContain(CHAT_ALTERNATIVES_LEAD)
    expect(msg).toContain('• try a forest')
    expect(msg).toContain('• try a garden')
  })

  it('for Blocked with no alternatives, falls back to blockedTips', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      [],
      'parent',
      ImageRetryDoor.Sticker,
    )
    const tips = blockedTips(ImageRetryDoor.Sticker, 'parent')
    for (const tip of tips) {
      expect(msg).toContain(tip)
    }
  })

  it('defaults door to Scene when not provided', () => {
    const msg = imageFailureChatMessage(ImageGenerationFailure.Blocked, [], 'parent')
    const tips = blockedTips(ImageRetryDoor.Scene, 'parent')
    for (const tip of tips) {
      expect(msg).toContain(tip)
    }
  })
})

// --- copy constants ---

describe('copy constants', () => {
  it('ALTERNATIVES_HEADING has both audiences', () => {
    expect(ALTERNATIVES_HEADING.parent).toBeTruthy()
    expect(ALTERNATIVES_HEADING.kid).toBeTruthy()
  })

  it('ALTERNATIVE_COST_NOTE has both audiences', () => {
    expect(ALTERNATIVE_COST_NOTE.parent).toBeTruthy()
    expect(ALTERNATIVE_COST_NOTE.kid).toBeTruthy()
  })

  it('FREE_EXITS_HEADING has both audiences', () => {
    expect(FREE_EXITS_HEADING.parent).toBeTruthy()
    expect(FREE_EXITS_HEADING.kid).toBeTruthy()
  })
})
