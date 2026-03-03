import { describe, expect, it } from 'vitest'

import type { DayBlock } from '../types/domain'
import { DayBlockType, SubjectBucket } from '../types/enums'
import {
  autoTagBlocks,
  inferMoSubjects,
  inferThemeSubjects,
  MO_REQUIRED_SUBJECTS,
  resolveSubjectBucket,
} from './complianceMapping'

// ─── MO_REQUIRED_SUBJECTS ────────────────────────────────────────────────────

describe('MO_REQUIRED_SUBJECTS', () => {
  it('contains exactly the five MO-required subjects', () => {
    expect(MO_REQUIRED_SUBJECTS).toEqual([
      'Reading',
      'LanguageArts',
      'Math',
      'Science',
      'SocialStudies',
    ])
  })
})

// ─── inferMoSubjects ─────────────────────────────────────────────────────────

describe('inferMoSubjects', () => {
  // ── Block-type defaults ──

  it('maps Reading block to Reading', () => {
    const result = inferMoSubjects({ blockType: DayBlockType.Reading })
    expect(result).toContain(SubjectBucket.Reading)
  })

  it('maps Reading block to both Reading and LanguageArts (read-aloud)', () => {
    const result = inferMoSubjects({ blockType: DayBlockType.Reading })
    expect(result).toContain(SubjectBucket.Reading)
    expect(result).toContain(SubjectBucket.LanguageArts)
  })

  it('maps Math block to Math', () => {
    const result = inferMoSubjects({ blockType: DayBlockType.Math })
    expect(result).toEqual([SubjectBucket.Math])
  })

  it('maps Speech block to LanguageArts', () => {
    const result = inferMoSubjects({ blockType: DayBlockType.Speech })
    expect(result).toEqual([SubjectBucket.LanguageArts])
  })

  // ── Explicit subjectBucket ──

  it('respects an explicit subjectBucket', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Other,
      subjectBucket: SubjectBucket.Science,
    })
    expect(result).toEqual([SubjectBucket.Science])
  })

  it('adds LanguageArts when Reading block is explicitly tagged Reading', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Reading,
      subjectBucket: SubjectBucket.Reading,
      title: 'Charlotte\'s Web read aloud',
    })
    expect(result).toContain(SubjectBucket.Reading)
    expect(result).toContain(SubjectBucket.LanguageArts)
  })

  it('does not add LanguageArts for non-read-aloud Reading-tagged block', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Other,
      subjectBucket: SubjectBucket.Reading,
      title: 'Sight word flashcards',
    })
    expect(result).toEqual([SubjectBucket.Reading])
  })

  // ── Formation + civic/historical content → SocialStudies ──

  it('maps Formation block with civic content to SocialStudies', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Formation,
      title: 'Morning formation',
      notes: 'Discussed citizenship and the Constitution',
    })
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  it('maps Formation block with historical content to SocialStudies', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Formation,
      title: 'Founding Fathers discussion',
    })
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  it('maps Formation block with geography content to SocialStudies', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Formation,
      notes: 'Talked about our community and neighborhood helpers',
    })
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  it('returns Other for Formation block without civic/historical content', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Formation,
      title: 'Morning prayer and gratitude',
    })
    expect(result).toEqual(['Other'])
  })

  // ── Read-aloud sessions → Reading + LanguageArts ──

  it('maps read-aloud title to Reading + LanguageArts', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Together,
      title: 'Read aloud — The Lion, the Witch, and the Wardrobe',
    })
    expect(result).toContain(SubjectBucket.Reading)
    expect(result).toContain(SubjectBucket.LanguageArts)
  })

  it('maps read-aloud with hyphen to Reading + LanguageArts', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Together,
      title: 'Read-aloud session',
    })
    expect(result).toContain(SubjectBucket.Reading)
    expect(result).toContain(SubjectBucket.LanguageArts)
  })

  // ── Nature journal → Science ──

  it('maps nature journal to Science', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Project,
      title: 'Nature journal',
    })
    expect(result).toContain(SubjectBucket.Science)
  })

  it('maps nature journal in notes to Science', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Other,
      notes: 'Drew observations in the nature journal',
    })
    expect(result).toContain(SubjectBucket.Science)
  })

  it('maps nature log to Science', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Project,
      title: 'Nature log — birds in the yard',
    })
    expect(result).toContain(SubjectBucket.Science)
  })

  // ── Science keywords ──

  it('maps science-keyword content to Science', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Project,
      title: 'Plant life cycle experiment',
    })
    expect(result).toContain(SubjectBucket.Science)
  })

  it('maps weather observation to Science', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Together,
      title: 'Weather observation and tracking',
    })
    expect(result).toContain(SubjectBucket.Science)
  })

  // ── Social-studies keywords in non-Formation blocks ──

  it('maps geography content in Together block to SocialStudies', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Together,
      title: 'Map skills and geography lesson',
    })
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  it('maps community topic in FieldTrip block to SocialStudies', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.FieldTrip,
      title: 'Visit to the community fire station',
    })
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  // ── Fallback ──

  it('returns Other when no subject can be inferred', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.Movement,
      title: 'Backyard free play',
    })
    expect(result).toEqual(['Other'])
  })

  it('returns Other for empty input', () => {
    const result = inferMoSubjects({ blockType: DayBlockType.Other })
    expect(result).toEqual(['Other'])
  })

  // ── Multiple subjects ──

  it('can return multiple subjects for content that spans areas', () => {
    const result = inferMoSubjects({
      blockType: DayBlockType.FieldTrip,
      title: 'Community nature walk — observing habitats',
    })
    expect(result).toContain(SubjectBucket.SocialStudies)
    expect(result).toContain(SubjectBucket.Science)
  })
})

