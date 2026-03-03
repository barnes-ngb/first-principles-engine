import { describe, it, expect } from 'vitest'
import {
  ALL_SKILL_TAGS,
  autoSuggestTags,
  MathTags,
  ReadingTags,
  SKILL_TAG_CATALOG,
  SKILL_TAG_MAP,
  suggestTagsForSubject,
  WritingTags,
} from './skillTags'

describe('skillTags', () => {
  describe('SKILL_TAG_CATALOG', () => {
    it('contains all expected reading tags', () => {
      const tags = SKILL_TAG_CATALOG.map((d) => d.tag)
      expect(tags).toContain(ReadingTags.CvcBlend)
      expect(tags).toContain(ReadingTags.SightWords)
      expect(tags).toContain(ReadingTags.PhonemicAwareness)
    })

    it('contains all expected math tags', () => {
      const tags = SKILL_TAG_CATALOG.map((d) => d.tag)
      expect(tags).toContain(MathTags.SubtractionRegroup)
      expect(tags).toContain(MathTags.AdditionFacts)
      expect(tags).toContain(MathTags.PlaceValue)
    })

    it('every tag has label, evidence, and commonSupports', () => {
      for (const def of SKILL_TAG_CATALOG) {
        expect(def.label).toBeTruthy()
        expect(def.evidence).toBeTruthy()
        expect(def.commonSupports.length).toBeGreaterThan(0)
      }
    })
  })

  describe('SKILL_TAG_MAP', () => {
    it('maps every tag in catalog', () => {
      for (const def of SKILL_TAG_CATALOG) {
        expect(SKILL_TAG_MAP[def.tag]).toBe(def)
      }
    })
  })

  describe('ALL_SKILL_TAGS', () => {
    it('matches catalog length', () => {
      expect(ALL_SKILL_TAGS.length).toBe(SKILL_TAG_CATALOG.length)
    })
  })

  describe('suggestTagsForSubject', () => {
    it('returns reading/writing tags for Reading', () => {
      const tags = suggestTagsForSubject('Reading')
      expect(tags).toContain(ReadingTags.CvcBlend)
      expect(tags).toContain(ReadingTags.SightWords)
      expect(tags).toContain(WritingTags.LetterFormation)
    })

    it('returns math tags for Math', () => {
      const tags = suggestTagsForSubject('Math')
      expect(tags).toContain(MathTags.SubtractionRegroup)
      expect(tags).toContain(MathTags.AdditionFacts)
    })

    it('returns all tags for unknown subject', () => {
      const tags = suggestTagsForSubject('SocialStudies')
      expect(tags.length).toBe(ALL_SKILL_TAGS.length)
    })

    it('returns reading tags for LanguageArts', () => {
      const tags = suggestTagsForSubject('LanguageArts')
      expect(tags).toContain(ReadingTags.CvcBlend)
    })
  })

  describe('autoSuggestTags', () => {
    it('prioritizes tags matching priority skills', () => {
      const tags = autoSuggestTags('Math', [MathTags.SubtractionRegroup])
      expect(tags).toEqual([MathTags.SubtractionRegroup])
    })

    it('falls back to first 2 subject tags when no priority match', () => {
      const tags = autoSuggestTags('Math', ['reading.cvcBlend'])
      expect(tags.length).toBe(2)
      expect(tags.every((t) => t.startsWith('math.'))).toBe(true)
    })

    it('returns subject-relevant tags even with empty priority list', () => {
      const tags = autoSuggestTags('Reading', [])
      expect(tags.length).toBe(2)
    })
  })
})
