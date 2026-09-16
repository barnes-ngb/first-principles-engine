import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { buildDataReviewExport, type DataReviewExportInput } from './dataReviewExport.logic'
import { buildReviewEvidence, REVIEW_EVIDENCE_SCHEMA } from './dataReviewExport.evidence'

function input(): DataReviewExportInput {
  return {
    appBuild: 'test-build', generatedAt: '2026-09-16T12:00:00Z', mode: 'full-history',
    child: { id: 'child-a', name: 'Example' }, schoolYear: { start: '2026-07-01', end: '2027-06-30' },
    schoolYearStart: { month: 7, day: 1 }, hoursRequirement: null,
    versions: { graph: 'test-graph', fastPhonicsBridge: 1, mathseedsBridge: 1, tgtbLa1Bridge: 1, tagConceptBridge: 1 },
    activityConfigs: [], workbookConfigs: [], skillSnapshot: null, sightWords: [], dayLogs: [], hoursEntries: [],
    hoursAdjustments: [], artifacts: [], dadLabReports: [], evaluationSessions: [], disposition: null, xpEvents: [], xpTotals: null,
    reads: [{ collection: 'evaluationSessions', shown: 1, scanned: 100, total: 300, cap: 100, note: 'Scan capped' }],
    learnerModel: {
      childId: 'child-a', graphVersion: 'stored-graph', status: 'seeded',
      conceptStates: { 'reading.phonics.cvc': { state: 'forming', needsReconcile: true, evidence: [
        { kind: 'curriculumPosition', sourceId: 'scan-old', observedAt: '2025-09-01T10:05:01Z', note: 'long source note '.repeat(80), source: 'workbook', unit: 'Unit 1', detail: 'with help', via: 'scan', positionSync: true },
        { kind: 'attestation', sourceId: 'review-new', observedAt: '2026-09-15T10:05:01Z', note: 'parent observation', overriddenBy: 'parent', readState: 'forming' },
      ] } },
      modalityCalibration: { reading: { note: 'supported' }, writing: { note: 'dictation' }, math: { note: 'spoken' } },
      whatMattersNext: [], changeFeed: [], openQuestions: [], seededAt: '2026-07-01T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
    },
  }
}

