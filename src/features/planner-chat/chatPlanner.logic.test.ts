import { describe, expect, it, beforeEach } from 'vitest'
import type { AssignmentCandidate, SkillSnapshot } from '../../core/types/domain'
import { AssignmentAction, SkillLevel, SubjectBucket } from '../../core/types/enums'
import {
  AdjustmentType,
  applySnapshotSuggestions,
  buildMinimumWinText,
  dayTotalMinutes,
  generateDraftPlanFromInputs,
  planTotalMinutes,
  resetIdCounter,
} from './chatPlanner.logic'
import type { PlanGeneratorInputs } from './chatPlanner.logic'

const baseSnapshot: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    { tag: 'reading.phonics.cvc.emerging', label: 'CVC blending', level: SkillLevel.Emerging },
    { tag: 'math.subtraction.regrouping.emerging', label: 'Regrouping', level: SkillLevel.Emerging },
  ],
  supports: [],
  stopRules: [
    { label: 'Skip long passages', trigger: 'Frustration spikes', action: 'Do 3 guided reps' },
  ],
  evidenceDefinitions: [
    { label: 'CVC', description: 'Blends 3+ CVC words with <=1 error' },
  ],
}

const baseInputs: PlanGeneratorInputs = {
  snapshot: baseSnapshot,
  hoursPerDay: 2.5,
  appBlocks: [{ label: 'Reading Eggs', defaultMinutes: 15 }],
  assignments: [],
}

beforeEach(() => {
  resetIdCounter()
})

describe('buildMinimumWinText', () => {
  it('returns generic text when no snapshot', () => {
    const text = buildMinimumWinText(null)
    expect(text).toContain('Complete daily assignments')
  })

  it('returns generic text when snapshot has no priority skills', () => {
    const text = buildMinimumWinText({ ...baseSnapshot, prioritySkills: [] })
    expect(text).toContain('Complete daily assignments')
  })

  it('includes daily micro reps for emerging skills', () => {
    const text = buildMinimumWinText(baseSnapshot)
    expect(text).toContain('CVC blending: daily micro reps')
    expect(text).toContain('Regrouping: daily micro reps')
  })

  it('includes 3x/week for developing skills', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        { tag: 'writing.handwriting', label: 'Handwriting', level: SkillLevel.Developing },
      ],
    }
    const text = buildMinimumWinText(snapshot)
    expect(text).toContain('Handwriting: 3x/week practice')
  })
})

describe('applySnapshotSuggestions', () => {
  const assignment: AssignmentCandidate = {
    id: 'a1',
    subjectBucket: SubjectBucket.Math,
    workbookName: 'Math G2',
    lessonName: 'L5',
    estimatedMinutes: 15,
    difficultyCues: [],
    action: AssignmentAction.Keep,
  }

  it('returns unchanged when no snapshot', () => {
    const result = applySnapshotSuggestions([assignment], null)
    expect(result.assignments).toEqual([assignment])
    expect(result.skipSuggestions).toHaveLength(0)
  })

  it('applies modify for stop rule match', () => {
    const a: AssignmentCandidate = { ...assignment, difficultyCues: ['frustration spikes'] }
    const result = applySnapshotSuggestions([a], baseSnapshot)
    expect(result.assignments[0].action).toBe(AssignmentAction.Modify)
    expect(result.skipSuggestions).toHaveLength(1)
  })

  it('applies modify for long tasks', () => {
    const a: AssignmentCandidate = { ...assignment, estimatedMinutes: 25 }
    const result = applySnapshotSuggestions([a], baseSnapshot)
    expect(result.assignments[0].action).toBe(AssignmentAction.Modify)
    expect(result.assignments[0].skipSuggestion?.reason).toContain('attention window')
  })
})

