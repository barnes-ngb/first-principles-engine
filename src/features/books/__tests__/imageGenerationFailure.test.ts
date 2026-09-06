import { describe, it, expect } from 'vitest'
import {
  blockedTips,
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  imageFailureChatMessage,
  imageFailureMessage,
  ImageGenerationFailure,
  ImageRetryDoor,
  offersAlternatives,
} from '../imageGenerationFailure'
import type { ImageErrorShape } from '../imageGenerationFailure'

// ── classifyImageGenerationFailure ──────────────────────────────

describe('classifyImageGenerationFailure', () => {
  describe('reads the declared kind first', () => {
    it('returns blocked when details.failure is "blocked"', () => {
      const err: ImageErrorShape = {
        code: 'functions/internal',
        message: 'something else',
        details: { failure: 'blocked' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Blocked)
    })

    it('returns busy when details.failure is "busy"', () => {
      const err: ImageErrorShape = {
        details: { failure: 'busy' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
    })

    it('returns not-configured when details.failure is "not-configured"', () => {
      const err: ImageErrorShape = {
        details: { failure: 'not-configured' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NotConfigured)
    })

    it('returns offline when details.failure is "offline"', () => {
      const err: ImageErrorShape = {
        details: { failure: 'offline' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Offline)
    })

    it('returns no-image when details.failure is "no-image"', () => {
      const err: ImageErrorShape = {
        details: { failure: 'no-image' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NoImage)
    })
  })

  describe('falls back to callable code', () => {
    it('resource-exhausted → busy', () => {
      expect(
        classifyImageGenerationFailure({ code: 'functions/resource-exhausted' }),
      ).toBe(ImageGenerationFailure.Busy)
    })

    it('failed-precondition → not-configured', () => {
      expect(
        classifyImageGenerationFailure({ code: 'functions/failed-precondition' }),
      ).toBe(ImageGenerationFailure.NotConfigured)
    })

    it('unavailable → offline', () => {
      expect(
        classifyImageGenerationFailure({ code: 'functions/unavailable' }),
      ).toBe(ImageGenerationFailure.Offline)
    })

    it('deadline-exceeded → offline', () => {
      expect(
        classifyImageGenerationFailure({ code: 'functions/deadline-exceeded' }),
      ).toBe(ImageGenerationFailure.Offline)
    })

    it('cancelled → offline', () => {
      expect(
        classifyImageGenerationFailure({ code: 'cancelled' }),
      ).toBe(ImageGenerationFailure.Offline)
    })

    it('invalid-argument with blocked text → blocked', () => {
      expect(
        classifyImageGenerationFailure({
          code: 'functions/invalid-argument',
          message: 'Content blocked by safety filter',
        }),
      ).toBe(ImageGenerationFailure.Blocked)
    })

    it('invalid-argument without blocked text → no-image', () => {
      expect(
        classifyImageGenerationFailure({
          code: 'functions/invalid-argument',
          message: 'Invalid parameters',
        }),
      ).toBe(ImageGenerationFailure.NoImage)
    })
  })

  describe('falls back to message text', () => {
    it('blocked in message → blocked', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Request was blocked by content policy' }),
      ).toBe(ImageGenerationFailure.Blocked)
    })

    it('content_policy in message → blocked', () => {
      expect(
        classifyImageGenerationFailure({ message: 'content_policy_violation error' }),
      ).toBe(ImageGenerationFailure.Blocked)
    })

    it('rate limit in message → busy', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Rate limit exceeded' }),
      ).toBe(ImageGenerationFailure.Busy)
    })

    it('429 in message → busy', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Error 429: too many requests' }),
      ).toBe(ImageGenerationFailure.Busy)
    })

    it('api key in message → not-configured', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Missing API key' }),
      ).toBe(ImageGenerationFailure.NotConfigured)
    })

    it('network error in message → offline', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Network error: failed to fetch' }),
      ).toBe(ImageGenerationFailure.Offline)
    })

    it('offline in message → offline', () => {
      expect(
        classifyImageGenerationFailure({ message: 'The device appears offline' }),
      ).toBe(ImageGenerationFailure.Offline)
    })
  })

  describe('edge cases', () => {
    it('returns no-image for null', () => {
      expect(classifyImageGenerationFailure(null)).toBe(ImageGenerationFailure.NoImage)
    })

    it('returns no-image for undefined', () => {
      expect(classifyImageGenerationFailure(undefined)).toBe(ImageGenerationFailure.NoImage)
    })

    it('returns no-image for a plain Error', () => {
      expect(classifyImageGenerationFailure(new Error('boom'))).toBe(ImageGenerationFailure.NoImage)
    })

    it('returns no-image for an unknown message', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Something completely different' }),
      ).toBe(ImageGenerationFailure.NoImage)
    })

    it('ignores unknown declared failure kinds', () => {
      expect(
        classifyImageGenerationFailure({
          details: { failure: 'totally-new-kind' },
          message: 'blocked by safety',
        }),
      ).toBe(ImageGenerationFailure.Blocked)
    })
  })
})

