import { describe, expect, it } from 'vitest'
import { expectKidLine } from '../../../test/kidReadability'
import {
  ALTERNATIVES_HEADING,
  ALTERNATIVE_COST_NOTE,
  FREE_EXITS_HEADING,
  ImageGenerationFailure,
  ImageRetryDoor,
  blockedTips,
  classifyImageGenerationFailure,
  imageFailureChatMessage,
  imageFailureAlternatives,
  imageFailureMessage,
  offersAlternatives,
} from '../imageGenerationFailure'

/**
 * The five kinds, from the shapes the handlers actually reject with
 * (`functions/src/ai/imageTasks/generateImage.ts` + `enhanceSketch.ts`), as a
 * Firebase callable delivers them: `functions/<code>` plus the declared
 * `details` payload.
 */
describe('classifyImageGenerationFailure — the declared kind', () => {
  it('reads the handler’s own word for a refusal', () => {
    expect(
      classifyImageGenerationFailure({
        code: 'functions/invalid-argument',
        message: "That prompt was blocked by the image generator's safety filter.",
        details: { failure: 'blocked', alternatives: ['a', 'b', 'c'] },
      }),
    ).toBe(ImageGenerationFailure.Blocked)
  })

  it('reads a rate limit', () => {
    expect(
      classifyImageGenerationFailure({
        code: 'functions/resource-exhausted',
        message: 'Image generation is busy right now. Wait a moment and try again.',
        details: { failure: 'busy' },
      }),
    ).toBe(ImageGenerationFailure.Busy)
  })

  it('reads a missing API key', () => {
    expect(
      classifyImageGenerationFailure({
        code: 'functions/failed-precondition',
        message: 'Image generation is not configured correctly. Ask Dad to check the API key.',
        details: { failure: 'not-configured' },
      }),
    ).toBe(ImageGenerationFailure.NotConfigured)
  })

  it('reads an empty result', () => {
    expect(
      classifyImageGenerationFailure({
        code: 'functions/internal',
        message: 'Image generation returned no data.',
        details: { failure: 'no-image' },
      }),
    ).toBe(ImageGenerationFailure.NoImage)
  })

  it('beats the message text — a reworded error must not change the kind', () => {
    // The message says "blocked"; the handler said it was a rate limit. The
    // declared kind wins, because the branch that decided it is the authority.
    expect(
      classifyImageGenerationFailure({
        code: 'functions/resource-exhausted',
        message: 'blocked by something',
        details: { failure: 'busy' },
      }),
    ).toBe(ImageGenerationFailure.Busy)
  })
})

describe('classifyImageGenerationFailure — an older deploy, with no details', () => {
  it('falls back to the callable code for a refusal', () => {
    expect(
      classifyImageGenerationFailure({
        code: 'functions/invalid-argument',
        message: "That prompt was blocked by the image generator's safety filter.",
      }),
    ).toBe(ImageGenerationFailure.Blocked)
  })

  it('an invalid-argument that is NOT a refusal is our own bug, not theirs', () => {
    expect(
      classifyImageGenerationFailure({
        code: 'functions/invalid-argument',
        message: 'prompt must be 4000 characters or fewer.',
      }),
    ).toBe(ImageGenerationFailure.NoImage)
  })

  it('a dropped connection reads as offline — the server never declares this one', () => {
    expect(
      classifyImageGenerationFailure({ code: 'functions/unavailable', message: '' }),
    ).toBe(ImageGenerationFailure.Offline)
    expect(
      classifyImageGenerationFailure({ code: 'functions/deadline-exceeded', message: '' }),
    ).toBe(ImageGenerationFailure.Offline)
    expect(classifyImageGenerationFailure(new Error('Failed to fetch'))).toBe(
      ImageGenerationFailure.Offline,
    )
  })

  it('reads a rate limit and a key problem out of bare message text', () => {
    expect(classifyImageGenerationFailure(new Error('429 rate_limit exceeded'))).toBe(
      ImageGenerationFailure.Busy,
    )
    expect(classifyImageGenerationFailure(new Error('invalid api key'))).toBe(
      ImageGenerationFailure.NotConfigured,
    )
  })
})

