import { describe, it, expect } from 'vitest'
import { SubjectBucket } from './enums'

describe('SubjectBucket', () => {
  it('contains SocialStudies', () => {
    expect(SubjectBucket.SocialStudies).toBe('SocialStudies')
  })

  it('is included in Object.values', () => {
    expect(Object.values(SubjectBucket)).toContain('SocialStudies')
  })
})
