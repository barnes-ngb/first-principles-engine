import { describe, expect, it } from 'vitest'

import { BoundedUploadError, BoundedUploadStop } from '../../core/firebase/upload'
import { redactText } from '../../core/observability'
import { expectKidLine, expectKidWording } from '../../test/kidReadability'
import {
  classifyLabUploadFailure,
  errorCode,
  LAB_UPLOAD_DISMISS_LABEL,
  LAB_UPLOAD_RETRY_LABEL,
  LabUploadAudience,
  LabUploadFailure,
  labUploadFailureLine,
  labUploadFailureNote,
  LabUploadHandler,
  labUploadInFlightLine,
  LabUploadMedium,
} from './labUploadCopy'

const MEDIA = Object.values(LabUploadMedium)
const FAILURES = Object.values(LabUploadFailure)

describe('labUploadCopy — the kid lines meet the shared readability bar', () => {
  it('every kid line, for every medium and every ending', () => {
    for (const medium of MEDIA) {
      expectKidLine(labUploadInFlightLine(LabUploadAudience.Kid, { medium }), `in-flight ${medium}`)
      for (const failure of FAILURES) {
        expectKidLine(
          labUploadFailureLine(LabUploadAudience.Kid, { medium }, failure),
          `${failure} ${medium}`,
        )
      }
    }
    // The buttons a kid sees are labels, not sentences.
    expectKidWording(LAB_UPLOAD_RETRY_LABEL, 'retry button')
    expectKidWording(LAB_UPLOAD_DISMISS_LABEL, 'dismiss button')
  })

  it('a kid hears that it took too long, which is not the same as being told it failed', () => {
    const slow = labUploadFailureLine(LabUploadAudience.Kid, { medium: 'photo' }, LabUploadFailure.Timeout)
    const broke = labUploadFailureLine(LabUploadAudience.Kid, { medium: 'photo' }, LabUploadFailure.Failed)
    expect(slow).toBe('Your picture took too long.')
    expect(broke).toBe('Your picture did not send.')
  })
})

describe('labUploadCopy — the parent lines name what, and say nothing was saved', () => {
  it('names the boy for a per-child capture and the beat for a beat capture', () => {
    expect(labUploadInFlightLine(LabUploadAudience.Parent, { medium: 'photo', owner: 'Lincoln' })).toBe(
      "Uploading Lincoln's photo…",
    )
    expect(
      labUploadFailureLine(
        LabUploadAudience.Parent,
        { medium: 'recording', beat: 'What we saw' },
        LabUploadFailure.Failed,
      ),
    ).toBe("The recording for What we saw didn't upload. Nothing was saved.")
  })

  it('a timeout says a slow connection, not "failed"', () => {
    const line = labUploadFailureLine(
      LabUploadAudience.Parent,
      { medium: 'photo', owner: 'London' },
      LabUploadFailure.Timeout,
    )
    expect(line).toMatch(/ran out of time on a slow connection/)
    expect(line).not.toMatch(/fail/i)
    expect(line).toMatch(/Nothing was saved/)
  })

  it('every parent ending says nothing was saved — file-before-record makes that true', () => {
    for (const failure of FAILURES) {
      expect(
        labUploadFailureLine(LabUploadAudience.Parent, { medium: 'photo' }, failure),
      ).toMatch(/Nothing was saved\./)
    }
  })
})

describe('classifyLabUploadFailure', () => {
  it('reads the bounded upload’s own stops', () => {
    expect(classifyLabUploadFailure(new BoundedUploadError(BoundedUploadStop.Deadline))).toBe(
      LabUploadFailure.Timeout,
    )
    expect(classifyLabUploadFailure(new BoundedUploadError(BoundedUploadStop.Cancelled))).toBe(
      LabUploadFailure.Cancelled,
    )
    expect(classifyLabUploadFailure({ code: 'storage/canceled' })).toBe(LabUploadFailure.Cancelled)
  })

  it('anything else is a failure, never a crash', () => {
    expect(classifyLabUploadFailure({ code: 'storage/unauthorized' })).toBe(LabUploadFailure.Failed)
    expect(classifyLabUploadFailure(new Error('boom'))).toBe(LabUploadFailure.Failed)
    expect(classifyLabUploadFailure(undefined)).toBe(LabUploadFailure.Failed)
    expect(classifyLabUploadFailure('a string')).toBe(LabUploadFailure.Failed)
  })
})

describe('labUploadFailureNote — the sink gets the shape, never the content', () => {
  it('keeps only code-shaped codes', () => {
    expect(errorCode({ code: 'storage/retry-limit-exceeded' })).toBe('storage/retry-limit-exceeded')
    expect(errorCode({ code: "Lincoln's lab broke" })).toBe('unknown')
    expect(errorCode(new Error('Lincoln'))).toBe('unknown')
  })

  it('survives redactText unchanged, across sizes up to and past a megabyte', () => {
    for (const sizeBytes of [0, 999, 1000, 250_000, 1_023_999, 2_400_000, 26_000_000]) {
      for (const elapsedMs of [0, 1_500, 120_000, 5_000_000]) {
        const note = labUploadFailureNote({
          handler: LabUploadHandler.ParentBeat,
          failure: LabUploadFailure.Timeout,
          type: 'image/jpeg',
          sizeBytes,
          elapsedMs,
          code: 'upload/deadline',
        })
        expect(redactText(note), note).toBe(note)
      }
    }
  })

  it('carries no name, title or file name: a strange type is replaced, not echoed', () => {
    const note = labUploadFailureNote({
      handler: LabUploadHandler.KidPhoto,
      failure: LabUploadFailure.Failed,
      type: 'Lincoln volcano.jpg',
      sizeBytes: 10,
      elapsedMs: 10,
      code: 'unknown',
    })
    expect(note).toBe('dad-lab upload failed handler=kid-photo type=unknown size=10B elapsed=0s code=unknown')
  })
})
