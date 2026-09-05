import { describe, expect, it, beforeEach } from 'vitest'
import type { ActivityConfig, AssignmentCandidate, DraftWeeklyPlan, SkillSnapshot } from '../../core/types'
import type { ChatResponse } from '../../core/ai/useAI'
import { ActivityFrequency, AssignmentAction, MasteryGate, SkillLevel, SubjectBucket } from '../../core/types/enums'
import {
  activityConfigsToRoutineText,
  AdjustmentType,
  applySnapshotSuggestions,
  buildMinimumWinText,
  buildPlannerPrompt,
  buildShiftedWeekPlan,
  dateKeyForDayPlan,
  dayTotalMinutes,
  ensureEvaluationItems,
  fillMissingDaysFromRoutine,
  filterRoutineForCompletedPrograms,
  formatDayCardLabel,
  formatPlanningWeekLabel,
  isPlanningWeekPast,
  generateDraftPlanFromInputs,
  parseAIResponse,
  frequencyDaysPerWeek,
  parseRoutineTotalMinutes,
  routineDailyBudgetMinutes,
  SCHOOL_DAYS_PER_WEEK,
  planTotalMinutes,
  resetIdCounter,
  resolveSuggestedTags,
  WEEK_DAYS,
} from './chatPlanner.logic'
import type { PlanGeneratorInputs } from './chatPlanner.logic'
import { ALL_SKILL_TAGS } from '../../core/types/skillTags'

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

  it('suggests skip when a priority skill at IndependentConsistent matches the assignment (G6)', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        {
          tag: 'math.addition.facts',
          label: 'Addition Facts',
          level: SkillLevel.Secure,
          masteryGate: MasteryGate.IndependentConsistent,
        },
      ],
    }
    const a: AssignmentCandidate = {
      ...assignment,
      workbookName: 'Math Workbook',
      lessonName: 'Addition Facts review',
    }
    const result = applySnapshotSuggestions([a], snapshot)
    expect(result.assignments[0].action).toBe(AssignmentAction.Skip)
    expect(result.assignments[0].skipSuggestion?.action).toBe('skip')
    expect(result.assignments[0].skipSuggestion?.reason).toContain('Addition Facts')
  })

  it('suggests modify when a priority skill at MostlyIndependent matches the assignment (G6)', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        {
          tag: 'math.subtraction.regroup',
          label: 'Regrouping',
          level: SkillLevel.Practice,
          masteryGate: MasteryGate.MostlyIndependent,
        },
      ],
    }
    const a: AssignmentCandidate = {
      ...assignment,
      workbookName: 'Math',
      lessonName: 'Regrouping practice',
    }
    const result = applySnapshotSuggestions([a], snapshot)
    expect(result.assignments[0].action).toBe(AssignmentAction.Modify)
    expect(result.assignments[0].skipSuggestion?.reason).toContain('Regrouping')
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

  it('consolidates emerging skills into one daily item', () => {
    const plan = generateDraftPlanFromInputs(baseInputs)
    for (const day of plan.days) {
      const skillItems = day.items.filter((item) => item.title.includes('Skill practice'))
      // 2 emerging skills = 1 consolidated item per day
      expect(skillItems).toHaveLength(1)
      expect(skillItems[0].estimatedMinutes).toBe(10) // 2 skills × 5min, capped at 15
      expect(skillItems[0].skillTags).toHaveLength(2)
      expect(skillItems[0].category).toBe('choose')
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

  it('applies lighten day adjustment and redistributes items', () => {
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
    // Non-essential items on Monday should be removed (accepted = false)
    const mondayItem = monday.items.find((i) => i.assignmentId === 'a1')
    if (mondayItem) {
      expect(mondayItem.accepted).toBe(false)
    }
    // The removed item should be redistributed to another day
    const otherDays = plan.days.filter((d) => d.day !== 'Monday')
    const redistributed = otherDays.flatMap((d) => d.items).filter(
      (i) => i.subjectBucket === SubjectBucket.Math && i.accepted,
    )
    // Should have more math items on other days than before (original 4 from bin-packing + 1 redistributed)
    expect(redistributed.length).toBeGreaterThan(0)
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

describe('generateDraftPlanFromInputs — FEAT-73 no-guess assignment tags', () => {
  const keepAssignment = (
    id: string,
    subjectBucket: SubjectBucket,
    workbookName: string,
  ): AssignmentCandidate => ({
    id,
    subjectBucket,
    workbookName,
    lessonName: 'L1',
    estimatedMinutes: 15,
    difficultyCues: [],
    action: AssignmentAction.Keep,
  })
  const assignmentItem = (plan: DraftWeeklyPlan, id: string) =>
    plan.days.flatMap((d) => d.items).find((i) => i.assignmentId === id)

  it('does not guess a reading tag for an untagged LanguageArts assignment (no priority match)', () => {
    const plan = generateDraftPlanFromInputs({
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [keepAssignment('la1', SubjectBucket.LanguageArts, 'Handwriting')],
    })
    const item = assignmentItem(plan, 'la1')
    expect(item).toBeDefined()
    // Before FEAT-73 this stamped ['reading.cvcBlend','reading.sightWords'] — a
    // cross-domain guess that seeded false CVC re-tests for writing work.
    expect(item!.skillTags).toEqual([])
  })

  it('keeps a priority-matched (witnessed) reading tag on a LanguageArts assignment', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [{ tag: 'reading.sightWords', label: 'Sight words', level: SkillLevel.Developing }],
    }
    const plan = generateDraftPlanFromInputs({
      ...baseInputs,
      snapshot,
      appBlocks: [],
      assignments: [keepAssignment('la1', SubjectBucket.LanguageArts, 'Handwriting')],
    })
    // Witnessed coverage preserved — proves this is NOT a blanket LA suppression.
    expect(assignmentItem(plan, 'la1')!.skillTags).toEqual(['reading.sightWords'])
  })

  it('does not guess a tag for a non-core (Science) assignment', () => {
    const plan = generateDraftPlanFromInputs({
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [keepAssignment('s1', SubjectBucket.Science, 'Science')],
    })
    // Before FEAT-73 this stamped a stray reading tag (ALL_SKILL_TAGS.slice(0,2)).
    expect(assignmentItem(plan, 's1')!.skillTags).toEqual([])
  })

  it('leaves reading/math assignment tags unchanged (same-domain subject default)', () => {
    const plan = generateDraftPlanFromInputs({
      ...baseInputs,
      snapshot: null,
      appBlocks: [],
      assignments: [
        keepAssignment('r1', SubjectBucket.Reading, 'Reading'),
        keepAssignment('m1', SubjectBucket.Math, 'Math'),
      ],
    })
    expect(assignmentItem(plan, 'r1')!.skillTags).toEqual(['reading.cvcBlend', 'reading.sightWords'])
    expect(assignmentItem(plan, 'm1')!.skillTags).toEqual([
      'math.subtraction.regroup',
      'math.subtraction.noRegroup',
    ])
  })

  it('leaves multi-tag skill-practice items untouched (witnessed priority skills)', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        { tag: 'reading.cvcBlend', label: 'CVC', level: SkillLevel.Emerging },
        { tag: 'math.subtraction.regroup', label: 'Regroup', level: SkillLevel.Emerging },
      ],
    }
    const plan = generateDraftPlanFromInputs({ ...baseInputs, snapshot, assignments: [] })
    const skillItem = plan.days[0].items.find((i) => i.title.includes('Skill practice'))
    expect(skillItem).toBeDefined()
    // Emerging skills stamp their full priority-tag set — FEAT-73 does not touch these.
    expect(skillItem!.skillTags).toEqual(['reading.cvcBlend', 'math.subtraction.regroup'])
  })
})