describe('classifyImageGenerationFailure — never throws', () => {
  it('an unknown error is no-image, which offers a plain retry', () => {
    expect(classifyImageGenerationFailure(null)).toBe(ImageGenerationFailure.NoImage)
    expect(classifyImageGenerationFailure(undefined)).toBe(ImageGenerationFailure.NoImage)
    expect(classifyImageGenerationFailure(new Error('something odd'))).toBe(
      ImageGenerationFailure.NoImage,
    )
    expect(classifyImageGenerationFailure({})).toBe(ImageGenerationFailure.NoImage)
  })

  it('ignores a details payload it cannot read', () => {
    for (const details of [null, 'blocked', 42, ['blocked'], { failure: 'nonsense' }]) {
      expect(
        classifyImageGenerationFailure({ code: 'functions/internal', message: '', details }),
      ).toBe(ImageGenerationFailure.NoImage)
    }
  })
})

describe('imageFailureAlternatives', () => {
  it('reads the three the server sent', () => {
    expect(
      imageFailureAlternatives({
        details: { failure: 'blocked', alternatives: [' a ', 'b', 'c'] },
      }),
    ).toEqual(['a', 'b', 'c'])
  })

  it('is empty when the suggester gave nothing, so the card falls back to tips', () => {
    expect(imageFailureAlternatives({ details: { failure: 'blocked' } })).toEqual([])
    expect(imageFailureAlternatives(null)).toEqual([])
    expect(imageFailureAlternatives(new Error('nope'))).toEqual([])
  })

  it('drops junk entries and caps at three rather than trusting the payload', () => {
    expect(
      imageFailureAlternatives({
        details: { failure: 'blocked', alternatives: ['a', '', 42, null, 'b', 'c', 'd'] },
      }),
    ).toEqual(['a', 'b', 'c'])
  })
})

describe('what each failure offers', () => {
  it('only a refusal can be answered with different words', () => {
    expect(offersAlternatives(ImageGenerationFailure.Blocked)).toBe(true)
    for (const kind of [
      ImageGenerationFailure.Busy,
      ImageGenerationFailure.NotConfigured,
      ImageGenerationFailure.NoImage,
      ImageGenerationFailure.Offline,
    ]) {
      expect(offersAlternatives(kind)).toBe(false)
    }
  })

  it('every kind has words for both audiences, and they differ', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      const parent = imageFailureMessage(kind, 'parent')
      const kid = imageFailureMessage(kind, 'kid')
      expect(parent.length).toBeGreaterThan(0)
      expect(kid.length).toBeGreaterThan(0)
      expect(kid).not.toBe(parent)
    }
  })

  it('the parent copy says nothing was spent, on every failure', () => {
    // A picture that never arrived is never charged (FEAT-165/166/168's rule);
    // saying so is what stops a kid rationing a budget they still have.
    for (const kind of Object.values(ImageGenerationFailure)) {
      expect(imageFailureMessage(kind, 'parent').toLowerCase()).toMatch(
        /nothing was (spent|lost)/,
      )
    }
  })

  it('the heading is honest — a guess offered as a guess', () => {
    expect(ALTERNATIVES_HEADING.parent).toBe('Try one of these')
    for (const audience of ['parent', 'kid'] as const) {
      expect(ALTERNATIVES_HEADING[audience].toLowerCase()).not.toMatch(/will work|this fixes/)
    }
  })

  it('says a tap costs a picture, before it is spent', () => {
    for (const audience of ['parent', 'kid'] as const) {
      expect(ALTERNATIVE_COST_NOTE[audience].toLowerCase()).toMatch(/count/)
    }
  })
})

describe('kid copy meets the shared readability bar', () => {
  it('every failure sentence', () => {
    for (const kind of Object.values(ImageGenerationFailure)) {
      expectKidLine(imageFailureMessage(kind, 'kid'), `failure ${kind}`)
    }
  })

  it('every heading, tip and cost note', () => {
    expectKidLine(ALTERNATIVES_HEADING.kid, 'alternatives heading')
    expectKidLine(ALTERNATIVE_COST_NOTE.kid, 'cost note')
    expectKidLine(FREE_EXITS_HEADING.kid, 'free exits heading')
    for (const door of Object.values(ImageRetryDoor)) {
      blockedTips(door, 'kid').forEach((tip, i) =>
        expectKidLine(tip, `kid tip ${door} ${i}`),
      )
    }
  })
})

