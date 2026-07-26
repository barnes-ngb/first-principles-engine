import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

import type { Artifact } from '../../core/types/common'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import {
  buildComplianceZip,
  buildCompliancePackFiles,
  CompliancePackFileRole,
  computeHoursSummary,
  type CompliancePackInput,
} from './records.logic'
import {
  buildCompliancePackRequest,
  buildPackArtifactPayload,
  describeArchiveResult,
  type CompliancePackArchiveResult,
} from './compliancePackArchive'

// The module reaches for `firebase/functions` at import time; the callable
// itself is not exercised here (that lives in the Cloud Function's own suite).
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => async () => ({ data: {} }),
}))

const START = '2026-07-01'
const END = '2027-06-30'

const tokenUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/fpe.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=abc-123`

const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: 'art-1',
  childId: 'lincoln',
  title: 'Volcano',
  type: EvidenceType.Photo,
  createdAt: '2026-07-04T12:00:00.000Z',
  uri: tokenUrl('families/fam-1/artifacts/art-1/photo.jpg'),
  tags: {
    engineStage: EngineStage.Build,
    domain: 'science',
    subjectBucket: SubjectBucket.Science,
    location: 'Home',
  },
  ...over,
})

const packInput = (over: Partial<CompliancePackInput> = {}): CompliancePackInput => ({
  summary: computeHoursSummary([], [], []),
  dayLogs: [],
  hoursEntries: [],
  evaluations: [],
  artifacts: [artifact()],
  children: [{ id: 'lincoln', name: 'Lincoln' }],
  startDate: START,
  endDate: END,
  childName: 'Lincoln',
  ...over,
})

describe('buildCompliancePackFiles — one renderer, not two', () => {
  it('produces exactly the bytes the existing client pack zips', async () => {
    const input = packInput()
    const files = buildCompliancePackFiles(input)
    const zip = await JSZip.loadAsync(await buildComplianceZip(input))

    // Same set of names, same order, byte-identical contents — so the
    // server-side archive can never drift from the fast pack's records.
    expect(Object.keys(zip.files)).toEqual(files.map((f) => f.name))
    for (const file of files) {
      expect(await zip.files[file.name].async('string'), file.name).toBe(file.content)
    }
  })

  it('tags each file with what it is, so the archive need not parse a filename', () => {
    const files = buildCompliancePackFiles(packInput())
    expect(files.map((f) => f.role)).toEqual([
      CompliancePackFileRole.HoursSummary,
      CompliancePackFileRole.DailyLogs,
      CompliancePackFileRole.Portfolio,
    ])
    expect(files.find((f) => f.role === CompliancePackFileRole.Portfolio)?.name).toBe(
      `lincoln-portfolio-${START}-to-${END}.md`,
    )
  })

  it('omits the portfolio for a range with neither artifacts nor labs, as before', () => {
    const files = buildCompliancePackFiles(packInput({ artifacts: [] }))
    expect(files.map((f) => f.role)).toEqual([
      CompliancePackFileRole.HoursSummary,
      CompliancePackFileRole.DailyLogs,
    ])
  })
})

describe('buildPackArtifactPayload', () => {
  it('sends every media URL an artifact carries', () => {
    const payload = buildPackArtifactPayload([
      artifact(),
      artifact({
        id: 'art-2',
        type: EvidenceType.Audio,
        uri: undefined,
        mediaUrls: [tokenUrl('families/fam-1/artifacts/art-2/a.webm'), tokenUrl('families/fam-1/artifacts/art-2/b.webm')],
      }),
    ])
    expect(payload[0].urls).toHaveLength(1)
    expect(payload[1].urls).toHaveLength(2)
  })

  it('includes a media-less artifact so the manifest can account for it', () => {
    const payload = buildPackArtifactPayload([
      artifact({ id: 'art-3', type: EvidenceType.Note, uri: undefined }),
    ])
    expect(payload).toHaveLength(1)
    expect(payload[0].urls).toEqual([])
  })

  it('marks a whole-family capture as shared rather than as this child’s solo work', () => {
    const payload = buildPackArtifactPayload([
      artifact({ id: 'art-4', childId: 'both' }),
      artifact({ id: 'art-5', childId: 'lincoln' }),
    ])
    expect(payload[0].scope).toBe('family')
    expect(payload[1].scope).toBe('child')
  })
})

describe('buildCompliancePackRequest', () => {
  it('describes the same range the pack does, with the rendered files attached', () => {
    const input = packInput()
    const request = buildCompliancePackRequest({
      familyId: 'fam-1',
      childId: 'lincoln',
      pack: input,
      artifacts: input.artifacts,
    })

    expect(request.familyId).toBe('fam-1')
    expect(request.childId).toBe('lincoln')
    expect(request.startDate).toBe(START)
    expect(request.endDate).toBe(END)
    expect(request.childName).toBe('Lincoln')
    expect(request.files).toEqual(buildCompliancePackFiles(input))
    expect(request.artifacts).toHaveLength(1)
  })
})

describe('describeArchiveResult', () => {
  const result = (over: Partial<CompliancePackArchiveResult> = {}): CompliancePackArchiveResult => ({
    objectPath: 'families/fam-1/compliance-packs/x.zip',
    downloadName: 'lincoln-compliance-archive.zip',
    downloadUrl: 'https://example.com/signed',
    urlKind: 'signed',
    expiresAt: '2026-07-26T03:15:00.000Z',
    bytes: 1024,
    mediaIncluded: 29,
    mediaSkipped: 0,
    hasGaps: false,
    ...over,
  })

  it('says plainly what is in the pack', () => {
    expect(describeArchiveResult(result())).toBe('Full archive ready — 29 files of evidence embedded.')
    expect(describeArchiveResult(result({ mediaIncluded: 1 }))).toContain('1 file of evidence')
  })

  it('never lets a pack with gaps read as complete', () => {
    expect(describeArchiveResult(result({ mediaIncluded: 29, mediaSkipped: 2, hasGaps: true }))).toBe(
      'Full archive ready — 29 files of evidence embedded, 2 flagged in manifest.csv.',
    )
  })
})
