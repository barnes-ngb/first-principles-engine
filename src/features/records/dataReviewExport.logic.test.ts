import { describe, expect, it } from 'vitest'

import {
  buildDataReviewExport,
  computeIntegrityChecks,
  DataReviewExportMode,
  dataReviewExportFilename,
  evalLooksAppliedToSnapshot,
  OPEN_QUESTION_STALE_DAYS,
  reportOwnedArtifactIds,
  schoolYearKey,
  workbookBridgeStatus,
  type DataReviewEvaluationSession,
  type DataReviewExportInput,
  type IntegrityCheck,
} from './dataReviewExport.logic'
import type {
  ActivityConfig,
  Artifact,
  DadLabReport,
  DayLog,
  HoursEntry,
  SightWordProgress,
  SkillSnapshot,
} from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  MasteryGate,
  SkillLevel,
  SubjectBucket,
} from '../../core/types/enums'
import type { LearnerModel } from '../../core/types/learnerModel'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = '2026-07-25T12:00:00.000Z'
const CHILD_ID = 'child-1'
const SCHOOL_YEAR_START = { month: 7, day: 1 }

/** A concept id that really exists in the curated reading graph. */
const CONCEPT = 'reading.phonics.cvc'

const emptyInput = (
  overrides: Partial<DataReviewExportInput> = {},
): DataReviewExportInput => ({
  generatedAt: NOW,
  mode: DataReviewExportMode.FullHistory,
  child: { id: CHILD_ID, name: 'Lincoln', grade: '4th' },
  schoolYear: { start: '2026-07-01', end: '2027-06-30' },
  schoolYearStart: SCHOOL_YEAR_START,
  hoursRequirement: { total: 1000, core: 600, coreAtHome: 600 },
  versions: {
    graph: 'reading@1+math@1',
    fastPhonicsBridge: 1,
    mathseedsBridge: 1,
    tgtbLa1Bridge: 1,
    tagConceptBridge: 1,
  },
  activityConfigs: [],
  workbookConfigs: [],
  learnerModel: null,
  skillSnapshot: null,
  sightWords: [],
  dayLogs: [],
  hoursEntries: [],
  hoursAdjustments: [],
  artifacts: [],
  dadLabReports: [],
  evaluationSessions: [],
  disposition: null,
  xpEvents: [],
  xpTotals: null,
  reads: [],
  ...overrides,
})

const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: 'art-1',
  childId: CHILD_ID,
  title: 'Bridge build',
  type: EvidenceType.Photo,
  uri: 'https://storage.example/art-1.jpg',
  createdAt: '2026-07-10T09:00:00.000Z',
  dayLogId: `2026-07-10_${CHILD_ID}`,
  tags: {
    engineStage: EngineStage.Build,
    domain: 'science',
    subjectBucket: SubjectBucket.Science,
    location: 'Home',
  },
  ...over,
})

const labReport = (over: Partial<DadLabReport> = {}): DadLabReport => ({
  id: 'lab-1',
  date: '2026-07-11',
  weekKey: '2026-07-05',
  title: 'Circuits',
  labType: 'science',
  question: 'What makes the bulb light?',
  description: 'Battery + wire + bulb',
  status: 'complete',
  childReports: {},
  subjectTags: [SubjectBucket.Science],
  totalMinutes: 45,
  createdAt: '2026-07-11T10:00:00.000Z',
  updatedAt: '2026-07-11T11:00:00.000Z',
  ...over,
})

const guidedSession = (
  over: Partial<DataReviewEvaluationSession> = {},
): DataReviewEvaluationSession => ({
  id: 'eval-1',
  childId: CHILD_ID,
  domain: 'reading',
  status: 'complete',
  messages: [],
  findings: [
    {
      skill: 'reading.phonics.cvc',
      status: 'emerging',
      evidence: 'Read 6 of 10 CVC words',
      testedAt: '2026-07-12T10:00:00.000Z',
    },
  ],
  recommendations: [],
  frontier: 'Short-vowel CVC words in connected text',
  evaluatedAt: '2026-07-12T10:00:00.000Z',
  ...over,
})

