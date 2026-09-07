/**
 * UX-193 — the type is named, and it is correctable.
 *
 * The pure half. The rendered half (that the chips appear on a pending add, that
 * the selected one is marked, that a shared add cannot pick workbook, and that
 * an applied card offers no control) is in `ActionConfirmCard.test.tsx`.
 */
import { describe, expect, it } from 'vitest'

import {
  ACTIVITY_TYPE_WORDS,
  activityTypeChoices,
  describeActivityType,
  sectionTitleForType,
  tracksPosition,
  withActivityType,
  WORKBOOK_WITHOUT_POSITION_NOTE,
  type AddActivityAction,
} from './activityTypeChoices'
import { CURRICULUM_SECTION_TITLE, SECTION_FOR_TYPE } from '../progress/curriculumGrouping'
import { ActivityType } from '../../core/types/enums'

const add = (overrides: Partial<AddActivityAction> = {}): AddActivityAction =>
  ({
    kind: 'addActivity',
    childId: 'lincoln1',
    name: 'Explode the Code 4',
    type: ActivityType.Activity,
    subjectBucket: 'LanguageArts',
    defaultMinutes: 15,
    frequency: 'daily',
    ...overrides,
  }) as AddActivityAction

describe('every ActivityType has words a parent recognises', () => {
  it('covers the whole enum — a seventh member fails to compile, not silently', () => {
    const members = Object.values(ActivityType)
    expect(Object.keys(ACTIVITY_TYPE_WORDS).sort()).toEqual([...members].sort())
  })

  it('never renders the raw enum value', () => {
    for (const type of Object.values(ActivityType)) {
      expect(describeActivityType(type)).not.toBe(type)
      expect(describeActivityType(type)).toMatch(/^an? /)
    }
  })

  it('names the section the tab will actually render the row under', () => {
    // Read from the tab's OWN partition, not restated — so the card cannot
    // promise a heading Progress → Curriculum does not have (UX-204's lesson,
    // applied to the door that caused it).
    for (const type of Object.values(ActivityType)) {
      expect(sectionTitleForType(type)).toBe(
        CURRICULUM_SECTION_TITLE[SECTION_FOR_TYPE[type]],
      )
    }
  })

  it('is the workbook option that mentions the photo scan', () => {
    expect(ACTIVITY_TYPE_WORDS[ActivityType.Workbook].note).toMatch(/photo/i)
    expect(ACTIVITY_TYPE_WORDS[ActivityType.Workbook].note).toMatch(/lesson number/i)
  })
})

// ── The workbook note may not promise a scan the write can't deliver ─────────
//
// Codex P2, round 1. `applyCurriculumAction` derives `scannable` from
// `totalUnits`/`currentPosition` alone, and `findWorkbookConfigId` filters
// `scannable !== false` — so picking Workbook on a proposal with neither field
// writes a workbook a page photo can never match. The picker's whole
// justification is that a card must not claim what the write does not do.
describe('the workbook note follows what the write will actually produce', () => {
  it('promises the photo scan only when the proposal carries a lesson number', () => {
    const positioned = activityTypeChoices(add({ totalUnits: 60, currentPosition: 1 }))
    const workbook = positioned.find((c) => c.type === ActivityType.Workbook)
    expect(workbook?.note).toMatch(/photo of a page can find it/)
  })

  it('says plainly that a scan cannot find it when there is no lesson number', () => {
    const bare = activityTypeChoices(add())
    const workbook = bare.find((c) => c.type === ActivityType.Workbook)
    expect(workbook?.note).toBe(WORKBOOK_WITHOUT_POSITION_NOTE)
    expect(workbook?.note).toMatch(/cannot find it/)
    expect(workbook?.note).toMatch(/Progress → Curriculum/)
  })

  it('is still offerable — the fix is honesty, not a refusal', () => {
    const workbook = activityTypeChoices(add()).find((c) => c.type === ActivityType.Workbook)
    expect(workbook?.disabledReason).toBeUndefined()
  })

  it('changes no other type’s note', () => {
    const bare = activityTypeChoices(add())
    for (const choice of bare.filter((c) => c.type !== ActivityType.Workbook)) {
      expect(choice.note, choice.type).toBe(ACTIVITY_TYPE_WORDS[choice.type].note)
    }
  })

  it('tracksPosition reads either field, matching the write’s own derivation', () => {
    expect(tracksPosition(add())).toBe(false)
    expect(tracksPosition(add({ totalUnits: 60 }))).toBe(true)
    expect(tracksPosition(add({ currentPosition: 1 }))).toBe(true)
  })
})

describe('activityTypeChoices', () => {
  it('offers every type, workbook first', () => {
    const choices = activityTypeChoices(add())
    expect(choices).toHaveLength(Object.values(ActivityType).length)
    expect(choices[0].type).toBe(ActivityType.Workbook)
  })

  it('refuses workbook on a SHARED add, with the DATA-08 rule’s own words', () => {
    const choices = activityTypeChoices(add({ shared: true }))
    const workbook = choices.find((c) => c.type === ActivityType.Workbook)
    expect(workbook?.disabledReason).toBeTruthy()
    // Every other option stays available — a shared routine is fine.
    for (const other of choices.filter((c) => c.type !== ActivityType.Workbook)) {
      expect(other.disabledReason, other.type).toBeUndefined()
    }
  })

  it('offers workbook freely on an unshared add', () => {
    const choices = activityTypeChoices(add())
    expect(choices.every((c) => c.disabledReason === undefined)).toBe(true)
  })
})

describe('withActivityType', () => {
  it('returns a NEW object, leaving the proposal it came from alone', () => {
    const original = add()
    const corrected = withActivityType(original, ActivityType.Workbook)

    expect(corrected).not.toBe(original)
    expect(corrected.type).toBe(ActivityType.Workbook)
    expect(original.type).toBe(ActivityType.Activity)
  })

  it('changes nothing but the type', () => {
    const original = add({ totalUnits: 60, currentPosition: 1 })
    const corrected = withActivityType(original, ActivityType.Workbook)

    expect({ ...corrected, type: original.type }).toEqual(original)
  })

  it('returns the SAME object when the type already matches', () => {
    // The confirm lane keys its re-entry guard on the action object, so a
    // no-op correction must not mint a new identity.
    const original = add()
    expect(withActivityType(original, ActivityType.Activity)).toBe(original)
  })
})
