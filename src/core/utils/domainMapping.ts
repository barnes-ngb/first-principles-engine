import type { EvaluationDomain } from '../types/enums'
import { SubjectBucket } from '../types/enums'

/**
 * Map an evaluation domain to the corresponding SubjectBucket for hours logging.
 * Speech and Writing both map to LanguageArts.
 */
export function domainToSubjectBucket(domain: EvaluationDomain): SubjectBucket {
  switch (domain) {
    case 'reading':
      return SubjectBucket.Reading
    case 'math':
      return SubjectBucket.Math
    case 'speech':
    case 'writing':
      return SubjectBucket.LanguageArts
    default:
      return SubjectBucket.Other
  }
}
