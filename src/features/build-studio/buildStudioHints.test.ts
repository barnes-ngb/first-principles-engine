import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BUILD_STUDIO_GOAL_LINE,
  BUILD_STUDIO_HINTS_DONE,
  BUILD_STUDIO_HINT_COUNT,
  buildStudioHints,
  goalSpeech,
  lifeBlockLabel,
  nextHint,
  readOpenLifeValue,
} from './buildStudioHints'
import { BUILD_STUDIO_GOAL, STARTER_MAIN_TS } from './buildStudioStarter'

/**
 * The helper (LOCAL-BUILD-001).
 *
 * Two rails. **The helper NEVER edits source** — asserted as a property of the
 * MODULE, not of a handler: there is no import of the bridge, no
 * `postMessage`, and no editor action name in it, so there is no code path from
 * a hint to a change in his program. And **the hints describe the project that
 * is open** — the repair: a hard-coded *set life to 3* kept sending him to find
 * a block that was not on his screen after he reopened a 4-life version.
 */

const SOURCE = readFileSync(resolve(__dirname, 'buildStudioHints.ts'), 'utf8')

/**
 * The same file with its comments removed.
 *
 * The scans below are about what the module can DO, and a comment explaining
 * why it cannot post a message necessarily quotes the thing it cannot do.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the helper cannot touch the editor', () => {
  it('reads a non-trivial source (guards this scan itself)', () => {
    expect(CODE).toContain('buildStudioHints')
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

describe('the hints describe the project that is actually open', () => {
  it('names the block with the number the editor is showing', () => {
    expect(lifeBlockLabel(3)).toBe('set life to 3')
    expect(lifeBlockLabel(4)).toBe('set life to 4')
  })

  it('REFUSES to invent a number when it does not know one', () => {
    // Never the starter's 3 as a default — that is exactly the stale answer
    // this replaces.
    expect(lifeBlockLabel(null)).toBe('set life to')
    expect(lifeBlockLabel(null)).not.toContain('3')
  })

  it('after reopening a 4-life version, stops saying find 3', () => {
    const ladder = buildStudioHints(4)
    const all = ladder.map((h) => h.text).join(' ')
    expect(all).toContain('set life to 4')
    expect(all).not.toContain('set life to 3')
  })

  it('asks for one MORE than what is open, not a fixed number', () => {
    expect(buildStudioHints(3)[3].text).toContain('4')
    expect(buildStudioHints(4)[3].text).toContain('5')
    // With no number in hand it stays relative rather than guessing.
    expect(buildStudioHints(null)[3].text).toContain('a bigger number')
  })

  it('reads the open life value out of real source', () => {
    expect(readOpenLifeValue(STARTER_MAIN_TS)).toBe(3)
    expect(readOpenLifeValue('info.setLife(7)\n')).toBe(7)
  })

  it('answers null for source it cannot read, never a guess', () => {
    expect(readOpenLifeValue(undefined)).toBeNull()
    expect(readOpenLifeValue('')).toBeNull()
    expect(readOpenLifeValue('scene.setBackgroundColor(9)')).toBeNull()
  })
})

describe('the hints are authored, finite and escalating', () => {
  it('has five rungs, numbered in order from one', () => {
    expect(BUILD_STUDIO_HINT_COUNT).toBe(5)
    expect(buildStudioHints(3).map((h) => h.rung)).toEqual([1, 2, 3, 4, 5])
  })

  it('names the real life block, spelled as the editor spells it', () => {
    const naming = buildStudioHints(3).filter((h) =>
      h.text.includes(BUILD_STUDIO_GOAL.blockLabelPrefix),
    )
    expect(naming.length).toBeGreaterThan(0)
  })

  it('asks what he expects before telling him what happens', () => {
    const ladder = buildStudioHints(3)
    const asking = ladder.findIndex((h) => h.text.includes('what you think'))
    expect(asking).toBeGreaterThan(-1)
    expect(asking).toBeLessThan(BUILD_STUDIO_HINT_COUNT - 1)
  })

  it('reads a rung at a time and stops rather than repeating', () => {
    expect(nextHint(0, 3)?.rung).toBe(1)
    expect(nextHint(1, 3)?.rung).toBe(2)
    expect(nextHint(4, 3)?.rung).toBe(5)
    expect(nextHint(5, 3)).toBeNull()
    expect(nextHint(99, 3)).toBeNull()
  })

  it('treats a nonsense count as the beginning, never as an error', () => {
    expect(nextHint(-1, 3)?.rung).toBe(1)
    expect(nextHint(1.5, 3)?.rung).toBe(1)
  })

  it('says so honestly when it is out of hints', () => {
    expect(BUILD_STUDIO_HINTS_DONE).toMatch(/all the hints/i)
    expect(BUILD_STUDIO_HINTS_DONE).toMatch(/change it back/)
  })
})

describe('nothing here is a score', () => {
  it('declares no streak, level, badge, reward or progress', () => {
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
  it('speaks the goal and the block to look for, as it is now', () => {
    expect(goalSpeech(4).join(' ')).toContain('set life to 4')
    expect(BUILD_STUDIO_GOAL_LINE).toContain('one more life')
  })

  it('is not one of the hint rungs', () => {
    const rungTexts = new Set(buildStudioHints(3).map((h) => h.text))
    for (const line of goalSpeech(3)) {
      expect(rungTexts.has(line)).toBe(false)
    }
  })
})