// ─── resolveSubjectBucket ────────────────────────────────────────────────────

describe('resolveSubjectBucket', () => {
  it('returns the explicit subjectBucket when set', () => {
    expect(
      resolveSubjectBucket({
        blockType: DayBlockType.Other,
        subjectBucket: SubjectBucket.Math,
      }),
    ).toBe(SubjectBucket.Math)
  })

  it('infers primary subject from block type', () => {
    expect(
      resolveSubjectBucket({ blockType: DayBlockType.Math }),
    ).toBe(SubjectBucket.Math)
  })

  it('falls back to Other when nothing matches', () => {
    expect(
      resolveSubjectBucket({ blockType: DayBlockType.Movement }),
    ).toBe('Other')
  })

  it('resolves Reading as primary for read-aloud block', () => {
    expect(
      resolveSubjectBucket({
        blockType: DayBlockType.Reading,
        title: 'Read aloud',
      }),
    ).toBe(SubjectBucket.Reading)
  })

  it('ignores subjectBucket of Other and infers from content', () => {
    expect(
      resolveSubjectBucket({
        blockType: DayBlockType.Formation,
        subjectBucket: 'Other',
        notes: 'Constitution discussion',
      }),
    ).toBe(SubjectBucket.SocialStudies)
  })
})

// ─── inferThemeSubjects ──────────────────────────────────────────────────────