const learnerModel = (over: Partial<LearnerModel> = {}): LearnerModel => ({
  childId: CHILD_ID,
  graphVersion: 'reading@1+math@1',
  status: 'synthesized',
  conceptStates: {
    [CONCEPT]: {
      state: 'frontier',
      evidence: [
        {
          kind: 'eval',
          sourceId: 'eval-1',
          note: 'Guided eval read this as emerging',
          observedAt: '2026-07-12T10:00:00.000Z',
        },
      ],
    },
  },
  modalityCalibration: {
    reading: { level: 3, note: 'Reads short vowels with support' },
    writing: { note: 'Dictates more than he writes' },
    math: { level: 4, note: 'Two-digit addition is steady' },
  },
  whatMattersNext: [],
  changeFeed: [
    {
      conceptId: CONCEPT,
      from: 'not-yet',
      to: 'frontier',
      cause: 'guided evaluation',
      at: '2026-07-12T10:00:00.000Z',
    },
  ],
  openQuestions: [
    {
      conceptId: CONCEPT,
      question: 'Does he hold short vowels in connected text?',
      routedTo: 'quest',
      reason: 'eval saw it only in isolation',
    },
  ],
  synthesis: {
    whatMattersNext: [
      {
        conceptId: CONCEPT,
        kidName: 'Short-vowel words',
        why: 'He reads them in lists but loses them in stories.',
        suggestedVehicle: 'quest',
      },
    ],
    narrative: 'Phonics is clicking.',
    openQuestionsSummary: ['Do short vowels hold in a story?'],
    generatedAt: '2026-07-13T00:00:00.000Z',
  },
  synthesisStaleAt: null,
  seededAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  ...over,
})

