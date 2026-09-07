import { describe, it, expect } from 'vitest'
import type { DraftWeeklyPlan, PrioritySkill } from '../../core/types'
import { SkillLevel, SubjectBucket } from '../../core/types/enums'
import { MathTags, ReadingTags } from '../../core/types/skillTags'
import {
  COVERAGE_DETAIL_LIMIT,
  COVERAGE_OTHER_TITLE_LIMIT,
  buildCoverageSummary,
  coverageSubjectLabel,
  formatCoverageSummaryText,
} from './coverageSummary'

const makePlan = (items: Array<{ subject: string; minutes: number; tags: string[]; accepted?: boolean; title?: string }>): DraftWeeklyPlan => ({
  days: [
    {
      day: 'Monday',
      timeBudgetMinutes: 150,
      items: items.map((item, i) => ({
        id: `item_${i}`,
        title: item.title ?? `Item ${i}`,
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

    // ── UX-237 ──────────────────────────────────────────────────────────────
    it('never names a tag the catalog cannot label, but still counts it', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Reading, minutes: 10, tags: ['reading.short-i-vs-e'] },
        { subject: SubjectBucket.Reading, minutes: 10, tags: ['reading.ful'] },
      ])
      const entries = buildCoverageSummary(plan, [])
      const reading = entries.find((e) => e.subject === SubjectBucket.Reading)
      // The blocks are real work and are counted…
      expect(reading?.totalBlocks).toBe(2)
      // …but a raw identifier never reaches parent-facing copy.
      expect(reading?.details).toEqual([])
    })

    it('caps the named details so the chip cannot truncate mid-word', () => {
      const manyTags = [
        ReadingTags.CvcBlend,
        ReadingTags.LetterSound,
        ReadingTags.SightWords,
        ReadingTags.PhonemicAwareness,
      ]
      const plan = makePlan(
        manyTags.map((tag) => ({ subject: SubjectBucket.Reading, minutes: 10, tags: [tag] })),
      )
      const entries = buildCoverageSummary(plan, [])
      const reading = entries.find((e) => e.subject === SubjectBucket.Reading)
      expect(reading?.totalBlocks).toBe(4)
      expect(reading?.details).toHaveLength(COVERAGE_DETAIL_LIMIT)
    })
  })

  // ── UX-259: the chip says what the bucket IS ────────────────────────────────
  describe('coverageSubjectLabel', () => {
    it('gives every real subject its catalogued name', () => {
      expect(coverageSubjectLabel(SubjectBucket.Reading, [])).toBe('Reading')
      expect(coverageSubjectLabel(SubjectBucket.Math, [])).toBe('Math')
      expect(coverageSubjectLabel(SubjectBucket.PracticalArts, [])).toBe('Practical Arts')
    })

    it('stops printing two identifiers this chip used to show raw', () => {
      expect(coverageSubjectLabel(SubjectBucket.LanguageArts, [])).toBe('Language Arts')
      expect(coverageSubjectLabel(SubjectBucket.SocialStudies, [])).toBe('Social Studies')
    })

    it('names Other by what is actually in it', () => {
      expect(
        coverageSubjectLabel(SubjectBucket.Other, ['Prayer and Scripture', 'Morning Basket']),
      ).toBe('Prayer and Scripture, Morning Basket')
    })

    it('de-duplicates, because a daily routine item recurs on every day', () => {
      const titles = ['Prayer and Scripture', 'Prayer and Scripture', 'Prayer and Scripture']
      expect(coverageSubjectLabel(SubjectBucket.Other, titles)).toBe('Prayer and Scripture')
    })

    it('caps the names so the chip cannot truncate mid-word', () => {
      const titles = ['Prayer', 'Copywork', 'Chores', 'Packing boxes', 'Bible memory']
      const label = coverageSubjectLabel(SubjectBucket.Other, titles)
      expect(label).toBe('Prayer, Copywork +3')
      expect(label.split(',').length).toBe(COVERAGE_OTHER_TITLE_LIMIT)
    })

    it('never guesses a name for a bucket it cannot read', () => {
      // UX-237's rule: naming something wrongly is worse than not naming it. The
      // AI prompt path calls this bucket "Formation/Prayer"; on a week the family
      // spent packing, that would be false.
      expect(coverageSubjectLabel(SubjectBucket.Other, [])).toBe('Other')
      expect(coverageSubjectLabel(SubjectBucket.Other, ['  ', ''])).toBe('Other')
      expect(coverageSubjectLabel(SubjectBucket.Other, ['Packing boxes'])).not.toContain('Prayer')
    })

    it('falls back to the raw key for a bucket that is not in the catalog', () => {
      expect(coverageSubjectLabel('SomethingStored', [])).toBe('SomethingStored')
    })
  })

  describe('the coverage entry carries both (UX-259)', () => {
    it('keeps the raw bucket as the grouping key and adds the display label', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Other, minutes: 10, tags: [], title: 'Prayer and Scripture' },
        { subject: SubjectBucket.Other, minutes: 10, tags: [], title: 'Chores' },
      ])
      const [other] = buildCoverageSummary(plan, [])
      expect(other.subject).toBe(SubjectBucket.Other)
      expect(other.label).toBe('Prayer and Scripture, Chores')
    })

    it('changes what is DISPLAYED and nothing that is COUNTED', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Other, minutes: 10, tags: [], title: 'Prayer and Scripture' },
        { subject: SubjectBucket.Other, minutes: 25, tags: [], title: 'Chores' },
        { subject: SubjectBucket.Math, minutes: 20, tags: [] },
      ])
      const entries = buildCoverageSummary(plan, [])
      const other = entries.find((e) => e.subject === SubjectBucket.Other)
      expect(other?.totalBlocks).toBe(2)
      expect(other?.totalMinutes).toBe(35)
      // …and Other is still its own entry: nothing was dropped, merged or moved.
      expect(entries).toHaveLength(2)
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

    it('says the same names the chips say (UX-259)', () => {
      const plan = makePlan([
        { subject: SubjectBucket.Other, minutes: 20, tags: [], title: 'Prayer and Scripture' },
        { subject: SubjectBucket.LanguageArts, minutes: 20, tags: [] },
      ])
      const text = formatCoverageSummaryText(buildCoverageSummary(plan, []), [])
      expect(text).toContain('Prayer and Scripture')
      expect(text).toContain('Language Arts')
      expect(text).not.toContain('LanguageArts')
      expect(text).not.toMatch(/\bOther\b/)
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