describe('inferThemeSubjects', () => {
  it('infers SocialStudies from a civic theme', () => {
    const result = inferThemeSubjects('American History Week')
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  it('infers SocialStudies from a geography theme', () => {
    const result = inferThemeSubjects('Community Helpers')
    expect(result).toContain(SubjectBucket.SocialStudies)
  })

  it('infers Science from a nature theme', () => {
    const result = inferThemeSubjects('Seasons and Weather')
    expect(result).toContain(SubjectBucket.Science)
  })

  it('infers both SocialStudies and Science from a combined theme', () => {
    const result = inferThemeSubjects('Community Nature Exploration')
    expect(result).toContain(SubjectBucket.SocialStudies)
    expect(result).toContain(SubjectBucket.Science)
  })

  it('returns empty array for unrecognized theme', () => {
    expect(inferThemeSubjects('Free Play Week')).toEqual([])
  })
})

// ─── autoTagBlocks ───────────────────────────────────────────────────────────

describe('autoTagBlocks', () => {
  const makeBlock = (
    overrides: Partial<DayBlock> & Pick<DayBlock, 'type'>,
  ): DayBlock => ({
    ...overrides,
  })

  it('tags every block in a standard day', () => {
    const blocks: DayBlock[] = [
      makeBlock({ type: DayBlockType.Formation, title: 'Pledge, prayer, civics chat' }),
      makeBlock({ type: DayBlockType.Reading, title: 'Read aloud' }),
      makeBlock({ type: DayBlockType.Math }),
      makeBlock({ type: DayBlockType.Project, title: 'Nature journal' }),
      makeBlock({ type: DayBlockType.Together, title: 'Map activity' }),
    ]

    const tagged = autoTagBlocks(blocks)

    // Formation with civic content → SocialStudies
    expect(tagged[0].subjects).toContain(SubjectBucket.SocialStudies)
    // Reading → Reading + LanguageArts
    expect(tagged[1].subjects).toContain(SubjectBucket.Reading)
    expect(tagged[1].subjects).toContain(SubjectBucket.LanguageArts)
    // Math → Math
    expect(tagged[2].subjects).toContain(SubjectBucket.Math)
    // Nature journal → Science
    expect(tagged[3].subjects).toContain(SubjectBucket.Science)
    // Map activity → SocialStudies
    expect(tagged[4].subjects).toContain(SubjectBucket.SocialStudies)
  })

  it('covers all five MO subjects in a standard day', () => {
    const blocks: DayBlock[] = [
      makeBlock({ type: DayBlockType.Formation, notes: 'Discussed citizenship' }),
      makeBlock({ type: DayBlockType.Reading }),
      makeBlock({ type: DayBlockType.Math }),
      makeBlock({ type: DayBlockType.Project, title: 'Nature journal' }),
    ]

    const tagged = autoTagBlocks(blocks)
    const allSubjects = new Set(tagged.flatMap((t) => t.subjects))

    for (const required of MO_REQUIRED_SUBJECTS) {
      expect(allSubjects).toContain(required)
    }
  })

  it('uses week theme for blocks that would otherwise be Other', () => {
    const blocks: DayBlock[] = [
      makeBlock({ type: DayBlockType.Together, title: 'Group project' }),
    ]

    const tagged = autoTagBlocks(blocks, 'American History Week')
    expect(tagged[0].subjects).toContain(SubjectBucket.SocialStudies)
  })

  it('does not override inferred subjects with theme', () => {
    const blocks: DayBlock[] = [
      makeBlock({ type: DayBlockType.Math }),
    ]

    const tagged = autoTagBlocks(blocks, 'Community Helpers')
    expect(tagged[0].subjects).toEqual([SubjectBucket.Math])
  })

  it('preserves blockIndex', () => {
    const blocks: DayBlock[] = [
      makeBlock({ type: DayBlockType.Reading }),
      makeBlock({ type: DayBlockType.Math }),
    ]

    const tagged = autoTagBlocks(blocks)
    expect(tagged[0].blockIndex).toBe(0)
    expect(tagged[1].blockIndex).toBe(1)
  })

  it('handles empty blocks array', () => {
    expect(autoTagBlocks([])).toEqual([])
  })

  it('respects explicit subjectBucket on blocks', () => {
    const blocks: DayBlock[] = [
      makeBlock({
        type: DayBlockType.Other,
        subjectBucket: SubjectBucket.Science,
      }),
    ]

    const tagged = autoTagBlocks(blocks)
    expect(tagged[0].subjects).toEqual([SubjectBucket.Science])
  })
})
