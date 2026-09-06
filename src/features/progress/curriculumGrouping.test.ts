import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'
import {
  CURRICULUM_SECTION_TITLE,
  CurriculumSection,
  groupCurriculumConfigs,
  SECTION_FOR_TYPE,
  sectionForType,
} from './curriculumGrouping'

function config(overrides: Partial<ActivityConfig> & { id: string }): ActivityConfig {
  return {
    name: overrides.id,
    type: ActivityType.Routine,
    subjectBucket: SubjectBucket.Other,
    defaultMinutes: 15,
    frequency: ActivityFrequency.Daily,
    childId: 'c1',
    sortOrder: 0,
    completed: false,
    scannable: false,
    ...overrides,
  } as ActivityConfig
}

// ── The property, not the section (UX-204) ───────────────────────────────────
//
// The bug was four `filter` calls over a six-member enum, which left `activity`
// and `app` rendered nowhere. These fail if a seventh `ActivityType` is added
// and left unplaced, or if a type is placed in a section that has no heading.
describe('every ActivityType is placed', () => {
  const ALL_TYPES = Object.values(ActivityType)

  it('maps every member of ActivityType to a section', () => {
    for (const type of ALL_TYPES) {
      expect(SECTION_FOR_TYPE[type], `ActivityType "${type}" has no section`).toBeDefined()
    }
    expect(Object.keys(SECTION_FOR_TYPE).sort()).toEqual([...ALL_TYPES].sort())
  })

  it('every section a type can land in has a rendered heading', () => {
    for (const section of Object.values(SECTION_FOR_TYPE)) {
      expect(CURRICULUM_SECTION_TITLE[section]).toBeTruthy()
    }
  })

  it('renders a non-completed config of EVERY type somewhere', () => {
    const configs = ALL_TYPES.map((type, i) => config({ id: `a${i}`, type }))
    const grouped = groupCurriculumConfigs(configs)
    const rendered = [
      ...grouped.workbooks,
      ...grouped.routines,
      ...grouped.other,
      ...grouped.evaluations,
    ]
    expect(rendered.map((c) => c.id).sort()).toEqual(configs.map((c) => c.id).sort())
  })

  it('places activity and app in Other — the section that did not exist', () => {
    expect(sectionForType(ActivityType.Activity)).toBe(CurriculumSection.Other)
    expect(sectionForType(ActivityType.App)).toBe(CurriculumSection.Other)
  })

  it('sends an unrecognised stored type to Other rather than dropping it', () => {
    expect(sectionForType('something-a-later-build-wrote' as ActivityType)).toBe(
      CurriculumSection.Other,
    )
  })
})

describe('groupCurriculumConfigs', () => {
  it('is a partition — every config lands in exactly one bucket', () => {
    const configs = [
      config({ id: 'w', type: ActivityType.Workbook }),
      config({ id: 'r', type: ActivityType.Routine }),
      config({ id: 'f', type: ActivityType.Formation }),
      config({ id: 'a', type: ActivityType.Activity }),
      config({ id: 'p', type: ActivityType.App }),
      config({ id: 'e', type: ActivityType.Evaluation }),
      config({ id: 'done', type: ActivityType.App, completed: true }),
    ]
    const g = groupCurriculumConfigs(configs)
    const total =
      g.workbooks.length +
      g.routines.length +
      g.other.length +
      g.evaluations.length +
      g.completed.length
    expect(total).toBe(configs.length)
  })

  it('keeps the four original buckets exactly as they were', () => {
    const configs = [
      config({ id: 'w', type: ActivityType.Workbook }),
      config({ id: 'r', type: ActivityType.Routine }),
      config({ id: 'f', type: ActivityType.Formation }),
      config({ id: 'e', type: ActivityType.Evaluation }),
      config({ id: 'done', type: ActivityType.Workbook, completed: true }),
    ]
    const g = groupCurriculumConfigs(configs)
    expect(g.workbooks.map((c) => c.id)).toEqual(['w'])
    expect(g.routines.map((c) => c.id)).toEqual(['r', 'f'])
    expect(g.evaluations.map((c) => c.id)).toEqual(['e'])
    expect(g.completed.map((c) => c.id)).toEqual(['done'])
  })

  it('a completed activity/app config stays in Completed, not in Other', () => {
    const g = groupCurriculumConfigs([
      config({ id: 'old-app', type: ActivityType.App, completed: true }),
    ])
    expect(g.other).toEqual([])
    expect(g.completed.map((c) => c.id)).toEqual(['old-app'])
  })

  it('preserves the caller ordering within a bucket', () => {
    const g = groupCurriculumConfigs([
      config({ id: 'second', type: ActivityType.App, sortOrder: 2 }),
      config({ id: 'first', type: ActivityType.Activity, sortOrder: 1 }),
    ])
    expect(g.other.map((c) => c.id)).toEqual(['second', 'first'])
  })
})
