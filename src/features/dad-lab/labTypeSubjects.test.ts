import { describe, expect, it } from 'vitest'

import { DadLabType, SubjectBucket } from '../../core/types/enums'
import { LAB_TYPE_SUBJECTS, subjectsForLabType } from './labTypeSubjects'

describe('LAB_TYPE_SUBJECTS routing table', () => {
  it('maps each owner-approved default (FEAT-55)', () => {
    expect(LAB_TYPE_SUBJECTS[DadLabType.Science]).toEqual([SubjectBucket.Science])
    expect(LAB_TYPE_SUBJECTS[DadLabType.Engineering]).toEqual([
      SubjectBucket.Science,
      SubjectBucket.PracticalArts,
    ])
    expect(LAB_TYPE_SUBJECTS[DadLabType.Adventure]).toEqual([
      SubjectBucket.Science,
      SubjectBucket.PE,
    ])
    expect(LAB_TYPE_SUBJECTS[DadLabType.Heart]).toEqual([SubjectBucket.Other])
  })

  it('covers every lab type (no gaps)', () => {
    for (const type of Object.values(DadLabType)) {
      const subjects = LAB_TYPE_SUBJECTS[type]
      expect(subjects, `missing routing for ${type}`).toBeDefined()
      expect(subjects.length).toBeGreaterThan(0)
    }
  })

  it('every routed subject is a real SubjectBucket', () => {
    const valid = new Set<string>(Object.values(SubjectBucket))
    for (const subjects of Object.values(LAB_TYPE_SUBJECTS)) {
      for (const s of subjects) expect(valid.has(s)).toBe(true)
    }
  })
})

describe('subjectsForLabType', () => {
  it('returns the default subjects for a type', () => {
    expect(subjectsForLabType(DadLabType.Engineering)).toEqual([
      SubjectBucket.Science,
      SubjectBucket.PracticalArts,
    ])
  })

  it('returns a fresh array each call (safe to mutate)', () => {
    const a = subjectsForLabType(DadLabType.Science)
    const b = subjectsForLabType(DadLabType.Science)
    expect(a).not.toBe(b)
    a.push(SubjectBucket.Math)
    expect(subjectsForLabType(DadLabType.Science)).toEqual([SubjectBucket.Science])
  })

  it('falls back to Science for an unknown type', () => {
    expect(subjectsForLabType('bogus' as DadLabType)).toEqual([SubjectBucket.Science])
  })

  it('never yields an empty tag set (guards the zero-hours path)', () => {
    for (const type of Object.values(DadLabType)) {
      expect(subjectsForLabType(type).length).toBeGreaterThan(0)
    }
  })
})