/**
 * The written suggestions have to fit the door they are shown on (Codex P2,
 * PR #1768). The first cut lifted the Book Editor's two and showed them
 * everywhere: a sticker maker was told to describe a *world* when what it makes
 * is one thing on its own, and a door with no prompt field at all was told to
 * reword something it cannot reach.
 */
describe('blockedTips — advice you can actually follow on THIS door', () => {
  it('every door has two tips for both audiences', () => {
    for (const door of Object.values(ImageRetryDoor)) {
      for (const audience of ['parent', 'kid'] as const) {
        expect(blockedTips(door, audience)).toHaveLength(2)
      }
    }
  })

  it('the scene door keeps the Book Editor\'s own words — they were written for it', () => {
    expect(blockedTips(ImageRetryDoor.Scene, 'parent')[0]).toMatch(
      /describe the world instead of characters/i,
    )
  })

  it('a sticker door never tells you to describe a world — a sticker is one thing', () => {
    // It may say what a sticker is NOT ("not a whole scene"); what it must never
    // do is send someone off to describe a world, which is the Book Editor's
    // advice for a different product.
    for (const audience of ['parent', 'kid'] as const) {
      for (const tip of blockedTips(ImageRetryDoor.Sticker, audience)) {
        expect(tip.toLowerCase()).not.toMatch(/describe the world|instead of characters/)
      }
    }
    expect(blockedTips(ImageRetryDoor.Sticker, 'parent').join(' ')).toMatch(/one thing/i)
  })

  it('a door with no prompt field never advises rewording', () => {
    // Make it fancy, Add version, Kit Builder art, the Workshop batch: there is
    // no box to type into, so every tip must name something else — the style,
    // or the drawing.
    for (const audience of ['parent', 'kid'] as const) {
      for (const tip of blockedTips(ImageRetryDoor.Redraw, audience)) {
        expect(tip.toLowerCase()).not.toMatch(/describe|say what|ask for|word/)
      }
    }
  })

  it('no two doors give the same pair — otherwise the split earns nothing', () => {
    const joined = Object.values(ImageRetryDoor).map((d) =>
      blockedTips(d, 'parent').join('|'),
    )
    expect(new Set(joined).size).toBe(joined.length)
  })
})

/**
 * The text-only reply (the Shelly chat's image door). Its one rule: a refusal
 * ALWAYS ends with something to do — an empty suggester is an expected path, and
 * a chat that stops at "wouldn't draw that one" is a worse dead end than the
 * line it replaced (Codex P2, PR #1768).
 */
describe('imageFailureChatMessage', () => {
  it('lists the server’s alternatives when there are any', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      ['a red plumber', 'a cheerful hero'],
      'parent',
    )
    expect(msg).toContain(imageFailureMessage(ImageGenerationFailure.Blocked, 'parent'))
    expect(msg).toContain('\u2022 a red plumber')
    expect(msg).toContain('\u2022 a cheerful hero')
  })

  it('falls back to the written tips when the suggester gave nothing', () => {
    const msg = imageFailureChatMessage(ImageGenerationFailure.Blocked, [], 'parent')
    for (const tip of blockedTips(ImageRetryDoor.Scene, 'parent')) {
      expect(msg).toContain(tip)
    }
  })

  it('never leaves a refusal without a next step, whatever came back', () => {
    for (const alternatives of [[], ['a red plumber']]) {
      const msg = imageFailureChatMessage(
        ImageGenerationFailure.Blocked,
        alternatives,
        'parent',
      )
      expect(msg).toMatch(/try one of these/i)
    }
  })

  it('suggests nothing for the kinds no rewording fixes', () => {
    for (const kind of [
      ImageGenerationFailure.Busy,
      ImageGenerationFailure.NotConfigured,
      ImageGenerationFailure.NoImage,
      ImageGenerationFailure.Offline,
    ]) {
      // Even if a stale alternatives list were handed in, a rate limit is a wait.
      const msg = imageFailureChatMessage(kind, ['a red plumber'], 'parent')
      expect(msg).toBe(imageFailureMessage(kind, 'parent'))
    }
  })

  it('follows the door — a sticker door’s fallback is sticker advice', () => {
    const msg = imageFailureChatMessage(
      ImageGenerationFailure.Blocked,
      [],
      'parent',
      ImageRetryDoor.Sticker,
    )
    expect(msg).toContain(blockedTips(ImageRetryDoor.Sticker, 'parent')[0])
  })
})
