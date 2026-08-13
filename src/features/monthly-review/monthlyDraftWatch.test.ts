import { describe, expect, it } from 'vitest'

import {
  isDeadlineExceeded,
  isDraftReady,
  monthlyReviewDocId,
} from './monthlyDraftWatch'

const TAP = '2026-08-13T18:00:00.000Z'

describe('monthlyReviewDocId', () => {
  it('matches the id the server writes', () => {
    expect(monthlyReviewDocId('lincoln', '2026-07')).toBe('lincoln_2026-07')
  })
})

describe('isDraftReady', () => {
  it('is not ready while no doc exists', () => {
    expect(isDraftReady({ baseline: null, current: null, tappedAt: TAP })).toBe(
      false,
    )
  })

  it('is ready when the doc appears while we watch', () => {
    expect(
      isDraftReady({
        baseline: null,
        current: '2026-08-13T18:02:00.000Z',
        tappedAt: TAP,
      }),
    ).toBe(true)
  })

  it('is ready when an existing doc is rewritten while we watch', () => {
    expect(
      isDraftReady({
        baseline: '2026-07-02T09:00:00.000Z',
        current: '2026-08-13T18:02:00.000Z',
        tappedAt: TAP,
      }),
    ).toBe(true)
  })

  it('does not resolve onto an older book that never changed', () => {
    expect(
      isDraftReady({
        baseline: '2026-07-02T09:00:00.000Z',
        current: '2026-07-02T09:00:00.000Z',
        tappedAt: TAP,
      }),
    ).toBe(false)
  })

  it('is ready when the first snapshot is already at/after the tap', () => {
    // The server finished just as the client aborted, so there was no change
    // for us to observe — the timestamp is the only evidence.
    const at = '2026-08-13T18:00:00.000Z'
    expect(isDraftReady({ baseline: at, current: at, tappedAt: TAP })).toBe(true)
  })

  it('treats an unparseable generatedAt on an unchanged doc as not ready', () => {
    expect(
      isDraftReady({ baseline: 'whenever', current: 'whenever', tappedAt: TAP }),
    ).toBe(false)
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
