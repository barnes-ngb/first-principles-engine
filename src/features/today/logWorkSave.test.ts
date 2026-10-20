/**
 * `FIX-267` — one logical save, and a retry that cannot save anything twice.
 *
 * What these hold:
 *
 *   • the writes a complete log makes, in order, with the payloads this card
 *     has always written (one artifact for a whole photo batch, `mediaUrls`
 *     plus `uri` as its cover, ONE `hours` row, and none at all without
 *     minutes);
 *   • each of the three failures — the entry, an upload, the hours row —
 *     reported as a `partial` outcome that names the stage and carries what DID
 *     land;
 *   • a retry that **finishes only what is missing**: the same document ids,
 *     the same filenames, no second artifact and no second `hours` row;
 *   • an AMBIGUOUS failure (the write may have committed) retried into the same
 *     document rather than a new one — the reason the ids exist before the
 *     first attempt.
 *
 * Regression sensitivity: against the card's previous save path — `addDoc`,
 * upload, `addDoc`, no memory — every retry test fails by writing a second
 * record, which is the defect this run is about. The complete-save tests pass
 * then and now, which is the point of carrying them.
 *
 * Synthetic services only: Firestore and the uploader are local stubs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NO_LOG_WORK_PROGRESS,
  buildLogWorkArtifact,
  buildLogWorkHoursRow,
  describeLogWorkPartial,
  executeLogWorkSave,
  logWorkComplete,
  logWorkFilenames,
  logWorkPartialBase,
  logWorkRetryReceipt,
  newLogWorkIds,
  type LogWorkProgress,
  type LogWorkSubmission,
} from './logWorkSave'
import { EvidenceType, SubjectBucket } from '../../core/types/enums'

interface WriteCall {
  collectionKey: string
  id: string
  data: Record<string, unknown>
  options: unknown
}

const setDocCalls: WriteCall[] = []
const updateDocCalls: { id: string; data: Record<string, unknown> }[] = []
const uploadCalls: { artifactId: string; filename: string }[] = []

/** Collection keys whose `setDoc` rejects. */
let failingWrites = new Set<string>()
/** Filenames whose upload rejects. */
let failingUploads = new Set<string>()
/** The media-link `updateDoc` rejects. */
let failLink = false

let generated = 0

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((col: { __key: string }, id?: string) => ({
    __key: col.__key,
    id: id ?? `generated-${(generated += 1)}`,
  })),
  setDoc: vi.fn(
    async (
      ref: { __key: string; id: string },
      data: Record<string, unknown>,
      options: unknown,
    ) => {
      setDocCalls.push({ collectionKey: ref.__key, id: ref.id, data, options })
      if (failingWrites.has(ref.__key)) throw new Error(`synthetic ${ref.__key} failure`)
    },
  ),
  updateDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    updateDocCalls.push({ id: ref.id, data })
    if (failLink) throw new Error('synthetic link failure')
  }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  hoursCollection: vi.fn(() => ({ __key: 'hours' })),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: vi.fn((ext: string) => `stamp.${ext}`),
  uploadArtifactFile: vi.fn(
    async (_fam: string, artifactId: string, _file: unknown, filename: string) => {
      uploadCalls.push({ artifactId, filename })
      if (failingUploads.has(filename)) throw new Error(`synthetic upload failure ${filename}`)
      return { downloadUrl: `https://x/${filename}`, storagePath: `p/${filename}` }
    },
  ),
}))

const DAY = '2026-10-20'

function submission(overrides: Partial<LogWorkSubmission> = {}): LogWorkSubmission {
  return {
    familyId: 'fam-1',
    artifactId: 'artifact-1',
    hoursId: 'hours-1',
    childId: 'lincoln',
    childName: 'Lincoln',
    day: DAY,
    weekPlanId: 'week-1',
    subjectBucket: SubjectBucket.PracticalArts,
    activityName: 'Lego build',
    note: 'Built a tower',
    minutes: 45,
    evidenceType: EvidenceType.Note,
    files: [],
    createdAt: '2026-10-20T15:00:00.000Z',
    evidenceWord: 'your note',
    ...overrides,
  }
}

function photoSubmission(count: number): LogWorkSubmission {
  return submission({
    evidenceType: EvidenceType.Photo,
    evidenceWord: `${count} photos`,
    files: Array.from({ length: count }, (_, i) => ({
      file: new File([`p${i}`], `p${i}.jpg`, { type: 'image/jpeg' }),
      filename: `${i}-stamp.jpg`,
    })),
  })
}

