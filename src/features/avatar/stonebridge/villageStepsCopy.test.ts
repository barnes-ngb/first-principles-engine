import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { expectKidLine, expectKidWording } from '../../../test/kidReadability'
import {
  advanceMissions,
  countReadingActions,
  type ReadingActivityEvent,
} from './computeStonebridgeProgress'
import { STONEBRIDGE_MISSIONS } from './missions'
import type { StonebridgeProgress } from '../../../core/types/stonebridge'
import {
  VILLAGE_STEPS_HELP_LABEL,
  VILLAGE_STEPS_HELP_LINES,
  VILLAGE_STEPS_LINE,
  VILLAGE_STEP_UNIT,
  villageStepsCompact,
  villageStepsLabel,
} from './villageStepsCopy'

/**
 * The step vocabulary: that it is readable, that it is TRUE of the counter, and
 * that all three surfaces say it from this one definition.
 *
 * Deliberately not a copy mirror — nothing here asserts a string by repeating
 * it. Each case names a fact the counter's own semantics make true or false, so
 * a later edit that reads well and says something the number cannot support
 * fails here. Phone / tablet / desktop layout, real focus and real touch
 * targets are Sol's independent pass and are not claimed.
 */

const ALL_COPY = [
  villageStepsLabel(3, 8),
  villageStepsCompact(3, 8),
  VILLAGE_STEPS_LINE,
  VILLAGE_STEPS_HELP_LABEL,
  ...VILLAGE_STEPS_HELP_LINES,
]

const readRendered = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** The three surfaces that show the repair number. */
const CONSUMERS = [
  'src/features/avatar/stonebridge/StonebridgeVillage.tsx',
  'src/features/avatar/stonebridge/StonebridgeLocationDialog.tsx',
  'src/features/avatar/stonebridge/StonebridgeMissionCard.tsx',
]

describe('the step words hold the kid readability bar', () => {
  it('every sentence a child reads', () => {
    expectKidLine(VILLAGE_STEPS_LINE, 'village steps · the default line')
    for (const line of VILLAGE_STEPS_HELP_LINES) {
      expectKidLine(line, `village steps · help "${line}"`)
    }
  })

  it('and the label, the compact number and the help control', () => {
    // Not sentences: a legend, a bare count and a question. The word bar and
    // the syllable bar still apply — see `kidReadability`'s header.
    expectKidWording(villageStepsLabel(3, 8), 'village steps · full label')
    expectKidWording(villageStepsCompact(3, 8), 'village steps · compact count')
    expectKidWording(VILLAGE_STEPS_HELP_LABEL, 'village steps · help control')
  })
})

describe('what the words claim is what the counter does', () => {
  it('names the unit, and names it the same way everywhere', () => {
    expect(villageStepsLabel(3, 8)).toContain('3 / 8')
    // The legend gives the unit its word; the compact form carries that same
    // word, so a number away from the legend is not bare digits again.
    expect(villageStepsLabel(3, 8).toLowerCase()).toContain('step')
    expect(villageStepsCompact(3, 8)).toBe(`3 / 8 ${VILLAGE_STEP_UNIT}`)
  })

  it('names BOTH sources, because a step can come from either', () => {
    const line = VILLAGE_STEPS_LINE.toLowerCase()
    expect(line).toMatch(/read/)
    expect(line).toMatch(/quest/)
    // Hedged, not promised: the writers dedup and the counter excludes the
    // per-answer diamond rows, so no action is owed a step.
    expect(line).toMatch(/\bcan\b/)
  })

  it('says a finished Mine quest counts, and an opened book may not', () => {
    const help = VILLAGE_STEPS_HELP_LINES.join(' ').toLowerCase()
    expect(help).toMatch(/mine quest/)
    expect(help).toMatch(/finish/)
    expect(help).toMatch(/open/)
    // The caveat is the half that stops a child counting a step they did not
    // get. It must stay hedged rather than becoming a rule about opening.
    expect(help).toMatch(/\bmay\b/)
  })

  it('claims nothing the counter cannot support', () => {
    // Each of these is a claim the stored rows cannot back: a page, a minute, a
    // whole book, a visit, or a particular trip to the shelf. "100%" and
    // "every" are the quota and mastery shapes the rally does not have.
    for (const text of ALL_COPY) {
      expect(text, `"${text}" claims a page`).not.toMatch(/\bpages?\b/i)
      expect(text, `"${text}" claims a minute`).not.toMatch(/\bminutes?\b/i)
      expect(text, `"${text}" claims a whole book`).not.toMatch(/whole book|finish(?:ed)? a book/i)
      expect(text, `"${text}" claims a visit`).not.toMatch(/\bvisits?\b|\btrips?\b/i)
      expect(text, `"${text}" is a quota`).not.toMatch(/100%|\bevery\b|\bmust\b|\ball of\b/i)
    }
  })

  it('and never says the number is books read', () => {
    // The defect this run exists for: "N / M done" beside a bar reads as
    // finished books, and the number is reads PLUS quest completions.
    for (const text of ALL_COPY) {
      expect(text, `"${text}" labels the count as books`).not.toMatch(/books? read\b/i)
    }
  })
})