// ── imageFailureAlternatives ────────────────────────────────────

describe('imageFailureAlternatives', () => {
  it('extracts string alternatives from details', () => {
    const err: ImageErrorShape = {
      details: {
        failure: 'blocked',
        alternatives: ['Try a dragon', 'Try a castle', 'Try a knight'],
      },
    }
    expect(imageFailureAlternatives(err)).toEqual(['Try a dragon', 'Try a castle', 'Try a knight'])
  })

  it('returns empty for no alternatives', () => {
    expect(imageFailureAlternatives({ details: { failure: 'blocked' } })).toEqual([])
    expect(imageFailureAlternatives(null)).toEqual([])
    expect(imageFailureAlternatives(undefined)).toEqual([])
  })

  it('filters out non-string entries', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['good', 42, null, '', 'also good'] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['good', 'also good'])
  })

  it('caps at 3 alternatives', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['a', 'b', 'c', 'd', 'e'] },
    }
    expect(imageFailureAlternatives(err)).toHaveLength(3)
  })

  it('trims whitespace from alternatives', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['  hello  ', ' world '] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['hello', 'world'])
  })
})

// ── offersAlternatives ──────────────────────────────────────────

describe('offersAlternatives', () => {
  it('returns true only for blocked', () => {
    expect(offersAlternatives(ImageGenerationFailure.Blocked)).toBe(true)
  })

  it('returns false for all other kinds', () => {
    expect(offersAlternatives(ImageGenerationFailure.Busy)).toBe(false)
    expect(offersAlternatives(ImageGenerationFailure.NotConfigured)).toBe(false)
    expect(offersAlternatives(ImageGenerationFailure.NoImage)).toBe(false)
    expect(offersAlternatives(ImageGenerationFailure.Offline)).toBe(false)
  })
})

// ── imageFailureMessage ─────────────────────────────────────────

describe('imageFailureMessage', () => {
  it('returns a non-empty message for every kind + audience', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      for (const audience of ['parent', 'kid'] as const) {
        const msg = imageFailureMessage(kind, audience)
        expect(msg.length).toBeGreaterThan(0)
      }
    }
  })

  it('parent blocked message mentions "nothing was spent"', () => {
    expect(imageFailureMessage(ImageGenerationFailure.Blocked, 'parent')).toContain(
      'Nothing was spent',
    )
  })

  it('kid messages are short (readability bar)', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      const msg = imageFailureMessage(kind, 'kid')
      const words = msg.split(/\s+/).length
      expect(words).toBeLessThanOrEqual(12)
    }
  })
})

// ── blockedTips ─────────────────────────────────────────────────

describe('blockedTips', () => {
  it('returns non-empty tips for every door + audience', () => {
    for (const door of Object.values(ImageRetryDoor)) {
      for (const audience of ['parent', 'kid'] as const) {
        const tips = blockedTips(door, audience)
        expect(tips.length).toBeGreaterThan(0)
        for (const tip of tips) {
          expect(tip.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// ── imageFailureChatMessage ─────────────────────────────────────

describe('imageFailureChatMessage', () => {
  it('non-blocked kind returns just the message', () => {
    const msg = imageFailureChatMessage(ImageGenerationFailure.Busy, [], 'parent')
    expect(msg).toBe(imageFailureMessage(ImageGenerationFailure.Busy, 'parent'))
    expect(msg).not.toContain('Try one of these')
  })

  it('blocked with alternatives includes them as bullet points', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      ['a dragon', 'a castle'],
      'parent',
    )
    expect(msg).toContain('• a dragon')
    expect(msg).toContain('• a castle')
    expect(msg).toContain('Tap the image button')
  })

  it('blocked without alternatives falls back to written tips', () => {
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
})
