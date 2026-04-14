import { describe, expect, it } from 'vitest'
import { domainToSubjectBucket } from './domainMapping'
import { SubjectBucket } from '../types/enums'

describe('domainToSubjectBucket', () => {
  it('maps reading → Reading', () => {
    expect(domainToSubjectBucket('reading')).toBe(SubjectBucket.Reading)
  })

  it('maps math → Math', () => {
    expect(domainToSubjectBucket('math')).toBe(SubjectBucket.Math)
  })

  it('maps speech → LanguageArts', () => {
    expect(domainToSubjectBucket('speech')).toBe(SubjectBucket.LanguageArts)
  })

  it('maps writing → LanguageArts', () => {
    expect(domainToSubjectBucket('writing')).toBe(SubjectBucket.LanguageArts)
  })
})