describe('resolveSuggestedTags — FEAT-73 shared no-guess resolver', () => {
  it('keeps priority-matched tags for LanguageArts (witnessed)', () => {
    expect(resolveSuggestedTags(SubjectBucket.LanguageArts, ['reading.sightWords'])).toEqual([
      'reading.sightWords',
    ])
  })

  it('suppresses the reading-first subject default for an unwitnessed LanguageArts item', () => {
    expect(resolveSuggestedTags(SubjectBucket.LanguageArts, [])).toEqual([])
  })

  it('suppresses any tag for a non-core subject even when a priority tag matches the catalog', () => {
    expect(resolveSuggestedTags(SubjectBucket.Science, ['reading.cvcBlend'])).toEqual([])
  })

  it('keeps the same-domain subject default for reading/math without a witness', () => {
    expect(resolveSuggestedTags(SubjectBucket.Reading, [])).toEqual([
      'reading.cvcBlend',
      'reading.sightWords',
    ])
    expect(resolveSuggestedTags(SubjectBucket.Math, [])).toEqual([
      'math.subtraction.regroup',
      'math.subtraction.noRegroup',
    ])
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

// ── AI Integration Tests ─────────────────────────────────────

describe('buildPlannerPrompt', () => {
  it('includes hours per day budget', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('150 minutes/day')
  })

  it('includes app blocks', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('Reading Eggs')
    expect(prompt).toContain('15 min/day')
  })

  it('includes assignments when present', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      assignments: [
        {
          id: 'a1', subjectBucket: SubjectBucket.Math, workbookName: 'Math G2', lessonName: 'L5',
          estimatedMinutes: 15, difficultyCues: [], action: AssignmentAction.Keep,
        },
      ],
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('Math G2')
    expect(prompt).toContain('L5')
  })

  it('includes priority skills from snapshot', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('CVC blending')
    expect(prompt).toContain('Regrouping')
  })

  it('includes stop rules from snapshot', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('Frustration spikes')
  })

  it('includes adjustments when present', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      adjustments: [{ type: AdjustmentType.LightenDay, day: 'Wednesday' }],
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('lighten_day')
    expect(prompt).toContain('Wednesday')
  })

  it('includes JSON schema instruction', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('Respond ONLY with a JSON object')
  })
})

describe('parseAIResponse', () => {
  const validPlan = {
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: 150,
        items: [
          {
            title: 'CVC blending (micro rep)',
            subjectBucket: 'Reading',
            estimatedMinutes: 8,
            skillTags: ['reading.phonics.cvc'],
            isAppBlock: false,
            accepted: true,
          },
          {
            title: 'Reading Eggs',
            subjectBucket: 'Other',
            estimatedMinutes: 15,
            skillTags: [],
            isAppBlock: true,
            accepted: true,
          },
        ],
      },
      {
        day: 'Tuesday',
        timeBudgetMinutes: 150,
        items: [
          {
            title: 'Math worksheet',
            subjectBucket: 'Math',
            estimatedMinutes: 20,
            skillTags: [],
            isAppBlock: false,
            accepted: true,
          },
        ],
      },
    ],
    skipSuggestions: [],
    minimumWin: 'CVC blending: daily micro reps (5-8 min).',
  }

  const makeResponse = (message: string): ChatResponse => ({
    message,
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 100, outputTokens: 200 },
  })

  it('parses a valid JSON response into DraftWeeklyPlan', () => {
    const result = parseAIResponse(makeResponse(JSON.stringify(validPlan)))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
    expect(result!.days[0].day).toBe('Monday')
    expect(result!.days[0].items).toHaveLength(2)
    expect(result!.days[0].items[0].title).toBe('CVC blending (micro rep)')
    expect(result!.days[0].items[0].subjectBucket).toBe(SubjectBucket.Reading)
    expect(result!.minimumWin).toContain('CVC blending')
  })

  it('generates unique IDs for each item', () => {
    const result = parseAIResponse(makeResponse(JSON.stringify(validPlan)))
    const allIds = result!.days.flatMap((d) => d.items.map((i) => i.id))
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(allIds.length)
  })

  it('strips markdown code fences', () => {
    const wrapped = '```json\n' + JSON.stringify(validPlan) + '\n```'
    const result = parseAIResponse(makeResponse(wrapped))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })

  it('extracts JSON when AI adds preamble text before the object', () => {
    const preamble = "Here's your weekly plan:\n" + JSON.stringify(validPlan)
    const result = parseAIResponse(makeResponse(preamble))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
    expect(result!.days[0].day).toBe('Monday')
  })

  it('extracts JSON when AI adds trailing text after the object', () => {
    const trailing = JSON.stringify(validPlan) + '\n\nLet me know if you want adjustments!'
    const result = parseAIResponse(makeResponse(trailing))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })

  it('extracts JSON wrapped in markdown fences with preamble', () => {
    const mixed = "Here's the plan:\n```json\n" + JSON.stringify(validPlan) + '\n```\nAdjust as needed.'
    const result = parseAIResponse(makeResponse(mixed))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })

  it('defaults invalid subjectBucket to Other', () => {
    const plan = {
      ...validPlan,
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [
            {
              title: 'Test item',
              subjectBucket: 'InvalidSubject',
              estimatedMinutes: 10,
              skillTags: [],
            },
          ],
        },
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].subjectBucket).toBe(SubjectBucket.Other)
  })

  it('defaults accepted to true when not specified', () => {
    const plan = {
      ...validPlan,
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [{ title: 'Test', subjectBucket: 'Math', estimatedMinutes: 10 }],
        },
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.days[0].items[0].accepted).toBe(true)
  })

  it('parses skip suggestions when present', () => {
    const plan = {
      ...validPlan,
      skipSuggestions: [
        {
          action: 'modify',
          reason: 'Long task',
          replacement: 'Do half',
          evidence: 'Completes modified set',
        },
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.skipSuggestions).toHaveLength(1)
    expect(result!.skipSuggestions[0].reason).toBe('Long task')
  })

  it('returns null for empty string', () => {
    expect(parseAIResponse(makeResponse(''))).toBeNull()
  })

  it('returns null for non-JSON text', () => {
    expect(parseAIResponse(makeResponse('Here is your plan for the week...'))).toBeNull()
  })

  it('returns null when days array is missing', () => {
    expect(parseAIResponse(makeResponse(JSON.stringify({ minimumWin: 'x' })))).toBeNull()
  })

  it('returns null when days array is empty', () => {
    expect(parseAIResponse(makeResponse(JSON.stringify({ days: [], minimumWin: 'x' })))).toBeNull()
  })

  it('defaults minimumWin when missing from AI response', () => {
    const plan = { days: [{ day: 'Monday', items: [{ title: 'X', estimatedMinutes: 10 }] }] }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.minimumWin).toBe('Complete the core items for each day.')
  })

  it('skips items with missing title but keeps other items', () => {
    const plan = {
      days: [{ day: 'Monday', items: [
        { estimatedMinutes: 10, subjectBucket: 'Math' },
        { title: 'Good Item', estimatedMinutes: 15, subjectBucket: 'Reading' },
      ] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    // First item has no title → gets coerced to 'Activity', which is truthy, so it's kept
    expect(result!.days[0].items.length).toBeGreaterThanOrEqual(1)
  })

  it('defaults estimatedMinutes to 15 when missing', () => {
    const plan = {
      days: [{ day: 'Monday', items: [{ title: 'X', subjectBucket: 'Math' }] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].estimatedMinutes).toBe(15)
  })

  it('defaults items with negative estimatedMinutes to 15 and keeps all items', () => {
    const plan = {
      days: [{ day: 'Monday', items: [
        { title: 'Bad', estimatedMinutes: -5, subjectBucket: 'Math' },
        { title: 'Good', estimatedMinutes: 10, subjectBucket: 'Reading' },
      ] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items).toHaveLength(2)
    expect(result!.days[0].items[0].title).toBe('Bad')
    expect(result!.days[0].items[0].estimatedMinutes).toBe(15)
    expect(result!.days[0].items[1].title).toBe('Good')
    expect(result!.days[0].items[1].estimatedMinutes).toBe(10)
  })

  it('coerces string estimatedMinutes to number', () => {
    const plan = {
      days: [{ day: 'Monday', items: [{ title: 'X', estimatedMinutes: '8', subjectBucket: 'Math' }] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].estimatedMinutes).toBe(8)
  })

  it('returns null when all days are invalid', () => {
    const plan = {
      days: [{ items: [{ title: 'X', estimatedMinutes: 10 }] }],
      minimumWin: 'x',
    }
    expect(parseAIResponse(makeResponse(JSON.stringify(plan)))).toBeNull()
  })

  it('defaults timeBudgetMinutes to 150 when not provided', () => {
    const plan = {
      days: [{ day: 'Monday', items: [{ title: 'X', estimatedMinutes: 10, subjectBucket: 'Math' }] }],
      minimumWin: 'x',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.days[0].timeBudgetMinutes).toBe(150)
  })

  it('filters out malformed skip suggestions', () => {
    const plan = {
      ...validPlan,
      skipSuggestions: [
        { action: 'modify', reason: 'valid', replacement: 'ok', evidence: 'yes' },
        { action: 'modify' }, // missing fields
        'not an object',
      ],
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result!.skipSuggestions).toHaveLength(1)
  })

  it('handles JSON with trailing commas (forgiving parser)', () => {
    const jsonWithTrailing = `{
      "days": [
        {
          "day": "Monday",
          "timeBudgetMinutes": 150,
          "items": [
            { "title": "Math", "estimatedMinutes": 20, "subjectBucket": "Math", },
          ],
        },
      ],
      "minimumWin": "Complete math",
    }`
    const result = parseAIResponse(makeResponse(jsonWithTrailing))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].title).toBe('Math')
  })

  it('handles truncated JSON response (forgiving parser)', () => {
    const truncated = `{
      "days": [
        {
          "day": "Monday",
          "timeBudgetMinutes": 150,
          "items": [
            { "title": "Reading practice", "estimatedMinutes": 15, "subjectBucket": "Reading" }
          ]
        }
      ],
      "minimumWin": "Complete reading`
    const result = parseAIResponse(makeResponse(truncated))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(1)
    expect(result!.days[0].items[0].title).toBe('Reading practice')
  })

  it('extracts JSON from markdown fences with preamble and trailing text', () => {
    const messy = `Sure! Here's your plan:

\`\`\`json
${JSON.stringify(validPlan)}
\`\`\`

Let me know if you'd like any changes!`
    const result = parseAIResponse(makeResponse(messy))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
  })
})

describe('parseAIResponse — enhanced fallbacks', () => {
  const makeResponse = (message: string): ChatResponse => ({
    message,
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 100, outputTokens: 200 },
  })

  it('extracts plan from nested { plan: { days: [...] } } wrapper', () => {
    const wrapped = {
      plan: {
        days: [
          {
            day: 'Monday',
            timeBudgetMinutes: 150,
            items: [{ title: 'Math practice', subjectBucket: 'Math', estimatedMinutes: 20 }],
          },
        ],
        minimumWin: 'Complete math',
      },
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(wrapped)))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(1)
    expect(result!.days[0].items[0].title).toBe('Math practice')
    expect(result!.minimumWin).toBe('Complete math')
  })

  it('extracts plan from nested { weeklyPlan: { days: [...] } } wrapper', () => {
    const wrapped = {
      weeklyPlan: {
        days: [
          { day: 'Tuesday', items: [{ title: 'Reading', estimatedMinutes: 15, subjectBucket: 'Reading' }] },
        ],
        minimumWin: 'Read daily',
      },
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(wrapped)))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(1)
    expect(result!.days[0].day).toBe('Tuesday')
  })

  it('falls back to text extraction when no JSON is found', () => {
    const text = `Here is your plan:

Monday:
- Handwriting practice — 20 min
- GATB Reading — 30 min
- Math worksheet — 25 min

Tuesday:
- Booster cards — 15 min
- Sight word games — 15 min

Let me know if you want changes!`

    const result = parseAIResponse(makeResponse(text))
    expect(result).not.toBeNull()
    expect(result!.days.length).toBeGreaterThanOrEqual(2)
    expect(result!.days[0].day).toBe('Monday')
    expect(result!.days[0].items.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to text extraction when days array is empty in JSON', () => {
    const result = parseAIResponse(makeResponse(JSON.stringify({ days: [], minimumWin: 'x' })))
    // Empty days JSON → returns null (no text fallback content either)
    expect(result).toBeNull()
  })

  it('guesses subject from activity title in text fallback', () => {
    const text = `Monday:
- GATB Math lesson 5 — 30 min
- Phonics practice — 15 min
- Handwriting — 20 min
- Science experiment — 25 min`

    const result = parseAIResponse(makeResponse(text))
    expect(result).not.toBeNull()
    const items = result!.days[0].items
    const mathItem = items.find((i) => i.title.includes('Math'))
    expect(mathItem?.subjectBucket).toBe(SubjectBucket.Math)
    const phonicsItem = items.find((i) => i.title.includes('Phonics'))
    expect(phonicsItem?.subjectBucket).toBe(SubjectBucket.Reading)
    const handwritingItem = items.find((i) => i.title.includes('Handwriting'))
    expect(handwritingItem?.subjectBucket).toBe(SubjectBucket.LanguageArts)
    const scienceItem = items.find((i) => i.title.includes('Science'))
    expect(scienceItem?.subjectBucket).toBe(SubjectBucket.Science)
  })

  it('extracts time from bullet items in text fallback', () => {
    const text = `Monday:
- Booster cards — 15 min
- Reading practice — 30 min`

    const result = parseAIResponse(makeResponse(text))
    expect(result).not.toBeNull()
    const booster = result!.days[0].items.find((i) => i.title.includes('Booster'))
    expect(booster?.estimatedMinutes).toBe(15)
  })
})

describe('parseAIResponse — skipGuidance and weekSkipSummary', () => {
  const makeResponse = (message: string): ChatResponse => ({
    message,
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0 },
  })

  it('extracts skipGuidance from items', () => {
    const plan = {
      days: [{
        day: 'Monday',
        timeBudgetMinutes: 150,
        items: [{
          title: 'Math drills',
          subjectBucket: 'Math',
          estimatedMinutes: 20,
          skillTags: [],
          skipGuidance: 'Do odds only if time is short',
        }],
      }],
      minimumWin: 'Do math',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].skipGuidance).toBe('Do odds only if time is short')
  })

  it('extracts weekSkipSummary from plan', () => {
    const plan = {
      days: [{
        day: 'Monday',
        timeBudgetMinutes: 150,
        items: [{
          title: 'Reading',
          subjectBucket: 'Reading',
          estimatedMinutes: 30,
          skillTags: [],
        }],
      }],
      minimumWin: 'Read daily',
      weekSkipSummary: 'Drop Wednesday art if needed',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.weekSkipSummary).toBe('Drop Wednesday art if needed')
  })

  it('handles wrapped plan with weekSkipSummary', () => {
    const wrapped = {
      weeklyPlan: {
        days: [{
          day: 'Tuesday',
          timeBudgetMinutes: 120,
          items: [{
            title: 'Phonics',
            subjectBucket: 'Reading',
            estimatedMinutes: 15,
            skillTags: [],
          }],
        }],
        minimumWin: 'Phonics daily',
        weekSkipSummary: 'Skip science if energy is low',
      },
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(wrapped)))
    expect(result).not.toBeNull()
    expect(result!.weekSkipSummary).toBe('Skip science if energy is low')
  })

  it('parses items with minutes alias for estimatedMinutes', () => {
    const plan = {
      days: [{
        day: 'Monday',
        timeBudgetMinutes: 150,
        items: [{
          title: 'Handwriting',
          subjectBucket: 'LanguageArts',
          minutes: 25,
          skillTags: [],
        }],
      }],
      minimumWin: 'Write daily',
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(plan)))
    expect(result).not.toBeNull()
    expect(result!.days[0].items[0].estimatedMinutes).toBe(25)
  })

  it('finds days under arbitrary wrapper key', () => {
    const wrapped = {
      schedule: {
        days: [{
          day: 'Wednesday',
          timeBudgetMinutes: 120,
          items: [{
            title: 'Science',
            subjectBucket: 'Science',
            estimatedMinutes: 30,
            skillTags: [],
          }],
        }],
        minimumWin: 'Explore',
      },
    }
    const result = parseAIResponse(makeResponse(JSON.stringify(wrapped)))
    expect(result).not.toBeNull()
    expect(result!.days[0].day).toBe('Wednesday')
  })
})

