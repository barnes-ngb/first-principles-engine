import { describe, expect, it } from 'vitest'

import {
  UNSAVED_BOOK_WARNING,
  departureIsSafe,
  departureNotice,
  departureStage,
  shouldGuardDeparture,
} from '../unsavedBookDeparture'

/**
 * UX-473 — the rules the guard turns on, stated where they can be read.
 *
 * These are predicates only. That they are WIRED to the latest authoritative
 * dirty answer, and that a same-tick mutate-then-navigate is actually held, is
 * asserted against the real hook and a real router in
 * `booksSaveDeparture.sameTick.test.tsx` — an earlier draft of this suite
 * proved the predicate and missed the bug.
 */
describe('unsavedBookDeparture', () => {
  it('holds a departure for EVERY outstanding edit, whatever the last report said', () => {
    // The owner-approved contract (2026-10-31), after Chrome lost a draft on
    // both a pre-debounce exit and an exit during an in-flight retry.
    expect(shouldGuardDeparture({ saveState: 'idle', hasUnsavedEdits: true })).toBe(true)
    expect(shouldGuardDeparture({ saveState: 'saving', hasUnsavedEdits: true })).toBe(true)
    expect(shouldGuardDeparture({ saveState: 'saved', hasUnsavedEdits: true })).toBe(true)
    expect(shouldGuardDeparture({ saveState: 'error', hasUnsavedEdits: true })).toBe(true)
  })

  it('holds nothing once the latest edit is acknowledged', () => {
    for (const saveState of ['idle', 'saving', 'saved', 'error'] as const) {
      // Including 'error': an upload failure with no outstanding document edit
      // has nothing for a departure to protect.
      expect(shouldGuardDeparture({ saveState, hasUnsavedEdits: false })).toBe(false)
    }
  })

  it('releases a held departure on ACKNOWLEDGMENT, not on the error clearing', () => {
    // A retry sets 'saving' at once. Releasing then would unmount the editor in
    // the middle of the write the kid asked for, with no page left to report a
    // second failure — which is the loss Chrome reproduced.
    expect(departureIsSafe({ saveState: 'saving', hasUnsavedEdits: true })).toBe(false)
    expect(departureIsSafe({ saveState: 'error', hasUnsavedEdits: true })).toBe(false)
    expect(departureIsSafe({ saveState: 'saved', hasUnsavedEdits: false })).toBe(true)
  })

  it('calls a held pending write a wait, and only a failure a failure', () => {
    expect(departureStage({ saveState: 'idle', hasUnsavedEdits: true })).toBe('saving')
    expect(departureStage({ saveState: 'saving', hasUnsavedEdits: true })).toBe('saving')
    expect(departureStage({ saveState: 'saved', hasUnsavedEdits: true })).toBe('saving')
    expect(departureStage({ saveState: 'error', hasUnsavedEdits: true })).toBe('failed')
  })

  it('says nothing about failure or retrying while the write is simply still going', () => {
    for (const saveState of ['idle', 'saving', 'saved'] as const) {
      const notice = departureNotice({ saveState, hasUnsavedEdits: true })
      expect(notice.stage).toBe('saving')
      expect(notice.retryable).toBe(false)
      expect(notice.title).toMatch(/Saving/)
      expect(`${notice.title} ${notice.detail}`).not.toMatch(/fail|error|wrong|try again/i)
    }
    // Only the in-flight one is busy; a pre-debounce edit has no write to wait
    // on yet, so leaving is not withheld from it.
    expect(departureNotice({ saveState: 'saving', hasUnsavedEdits: true }).busy).toBe(true)
    expect(departureNotice({ saveState: 'idle', hasUnsavedEdits: true }).busy).toBe(false)
  })

  it('shows the actual error and offers the retry when a write HAS failed', () => {
    const notice = departureNotice(
      { saveState: 'error', hasUnsavedEdits: true },
      'Save failed: permission-denied',
    )
    expect(notice.stage).toBe('failed')
    expect(notice.retryable).toBe(true)
    expect(notice.busy).toBe(false)
    expect(notice.detail).toBe('Save failed: permission-denied')
    expect(notice.reassurance).toMatch(/still here/)
  })

  it('falls back to a plain reason rather than an empty one', () => {
    expect(departureNotice({ saveState: 'error', hasUnsavedEdits: true }, null).detail).toBe(
      'Save failed',
    )
  })

  it('never promises that leaving erases or cancels a write', () => {
    // It used to read "they are gone", and that was a promise this code cannot
    // keep: a dispatched write may still land after the editor is gone.
    for (const saveState of ['idle', 'saving', 'error'] as const) {
      const { reassurance } = departureNotice({ saveState, hasUnsavedEdits: true })
      expect(reassurance).toMatch(/may not be saved/)
      expect(reassurance).toMatch(/cannot promise/)
      expect(reassurance).not.toMatch(/\bare gone\b|\bwill be lost\b|\berase/i)
    }
  })

  it('promises nothing about surviving a browser close', () => {
    expect(UNSAVED_BOOK_WARNING).toMatch(/hasn't finished saving/)
    expect(UNSAVED_BOOK_WARNING).not.toMatch(/saved\b|safe|kept/i)
  })
})