describe('the three surfaces say it from this one definition', () => {
  it('each one renders the shared label, and none spells its own', () => {
    for (const file of CONSUMERS) {
      const code = readRendered(file)
      expect(code, `${file} does not read villageStepsCopy`).toContain("from './villageStepsCopy'")
      expect(code, `${file} does not render the shared label`).toContain('villageStepsLabel(')
      // The retired form, in the two shapes it was written in.
      expect(code, `${file} still spells a counter by hand`).not.toMatch(
        /\{active\.current\}\s*\/\s*\{active\.target\}/,
      )
    }
  })

  it('and the help lives in one component, never inside a place button', () => {
    for (const file of CONSUMERS) {
      const code = readRendered(file)
      expect(code, `${file} does not offer the step help`).toContain('<VillageStepsHelp')
      // A help control nested in a place control would make one tap mean two
      // things, so no surface may render its own toggle for this.
      expect(code, `${file} rolls its own help toggle`).not.toContain(VILLAGE_STEPS_HELP_LABEL)
    }
  })

  it('and the help component itself declares a 44px target and no writes', () => {
    const help = readRendered('src/features/avatar/stonebridge/VillageStepsHelp.tsx')
    expect(help).toContain('minHeight: 44')
    expect(help).toContain('aria-expanded')
    expect(help).toContain('aria-controls')
    // Read-only by construction: nothing to persist, nothing to earn.
    expect(help).not.toMatch(/firebase|firestore/i)
    expect(help).not.toMatch(/\b(?:setDoc|addDoc|updateDoc|runTransaction|writeBatch)\s*\(/)
    expect(help).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
})

describe('a real mixed set of stored events reads as steps', () => {
  /**
   * The shapes that actually land in `xpLedger` for a week of mixed work: book
   * reads, Knowledge Mine quest completions — a Math quest completes as an
   * ordinary `QUEST_COMPLETE`, which is exactly why it counts — plus the rows
   * that are deliberately excluded (per-diamond quest rows and every diamond
   * mirror).
   */
  const EVENTS: ReadingActivityEvent[] = [
    { type: 'BOOK_READ', currencyType: 'xp' },
    { type: 'BOOK_READ', currencyType: 'xp' },
    { type: 'QUEST_COMPLETE', currencyType: 'xp' }, // a reading quest
    { type: 'QUEST_COMPLETE', currencyType: 'xp' }, // a Math quest — same row
    { type: 'QUEST_DIAMOND', currencyType: 'xp' }, // per diamond mined — not a step
    { type: 'QUEST_DIAMOND', currencyType: 'xp' },
    { type: 'BOOK_READ', currencyType: 'diamond' }, // the diamond mirror of a read
    { type: 'MANUAL_AWARD', currencyType: 'diamond' },
    { type: 'CHECKLIST_ITEM', currencyType: 'xp' },
    { currencyType: 'xp' }, // the cumulative ledger doc
  ]

  const OLD_BRIDGE = STONEBRIDGE_MISSIONS[0]

  it('counts what it always counted, and the words say steps', () => {
    const total = countReadingActions(EVENTS)
    // Unchanged computation: two reads and two quest completions.
    expect(total).toBe(4)

    const stored: StonebridgeProgress = {
      childId: 'child-1',
      currentMissionId: OLD_BRIDGE.id,
      activeProgress: null,
      completedMissions: [],
      raisedBanners: [],
      // A first-sight baseline of 1 — so one of the four landed before the
      // rally began and three are credited to this repair.
      missionBaselines: { [OLD_BRIDGE.id]: 1 },
      updatedAt: '2026-11-01T00:00:00.000Z',
    }
    const { active } = advanceMissions(stored, total, '2026-11-07T00:00:00.000Z')
    expect(active).not.toBeNull()
    expect(active!.current).toBe(3)
    expect(active!.target).toBe(OLD_BRIDGE.target)

    const label = villageStepsLabel(active!.current, active!.target)
    expect(label).toBe(`Village steps for this repair: 3 / ${OLD_BRIDGE.target}`)
    // Three is not "three books", and it is not a reading-only number either:
    // one of the three came from the Mine.
    expect(label).not.toMatch(/books?/i)
    expect(label.toLowerCase()).toContain('step')
    expect(VILLAGE_STEPS_LINE.toLowerCase()).toMatch(/quest/)
  })
})