describe('buildPlannerPrompt with dailyRoutine', () => {
  it('includes daily routine when provided', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      dailyRoutine: 'Handwriting (20 min)\nReading Eggs (45 min)',
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('MUST-DO: "Handwriting" — 20 minutes')
    expect(prompt).toContain('MUST-DO: "Reading Eggs" — 45 minutes')
    expect(prompt).toContain('YOUR #1 JOB')
  })

  it('excludes daily routine section when not provided', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).not.toContain('YOUR #1 JOB')
  })
})

describe('buildPlannerPrompt with subjectTimeDefaults', () => {
  it('includes subject time defaults when provided', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      subjectTimeDefaults: { Reading: 25, Math: 30, Other: 10 },
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('Subject time defaults')
    expect(prompt).toContain('Reading: 25 min/day')
    expect(prompt).toContain('Math: 30 min/day')
    expect(prompt).toContain('Formation/Prayer: 10 min/day')
  })

  it('formats LanguageArts and SocialStudies labels correctly', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      subjectTimeDefaults: { LanguageArts: 20, SocialStudies: 15 },
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('Language Arts: 20 min/day')
    expect(prompt).toContain('Social Studies: 15 min/day')
  })

  it('excludes subject time defaults section when not provided', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).not.toContain('Subject time defaults')
  })

  it('excludes subject time defaults section when empty object', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      subjectTimeDefaults: {},
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).not.toContain('Subject time defaults')
  })
})

describe('buildPlannerPrompt size constraints', () => {
  it('includes critical size constraint instructions', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('CRITICAL SIZE CONSTRAINTS')
    expect(prompt).toContain('max 6 words')
    expect(prompt).toContain('under 4000 tokens')
  })
})