describe('review evidence appendix', () => {
  it('preserves every full stored reference and disagreement in the downloadable Markdown', () => {
    const data = input()
    const before = JSON.stringify(data)
    const markdown = buildDataReviewExport(data)
    const json = markdown.split('## Structured learning evidence')[1].split('```json\n')[1].split('\n```')[0]
    const result = JSON.parse(json)
    expect(result.schema).toBe(REVIEW_EVIDENCE_SCHEMA)
    expect(result.appBuild).toBe('test-build')
    expect(result.learnerModel).toEqual(data.learnerModel)
    expect(result.completeness.limitedReads).toEqual(data.reads)
    expect(result.interpretation.assistance).toMatch(/Not recorded/)
    expect(result.interpretation.confidence).toMatch(/No new confidence/)
    expect(JSON.stringify(data)).toBe(before)
  })

  it('keeps full findings but excludes conversations and honors evaluation year scope', () => {
    const data = input()
    const finding = { skill: 'reading.phonics', status: 'emerging' as const, evidence: 'Responded with a hint. '.repeat(50), notes: 'adult assistance', testedAt: '2026-09-01T00:00:00Z' }
    const session = { childId: 'child-a', domain: 'reading' as const, status: 'complete' as const, findings: [finding], recommendations: [], messages: [{ id: 'message-1', role: 'user' as const, text: 'PRIVATE CONVERSATION', createdAt: '2026-09-01T00:00:00Z' }], evaluatedAt: '2026-09-01T00:00:00Z' }
    data.evaluationSessions = [{ ...session, id: 'now' }, { ...session, id: 'old', evaluatedAt: '2025-09-01T00:00:00Z' }]
    const full = JSON.stringify(buildReviewEvidence(data))
    expect(full).toContain(finding.evidence)
    expect(full).not.toContain('PRIVATE CONVERSATION')
    data.mode = 'current-year'
    const current = JSON.parse(JSON.stringify(buildReviewEvidence(data)))
    expect(current.evaluations.map((item: { id: string }) => item.id)).toEqual(['now'])
    expect(current.scope.excludedOutsideSchoolYearEvaluations).toBe(1)
    expect(current.learnerModel.conceptStates['reading.phonics.cvc'].evidence[0].sourceId).toBe('scan-old')
    expect(current.scope.model).toMatch(/not date-filtered/)
  })

  it('serializes real Firestore timestamps without losing precision or inventing missing data', () => {
    const data = input()
    const stamp = new Timestamp(1750000000, 123456789)
    Object.assign(data.learnerModel!, { updatedAt: stamp })
    const result = JSON.parse(JSON.stringify(buildReviewEvidence(data)))
    expect(result.learnerModel.updatedAt).toEqual({ seconds: 1750000000, nanoseconds: 123456789, iso: stamp.toDate().toISOString() })
    data.learnerModel = null
    data.appBuild = undefined
    const empty = JSON.parse(JSON.stringify(buildReviewEvidence(data)))
    expect(empty.learnerModel).toBeNull()
    expect(empty.appBuild).toBe('not recorded')
    expect(empty.evaluations).toEqual([])
  })

  it('retains ordered quest answers, their provenance and partial-session outcomes in the downloaded file', () => {
    const data = input()
    const questions = [{
      id: 'answer-1', type: 'multiple-choice' as const, level: 2, skill: 'reading.phonics',
      prompt: 'Choose the word', stimulus: 'cat', options: ['cat', 'cap'], correctAnswer: 'cat',
      childAnswer: 'cap', correct: false, responseTimeMs: 2400, timestamp: '2026-09-01T10:00:00Z',
      inputMethod: 'voice' as const, targetConceptId: 'reading.phonics.cvc', targetedBlockerId: 'blocker-1',
      assistance: { kind: 'hint', source: 'parent observation' }, confidence: 'not recorded',
    }, {
      id: 'answer-2', type: 'multiple-choice' as const, level: 2, skill: 'reading.phonics',
      prompt: 'Choose another word', options: ['dog', 'dot'], correctAnswer: 'dog', childAnswer: '',
      correct: false, skipped: true, flaggedAsError: true, responseTimeMs: 0, timestamp: '2026-09-01T10:01:00Z',
    }]
    const session = {
      id: 'quest-partial', childId: 'child-a', domain: 'reading' as const, status: 'partial' as const,
      sessionType: 'interactive', questMode: 'phonics', questions, finalLevel: 2, totalCorrect: 0,
      totalQuestions: 2, diamondsMined: 0, streakDays: 1, timedOut: false, skippedCount: 1, flaggedErrorCount: 1,
      summary: 'Stopped early; one question flagged.', findings: [], recommendations: [],
      evaluatedAt: '2026-09-01T10:02:00Z',
      messages: [{ id: 'secret', role: 'user' as const, text: 'PRIVATE CHAT', createdAt: '2026-09-01T10:00:00Z' }],
      savedQuestState: { currentLevel: 2 }, savedCurrentQuestion: { prompt: 'UNANSWERED RESUME PROMPT' }, bonusRoundUsed: false,
    }
    data.evaluationSessions = [session]
    const before = JSON.stringify(data)
    const markdown = buildDataReviewExport(data)
    const result = JSON.parse(markdown.split('## Structured learning evidence')[1].split('```json\n')[1].split('\n```')[0])
    const evidence = { ...session }
    for (const key of ['messages', 'savedQuestState', 'savedCurrentQuestion', 'bonusRoundUsed']) Reflect.deleteProperty(evidence, key)
    expect(result.evaluations).toEqual([evidence])
    expect(result.evaluations[0].questions[1]).not.toHaveProperty('assistance')
    expect(result.evaluations[0].questions[1]).not.toHaveProperty('confidence')
    expect(result.completeness.excluded.join(' ')).toContain('savedQuestState')
    expect(markdown).not.toContain('PRIVATE CHAT')
    expect(markdown).not.toContain('UNANSWERED RESUME PROMPT')
    expect(JSON.stringify(data)).toBe(before)
  })

  it('retains fluency passages and every reading attempt without fetching recordings', () => {
    const data = input()
    const passages = [{ text: 'A cat sat. '.repeat(80), targetWords: ['cat'], speechWords: ['sat'], wordCount: 240,
      readingLevel: 'L1', attempts: [
        { recordingUrl: 'gs://synthetic/attempt-1', selfRating: 'hard' as const, durationSeconds: 12.5, timestamp: '2026-09-01T11:00:00Z' },
        { recordingUrl: null, selfRating: 'easy' as const, durationSeconds: 0, timestamp: '2026-09-01T11:02:00Z' },
      ] }, { text: 'The dog ran.', targetWords: [], speechWords: [], wordCount: 3, readingLevel: 'L1', attempts: [] }]
    data.evaluationSessions = [{
      id: 'fluency-1', childId: 'child-a', domain: 'reading', status: 'complete', sessionType: 'fluency',
      questMode: 'fluency', passages, totalReadingTimeSeconds: 12.5, diamondsEarned: 0,
      evaluatedAt: '2026-09-01T11:03:00Z', messages: [], findings: [], recommendations: [], summary: 'Two passages read.',
    }]
    const markdown = buildDataReviewExport(data)
    const result = JSON.parse(markdown.split('## Structured learning evidence')[1].split('```json\n')[1].split('\n```')[0])
    expect(result.evaluations[0]).toEqual({
      id: 'fluency-1', childId: 'child-a', domain: 'reading', status: 'complete', sessionType: 'fluency',
      questMode: 'fluency', passages, totalReadingTimeSeconds: 12.5, diamondsEarned: 0,
      evaluatedAt: '2026-09-01T11:03:00Z', findings: [], recommendations: [], summary: 'Two passages read.',
    })
    expect(result.evaluations[0]).not.toHaveProperty('questions')
    expect(result.evaluations[0]).not.toHaveProperty('finalLevel')
  })

  it('preserves guided summary and next review date while applying the same scope to session details', () => {
    const data = input()
    const session = { childId: 'child-a', domain: 'reading' as const, status: 'complete' as const,
      messages: [], findings: [], recommendations: [], summary: 'Observed evidence. '.repeat(80),
      nextEvalDate: '2026-10-01', evaluatedAt: '2026-09-01T00:00:00Z' }
    data.evaluationSessions = [{ ...session, id: 'guided-now' }, { ...session, id: 'old-quest',
      sessionType: 'interactive', questMode: 'math', questions: [], evaluatedAt: '2025-09-01T00:00:00Z' }]
    const full = JSON.parse(JSON.stringify(buildReviewEvidence(data)))
    expect(full.evaluations[0]).toMatchObject({ summary: session.summary, nextEvalDate: session.nextEvalDate })
    expect(full.evaluations[1]).toMatchObject({ id: 'old-quest', questMode: 'math', questions: [] })
    data.mode = 'current-year'
    const current = JSON.parse(JSON.stringify(buildReviewEvidence(data)))
    expect(current.evaluations.map((item: { id: string }) => item.id)).toEqual(['guided-now'])
    expect(current.scope.excludedOutsideSchoolYearEvaluations).toBe(1)
  })
})
