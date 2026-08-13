import { describe, expect, it } from 'vitest'

import {
  fingerprintDraft,
  isDeadlineExceeded,
  isDraftReady,
  monthlyReviewDocId,
  WAIT_GRACE_MS,
} from './monthlyDraftWatch'

describe('monthlyReviewDocId', () => {
  it('matches the id the server writes', () => {
    expect(monthlyReviewDocId('lincoln', '2026-07')).toBe('lincoln_2026-07')
  })
})

describe('fingerprintDraft', () => {
  it('reads a missing doc as absent', () => {
    expect(fingerprintDraft(null)).toBeNull()
    expect(fingerprintDraft(undefined)).toBeNull()
  })

  it('distinguishes a doc with no generatedAt from no doc at all', () => {
    // Otherwise the first snapshot of an undated existing draft would read as
    // "it appeared!" and open the pre-existing book immediately.
    expect(fingerprintDraft({})).not.toBeNull()
  })

  it('carries generatedAt as the version marker', () => {
    expect(fingerprintDraft({ generatedAt: 'A' })).toBe('A')
  })
})

describe('isDraftReady', () => {
  it('is not ready while no doc exists', () => {
    expect(isDraftReady({ baseline: null, current: null })).toBe(false)
  })

  it('is ready when the doc appears while we watch', () => {
    expect(isDraftReady({ baseline: null, current: 'A' })).toBe(true)
  })

  it('is ready when an existing doc is rewritten while we watch', () => {
    expect(isDraftReady({ baseline: 'old', current: 'new' })).toBe(true)
  })

  it('never resolves onto an unchanged doc', () => {
    // Regression: readiness used to also accept an unchanged doc whose
    // `generatedAt` looked later than the tap. The tap is on the phone's clock
    // and `generatedAt` is on the server's, so a device running slow would find
    // an EXISTING draft "newer than" the tap and open the stale book while the
    // real generation was still running. No clock is consulted any more.
    expect(isDraftReady({ baseline: 'A', current: 'A' })).toBe(false)
    // Including the far-future timestamp that used to be enough on its own.
    expect(
      isDraftReady({
        baseline: '2099-01-01T00:00:00.000Z',
        current: '2099-01-01T00:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('does not resolve on an unchanged undated doc', () => {
    const undated = fingerprintDraft({})
    expect(isDraftReady({ baseline: undated, current: undated })).toBe(false)
  })
})

describe('WAIT_GRACE_MS', () => {
  it('bounds the wait — the server shares the same 540s budget', () => {
    // A `deadline-exceeded` can mean the function was killed at its own wall,
    // which produces no doc write and no subscription error. Something has to
    // end the wait.
    expect(WAIT_GRACE_MS).toBeGreaterThan(0)
    expect(Number.isFinite(WAIT_GRACE_MS)).toBe(true)
  })
})

describe('isDeadlineExceeded', () => {
  it('recognises the Firebase callable code', () => {
    expect(isDeadlineExceeded({ code: 'functions/deadline-exceeded' })).toBe(
      true,
    )
  })

  it('recognises the bare code', () => {
    expect(isDeadlineExceeded({ code: 'deadline-exceeded' })).toBe(true)
  })

  it('does not swallow a real function failure', () => {
    expect(isDeadlineExceeded({ code: 'functions/internal' })).toBe(false)
    expect(isDeadlineExceeded({ code: 'failed-precondition' })).toBe(false)
    expect(isDeadlineExceeded(new Error('boom'))).toBe(false)
    expect(isDeadlineExceeded(null)).toBe(false)
    expect(isDeadlineExceeded(undefined)).toBe(false)
  })
})