describe('buildPlannerPrompt hard budget rule', () => {
  it('emits a hard budget rule that forbids overflow plans', () => {
    const prompt = buildPlannerPrompt(baseInputs)
    expect(prompt).toContain('HARD BUDGET RULE')
    expect(prompt).toMatch(/SUM of estimatedMinutes per day MUST be/)
    expect(prompt).toContain('fewer-item plan that fits is ALWAYS better')
  })

  it('treats subject time defaults as totals per subject, not per item', () => {
    const inputs: PlanGeneratorInputs = {
      ...baseInputs,
      subjectTimeDefaults: { Reading: 30 },
    }
    const prompt = buildPlannerPrompt(inputs)
    expect(prompt).toContain('TOTAL minutes per subject per day')
    expect(prompt).toContain('Do NOT add multiple items in the same subject')
  })
})

describe('parseAIResponse — severely truncated JSON', () => {
  const makeResponse = (message: string): ChatResponse => ({
    message,
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 100, outputTokens: 200 },
  })

  it('recovers partial days from truncated mid-day JSON', () => {
    // Simulates AI returning 2 complete days then truncating mid-Wednesday
    const truncated = `{
      "days": [
        {
          "day": "Monday",
          "timeBudgetMinutes": 150,
          "items": [
            { "title": "Prayer", "estimatedMinutes": 10, "subjectBucket": "Other" },
            { "title": "Reading", "estimatedMinutes": 20, "subjectBucket": "Reading" }
          ]
        },
        {
          "day": "Tuesday",
          "timeBudgetMinutes": 150,
          "items": [
            { "title": "Math drills", "estimatedMinutes": 15, "subjectBucket": "Math" }
          ]
        },
        {
          "day": "Wednes`
    const result = parseAIResponse(makeResponse(truncated))
    expect(result).not.toBeNull()
    // Should recover at least the 2 complete days
    expect(result!.days.length).toBeGreaterThanOrEqual(1)
    expect(result!.days[0].day).toBe('Monday')
  })

  it('handles JSON with no closing brace at all', () => {
    const truncated = `{ "days": [ { "day": "Monday", "timeBudgetMinutes": 150, "items": [ { "title": "Formation", "estimatedMinutes": 10, "subjectBucket": "Other" } ] }`
    const result = parseAIResponse(makeResponse(truncated))
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(1)
    expect(result!.days[0].day).toBe('Monday')
  })
})

describe('fillMissingDaysFromRoutine', () => {
  it('returns plan unchanged when all 5 days present', () => {
    const plan = {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({
        day,
        timeBudgetMinutes: 150,
        items: [{ id: 'x', title: 'Test', subjectBucket: SubjectBucket.Other, estimatedMinutes: 10, skillTags: [], accepted: true }],
      })),
      skipSuggestions: [],
      minimumWin: 'test',
    }
    const result = fillMissingDaysFromRoutine(plan, 'Handwriting — 20 min — LanguageArts', 2.5)
    expect(result.plan.days).toHaveLength(5)
    expect(result.filledDays).toHaveLength(0)
  })

  it('fills missing days from routine text', () => {
    const plan = {
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [{ id: 'x', title: 'AI item', subjectBucket: SubjectBucket.Reading, estimatedMinutes: 20, skillTags: [], accepted: true }],
        },
        {
          day: 'Tuesday',
          timeBudgetMinutes: 150,
          items: [{ id: 'y', title: 'AI item 2', subjectBucket: SubjectBucket.Math, estimatedMinutes: 15, skillTags: [], accepted: true }],
        },
      ],
      skipSuggestions: [],
      minimumWin: 'test',
    }
    const result = fillMissingDaysFromRoutine(plan, 'Handwriting — 20 min — LanguageArts', 2.5)
    expect(result.plan.days).toHaveLength(5)
    expect(result.filledDays).toEqual(['Wednesday', 'Thursday', 'Friday'])
    // Monday/Tuesday should keep AI items
    expect(result.plan.days[0].items[0].title).toBe('AI item')
    expect(result.plan.days[1].items[0].title).toBe('AI item 2')
    // Wed/Thu/Fri should have routine items
    expect(result.plan.days[2].day).toBe('Wednesday')
    expect(result.plan.days[2].items[0].title).toBe('Handwriting')
    expect(result.plan.days[3].day).toBe('Thursday')
    expect(result.plan.days[4].day).toBe('Friday')
  })

  it('returns plan unchanged when no routine provided', () => {
    const plan = {
      days: [{ day: 'Monday', timeBudgetMinutes: 150, items: [] }],
      skipSuggestions: [],
      minimumWin: 'test',
    }
    const result = fillMissingDaysFromRoutine(plan, undefined, 2.5)
    expect(result.plan.days).toHaveLength(1)
    expect(result.filledDays).toHaveLength(0)
  })

  it('maintains weekday order after filling', () => {
    const plan = {
      days: [
        { day: 'Friday', timeBudgetMinutes: 150, items: [{ id: 'x', title: 'Friday item', subjectBucket: SubjectBucket.Other, estimatedMinutes: 10, skillTags: [], accepted: true }] },
      ],
      skipSuggestions: [],
      minimumWin: 'test',
    }
    const result = fillMissingDaysFromRoutine(plan, 'Math — 30 min — Math', 2.5)
    expect(result.plan.days).toHaveLength(5)
    expect(result.plan.days.map(d => d.day)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    // Friday should still have the AI item
    expect(result.plan.days[4].items[0].title).toBe('Friday item')
    expect(result.filledDays).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday'])
  })
})

describe('dateKeyForDayPlan', () => {
  it('returns Monday date from Sunday-based week start', () => {
    expect(dateKeyForDayPlan('2026-04-05', 'Monday')).toBe('2026-04-06')
  })

  it('returns Friday date from Sunday-based week start', () => {
    expect(dateKeyForDayPlan('2026-04-05', 'Friday')).toBe('2026-04-10')
  })

  it('returns correct dates for all 5 weekdays', () => {
    const results = WEEK_DAYS.map((day) => dateKeyForDayPlan('2026-04-05', day))
    expect(results).toEqual([
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
    ])
  })

  it('handles month boundary (March → April)', () => {
    expect(dateKeyForDayPlan('2026-03-29', 'Friday')).toBe('2026-04-03')
  })

  it('handles year boundary (December → January)', () => {
    expect(dateKeyForDayPlan('2025-12-28', 'Friday')).toBe('2026-01-02')
  })

  it('throws on invalid day name', () => {
    expect(() => dateKeyForDayPlan('2026-04-05', 'Saturday' as typeof WEEK_DAYS[number])).toThrow(
      /Invalid day/,
    )
  })
})

describe('formatDayCardLabel (FEAT-112)', () => {
  // Planning week of Jul 20–24, 2026 has Sunday-start 2026-07-19.
  it('renders the concrete mapped date next to the weekday', () => {
    expect(formatDayCardLabel('2026-07-19', 'Monday')).toBe('Monday · Jul 20')
    expect(formatDayCardLabel('2026-07-19', 'Friday')).toBe('Friday · Jul 24')
  })

  it('uses the same mapping as dateKeyForDayPlan (labels the day apply writes)', () => {
    for (const day of WEEK_DAYS) {
      const dateKey = dateKeyForDayPlan('2026-07-19', day)
      // e.g. "Monday · Jul 20" ends with the day-of-month of the mapped key
      const dom = Number(dateKey.slice(-2))
      expect(formatDayCardLabel('2026-07-19', day)).toContain(String(dom))
    }
  })

  it('falls back to the bare name for a non-WEEK_DAYS string', () => {
    expect(formatDayCardLabel('2026-07-19', 'Saturday')).toBe('Saturday')
  })
})

describe('formatPlanningWeekLabel (FEAT-112)', () => {
  it('renders the Mon–Fri school body of the week', () => {
    expect(formatPlanningWeekLabel('2026-07-19')).toBe('Week of Jul 20–24')
  })

  it('handles a month boundary within the week', () => {
    // Sunday-start 2026-07-26 → Mon Jul 27 … Fri Jul 31 (same month)
    expect(formatPlanningWeekLabel('2026-07-26')).toBe('Week of Jul 27–31')
    // Sunday-start 2026-08-30 → Mon Aug 31 … Fri Sep 4 (crosses into September)
    expect(formatPlanningWeekLabel('2026-08-30')).toBe('Week of Aug 31 – Sep 4')
  })

  it('returns empty string for an unparseable start', () => {
    expect(formatPlanningWeekLabel('not-a-date')).toBe('')
  })
})