describe('generateDraftPlanFromInputs', () => {
  it('creates app blocks for each day', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    expect(plan.days).toHaveLength(5)
    for (const day of plan.days) {
      const appItems = day.items.filter((item) => item.isAppBlock)
      expect(appItems).toHaveLength(1)
      expect(appItems[0].title).toBe('Reading Eggs')
    }
  })

  it('generates daily micro reps for emerging skills', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    for (const day of plan.days) {
      const microReps = day.items.filter((item) => item.title.includes('micro rep'))
      // 2 emerging skills = 2 micro reps per day
      expect(microReps).toHaveLength(2)
      expect(microReps[0].estimatedMinutes).toBe(8)
    }
  })

  it('distributes assignments across least-loaded days', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 20, difficultyCues: [], action: AssignmentAction.Keep,
        },
        {
          id: 'a2', subjectBucket: SubjectBucket.Reading, workbookName: 'Reading', lessonName: 'L2',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const assignmentItems = plan.days.flatMap((d) => d.items.filter((i) => i.assignmentId))
    expect(assignmentItems).toHaveLength(2)
    // Should be on different days since all days start equally loaded
    const days = new Set(assignmentItems.map((_, idx) =>
      plan.days.find((d) => d.items.includes(assignmentItems[idx]))?.day,
    ))
    expect(days.size).toBe(2)
  })

  it('reduces time for modified assignments', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 30, difficultyCues: [], action: AssignmentAction.Modify,
        },
      ],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const item = plan.days.flatMap((d) => d.items).find((i) => i.assignmentId === 'a1')
    expect(item).toBeDefined()
    expect(item!.estimatedMinutes).toBe(18) // 30 * 0.6
  })

  it('skips assignments with Skip action', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Skip,
        },
      ],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const assignmentItems = plan.days.flatMap((d) => d.items.filter((i) => i.assignmentId))
    expect(assignmentItems).toHaveLength(0)
  })

  it('includes minimum win text from snapshot', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    expect(plan.minimumWin).toContain('CVC blending')
    expect(plan.minimumWin).toContain('daily micro reps')
  })

  it('applies lighten day adjustment', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 30, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
      adjustments: [{ type: AdjustmentType.LightenDay, day: 'Monday' }],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    const monday = plan.days.find((d) => d.day === 'Monday')!
    // Assignment should have been halved (30 -> 15)
    const item = monday.items.find((i) => i.assignmentId === 'a1')
    if (item) {
      expect(item.estimatedMinutes).toBeLessThanOrEqual(15)
    }
  })

  it('applies move subject adjustment', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
      adjustments: [{
        type: AdjustmentType.MoveSubject,
        subject: SubjectBucket.Math,
        toDays: ['Tuesday', 'Thursday'],
      }],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    // Math should only be accepted on Tue/Thu
    for (const day of plan.days) {
      const mathItems = day.items.filter((i) => i.subjectBucket === SubjectBucket.Math && i.accepted)
      if (day.day === 'Tuesday' || day.day === 'Thursday') {
        // Could be 0 or more depending on where it was assigned
      } else {
        expect(mathItems).toHaveLength(0)
      }
    }
  })

  it('applies cap subject time adjustment', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math', lessonName: 'L1',
          estimatedMinutes: 30, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
      adjustments: [{
        type: AdjustmentType.CapSubjectTime,
        subject: SubjectBucket.Math,
        maxMinutesPerDay: 15,
      }],
    }
    const plan = generateDraftPlanFromInputs(inputs)
    for (const day of plan.days) {
      for (const item of day.items) {
        if (item.subjectBucket === SubjectBucket.Math) {
          expect(item.estimatedMinutes).toBeLessThanOrEqual(15)
        }
      }
    }
  })
})

describe('dayTotalMinutes', () => {
  it('sums only accepted items', () => {
    const day = {
      day: 'Monday' as const,
      timeBudgetMinutes: 150,
      items: [
        { id: '1', title: 'A', subjectBucket: SubjectBucket.Math, estimatedMinutes: 20, skillTags: [], accepted: true },
        { id: '2', title: 'B', subjectBucket: SubjectBucket.Reading, estimatedMinutes: 15, skillTags: [], accepted: true },
        { id: '3', title: 'C', subjectBucket: SubjectBucket.Other, estimatedMinutes: 10, skillTags: [], accepted: false },
      ],
    }
    expect(dayTotalMinutes(day)).toBe(35)
  })
})

describe('planTotalMinutes', () => {
  it('sums all days', () => {
    const plan = generateDraftPlanFromInputs({ ...baseInputs, snapshot: null })
    // 1 app block * 15 min * 5 days = 75 minutes
    expect(planTotalMinutes(plan)).toBe(75)
  })
})
