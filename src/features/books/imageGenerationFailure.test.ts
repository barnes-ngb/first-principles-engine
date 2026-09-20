import { describe, expect, it } from 'vitest'
import {
  ImageGenerationFailure,
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  imageFailureMessage,
  offersAlternatives,
  blockedTips,
  imageFailureChatMessage,
  ImageRetryDoor,
} from './imageGenerationFailure'
import type { ImageErrorShape } from './imageGenerationFailure'

// ── classifyImageGenerationFailure ────────────────────────────────────

describe('classifyImageGenerationFailure', () => {
  describe('declared kind in details (highest trust)', () => {
    it('reads the declared kind when present', () => {
      const err: ImageErrorShape = {
        code: 'functions/unknown',
        message: 'something',
        details: { failure: 'blocked' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Blocked)
    })

    it.each([
      ['blocked', ImageGenerationFailure.Blocked],
      ['busy', ImageGenerationFailure.Busy],
      ['not-configured', ImageGenerationFailure.NotConfigured],
      ['no-image', ImageGenerationFailure.NoImage],
      ['offline', ImageGenerationFailure.Offline],
    ] as const)('declared kind "%s" → %s', (declared, expected) => {
      const err: ImageErrorShape = { details: { failure: declared } }
      expect(classifyImageGenerationFailure(err)).toBe(expected)
    })

    it('ignores an unknown declared kind and falls through to code', () => {
      const err: ImageErrorShape = {
        code: 'functions/resource-exhausted',
        details: { failure: 'unknown-future-kind' },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
    })

    it('ignores a non-string declared kind', () => {
      const err: ImageErrorShape = {
        code: 'functions/resource-exhausted',
        details: { failure: 42 },
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
    })
  })

  describe('callable error code (second trust)', () => {
    it('resource-exhausted → Busy', () => {
      const err: ImageErrorShape = { code: 'functions/resource-exhausted' }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
    })

    it('failed-precondition → NotConfigured', () => {
      const err: ImageErrorShape = { code: 'functions/failed-precondition' }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NotConfigured)
    })

    it.each(['unavailable', 'deadline-exceeded', 'cancelled'])(
      '%s → Offline',
      (code) => {
        const err: ImageErrorShape = { code: `functions/${code}` }
        expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Offline)
      },
    )

    it('invalid-argument with blocked message → Blocked', () => {
      const err: ImageErrorShape = {
        code: 'functions/invalid-argument',
        message: 'content policy violation',
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Blocked)
    })

    it('invalid-argument without blocked message → NoImage', () => {
      const err: ImageErrorShape = {
        code: 'functions/invalid-argument',
        message: 'missing required field',
      }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NoImage)
    })

    it('bare code without functions/ prefix', () => {
      const err: ImageErrorShape = { code: 'resource-exhausted' }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.Busy)
    })
  })

  describe('message text fallback (lowest trust)', () => {
    it('blocked/safety keywords → Blocked', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Image was blocked by safety filter' }),
      ).toBe(ImageGenerationFailure.Blocked)
      expect(
        classifyImageGenerationFailure({ message: 'content_policy_violation' }),
      ).toBe(ImageGenerationFailure.Blocked)
    })

    it('rate limit keywords → Busy', () => {
      expect(
        classifyImageGenerationFailure({ message: 'rate limit exceeded' }),
      ).toBe(ImageGenerationFailure.Busy)
      expect(
        classifyImageGenerationFailure({ message: 'too many requests' }),
      ).toBe(ImageGenerationFailure.Busy)
      expect(
        classifyImageGenerationFailure({ message: 'Server is busy, 429' }),
      ).toBe(ImageGenerationFailure.Busy)
    })

    it('API key / configuration keywords → NotConfigured', () => {
      expect(
        classifyImageGenerationFailure({ message: 'API key not found' }),
      ).toBe(ImageGenerationFailure.NotConfigured)
      expect(
        classifyImageGenerationFailure({ message: 'Organization not verified' }),
      ).toBe(ImageGenerationFailure.NotConfigured)
    })

    it('network keywords → Offline', () => {
      expect(
        classifyImageGenerationFailure({ message: 'Network error' }),
      ).toBe(ImageGenerationFailure.Offline)
      expect(
        classifyImageGenerationFailure({ message: 'Failed to fetch' }),
      ).toBe(ImageGenerationFailure.Offline)
      expect(
        classifyImageGenerationFailure({ message: 'No internet connection' }),
      ).toBe(ImageGenerationFailure.Offline)
    })

    it('unrecognisable message → NoImage', () => {
      expect(
        classifyImageGenerationFailure({ message: 'something went wrong' }),
      ).toBe(ImageGenerationFailure.NoImage)
    })
  })

  describe('edge cases', () => {
    it('null → NoImage', () => {
      expect(classifyImageGenerationFailure(null)).toBe(ImageGenerationFailure.NoImage)
    })

    it('undefined → NoImage', () => {
      expect(classifyImageGenerationFailure(undefined)).toBe(
        ImageGenerationFailure.NoImage,
      )
    })

    it('plain Error object → NoImage', () => {
      expect(classifyImageGenerationFailure(new Error('boom'))).toBe(
        ImageGenerationFailure.NoImage,
      )
    })

    it('empty object → NoImage', () => {
      expect(classifyImageGenerationFailure({})).toBe(ImageGenerationFailure.NoImage)
    })

    it('details as array is ignored', () => {
      const err: ImageErrorShape = { details: ['not', 'an', 'object'] as unknown }
      expect(classifyImageGenerationFailure(err)).toBe(ImageGenerationFailure.NoImage)
    })
  })
})