describe('isPlanningWeekPast (FEAT-112 apply backstop)', () => {
  // Planning week Jul 20–24, 2026 → Sunday-start 2026-07-19.
  it('flags a week whose Friday is before today (whole week passed)', () => {
    // The stale-tab case: plan targets Jul 13–17 but today is Mon Jul 20.
    expect(isPlanningWeekPast('2026-07-12', '2026-07-20')).toBe(true)
  })

  it('does NOT flag the current in-progress week mid-week (Friday today-or-future)', () => {
    // Planning on Wednesday Jul 22 for the Jul 20–24 week: Mon/Tue are past but
    // Friday is still ahead — re-planning the rest of the week must not block.
    expect(isPlanningWeekPast('2026-07-19', '2026-07-22')).toBe(false)
  })

  it('does NOT flag on Friday itself (Friday == today)', () => {
    expect(isPlanningWeekPast('2026-07-19', '2026-07-24')).toBe(false)
  })

  it('does NOT flag a fully-upcoming week', () => {
    expect(isPlanningWeekPast('2026-07-19', '2026-07-18')).toBe(false)
  })

  it('flags the day after Friday (week just closed)', () => {
    expect(isPlanningWeekPast('2026-07-19', '2026-07-25')).toBe(true)
  })

  it('never blocks on an unparseable start', () => {
    expect(isPlanningWeekPast('not-a-date', '2026-07-20')).toBe(false)
  })
})

describe('buildShiftedWeekPlan (FEAT-112 follow-up)', () => {
  const children = [{ id: 'lincoln' }, { id: 'london' }]

  it('stamps the applied child\'s goals and leaves siblings empty', () => {
    const plan = buildShiftedWeekPlan('2026-07-19', children, 'lincoln', ['Math', 'Reading'])
    expect(plan.childGoals).toEqual([
      { childId: 'lincoln', goals: ['Math', 'Reading'] },
      { childId: 'london', goals: [] },
    ])
  })

  it('sets startDate + the Saturday endDate (start + 6 days)', () => {
    const plan = buildShiftedWeekPlan('2026-07-19', children, 'lincoln', [])
    expect(plan.startDate).toBe('2026-07-19')
    expect(plan.endDate).toBe('2026-07-25')
  })

  it('mirrors the seed default shape (empty theme/virtue/tracks/buildLab)', () => {
    const plan = buildShiftedWeekPlan('2026-07-19', children, 'lincoln', [])
    expect(plan.theme).toBe('')
    expect(plan.virtue).toBe('')
    expect(plan.tracks).toEqual([])
    expect(plan.buildLab).toEqual({ title: '', materials: [], steps: [] })
  })

  it('includes readAloudBookId only when provided', () => {
    expect(buildShiftedWeekPlan('2026-07-19', children, 'lincoln', []).readAloudBookId).toBeUndefined()
    expect(
      buildShiftedWeekPlan('2026-07-19', children, 'lincoln', [], 'book-42').readAloudBookId,
    ).toBe('book-42')
  })

  it('handles a month/year boundary in the endDate', () => {
    // Sunday-start 2025-12-28 → Saturday 2026-01-03
    expect(buildShiftedWeekPlan('2025-12-28', children, 'lincoln', []).endDate).toBe('2026-01-03')
  })
})

describe('parseAIResponse — FEAT-72 catalog-tag backfill', () => {
  const makeResponse = (message: string): ChatResponse => ({
    message,
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 100, outputTokens: 200 },
  })

  const planWith = (items: Array<Record<string, unknown>>) =>
    makeResponse(
      JSON.stringify({
        days: [{ day: 'Monday', timeBudgetMinutes: 150, items }],
        skipSuggestions: [],
        minimumWin: 'x',
      }),
    )

  const catalog = new Set(ALL_SKILL_TAGS)

  it('backfills empty/off-catalog tags and preserves valid catalog tags', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'Empty', subjectBucket: 'Reading', estimatedMinutes: 10, skillTags: [], accepted: true },
        { title: 'Bogus', subjectBucket: 'Reading', estimatedMinutes: 10, skillTags: ['reading.general'], accepted: true },
        { title: 'Valid', subjectBucket: 'Reading', estimatedMinutes: 10, skillTags: ['reading.cvcBlend'], accepted: true },
      ]),
    )
    expect(result).not.toBeNull()
    const items = result!.days[0].items
    // Every tag on every item is a real catalog tag (no empties, no bogus, no `.general`).
    for (const item of items) {
      for (const tag of item.skillTags) expect(catalog.has(tag)).toBe(true)
    }
    // Empty + bogus were backfilled to a single catalog tag; valid one preserved.
    expect(items[0].skillTags).toEqual(['reading.cvcBlend'])
    expect(items[1].skillTags).toEqual(['reading.cvcBlend'])
    expect(items[2].skillTags).toEqual(['reading.cvcBlend'])
  })

  it('targets a priority-matched catalog tag when snapshot priority tags are passed', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'Reading', subjectBucket: 'Reading', estimatedMinutes: 10, skillTags: [], accepted: true },
      ]),
      ['reading.sightWords'],
    )
    // Without priorities the Reading default is reading.cvcBlend; the priority tag steers it.
    expect(result!.days[0].items[0].skillTags).toEqual(['reading.sightWords'])
  })

  it('backfills a math item with no priority tags to a math subject-default catalog tag', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'Math', subjectBucket: 'Math', estimatedMinutes: 20, skillTags: [], accepted: true },
      ]),
    )
    const tags = result!.days[0].items[0].skillTags
    expect(tags).toHaveLength(1)
    expect(tags[0].startsWith('math.')).toBe(true)
    expect(catalog.has(tags[0])).toBe(true)
  })

  it('leaves items empty (no guess) for subjects without a targeted suggestion', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'Science', subjectBucket: 'Science', estimatedMinutes: 15, skillTags: [], accepted: true },
        { title: 'Other', subjectBucket: 'Other', estimatedMinutes: 15, skillTags: [], accepted: true },
      ]),
    )
    expect(result!.days[0].items[0].skillTags).toEqual([])
    expect(result!.days[0].items[1].skillTags).toEqual([])
  })

  it('does not guess a reading tag for an untagged LanguageArts item (ambiguous reading/writing)', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'Handwriting', subjectBucket: 'LanguageArts', estimatedMinutes: 15, skillTags: [], accepted: true },
      ]),
      ['reading.cvcBlend'],
    )
    // Even with a reading priority tag, an untagged LA item must NOT default to a
    // reading tag — that would enqueue a false CVC re-test for writing work.
    expect(result!.days[0].items[0].skillTags).toEqual([])
  })

  it('preserves a valid catalog tag the LLM emitted on a LanguageArts item', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'Phonics', subjectBucket: 'LanguageArts', estimatedMinutes: 15, skillTags: ['reading.cvcBlend'], accepted: true },
      ]),
    )
    // No-guess applies only to the backfill; an explicit valid catalog tag is kept.
    expect(result!.days[0].items[0].skillTags).toEqual(['reading.cvcBlend'])
  })

  it('never lets a persisted item carry a synthetic *.general tag', () => {
    const result = parseAIResponse(
      planWith([
        { title: 'A', subjectBucket: 'Reading', estimatedMinutes: 10, skillTags: [], accepted: true },
        { title: 'B', subjectBucket: 'Math', estimatedMinutes: 10, skillTags: ['math.general'], accepted: true },
        { title: 'C', subjectBucket: 'Other', estimatedMinutes: 10, skillTags: ['other.general'], accepted: true },
      ]),
    )
    const allTags = result!.days.flatMap((d) => d.items.flatMap((i) => i.skillTags))
    expect(allTags.some((t) => t.endsWith('.general'))).toBe(false)
  })
})

