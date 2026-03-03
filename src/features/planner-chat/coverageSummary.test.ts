import { describe, it, expect } from 'vitest'
import type { DraftWeeklyPlan, PrioritySkill } from '../../core/types/domain'
import { SkillLevel, SubjectBucket } from '../../core/types/enums'
import { MathTags, ReadingTags } from '../../core/types/skillTags'
import { buildCoverageSummary, formatCoverageSummaryText } from './coverageSummary'

const makePlan = (items: Array<{ subject: string; minutes: number; tags: string[]; accepted?: boolean }>): DraftWeeklyPlan => ({
  days: [
    {
      day: 'Monday',
      timeBudgetMinutes: 150,
      items: items.map((item, i) => ({
        id: `item_${i}`,
        title: `Item ${i}`,
        subjectBucket: item.subject as SubjectBucket,
        estimatedMinutes: item.minutes,
        skillTags: item.tags,
        accepted: item.accepted ?? true,
      })),
    },
  ],
  skipSuggestions: [],
  minimumWin: 'test',
})

const prioritySkills: PrioritySkill[] = [
  { tag: ReadingTags.CvcBlend, label: 'CVC blending', level: SkillLevel.Emerging },
  { tag: MathTags.SubtractionRegroup, label: 'Regrouping', level: SkillLevel.Emerging },
]

describe('coverageSummary', () => {
  describe('buildCoverageSummary', () => {
    it('groups items by subject', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Reading, minutes: 10, tags: [] },
        { subject: SubjectBucket.Reading, minutes: 15, tags: [] },
        { subject: SubjectBucket.Math, minutes: 20, tags: [] },
      ])
      const entries = buildCoverageSummary(plan, [])
      expect(entries.length).toBe(2)
      const reading = entries.find((e) => e.subject === SubjectBucket.Reading)
      expect(reading?.totalBlocks).toBe(2)
      expect(reading?.totalMinutes).toBe(25)
    })

    it('counts priority hits', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Reading, minutes: 10, tags: [ReadingTags.CvcBlend] },
        { subject: SubjectBucket.Reading, minutes: 15, tags: [] },
      ])
      const entries = buildCoverageSummary(plan, prioritySkills)
      const reading = entries.find((e) => e.subject === SubjectBucket.Reading)
      expect(reading?.priorityHits).toBe(1)
    })

    it('skips not-accepted items', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Math, minutes: 20, tags: [], accepted: false },
      ])
      const entries = buildCoverageSummary(plan, [])
      expect(entries.length).toBe(0)
    })

    it('sorts priority hits first', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Math, minutes: 30, tags: [] },
        { subject: SubjectBucket.Reading, minutes: 10, tags: [ReadingTags.CvcBlend] },
      ])
      const entries = buildCoverageSummary(plan, prioritySkills)
      expect(entries[0].subject).toBe(SubjectBucket.Reading)
    })

    it('builds tag detail strings', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Reading, minutes: 10, tags: [ReadingTags.CvcBlend] },
        { subject: SubjectBucket.Reading, minutes: 10, tags: [ReadingTags.CvcBlend] },
      ])
      const entries = buildCoverageSummary(plan, prioritySkills)
      const reading = entries.find((e) => e.subject === SubjectBucket.Reading)
      expect(reading?.details.some((d) => d.includes('2x'))).toBe(true)
    })
  })

  describe('formatCoverageSummaryText', () => {
    it('returns "No items" for empty entries', () => {
      expect(formatCoverageSummaryText([], [])).toBe('No items scheduled yet.')
    })

    it('includes coverage header', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Math, minutes: 20, tags: [] },
      ])
      const entries = buildCoverageSummary(plan, [])
      const text = formatCoverageSummaryText(entries, [])
      expect(text).toContain('Coverage this week:')
      expect(text).toContain('Math')
    })

    it('includes priority alignment when skills present', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Reading, minutes: 10, tags: [ReadingTags.CvcBlend] },
      ])
      const entries = buildCoverageSummary(plan, prioritySkills)
      const text = formatCoverageSummaryText(entries, prioritySkills)
      expect(text).toContain('Priority skill alignment')
    })
  })
})
