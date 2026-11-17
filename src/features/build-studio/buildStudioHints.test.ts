import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BUILD_STUDIO_GOAL_LINE,
  BUILD_STUDIO_HINTS,
  BUILD_STUDIO_HINTS_DONE,
  BUILD_STUDIO_HINT_COUNT,
  goalSpeech,
  nextHint,
} from './buildStudioHints'
import { BUILD_STUDIO_GOAL } from './buildStudioStarter'

/**
 * The helper (LOCAL-BUILD-001).
 *
 * The rail is *the helper NEVER edits source*, and this file asserts it as a
 * property of the MODULE rather than of a handler: the hints module has no
 * import of the bridge, no `postMessage`, and no editor action name anywhere in
 * it, so there is no code path from a hint to a change in his program.
 *
 * POSITIVE CONTROL: import `ArcadeBridge` into `buildStudioHints.ts` and the
 * first block fails.
 */

const SOURCE = readFileSync(resolve(__dirname, 'buildStudioHints.ts'), 'utf8')

/**
 * The same file with its comments removed.
 *
 * The scans below are about what the module can DO, and a comment explaining
 * why it cannot post a message necessarily quotes the thing it cannot do — the
 * module's own docstring does exactly that. Reading the raw source would make
 * this check unable to coexist with its own explanation, which is the
 * `kidLockWording` lesson.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the helper cannot touch the editor', () => {
  it('reads a non-trivial source (guards this scan itself)', () => {
    // A strip that produced nothing would satisfy every "not" below.
    expect(CODE).toContain('BUILD_STUDIO_HINTS')
    expect(CODE).toContain('nextHint')
    expect(CODE.length).toBeGreaterThan(400)
  })

  it('imports nothing that can post to the frame', () => {
    expect(CODE).not.toMatch(/from '\.\/arcadeBridge'/)
    expect(CODE).not.toMatch(/postMessage/)
    expect(CODE).not.toMatch(/contentWindow/)
    expect(CODE).not.toMatch(/iframe/i)
  })

  it('names no editor action', () => {
    for (const action of [
      'importproject',
      'saveproject',
      'switchblocks',
      'workspacesave',
      'pxteditor',
    ]) {
      expect(CODE).not.toContain(action)
    }
  })

  it('imports nothing that can write to the app’s own store either', () => {
    expect(CODE).not.toMatch(/firebase/)
    expect(CODE).not.toMatch(/setDoc|addDoc|runTransaction/)
  })
})

describe('the hints are authored, finite and escalating', () => {
  it('has five rungs, numbered in order from one', () => {
    expect(BUILD_STUDIO_HINT_COUNT).toBe(5)
    expect(BUILD_STUDIO_HINTS.map((h) => h.rung)).toEqual([1, 2, 3, 4, 5])
  })

  it('names the real life block, spelled as the editor spells it', () => {
    const naming = BUILD_STUDIO_HINTS.filter((h) =>
      h.text.includes(BUILD_STUDIO_GOAL.blockLabel),
    )
    // At least one rung must say the block's own words, or a child is hunting
    // for something the screen does not call that.
    expect(naming.length).toBeGreaterThan(0)
  })

  it('asks what he expects before telling him what happens', () => {
    const asking = BUILD_STUDIO_HINTS.findIndex((h) => h.text.includes('what you think'))
    expect(asking).toBeGreaterThan(-1)
    // ...and it comes before the last rung, which is the "go and look" one.
    expect(asking).toBeLessThan(BUILD_STUDIO_HINT_COUNT - 1)
  })

  it('never hands over the answer as a number', () => {
    // Rung 4 says "a bigger number", not "4". The prediction is the point.
    for (const hint of BUILD_STUDIO_HINTS) {
      expect(hint.text).not.toMatch(/\btype\s+4\b/)
    }
  })

  it('reads a rung at a time and stops rather than repeating', () => {
    expect(nextHint(0)?.rung).toBe(1)
    expect(nextHint(1)?.rung).toBe(2)
    expect(nextHint(4)?.rung).toBe(5)
    expect(nextHint(5)).toBeNull()
    expect(nextHint(99)).toBeNull()
  })

  it('treats a nonsense count as the beginning, never as an error', () => {
    expect(nextHint(-1)?.rung).toBe(1)
    expect(nextHint(1.5)?.rung).toBe(1)
  })

  it('says so honestly when it is out of hints', () => {
    expect(BUILD_STUDIO_HINTS_DONE).toMatch(/all the hints/i)
    // Not a telling-off, and it offers a way forward.
    expect(BUILD_STUDIO_HINTS_DONE).toMatch(/change it back/)
  })
})

describe('nothing here is a score', () => {
  it('declares no streak, level, badge, reward or progress', () => {
    // Whole words, not substrings: a hint that ends "did you get what you
    // expected?" contains the letters of `xp` and is not a currency.
    for (const word of [
      'streak',
      'level',
      'badge',
      'reward',
      'progress',
      'diamond',
      'points',
      'score',
    ]) {
      expect(CODE).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'))
    }
  })
})

describe('Hear it reads the goal, and does not spend a hint', () => {
  it('speaks the goal and the block to look for', () => {
    const speech = goalSpeech().join(' ')
    expect(speech).toContain(BUILD_STUDIO_GOAL.blockLabel)
    expect(BUILD_STUDIO_GOAL_LINE).toContain('one more life')
  })

  it('is not one of the hint rungs', () => {
    const rungTexts = new Set(BUILD_STUDIO_HINTS.map((h) => h.text))
    for (const line of goalSpeech()) {
      expect(rungTexts.has(line)).toBe(false)
    }
  })
})