// FEAT-104: the Watch Vehicle plan-item hook — `itemType:'watch'` + a
// `watchVideoId` companion — survives the AI-response parse (the plan → draft
// leg of the plan → lock-in → Today round trip).
describe('parseAIResponse — watch items (FEAT-104)', () => {
  const respond = (items: Array<Record<string, unknown>>): ChatResponse => ({
    message: JSON.stringify({
      days: [{ day: 'Monday', timeBudgetMinutes: 150, items }],
      skipSuggestions: [],
      minimumWin: 'x',
    }),
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 1, outputTokens: 1 },
  })

  it("preserves itemType:'watch' and watchVideoId on a watch item", () => {
    const result = parseAIResponse(
      respond([
        {
          title: 'Watch: The American Revolution',
          subjectBucket: 'SocialStudies',
          estimatedMinutes: 12,
          skillTags: [],
          accepted: true,
          itemType: 'watch',
          watchVideoId: 'vid-abc123',
        },
      ]),
    )
    expect(result).not.toBeNull()
    const item = result!.days[0].items[0]
    expect(item.itemType).toBe('watch')
    expect(item.watchVideoId).toBe('vid-abc123')
    expect(item.subjectBucket).toBe(SubjectBucket.SocialStudies)
    // Non-curriculum: never seeded with skill tags (C2/§6).
    expect(item.skillTags).toEqual([])
  })

  it('drops watchVideoId when it is empty or non-string (never a stray field)', () => {
    const result = parseAIResponse(
      respond([
        { title: 'A', subjectBucket: 'SocialStudies', estimatedMinutes: 10, skillTags: [], accepted: true, itemType: 'watch', watchVideoId: '' },
        { title: 'B', subjectBucket: 'SocialStudies', estimatedMinutes: 10, skillTags: [], accepted: true, itemType: 'watch', watchVideoId: 42 },
      ]),
    )
    expect(result!.days[0].items[0].watchVideoId).toBeUndefined()
    expect(result!.days[0].items[1].watchVideoId).toBeUndefined()
  })

  it('leaves existing item types unchanged (characterization)', () => {
    const result = parseAIResponse(
      respond([
        { title: 'Fluency Practice', subjectBucket: 'Reading', estimatedMinutes: 10, skillTags: [], accepted: true, itemType: 'evaluation', evaluationMode: 'fluency', link: '/quest' },
        { title: 'Read: My Book', subjectBucket: 'Reading', estimatedMinutes: 15, skillTags: [], accepted: true, bookId: 'book-1' },
        { title: 'Bogus kind', subjectBucket: 'Math', estimatedMinutes: 10, skillTags: [], accepted: true, itemType: 'nonsense' },
      ]),
    )
    const [evalItem, bookItem, bogus] = result!.days[0].items
    expect(evalItem.itemType).toBe('evaluation')
    expect(evalItem.evaluationMode).toBe('fluency')
    expect(evalItem.link).toBe('/quest')
    expect(evalItem.watchVideoId).toBeUndefined()
    expect(bookItem.bookId).toBe('book-1')
    expect(bookItem.itemType).toBeUndefined()
    // An unknown itemType is still dropped by the whitelist — watch didn't widen it.
    expect(bogus.itemType).toBeUndefined()
  })
})

// ─── activityConfigsToRoutineText ────────────────────────────────────────────

describe('activityConfigsToRoutineText', () => {
  const makeConfig = (overrides: Partial<ActivityConfig>): ActivityConfig => ({
    id: 'cfg-1',
    name: 'Reading',
    type: 'workbook' as const,
    subjectBucket: SubjectBucket.Reading,
    defaultMinutes: 30,
    frequency: 'daily' as const,
    childId: 'child-1',
    sortOrder: 1,
    completed: false,
    scannable: false,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  })

  it('converts active configs to routine text sorted by sortOrder', () => {
    const configs = [
      makeConfig({ id: 'c2', name: 'Math workbook', subjectBucket: SubjectBucket.Math, defaultMinutes: 25, sortOrder: 2 }),
      makeConfig({ id: 'c1', name: 'Handwriting', subjectBucket: SubjectBucket.LanguageArts, defaultMinutes: 15, sortOrder: 1 }),
    ]
    const text = activityConfigsToRoutineText(configs)
    const lines = text.split('\n')
    expect(lines[0]).toBe('Handwriting — 15 min — LanguageArts')
    expect(lines[1]).toBe('Math workbook — 25 min — Math')
  })

  it('filters out completed configs', () => {
    const configs = [
      makeConfig({ id: 'c1', name: 'Done Program', completed: true, sortOrder: 1 }),
      makeConfig({ id: 'c2', name: 'Active Program', completed: false, sortOrder: 2 }),
    ]
    const text = activityConfigsToRoutineText(configs)
    expect(text).not.toContain('Done Program')
    expect(text).toContain('Active Program')
  })

  it('includes position/totalUnits when present', () => {
    const configs = [
      makeConfig({
        name: 'GATB Reading',
        currentPosition: 45,
        totalUnits: 160,
        unitLabel: 'lesson',
      }),
    ]
    const text = activityConfigsToRoutineText(configs)
    expect(text).toContain('(at lesson 45 of 160)')
  })

  it('defaults unit label to "lesson" when unitLabel is absent', () => {
    const configs = [
      makeConfig({
        name: 'GATB Reading',
        currentPosition: 10,
        totalUnits: 50,
      }),
    ]
    const text = activityConfigsToRoutineText(configs)
    expect(text).toContain('(at lesson 10 of 50)')
  })

  it('returns empty string for empty array', () => {
    expect(activityConfigsToRoutineText([])).toBe('')
  })

  it('returns empty string when all configs are completed', () => {
    const configs = [
      makeConfig({ completed: true }),
    ]
    expect(activityConfigsToRoutineText(configs)).toBe('')
  })
})

// ─── routineDailyBudgetMinutes (UX-206) ──────────────────────────────────────

describe('routineDailyBudgetMinutes', () => {
  const cfg = (overrides: Partial<ActivityConfig>): ActivityConfig => ({
    id: 'cfg-1',
    name: 'Reading',
    type: 'routine' as const,
    subjectBucket: SubjectBucket.Reading,
    defaultMinutes: 20,
    frequency: 'daily' as const,
    childId: 'child-1',
    sortOrder: 1,
    completed: false,
    scannable: false,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  })

  it('costs a daily activity its full minutes', () => {
    expect(routineDailyBudgetMinutes([cfg({ defaultMinutes: 20 })])).toBe(20)
  })

  it('the worked example: a 20m 3x/week item costs 12m a day, not 20', () => {
    expect(
      routineDailyBudgetMinutes([cfg({ defaultMinutes: 20, frequency: '3x' })]),
    ).toBe(12)
  })

  it('weights 2x and 1x off ActivityFrequency', () => {
    expect(routineDailyBudgetMinutes([cfg({ defaultMinutes: 30, frequency: '2x' })])).toBe(12)
    expect(routineDailyBudgetMinutes([cfg({ defaultMinutes: 30, frequency: '1x' })])).toBe(6)
  })

  it('costs an as-needed activity one day, never zero', () => {
    expect(
      routineDailyBudgetMinutes([cfg({ defaultMinutes: 30, frequency: 'as-needed' })]),
    ).toBe(6)
  })

  it('is unchanged for an all-daily routine — the old total exactly', () => {
    const configs = [
      cfg({ id: 'a', defaultMinutes: 20 }),
      cfg({ id: 'b', defaultMinutes: 15 }),
      cfg({ id: 'c', defaultMinutes: 45 }),
    ]
    expect(routineDailyBudgetMinutes(configs)).toBe(80)
    // The prose the app writes still totals the same, unweighted — the string is
    // deliberately untouched by UX-206.
    expect(parseRoutineTotalMinutes(activityConfigsToRoutineText(configs))).toBe(80)
  })

  it('skips completed configs, like the routine text does', () => {
    expect(
      routineDailyBudgetMinutes([
        cfg({ id: 'a', defaultMinutes: 20 }),
        cfg({ id: 'b', defaultMinutes: 60, completed: true }),
      ]),
    ).toBe(20)
  })

  it('counts activity and app configs — visibility is UX-204, not removal', () => {
    expect(
      routineDailyBudgetMinutes([
        cfg({ id: 'a', type: 'app', defaultMinutes: 45 }),
        cfg({ id: 'b', type: 'activity', defaultMinutes: 15 }),
      ]),
    ).toBe(60)
  })

  it('rounds once over the whole week, not per config', () => {
    // 3 × (10m · 3x/week) = 90 weekly minutes = 18/day exactly. Rounding each
    // config first (10 × 3/5 = 6) happens to agree here; the point is one round.
    const configs = ['a', 'b', 'c'].map((id) =>
      cfg({ id, defaultMinutes: 10, frequency: '3x' }),
    )
    expect(routineDailyBudgetMinutes(configs)).toBe(18)
  })

  it('is 0 for an empty list, so callers keep their own fallback', () => {
    expect(routineDailyBudgetMinutes([])).toBe(0)
  })

  // Firestore holds whatever was written. The total this replaces never read
  // `frequency` at all, so it could not be poisoned by one — this one must not
  // regress on that. A budget of `NaN` breaks the bar for the whole family.
  it('never returns NaN for an unvalidated stored frequency', () => {
    const stored = cfg({ defaultMinutes: 20, frequency: undefined as unknown as 'daily' })
    const total = routineDailyBudgetMinutes([stored])
    expect(Number.isFinite(total)).toBe(true)
    // Full daily price — the conservative direction, and what it used to cost.
    expect(total).toBe(20)
  })

  it('falls back to daily for a cadence a later build wrote', () => {
    expect(
      routineDailyBudgetMinutes([
        cfg({ defaultMinutes: 20, frequency: '4x' as unknown as 'daily' }),
      ]),
    ).toBe(20)
  })

  it('a NaN or off-type defaultMinutes contributes nothing, and poisons nothing', () => {
    const total = routineDailyBudgetMinutes([
      cfg({ id: 'ok', defaultMinutes: 20 }),
      cfg({ id: 'bad', defaultMinutes: Number.NaN }),
      cfg({ id: 'worse', defaultMinutes: 'twenty' as unknown as number }),
      cfg({ id: 'negative', defaultMinutes: -30 }),
    ])
    expect(total).toBe(20)
  })
})

