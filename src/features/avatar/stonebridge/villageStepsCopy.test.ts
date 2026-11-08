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
  villageStepsCompact,
  villageStepsLabel,
} from './villageStepsCopy'

/**
 * The step vocabulary: that it is readable, and that it is true of the counter
 * on a real mixed set of stored events.
 *
 * What the words look like in a browser, where the controls are and what they
 * write is Sol's independent pass and the component's own behavioural suite —
 * not asserted here, and not inferred from source text.
 */

const ALL_COPY = [
  villageStepsLabel(3, 8),
  villageStepsCompact(3, 8),
  VILLAGE_STEPS_LINE,
  VILLAGE_STEPS_HELP_LABEL,
  ...VILLAGE_STEPS_HELP_LINES,
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

describe('a real mixed set of stored events reads as steps', () => {
  /**
   * The shapes that actually land in `xpLedger` for a week of mixed work: book
   * reads, Knowledge Mine quest completions — a Math quest completes as an
   * ordinary `QUEST_COMPLETE`, which is why it counts — plus the rows that are
   * deliberately excluded (per-diamond quest rows and every diamond mirror).
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

  it('counts what it always counted, and the words name the unit', () => {
    const total = countReadingActions(EVENTS)
    // Unchanged computation: two reads and two quest completions.
    expect(total).toBe(4)

    const stored: StonebridgeProgress = {
      childId: 'child-1',
      currentMissionId: OLD_BRIDGE.id,
      activeProgress: null,
      completedMissions: [],
      raisedBanners: [],
      // A first-sight baseline of 1: one of the four landed before the rally
      // began, so three are credited to this repair.
      missionBaselines: { [OLD_BRIDGE.id]: 1 },
      updatedAt: '2026-11-01T00:00:00.000Z',
    }
    const { active } = advanceMissions(stored, total, '2026-11-07T00:00:00.000Z')
    expect(active).not.toBeNull()
    expect(active!.current).toBe(3)
    expect(active!.target).toBe(OLD_BRIDGE.target)

    const label = villageStepsLabel(active!.current, active!.target)
    expect(label).toBe(`Village steps for this repair: 3 / ${OLD_BRIDGE.target}`)
    // Three is not three finished books, and it is not a reading-only number:
    // one of the three came from the Mine, so the line shown with it has to
    // name quest work as well as reading.
    expect(label).not.toMatch(/books?/i)
    expect(VILLAGE_STEPS_LINE.toLowerCase()).toMatch(/read/)
    expect(VILLAGE_STEPS_LINE.toLowerCase()).toMatch(/quest/)
  })

  it('and none of the words it is shown with claims a unit that was not counted', () => {
    // No row in the set above is a page, a minute, a visit or a trip, and the
    // rally has no quota — so none of the copy may say otherwise.
    for (const text of ALL_COPY) {
      expect(text, `"${text}" claims a page`).not.toMatch(/\bpages?\b/i)
      expect(text, `"${text}" claims a minute`).not.toMatch(/\bminutes?\b/i)
      expect(text, `"${text}" claims a whole book`).not.toMatch(/whole book|finish(?:ed)? a book/i)
      expect(text, `"${text}" claims a visit`).not.toMatch(/\bvisits?\b|\btrips?\b/i)
      expect(text, `"${text}" is a quota`).not.toMatch(/100%|\bevery\b|\bmust\b|\ball of\b/i)
    }
  })
})