// ── imageFailureAlternatives ──────────────────────────────────────────

describe('imageFailureAlternatives', () => {
  it('returns alternatives from details when present', () => {
    const err: ImageErrorShape = {
      details: {
        failure: 'blocked',
        alternatives: ['a cute animal', 'a small creature', 'a round pet'],
      },
    }
    expect(imageFailureAlternatives(err)).toEqual([
      'a cute animal',
      'a small creature',
      'a round pet',
    ])
  })

  it('trims whitespace from alternatives', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['  padded  ', ' text '] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['padded', 'text'])
  })

  it('filters out non-string entries', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['good', 42, null, 'also good'] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['good', 'also good'])
  })

  it('filters out empty/whitespace strings', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['good', '', '   ', 'fine'] },
    }
    expect(imageFailureAlternatives(err)).toEqual(['good', 'fine'])
  })

  it('caps at 3 alternatives', () => {
    const err: ImageErrorShape = {
      details: { alternatives: ['a', 'b', 'c', 'd', 'e'] },
    }
    expect(imageFailureAlternatives(err)).toHaveLength(3)
  })

  it('returns empty array for null error', () => {
    expect(imageFailureAlternatives(null)).toEqual([])
  })

  it('returns empty array for error with no details', () => {
    expect(imageFailureAlternatives({ message: 'blocked' })).toEqual([])
  })

  it('returns empty array when alternatives is not an array', () => {
    const err: ImageErrorShape = { details: { alternatives: 'not an array' } }
    expect(imageFailureAlternatives(err)).toEqual([])
  })
})

// ── imageFailureMessage ───────────────────────────────────────────────

describe('imageFailureMessage', () => {
  it('returns a message for every failure kind × audience', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      for (const audience of ['parent', 'kid'] as const) {
        const msg = imageFailureMessage(kind, audience)
        expect(msg).toBeTruthy()
        expect(typeof msg).toBe('string')
      }
    }
  })

  it('parent messages mention "Nothing was spent"', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      const msg = imageFailureMessage(kind, 'parent')
      expect(msg).toContain('Nothing was spent')
    }
  })
})

// ── offersAlternatives ────────────────────────────────────────────────

describe('offersAlternatives', () => {
  it('only Blocked offers alternatives', () => {
    expect(offersAlternatives(ImageGenerationFailure.Blocked)).toBe(true)
    expect(offersAlternatives(ImageGenerationFailure.Busy)).toBe(false)
    expect(offersAlternatives(ImageGenerationFailure.NotConfigured)).toBe(false)
    expect(offersAlternatives(ImageGenerationFailure.NoImage)).toBe(false)
    expect(offersAlternatives(ImageGenerationFailure.Offline)).toBe(false)
  })
})

// ── blockedTips ───────────────────────────────────────────────────────

describe('blockedTips', () => {
  it('returns non-empty tips for every door × audience', () => {
    for (const door of Object.values(ImageRetryDoor)) {
      for (const audience of ['parent', 'kid'] as const) {
        const tips = blockedTips(door, audience)
        expect(tips.length).toBeGreaterThan(0)
        tips.forEach((t) => expect(typeof t).toBe('string'))
      }
    }
  })
})

// ── imageFailureChatMessage ───────────────────────────────────────────

describe('imageFailureChatMessage', () => {
  it('includes alternatives when Blocked and alternatives are provided', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      ['a cute animal', 'a small creature'],
      'parent',
    )
    expect(msg).toContain('a cute animal')
    expect(msg).toContain('a small creature')
    expect(msg).toContain('Tap the image button')
  })

  it('falls back to tips when Blocked but alternatives are empty', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      [],
      'parent',
      ImageRetryDoor.Scene,
    )
    const tips = blockedTips(ImageRetryDoor.Scene, 'parent')
    for (const tip of tips) {
      expect(msg).toContain(tip)
    }
  })

  it('returns only the head message for non-Blocked kinds', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Busy,
      ['should not appear'],
      'parent',
    )
    expect(msg).not.toContain('should not appear')
    expect(msg).toContain('busy')
  })

  it('works for kid audience', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      [],
      'kid',
      ImageRetryDoor.Sticker,
    )
    const tips = blockedTips(ImageRetryDoor.Sticker, 'kid')
    for (const tip of tips) {
      expect(msg).toContain(tip)
    }
  })
})