describe('frequencyDaysPerWeek', () => {
  it('reads the cadence off ActivityFrequency rather than a private table', () => {
    expect(frequencyDaysPerWeek(ActivityFrequency.Daily)).toBe(SCHOOL_DAYS_PER_WEEK)
    expect(frequencyDaysPerWeek(ActivityFrequency.ThreePerWeek)).toBe(3)
    expect(frequencyDaysPerWeek(ActivityFrequency.TwoPerWeek)).toBe(2)
    expect(frequencyDaysPerWeek(ActivityFrequency.OnePerWeek)).toBe(1)
  })

  it('never costs a frequency more than the school week', () => {
    for (const frequency of Object.values(ActivityFrequency)) {
      const days = frequencyDaysPerWeek(frequency)
      expect(days).toBeGreaterThan(0)
      expect(days).toBeLessThanOrEqual(SCHOOL_DAYS_PER_WEEK)
    }
  })
})

// ─── parseRoutineTotalMinutes ────────────────────────────────────────────────

describe('parseRoutineTotalMinutes', () => {
  it('sums minutes from dash-separated lines', () => {
    const routine = 'Handwriting — 20 min — LanguageArts\nMath — 30 min — Math'
    expect(parseRoutineTotalMinutes(routine)).toBe(50)
  })

  it('sums minutes from paren-format lines', () => {
    const routine = 'Handwriting (20 min)\nMath (30 min)'
    expect(parseRoutineTotalMinutes(routine)).toBe(50)
  })

  it('defaults to 15 minutes for unparseable lines', () => {
    const routine = 'Handwriting — 20 min — LanguageArts\nFree play time'
    expect(parseRoutineTotalMinutes(routine)).toBe(35) // 20 + 15
  })

  it('returns 0 for empty string', () => {
    expect(parseRoutineTotalMinutes('')).toBe(0)
  })

  it('skips blank lines', () => {
    const routine = 'Handwriting — 20 min\n\n\nMath — 30 min'
    expect(parseRoutineTotalMinutes(routine)).toBe(50)
  })
})

// ─── filterRoutineForCompletedPrograms ───────────────────────────────────────

describe('filterRoutineForCompletedPrograms', () => {
  const routine = 'Reading Eggs — 45 min — Reading\nMath app — 15 min — Math\nHandwriting — 20 min — LanguageArts'

  it('returns routine unchanged when no completed programs', () => {
    expect(filterRoutineForCompletedPrograms(routine, [])).toBe(routine)
  })

  it('removes lines matching a completed program (case-insensitive)', () => {
    const result = filterRoutineForCompletedPrograms(routine, ['reading eggs'])
    expect(result).not.toContain('Reading Eggs')
    expect(result).toContain('Math app')
    expect(result).toContain('Handwriting')
  })

  it('handles multiple completed programs', () => {
    const result = filterRoutineForCompletedPrograms(routine, ['reading eggs', 'math app'])
    expect(result).not.toContain('Reading Eggs')
    expect(result).not.toContain('Math app')
    expect(result).toContain('Handwriting')
  })

  it('returns routine unchanged when completedPrograms is undefined-ish', () => {
    expect(filterRoutineForCompletedPrograms(routine, undefined as unknown as string[])).toBe(routine)
  })

  it('matches ignoring non-alphanumeric characters', () => {
    const routineWithSpecial = 'Good & the Beautiful — 30 min — Reading'
    const result = filterRoutineForCompletedPrograms(routineWithSpecial, ['Good the Beautiful'])
    expect(result).not.toContain('Good & the Beautiful')
  })
})

// ─── ensureEvaluationItems ───────────────────────────────────────────────────

describe('ensureEvaluationItems', () => {
  it('returns plan unchanged when fluency item already exists', () => {
    const plan: DraftWeeklyPlan = {
      skipSuggestions: [],
      minimumWin: '',
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [{
            id: 'f1',
            title: 'Fluency Practice',
            estimatedMinutes: 10,
            subjectBucket: SubjectBucket.Reading,
            skillTags: [],
            accepted: true,
            evaluationMode: 'fluency',
          }],
        },
        { day: 'Tuesday', timeBudgetMinutes: 150, items: [] },
        { day: 'Wednesday', timeBudgetMinutes: 150, items: [] },
      ],
    }

    const result = ensureEvaluationItems(plan)
    expect(result).toBe(plan)
  })

  it('injects fluency items on Monday and Wednesday when missing', () => {
    const plan: DraftWeeklyPlan = {
      skipSuggestions: [],
      minimumWin: '',
      days: [
        { day: 'Monday', timeBudgetMinutes: 150, items: [{ id: 'a1', title: 'Math', estimatedMinutes: 30, subjectBucket: SubjectBucket.Math, skillTags: [], accepted: true }] },
        { day: 'Tuesday', timeBudgetMinutes: 150, items: [] },
        { day: 'Wednesday', timeBudgetMinutes: 150, items: [] },
        { day: 'Thursday', timeBudgetMinutes: 150, items: [] },
        { day: 'Friday', timeBudgetMinutes: 150, items: [] },
      ],
    }

    const result = ensureEvaluationItems(plan)
    const mondayFluency = result.days[0].items.find(i => i.evaluationMode === 'fluency')
    const wedFluency = result.days[2].items.find(i => i.evaluationMode === 'fluency')
    expect(mondayFluency).toBeDefined()
    expect(wedFluency).toBeDefined()
    expect(mondayFluency!.title).toBe('Fluency Practice')
    expect(mondayFluency!.subjectBucket).toBe(SubjectBucket.Reading)
    expect(mondayFluency!.estimatedMinutes).toBe(10)
  })

  it('returns plan unchanged when days array is empty', () => {
    const plan: DraftWeeklyPlan = { days: [], skipSuggestions: [], minimumWin: '' }
    expect(ensureEvaluationItems(plan)).toBe(plan)
  })

  it('detects fluency by evaluationMode', () => {
    const plan: DraftWeeklyPlan = {
      skipSuggestions: [],
      minimumWin: '',
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [{
            id: 'x1',
            title: 'Reading Assessment',
            estimatedMinutes: 10,
            subjectBucket: SubjectBucket.Reading,
            skillTags: [],
            accepted: true,
            evaluationMode: 'fluency',
          }],
        },
      ],
    }

    const result = ensureEvaluationItems(plan)
    expect(result).toBe(plan)
  })

  it('detects fluency by title keyword', () => {
    const plan: DraftWeeklyPlan = {
      skipSuggestions: [],
      minimumWin: '',
      days: [
        {
          day: 'Monday',
          timeBudgetMinutes: 150,
          items: [{
            id: 'x1',
            title: 'Fluency check',
            estimatedMinutes: 10,
            subjectBucket: SubjectBucket.Reading,
            skillTags: [],
            accepted: true,
          }],
        },
      ],
    }

    const result = ensureEvaluationItems(plan)
    expect(result).toBe(plan)
  })

  it('injects on Monday only when plan has fewer than 3 days', () => {
    const plan: DraftWeeklyPlan = {
      skipSuggestions: [],
      minimumWin: '',
      days: [
        { day: 'Monday', timeBudgetMinutes: 150, items: [] },
        { day: 'Tuesday', timeBudgetMinutes: 150, items: [] },
      ],
    }

    const result = ensureEvaluationItems(plan)
    const mondayFluency = result.days[0].items.find(i => i.evaluationMode === 'fluency')
    expect(mondayFluency).toBeDefined()
    expect(result.days[1].items).toHaveLength(0)
  })
})

// ─── ReduceSubject adjustment ────────────────────────────────────────────────

describe('generateDraftPlanFromInputs — ReduceSubject adjustment', () => {
  it('multiplies estimatedMinutes by factor for matching subject', () => {
    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        workbookName: 'GATB Reading',
        lessonName: 'Lesson 5',
        subjectBucket: SubjectBucket.Reading,
        estimatedMinutes: 20,
        action: AssignmentAction.Keep,
        difficultyCues: [],
      },
      {
        id: 'a2',
        workbookName: 'Math Book',
        lessonName: 'Ch 3',
        subjectBucket: SubjectBucket.Math,
        estimatedMinutes: 20,
        action: AssignmentAction.Keep,
        difficultyCues: [],
      },
    ]

    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 4,
      appBlocks: [],
      assignments,
      adjustments: [
        { type: AdjustmentType.ReduceSubject, subject: SubjectBucket.Reading, factor: 0.5 },
      ],
    })

    const allItems = result.days.flatMap(d => d.items)
    const readingItem = allItems.find(i => i.subjectBucket === SubjectBucket.Reading && i.assignmentId === 'a1')
    const mathItem = allItems.find(i => i.subjectBucket === SubjectBucket.Math && i.assignmentId === 'a2')

    expect(readingItem!.estimatedMinutes).toBe(10) // Math.ceil(20 * 0.5)
    expect(mathItem!.estimatedMinutes).toBe(20)
  })
})