const artifactWrites = () => setDocCalls.filter((c) => c.collectionKey === 'artifacts')
const hoursWrites = () => setDocCalls.filter((c) => c.collectionKey === 'hours')

beforeEach(() => {
  setDocCalls.length = 0
  updateDocCalls.length = 0
  uploadCalls.length = 0
  failingWrites = new Set()
  failingUploads = new Set()
  failLink = false
  generated = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('logWorkSave — the identity exists before the first write', () => {
  it('generates an id for each record the log needs, and none for the rest', () => {
    expect(newLogWorkIds('fam-1', { evidence: true, hours: true })).toEqual({
      artifactId: 'generated-1',
      hoursId: 'generated-2',
    })
    expect(newLogWorkIds('fam-1', { evidence: false, hours: true }).artifactId).toBeNull()
    expect(newLogWorkIds('fam-1', { evidence: true, hours: false }).hoursId).toBeNull()
  })

  it('freezes one filename per file, index-prefixed so a batch stays distinct', () => {
    const names = logWorkFilenames([
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new Blob(['c'], { type: 'audio/webm' }),
    ]).map((f) => f.filename)
    expect(names).toEqual(['0-stamp.png', '1-stamp.png', '2-stamp.webm'])
  })
})

describe('logWorkSave — a complete log', () => {
  it('writes the entry then the hours row, with the payloads this card wrote before', async () => {
    const sub = submission()
    const outcome = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)

    expect(outcome.status).toBe('complete')
    expect(setDocCalls.map((c) => c.collectionKey)).toEqual(['artifacts', 'hours'])
    expect(artifactWrites()[0]).toMatchObject({
      id: 'artifact-1',
      data: {
        title: 'Lego build',
        type: EvidenceType.Note,
        childId: 'lincoln',
        dayLogId: DAY,
        weekPlanId: 'week-1',
        content: 'Built a tower',
        activityName: 'Lego build',
        tags: { subjectBucket: SubjectBucket.PracticalArts, domain: '', location: 'Home' },
      },
      // Addressed to a known document, and never destructive.
      options: { merge: true },
    })
    expect(hoursWrites()[0]).toMatchObject({
      id: 'hours-1',
      data: {
        childId: 'lincoln',
        date: DAY,
        minutes: 45,
        subjectBucket: SubjectBucket.PracticalArts,
        source: 'unified-capture',
        quickCapture: true,
        notes: 'Lego build: Built a tower',
      },
    })
  })

  it('writes NO hours row without minutes, and no entry without evidence', async () => {
    await executeLogWorkSave(
      submission({ hoursId: null, minutes: 0 }),
      NO_LOG_WORK_PROGRESS,
    )
    expect(hoursWrites()).toHaveLength(0)

    setDocCalls.length = 0
    await executeLogWorkSave(
      submission({ artifactId: null, evidenceType: null, evidenceWord: null, note: '' }),
      NO_LOG_WORK_PROGRESS,
    )
    expect(artifactWrites()).toHaveLength(0)
    expect(hoursWrites()).toHaveLength(1)
  })

  it('keeps a photo batch as ONE artifact with mediaUrls and uri as the cover', async () => {
    const outcome = await executeLogWorkSave(photoSubmission(3), NO_LOG_WORK_PROGRESS)

    expect(outcome.status).toBe('complete')
    expect(artifactWrites()).toHaveLength(1)
    expect(uploadCalls.map((c) => c.filename)).toEqual([
      '0-stamp.jpg',
      '1-stamp.jpg',
      '2-stamp.jpg',
    ])
    expect(uploadCalls.every((c) => c.artifactId === 'artifact-1')).toBe(true)
    expect(updateDocCalls).toHaveLength(1)
    expect(updateDocCalls[0].data).toEqual({
      uri: 'https://x/0-stamp.jpg',
      mediaUrls: [
        'https://x/0-stamp.jpg',
        'https://x/1-stamp.jpg',
        'https://x/2-stamp.jpg',
      ],
    })
    expect(outcome.artifact).toMatchObject({ id: 'artifact-1', uri: 'https://x/0-stamp.jpg' })
  })

  it('stores a typed note WITH the photo, in the field every reader renders', async () => {
    await executeLogWorkSave(
      { ...photoSubmission(1), note: 'Rome day', evidenceWord: 'your note and 1 photo' },
      NO_LOG_WORK_PROGRESS,
    )
    expect(artifactWrites()[0].data).toMatchObject({
      type: EvidenceType.Photo,
      content: 'Rome day',
    })
  })

  it('stores no empty `content` for a photo logged without a note', async () => {
    await executeLogWorkSave({ ...photoSubmission(1), note: '' }, NO_LOG_WORK_PROGRESS)
    expect(artifactWrites()[0].data).not.toHaveProperty('content')
  })

  it('titles a note, a photo and a recording exactly as before', () => {
    expect(
      buildLogWorkArtifact(submission({ activityName: '', note: 'A long note' })).title,
    ).toBe('A long note')
    expect(
      buildLogWorkArtifact(
        submission({ activityName: '', note: '', evidenceType: EvidenceType.Photo }),
      ).title,
    ).toBe(`Photo ${DAY}`)
    expect(
      buildLogWorkArtifact(
        submission({ activityName: '', note: '', evidenceType: EvidenceType.Audio }),
      ).title,
    ).toBe(`Audio ${DAY}`)
  })

  it('falls back to the activity name for the hours note, and to Capture for neither', () => {
    expect(buildLogWorkHoursRow(submission({ note: '' })).notes).toBe('Lego build')
    expect(buildLogWorkHoursRow(submission({ note: '', activityName: '' })).notes).toBe(
      'Capture',
    )
  })
})

describe('logWorkSave — a partial log says what landed', () => {
  it('stops at the entry and attempts nothing else', async () => {
    failingWrites = new Set(['artifacts'])
    const sub = submission()
    const outcome = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)

    expect(outcome.status).toBe('partial')
    expect(outcome.failedStage).toBe('evidence')
    expect(outcome.progress.artifactWritten).toBe(false)
    expect(hoursWrites()).toHaveLength(0)

    // An unanswered write is not a write that did not happen: the client
    // learned that it threw, not what the server did with it.
    const report = describeLogWorkPartial(sub, outcome)
    expect(report.saved).toBeNull()
    expect(report.unsaved).toBe('Couldn’t confirm your note saved.')
    expect(report.retryLabel).toBe('Try again')
    expect(logWorkPartialBase(report)).not.toMatch(/did not save|nothing saved/i)
  })

  it('keeps the uploads that landed and names how many', async () => {
    failingUploads = new Set(['1-stamp.jpg'])
    const sub = photoSubmission(3)
    const outcome = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)

    expect(outcome.failedStage).toBe('upload')
    expect(outcome.progress.uploadedUrls).toEqual(['https://x/0-stamp.jpg'])
    // The media link never ran, so the record does not claim files it lacks.
    expect(updateDocCalls).toHaveLength(0)
    expect(hoursWrites()).toHaveLength(0)

    const report = describeLogWorkPartial(sub, outcome)
    expect(report.saved).toBe('The entry and 1 of 3 files saved.')
    expect(report.unsaved).toBe('Couldn’t confirm 2 of 3 uploaded.')
    expect(report.retryLabel).toBe('Finish uploading')
  })

  it('names the minutes when only the hours row failed', async () => {
    failingWrites = new Set(['hours'])
    const sub = submission()
    const outcome = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)

    expect(outcome.failedStage).toBe('hours')
    expect(outcome.progress.artifactWritten).toBe(true)
    const report = describeLogWorkPartial(sub, outcome)
    // The entry WAS acknowledged, so that half asserts; the minutes were not.
    expect(report.saved).toBe('Your note saved.')
    expect(report.unsaved).toBe('Couldn’t confirm the 45 minutes saved.')
    expect(report.retryLabel).toBe('Retry 45 min')
    expect(logWorkPartialBase(report)).toBe(
      'Your note saved. Couldn’t confirm the 45 minutes saved.',
    )
  })

  it('publishes the evidence that IS whole when only the hours failed', async () => {
    failingWrites = new Set(['hours'])
    const outcome = await executeLogWorkSave(submission(), NO_LOG_WORK_PROGRESS)
    // The note is on the day whatever the hours row did, so the caller can put
    // it on the day's list instead of leaving it reading "nothing captured".
    expect(outcome.status).toBe('partial')
    expect(outcome.artifact).toMatchObject({ id: 'artifact-1', content: 'Built a tower' })
  })

  it('does NOT publish an entry whose media is not linked yet', async () => {
    failLink = true
    const outcome = await executeLogWorkSave(photoSubmission(1), NO_LOG_WORK_PROGRESS)
    expect(outcome.artifact).toBeNull()
  })

  it('distinguishes a file that never uploaded from a link it cannot confirm', async () => {
    failLink = true
    const sub = photoSubmission(2)
    const outcome = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)

    expect(outcome.failedStage).toBe('upload')
    expect(outcome.progress.uploadedUrls).toHaveLength(2)
    expect(outcome.progress.mediaLinked).toBe(false)
    const report = describeLogWorkPartial(sub, outcome)
    // Every byte is in Storage; what is unknown is the document's link to them.
    expect(report.saved).toBe('The entry and 2 of 2 files saved.')
    expect(report.unsaved).toBe('Couldn’t confirm the entry is linked to them.')
  })
})

