import type { DataReviewExportInput } from './dataReviewExport.logic'

export const REVIEW_EVIDENCE_SCHEMA = 'first-principles-review-evidence@1'

/** Preserve Firestore timestamp precision alongside a readable ISO value. */
function storedValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(storedValue)
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    if (typeof object.seconds === 'number' && typeof object.nanoseconds === 'number'
      && typeof object.toDate === 'function') {
      const date = (object.toDate as () => Date)()
      return { seconds: object.seconds, nanoseconds: object.nanoseconds, iso: date.toISOString() }
    }
    return Object.fromEntries(Object.entries(object)
      .filter(([, item]) => item !== undefined && typeof item !== 'function')
      .map(([key, item]) => [key, storedValue(item)]))
  }
  return value
}

/** Full stored references; this does not reassess a child or follow media URLs. */
export function buildReviewEvidence(input: DataReviewExportInput) {
  const currentYearOnly = input.mode === 'current-year'
  const evaluations = input.evaluationSessions.filter(session => {
    if (!currentYearOnly) return true
    const date = typeof session.evaluatedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(session.evaluatedAt)
      && Number.isFinite(Date.parse(session.evaluatedAt)) ? session.evaluatedAt.slice(0, 10) : null
    // Missing dates remain visible as unknown instead of disappearing.
    return !date || date >= input.schoolYear.start && date <= input.schoolYear.end
  })
  return storedValue({
    schema: REVIEW_EVIDENCE_SCHEMA,
    appBuild: input.appBuild ?? 'not recorded',
    generatedAt: input.generatedAt,
    child: input.child,
    versions: input.versions,
    scope: {
      mode: input.mode,
      schoolYear: input.schoolYear,
      model: 'Current stored model, including its full evidence history; model references are not date-filtered.',
      evaluations: currentYearOnly ? 'Current school year and undated records only.' : 'All loaded evaluation records.',
      excludedOutsideSchoolYearEvaluations: input.evaluationSessions.length - evaluations.length,
    },
    completeness: {
      reads: input.reads,
      limitedReads: input.reads.filter(read => read.cap != null || read.note || read.total == null
        || read.total != null && read.scanned != null && read.scanned < read.total),
      meaning: 'Complete stored fields for the references below, not a complete database backup. Read caps and unknown counts remain limitations.',
      excluded: ['Full conversations', 'Image and recording bytes', 'Sticker cleanup diagnostics', 'Collections not listed in the read report'],
    },
    interpretation: {
      assistance: 'Not recorded unless explicitly present in the source evidence. Support defaults do not establish help used on an attempt.',
      confidence: 'Not recorded unless explicitly present. No new confidence score or mastery inference is calculated.',
      separation: 'Usage, XP and recorded hours are not proof of mastery. A projected state and a direct observation are different evidence kinds.',
    },
    learnerModel: input.learnerModel,
    evaluations: evaluations.map(session => ({
      id: session.id ?? null,
      childId: session.childId,
      sessionType: session.sessionType ?? null,
      domain: session.domain,
      status: session.status,
      evaluatedAt: session.evaluatedAt ?? null,
      findings: session.findings,
      recommendations: session.recommendations,
      frontier: session.frontier,
    })),
  })
}

export function buildReviewEvidenceAppendix(input: DataReviewExportInput): string[] {
  return [
    '## Structured learning evidence',
    '',
    'This appendix preserves the loaded model and full stored evidence references, including provenance and disagreements. It does not infer assistance or confidence when absent. Current-year mode filters evaluation detail; the current model retains its historical evidence references.',
    '',
    'Private review data: notes and source references may contain sensitive details or links. No media is fetched, and complete conversations are excluded. Read limits below still apply.',
    '',
    '```json',
    JSON.stringify(buildReviewEvidence(input), null, 2),
    '```',
    '',
  ]
}