// ─── Daily time budget overflow trimming ─────────────────────────────────────

describe('generateDraftPlanFromInputs — budget overflow', () => {
  it('removes excess choose items when day exceeds budget', () => {
    const routine = 'Handwriting — 50 min — LanguageArts'
    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 1, // 60 min budget
      appBlocks: [
        { label: 'Reading Eggs', defaultMinutes: 20 },
        { label: 'Math App', defaultMinutes: 20 },
      ],
      assignments: [],
      dailyRoutine: routine,
    })

    for (const day of result.days) {
      const acceptedMinutes = day.items
        .filter(i => i.accepted)
        .reduce((sum, i) => sum + i.estimatedMinutes, 0)
      expect(acceptedMinutes).toBeLessThanOrEqual(60)
    }
  })
})

// ─── dailyRoutine flow-through integration ──────────────────────────────────

describe('generateDraftPlanFromInputs — dailyRoutine flow-through', () => {
  it('populates routine items on all 5 days as must-do items', () => {
    const routine = [
      'Handwriting — 15 min — LanguageArts',
      'Reading Eggs (20 min) — Reading',
      'Math worksheet — 20 min — Math',
    ].join('\n')

    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 2.5,
      appBlocks: [],
      assignments: [],
      dailyRoutine: routine,
    })

    expect(result.days).toHaveLength(5)
    for (const day of result.days) {
      const titles = day.items.map(i => i.title)
      expect(titles).toContain('Handwriting')
      expect(titles).toContain('Reading Eggs')
      expect(titles).toContain('Math worksheet')

      const handwriting = day.items.find(i => i.title === 'Handwriting')!
      expect(handwriting.category).toBe('must-do')
      expect(handwriting.subjectBucket).toBe(SubjectBucket.LanguageArts)
      expect(handwriting.estimatedMinutes).toBe(15)
    }
  })

  it('infers subject from title when no explicit subject', () => {
    const routine = 'Phonics drill — 10 min'
    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 2,
      appBlocks: [],
      assignments: [],
      dailyRoutine: routine,
    })

    const item = result.days[0].items.find(i => i.title === 'Phonics drill')
    expect(item).toBeDefined()
    expect(item!.subjectBucket).toBe(SubjectBucket.Reading)
  })

  it('does not duplicate app blocks already covered by routine', () => {
    const routine = 'Reading Eggs — 20 min — Reading'
    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 2,
      appBlocks: [{ label: 'Reading Eggs', defaultMinutes: 20 }],
      assignments: [],
      dailyRoutine: routine,
    })

    for (const day of result.days) {
      const readingEggsItems = day.items.filter(i =>
        i.title.toLowerCase().includes('reading eggs'),
      )
      expect(readingEggsItems).toHaveLength(1)
    }
  })

  it('adds app blocks not covered by routine as choose items', () => {
    const routine = 'Handwriting — 15 min — LanguageArts'
    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 2,
      appBlocks: [{ label: 'Math App', defaultMinutes: 15 }],
      assignments: [],
      dailyRoutine: routine,
    })

    for (const day of result.days) {
      const mathApp = day.items.find(i => i.title === 'Math App')
      expect(mathApp).toBeDefined()
      expect(mathApp!.category).toBe('choose')
    }
  })
})

// ─── skip suggestion full pipeline ──────────────────────────────────────────

describe('generateDraftPlanFromInputs — skip suggestion pipeline', () => {
  it('populates skipSuggestions when snapshot triggers a skip on an assignment', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        {
          tag: 'math.subtraction.regrouping',
          label: 'Regrouping',
          level: SkillLevel.Emerging,
          masteryGate: MasteryGate.IndependentConsistent,
        },
      ],
    }

    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Math,
        workbookName: 'Math G2',
        lessonName: 'Regrouping L5',
        estimatedMinutes: 15,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
    ]

    const result = generateDraftPlanFromInputs({
      snapshot,
      hoursPerDay: 2.5,
      appBlocks: [],
      assignments,
    })

    expect(result.skipSuggestions.length).toBeGreaterThan(0)
    expect(result.skipSuggestions[0].action).toBe('skip')
    const allItems = result.days.flatMap(d => d.items)
    const skippedItem = allItems.find(i => i.assignmentId === 'a1')
    expect(skippedItem).toBeUndefined()
  })

  it('reduces time for modify-suggested assignments in the plan', () => {
    const snapshot: SkillSnapshot = {
      ...baseSnapshot,
      prioritySkills: [
        {
          tag: 'reading.phonics',
          label: 'Phonics',
          level: SkillLevel.Emerging,
          masteryGate: MasteryGate.MostlyIndependent,
        },
      ],
    }

    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Reading,
        workbookName: 'Phonics G1',
        lessonName: 'Phonics L3',
        estimatedMinutes: 20,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
    ]

    const result = generateDraftPlanFromInputs({
      snapshot,
      hoursPerDay: 2.5,
      appBlocks: [],
      assignments,
    })

    expect(result.skipSuggestions.length).toBeGreaterThan(0)
    expect(result.skipSuggestions[0].action).toBe('modify')
    const allItems = result.days.flatMap(d => d.items)
    const modifiedItem = allItems.find(i => i.assignmentId === 'a1')!
    expect(modifiedItem).toBeDefined()
    expect(modifiedItem.estimatedMinutes).toBe(Math.ceil(20 * 0.6))
  })
})

// ─── full integration with all input channels ───────────────────────────────

describe('generateDraftPlanFromInputs — full integration', () => {
  it('produces a valid 5-day plan when all input channels are populated', () => {
    const routine = [
      'Handwriting — 15 min — LanguageArts',
      'Read aloud — 20 min — Reading',
    ].join('\n')

    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Math,
        workbookName: 'Math G3',
        lessonName: 'Addition L2',
        estimatedMinutes: 15,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
      {
        id: 'a2',
        subjectBucket: SubjectBucket.Science,
        workbookName: 'Science G3',
        lessonName: 'Plants L1',
        estimatedMinutes: 15,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
    ]

    const result = generateDraftPlanFromInputs({
      snapshot: baseSnapshot,
      hoursPerDay: 3,
      appBlocks: [{ label: 'Math App', defaultMinutes: 10 }],
      assignments,
      dailyRoutine: routine,
      subjectTimeDefaults: {
        [SubjectBucket.Math]: 20,
        [SubjectBucket.Reading]: 25,
      },
    })

    expect(result.days).toHaveLength(5)
    expect(result.minimumWin).toBeTruthy()

    for (const day of result.days) {
      expect(day.timeBudgetMinutes).toBe(180)
      expect(day.items.length).toBeGreaterThan(0)
      const routineItems = day.items.filter(i => i.title === 'Handwriting' || i.title === 'Read aloud')
      expect(routineItems.length).toBe(2)
    }

    const allTitles = result.days.flatMap(d => d.items.map(i => i.title))
    expect(allTitles.some(t => t.includes('Math G3'))).toBe(true)
    expect(allTitles.some(t => t.includes('Science G3'))).toBe(true)
    expect(allTitles.some(t => t.includes('Skill practice'))).toBe(true)
  })

  it('applies multiple simultaneous adjustments', () => {
    const assignments: AssignmentCandidate[] = [
      {
        id: 'a1',
        subjectBucket: SubjectBucket.Reading,
        workbookName: 'Reading G2',
        lessonName: 'L1',
        estimatedMinutes: 20,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
      {
        id: 'a2',
        subjectBucket: SubjectBucket.Math,
        workbookName: 'Math G2',
        lessonName: 'L2',
        estimatedMinutes: 20,
        difficultyCues: [],
        action: AssignmentAction.Keep,
      },
    ]

    const result = generateDraftPlanFromInputs({
      snapshot: null,
      hoursPerDay: 2.5,
      appBlocks: [],
      assignments,
      adjustments: [
        { type: AdjustmentType.CapSubjectTime, subject: SubjectBucket.Reading, maxMinutesPerDay: 10 },
        { type: AdjustmentType.ReduceSubject, subject: SubjectBucket.Math, factor: 0.5 },
      ],
    })

    const allItems = result.days.flatMap(d => d.items)
    const readingItems = allItems.filter(i => i.subjectBucket === SubjectBucket.Reading && i.assignmentId)
    const mathItems = allItems.filter(i => i.subjectBucket === SubjectBucket.Math && i.assignmentId)

    for (const item of readingItems) {
      expect(item.estimatedMinutes).toBeLessThanOrEqual(10)
    }
    for (const item of mathItems) {
      expect(item.estimatedMinutes).toBe(Math.ceil(20 * 0.5))
    }
  })
})