describe('logWorkSave — a retry finishes what is left and nothing else', () => {
  it('does not re-create an artifact that already landed', async () => {
    failingWrites = new Set(['hours'])
    const sub = submission()
    const first = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)
    expect(artifactWrites()).toHaveLength(1)

    failingWrites = new Set()
    const second = await executeLogWorkSave(sub, first.progress)

    expect(second.status).toBe('complete')
    // One artifact, one hours row, for the whole episode.
    expect(artifactWrites()).toHaveLength(1)
    expect(hoursWrites()).toHaveLength(2) // the failed attempt and the retry…
    expect(new Set(hoursWrites().map((c) => c.id)).size).toBe(1) // …at ONE id.
    expect(hoursWrites()[1].data).toMatchObject({ minutes: 45 })
  })

  it('uploads only the files that are missing, under their frozen names', async () => {
    failingUploads = new Set(['1-stamp.jpg'])
    const sub = photoSubmission(3)
    const first = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)
    expect(uploadCalls.map((c) => c.filename)).toEqual(['0-stamp.jpg', '1-stamp.jpg'])

    failingUploads = new Set()
    const second = await executeLogWorkSave(sub, first.progress)

    expect(second.status).toBe('complete')
    // The one that landed is not uploaded again; the names are the frozen ones,
    // so a retried upload overwrites its own object rather than orphaning it.
    expect(uploadCalls.map((c) => c.filename)).toEqual([
      '0-stamp.jpg',
      '1-stamp.jpg',
      '1-stamp.jpg',
      '2-stamp.jpg',
    ])
    expect(artifactWrites()).toHaveLength(1)
    expect(updateDocCalls).toHaveLength(1)
    expect(updateDocCalls[0].data).toMatchObject({
      mediaUrls: ['https://x/0-stamp.jpg', 'https://x/1-stamp.jpg', 'https://x/2-stamp.jpg'],
    })
    expect(hoursWrites()).toHaveLength(1)
  })

  it('retries an AMBIGUOUS entry failure into the SAME document', async () => {
    // The write that may or may not have committed: the client cannot tell, so
    // the retry must not depend on the answer.
    failingWrites = new Set(['artifacts'])
    const sub = submission()
    const first = await executeLogWorkSave(sub, NO_LOG_WORK_PROGRESS)

    failingWrites = new Set()
    const second = await executeLogWorkSave(sub, first.progress)

    expect(second.status).toBe('complete')
    expect(artifactWrites()).toHaveLength(2)
    // Two attempts, ONE document — so whichever of them the server kept, the
    // family has exactly one record of this log.
    expect(new Set(artifactWrites().map((c) => c.id))).toEqual(new Set(['artifact-1']))
    expect(artifactWrites()[1].options).toEqual({ merge: true })
    expect(hoursWrites()).toHaveLength(1)
  })

  it('answers whether a submission is finished', () => {
    const sub = photoSubmission(2)
    const half: LogWorkProgress = {
      artifactWritten: true,
      uploadedUrls: ['u1'],
      mediaLinked: false,
      hoursWritten: false,
    }
    expect(logWorkComplete(sub, half)).toBe(false)
    expect(
      logWorkComplete(sub, {
        artifactWritten: true,
        uploadedUrls: ['u1', 'u2'],
        mediaLinked: true,
        hoursWritten: true,
      }),
    ).toBe(true)
  })

  it('names the child and the day a retry finished for', () => {
    expect(logWorkRetryReceipt(submission(), 'Saved your note — 45 min logged')).toBe(
      `Saved your note — 45 min logged — finished for Lincoln on ${DAY}`,
    )
  })
})
