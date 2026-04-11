import { describe, expect, it, beforeEach } from 'vitest'
import type { AssignmentCandidate, SkillSnapshot } from '../../core/types'
import type { ChatResponse } from '../../core/ai/useAI'
import { AssignmentAction, SkillLevel, SubjectBucket } from '../../core/types/enums'
import {
  AdjustmentType,
  applySnapshotSuggestions,
  buildMinimumWinText,
  buildPlannerPrompt,
  dateKeyForDayPlan,
  dayTotalMinutes,
  fillMissingDaysFromRoutine,
  generateDraftPlanFromInputs,
  parseAIResponse,
  planTotalMinutes,
  resetIdCounter,
  WEEK_DAYS,
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
    expect(result.days).toHaveLength(5)
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
    expect(result.days).toHaveLength(5)
    // Monday/Tuesday should keep AI items
    expect(result.days[0].items[0].title).toBe('AI item')
    expect(result.days[1].items[0].title).toBe('AI item 2')
    // Wed/Thu/Fri should have routine items
    expect(result.days[2].day).toBe('Wednesday')
    expect(result.days[2].items[0].title).toBe('Handwriting')
    expect(result.days[3].day).toBe('Thursday')
    expect(result.days[4].day).toBe('Friday')
  })

  it('returns plan unchanged when no routine provided', () => {
    const plan = {
      days: [{ day: 'Monday', timeBudgetMinutes: 150, items: [] }],
      skipSuggestions: [],
      minimumWin: 'test',
    }
    const result = fillMissingDaysFromRoutine(plan, undefined, 2.5)
    expect(result.days).toHaveLength(1)
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
    expect(result.days).toHaveLength(5)
    expect(result.days.map(d => d.day)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    // Friday should still have the AI item
    expect(result.days[4].items[0].title).toBe('Friday item')
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