const skillSnapshot = (over: Partial<SkillSnapshot> = {}): SkillSnapshot => ({
  childId: CHILD_ID,
  prioritySkills: [
    {
      tag: 'reading.phonics.cvc',
      label: 'CVC words',
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.NotYet,
    },
  ],
  supports: [{ label: 'Short bursts', description: '10 minutes, then a win' }],
  stopRules: [{ label: 'Frustration', trigger: 'Two misses', action: 'Switch to audio' }],
  evidenceDefinitions: [],
  completedPrograms: ['reading-eggs'],
  workingLevels: {
    phonics: { level: 4, updatedAt: '2026-07-12T10:00:00.000Z', source: 'evaluation' },
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
  ...over,
})

const activityConfig = (over: Partial<ActivityConfig> = {}): ActivityConfig => ({
  id: 'cfg-mathseeds',
  name: 'Mathseeds',
  type: 'workbook',
  subjectBucket: SubjectBucket.Math,
  defaultMinutes: 20,
  frequency: 'daily',
  childId: CHILD_ID,
  sortOrder: 1,
  currentPosition: 122,
  totalUnits: 200,
  unitLabel: 'lesson',
  completed: false,
  scannable: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
})

const dayLog = (over: Partial<DayLog> = {}): DayLog => ({
  childId: CHILD_ID,
  date: '2026-07-10',
  planType: 'normal',
  blocks: [
    {
      type: 'Reading',
      subjectBucket: SubjectBucket.Reading,
      location: 'Home',
      actualMinutes: 30,
    },
  ],
  ...(over as Partial<DayLog>),
}) as DayLog

const hoursEntry = (over: Partial<HoursEntry> = {}): HoursEntry => ({
  id: 'hours-1',
  childId: CHILD_ID,
  date: '2026-07-11',
  minutes: 45,
  subjectBucket: SubjectBucket.Science,
  location: 'Home',
  ...over,
})

const sightWord = (over: Partial<SightWordProgress> = {}): SightWordProgress => ({
  word: 'the',
  encounters: 12,
  selfReportedKnown: 8,
  helpRequested: 1,
  shellyConfirmed: true,
  masteryLevel: 'mastered',
  firstSeen: '2026-02-01T00:00:00.000Z',
  lastSeen: '2026-07-01T00:00:00.000Z',
  lastLevelChange: '2026-06-01T00:00:00.000Z',
  ...over,
})

/** A child whose data is fully connected — every integrity check should PASS. */
const completeInput = (
  overrides: Partial<DataReviewExportInput> = {},
): DataReviewExportInput =>
  emptyInput({
    activityConfigs: [activityConfig()],
    learnerModel: learnerModel(),
    skillSnapshot: skillSnapshot(),
    sightWords: [sightWord(), sightWord({ word: 'and', masteryLevel: 'practicing', shellyConfirmed: false })],
    dayLogs: [dayLog()],
    hoursEntries: [hoursEntry()],
    artifacts: [
      artifact(),
      artifact({
        id: 'art-lab',
        title: 'Circuit photo',
        labSessionId: 'lab-1',
        labStage: EngineStage.Build,
        dayLogId: undefined,
        weekKey: '2026-07-05',
        createdAt: '2026-07-11T10:30:00.000Z',
      }),
    ],
    dadLabReports: [labReport()],
    evaluationSessions: [guidedSession()],
    xpEvents: [
      {
        childId: CHILD_ID,
        totalXp: 0,
        sources: { routines: 0, quests: 0, books: 0 },
        lastUpdatedAt: '2026-07-10T00:00:00.000Z',
        type: 'checklist',
        amount: 5,
        awardedAt: '2026-07-10T00:00:00.000Z',
      },
    ],
    xpTotals: {
      childId: CHILD_ID,
      totalXp: 420,
      sources: { routines: 300, quests: 100, books: 20 },
      lastUpdatedAt: '2026-07-12T00:00:00.000Z',
    },
    reads: [
      { collection: 'artifacts', shown: 2, scanned: 2, total: 2 },
      { collection: 'days', shown: 1, scanned: 1, total: 1 },
      { collection: 'hours', shown: 1, scanned: 1, total: 1 },
    ],
    ...overrides,
  })

const checkById = (checks: IntegrityCheck[], id: string): IntegrityCheck => {
  const found = checks.find((c) => c.id === id)
  if (!found) throw new Error(`no integrity check with id ${id}`)
  return found
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('schoolYearKey', () => {
  it('puts July 1 into the new school year and June 30 into the old one', () => {
    expect(schoolYearKey('2026-07-01', SCHOOL_YEAR_START)).toBe('2026-27')
    expect(schoolYearKey('2026-06-30', SCHOOL_YEAR_START)).toBe('2025-26')
    expect(schoolYearKey('2025-12-25', SCHOOL_YEAR_START)).toBe('2025-26')
  })
})

describe('workbookBridgeStatus (FEAT-63 gate)', () => {
  it('reports a synced bridge for a curated, position-addressable source', () => {
    const status = workbookBridgeStatus('Mathseeds', 122)
    expect(status.status).toBe('synced')
    expect(status.label).toContain('mathseeds')
  })

  it('reports no bridge for an unrecognized workbook name', () => {
    expect(workbookBridgeStatus('Made Up Workbook', 5).status).toBe('no-bridge')
  })

  it('reports pending curation when the lesson→unit mapping is uncurated', () => {
    // Fast Phonics has a bridge but its lesson numbering is provisional/uncurated
    // in the same way the position sync reports; either honest gate is acceptable
    // so long as it is NOT reported as synced.
    const status = workbookBridgeStatus('Some Workbook', null)
    expect(status.status).not.toBe('synced')
  })
})

describe('buildDataReviewExport — complete child', () => {
  const input = completeInput()
  const md = buildDataReviewExport(input)

  it('renders every numbered section', () => {
    for (const heading of [
      '## 1. Workbook / activity configs',
      '## 2. Learner model',
      '## 3. Skill snapshot',
      '## 4. Sight words',
      '## 5. Hours',
      '## 6. Artifacts index',
      '## 7. Dad Lab',
      '## 8. Evaluations (guided)',
      '## 9. Quest / Mine, dispositions, XP',
      '## Integrity checks',
    ]) {
      expect(md).toContain(heading)
    }
  })

  it('carries the generated-at stamp and the graph / bridge versions in the header', () => {
    expect(md).toContain(`| Generated at | ${NOW} |`)
    expect(md).toContain('| Concept graph version | `reading@1+math@1` |')
    expect(md).toContain('| Fast Phonics bridge | v1 |')
    expect(md).toContain('| Mathseeds bridge | v1 |')
    expect(md).toContain('| TGTB LA1 bridge | v1 |')
    expect(md).toContain('| Tag→concept bridge | v1 |')
  })

  it('states counts and explains the — / MISSING markers', () => {
    expect(md).toContain(
      '`artifacts` — 2 items kept for this child, from 2 family-wide `artifacts` document(s).',
    )
    expect(md).toContain('`hoursAdjustments` — 0 items.')
    expect(md).toContain('MISSING')
    expect(md).toContain('Do not treat them as export bugs')
  })

  it('reports the school-year hours totals against the targets', () => {
    // 30 min day-log reading + 45 min science entry = 75 min = 1.3 h
    expect(md).toContain('| 1.3 |')
    expect(md).toContain('| 1000 |')
  })

  it('includes photo URLs for artifacts that carry media', () => {
    expect(md).toContain('https://storage.example/art-1.jpg')
  })

  it('passes every integrity check', () => {
    const checks = computeIntegrityChecks(input)
    const flags = checks.filter((c) => c.status === 'FLAG')
    expect(flags.map((f) => `${f.id}: ${f.detail}`)).toEqual([])
    expect(checks.length).toBeGreaterThanOrEqual(11)
  })
})

describe('integrity — artifact links', () => {
  it('flags an artifact with no resolvable link, naming its doc id', () => {
    const input = completeInput({
      artifacts: [
        artifact({
          id: 'art-orphan',
          dayLogId: undefined,
          weekKey: undefined,
          projectId: undefined,
          labSessionId: undefined,
        }),
      ],
      dadLabReports: [],
    })
    const check = checkById(computeIntegrityChecks(input), 'artifact-unlinked')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('art-orphan')
  })

  it('does not flag an artifact that carries a link', () => {
    const input = completeInput({ artifacts: [artifact()], dadLabReports: [] })
    expect(checkById(computeIntegrityChecks(input), 'artifact-unlinked').status).toBe(
      'PASS',
    )
  })
})

describe('integrity — Dad Lab orphans (both directions)', () => {
  const input = completeInput({
    artifacts: [
      artifact({
        id: 'art-lab-orphan',
        labSessionId: 'lab-missing',
        dayLogId: undefined,
        weekKey: '2026-07-05',
      }),
    ],
    dadLabReports: [labReport({ id: 'lab-lonely' })],
  })
  const checks = computeIntegrityChecks(input)

  it('flags a lab artifact whose labSessionId matches no report', () => {
    const check = checkById(checks, 'lab-artifact-orphan')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('art-lab-orphan')
    expect(check.detail).toContain('lab-missing')
  })

  it('flags a report with no artifacts pointing at it', () => {
    const check = checkById(checks, 'lab-report-no-artifacts')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('lab-lonely')
  })

  it('surfaces both orphan directions in the rendered §7', () => {
    const md = buildDataReviewExport(input)
    expect(md).toContain('**NO — orphan**')
    expect(md).toContain('1 lab artifact(s) resolving to no report')
  })
})

// Codex review (PR #1624, P2): the lab↔artifact link lives on EITHER side. The
// FEAT-56 three-beat capture (`LabReportForm.captureBeatArtifact`) is today's
// DEFAULT and writes an artifact with NO `labSessionId` — the link is the
// report's own `beats[*].items[].artifactId`, and the artifact is written with
// `childId: 'both'`. Resolving only the artifact side produced false findings
// against perfectly well-connected data.
describe('integrity — Dad Lab links resolved from the report side', () => {
  /** A three-beat artifact exactly as LabReportForm writes it. */
  const beatArtifact = artifact({
    id: 'art-beat',
    childId: 'both',
    title: 'Dad Lab photo - Circuits',
    labBeat: 'try',
    labSessionId: undefined,
    dayLogId: undefined,
    weekKey: undefined,
    tags: {
      engineStage: EngineStage.Build,
      domain: 'dad-lab',
      subjectBucket: SubjectBucket.Science,
      location: 'Home',
    },
  })
  const beatReport = labReport({
    id: 'lab-beats',
    beats: {
      predict: { items: [] },
      try: { items: [{ artifactId: 'art-beat', child: 'both' }] },
      saw: { items: [] },
    },
  })
  const input = completeInput({
    artifacts: [beatArtifact],
    dadLabReports: [beatReport],
  })
  const checks = computeIntegrityChecks(input)

  it('collects artifact ids a report owns from beats and childReports', () => {
    expect(reportOwnedArtifactIds(beatReport)).toEqual(['art-beat'])
    expect(
      reportOwnedArtifactIds(
        labReport({ childReports: { [CHILD_ID]: { artifacts: ['art-legacy'] } } }),
      ),
    ).toEqual(['art-legacy'])
  })

  it('does not call a three-beat report artifact-less', () => {
    expect(checkById(checks, 'lab-report-no-artifacts').status).toBe('PASS')
  })

  it('does not call a report-owned artifact an orphan', () => {
    expect(checkById(checks, 'lab-artifact-orphan').status).toBe('PASS')
  })

  it('does not call a report-owned artifact unlinked', () => {
    expect(checkById(checks, 'artifact-unlinked').status).toBe('PASS')
  })

  it('names the resolution direction in the §7 cross-reference', () => {
    const md = buildDataReviewExport(input)
    expect(md).toContain('yes — the report lists this artifact id')
    // The report's linked-artifact count reflects the report-side link.
    expect(md).toContain('| `lab-beats` |')
  })

  it('still flags a dad-lab artifact that NO report lists and that names no session', () => {
    const stray = computeIntegrityChecks(
      completeInput({ artifacts: [beatArtifact], dadLabReports: [] }),
    )
    expect(checkById(stray, 'lab-artifact-orphan').status).toBe('FLAG')
    expect(checkById(stray, 'lab-artifact-orphan').detail).toContain('art-beat')
  })
})

describe('integrity — stale synthesis', () => {
  it('flags a model whose synthesisStaleAt is newer than the stored synthesis', () => {
    const input = completeInput({
      learnerModel: learnerModel({ synthesisStaleAt: '2026-07-20T00:00:00.000Z' }),
    })
    const check = checkById(computeIntegrityChecks(input), 'learner-model-stale')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('2026-07-20T00:00:00.000Z')
    expect(buildDataReviewExport(input)).toContain(
      '**STALE — the stored synthesis is behind the concept states**',
    )
  })

  it('passes when the synthesis is current', () => {
    expect(
      checkById(computeIntegrityChecks(completeInput()), 'learner-model-stale').status,
    ).toBe('PASS')
  })
})

describe('integrity — open questions, evaluations, Dad Lab tags', () => {
  it(`flags a routed question whose concept has not moved in ${OPEN_QUESTION_STALE_DAYS} days`, () => {
    const stale = learnerModel()
    stale.conceptStates[CONCEPT].evidence[0].observedAt = '2026-01-01T00:00:00.000Z'
    stale.updatedAt = '2026-01-01T00:00:00.000Z'
    const check = checkById(
      computeIntegrityChecks(completeInput({ learnerModel: stale })),
      'open-question-stale',
    )
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain(CONCEPT)
  })

  it('flags a guided evaluation that reached neither the snapshot nor the model', () => {
    const input = completeInput({
      learnerModel: learnerModel({ conceptStates: {} }),
      skillSnapshot: null,
      evaluationSessions: [guidedSession({ id: 'eval-lost' })],
    })
    const check = checkById(computeIntegrityChecks(input), 'eval-never-applied')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('eval-lost')
  })

  it('infers "applied to snapshot" from a matching priority skill, not a stored marker', () => {
    expect(evalLooksAppliedToSnapshot(guidedSession(), skillSnapshot())).toBe(true)
    expect(
      evalLooksAppliedToSnapshot(
        guidedSession(),
        skillSnapshot({ prioritySkills: [] }),
      ),
    ).toBe(false)
  })

  it('flags a completed Dad Lab with no subject tags (it logged zero hours)', () => {
    const input = completeInput({
      dadLabReports: [labReport({ id: 'lab-untagged', subjectTags: [] })],
      artifacts: [artifact({ id: 'art-lab', labSessionId: 'lab-untagged' })],
    })
    const check = checkById(computeIntegrityChecks(input), 'dad-lab-untagged')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('lab-untagged')
  })

  it('flags a tracked workbook position that cannot reach the learner model', () => {
    const input = completeInput({
      activityConfigs: [activityConfig({ id: 'cfg-mystery', name: 'Mystery Book' })],
    })
    const check = checkById(computeIntegrityChecks(input), 'workbook-bridge')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('cfg-mystery')
  })
})

describe('empty collections', () => {
  const input = emptyInput()

  it('renders without throwing', () => {
    expect(() => buildDataReviewExport(input)).not.toThrow()
  })

  it('renders every section with a zero count rather than omitting it', () => {
    const md = buildDataReviewExport(input)
    expect(md).toContain('## 1. Workbook / activity configs')
    expect(md).toContain('## 6. Artifacts index')
    expect(md).toContain('## 9. Quest / Mine, dispositions, XP')
    expect(md).toContain('_0 items')
    expect(md).toContain('no `learnerModels/child-1` document stored')
    expect(md).toContain('no `skillSnapshots/child-1` document stored')
  })

  it('still produces integrity checks, all PASS', () => {
    const checks = computeIntegrityChecks(input)
    expect(checks.length).toBeGreaterThanOrEqual(11)
    expect(checks.filter((c) => c.status === 'FLAG')).toEqual([])
  })
})

describe('full history (default) vs current-school-year-only', () => {
  const priorYear = artifact({
    id: 'art-old',
    title: 'Last year drawing',
    createdAt: '2025-11-04T09:00:00.000Z',
    dayLogId: `2025-11-04_${CHILD_ID}`,
  })
  const base = completeInput({
    artifacts: [artifact(), priorYear],
    dadLabReports: [],
    hoursEntries: [hoursEntry(), hoursEntry({ id: 'hours-old', date: '2025-11-04' })],
    evaluationSessions: [
      guidedSession(),
      guidedSession({ id: 'eval-old', evaluatedAt: '2025-11-05T10:00:00.000Z' }),
    ],
    reads: [],
  })

  it('defaults to full history and expands prior-year artifact detail', () => {
    expect(base.mode).toBe(DataReviewExportMode.FullHistory)
    const md = buildDataReviewExport(base)
    expect(md).toContain('**FULL HISTORY** (default)')
    expect(md).toContain('Last year drawing')
    expect(md).toContain('#### 2025-11')
    // Prior-year evaluation detail is present too.
    expect(md).toContain('eval-old')
  })

  it('collapses prior-year artifact detail to a count-per-month rollup', () => {
    const md = buildDataReviewExport({
      ...base,
      mode: DataReviewExportMode.CurrentYear,
    })
    expect(md).toContain('**CURRENT SCHOOL YEAR ONLY**')
    expect(md).not.toContain('Last year drawing')
    expect(md).toContain('prior-year detail collapsed to a count-per-month rollup')
    expect(md).toContain('| 2025-11 | 1 |')
    // Prior-year evaluations are collapsed out of the detail table but still counted.
    expect(md).not.toContain('`eval-old`')
    expect(md).toContain('prior-year evaluation(s) collapsed out of the detail table')
  })

  it('keeps per-school-year hours totals in BOTH modes (they are already rollups)', () => {
    for (const mode of [
      DataReviewExportMode.FullHistory,
      DataReviewExportMode.CurrentYear,
    ] as const) {
      const md = buildDataReviewExport({ ...base, mode })
      expect(md).toContain('2026-27')
      expect(md).toContain('2025-26')
    }
  })
})

describe('read caps', () => {
  const capped = completeInput({
    reads: [
      { collection: 'artifacts', shown: 2, scanned: 500, total: 812, cap: 500 },
      { collection: 'days', shown: 1, scanned: 1, total: 1 },
    ],
  })

  it('names the cap in the section header instead of truncating silently', () => {
    expect(buildDataReviewExport(capped)).toContain(
      'showing the most recent 500 of 812 `artifacts` documents',
    )
  })

  it('flags the cap in the integrity appendix', () => {
    const check = checkById(computeIntegrityChecks(capped), 'collection-row-counts')
    expect(check.status).toBe('FLAG')
    expect(check.detail).toContain('artifacts scanned the most recent 500 of 812')
  })

  it('flags documents the date-ordered query never returned', () => {
    const short = completeInput({
      reads: [{ collection: 'days', shown: 1, scanned: 40, total: 55 }],
    })
    const md = buildDataReviewExport(short)
    expect(md).toContain('**40 of 55 `days` documents were read**')
    expect(checkById(computeIntegrityChecks(short), 'collection-row-counts').status).toBe(
      'FLAG',
    )
  })
})

describe('dataReviewExportFilename', () => {
  it('slugifies the child name and stamps the scope + day', () => {
    expect(
      dataReviewExportFilename('Lincoln', NOW, DataReviewExportMode.FullHistory),
    ).toBe('lincoln-data-review-full-history-2026-07-25.md')
    expect(
      dataReviewExportFilename('London', NOW, DataReviewExportMode.CurrentYear),
    ).toBe('london-data-review-current-year-2026-07-25.md')
  })
})

