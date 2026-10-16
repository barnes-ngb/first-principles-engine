import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PAGE_CHECK_TASK, useProspectivePageCheck } from './useProspectivePageCheck'
import { ScanFailureKind } from './scanAnalysis'

/**
 * The one call, and the fact that it is the ONLY thing that happens.
 *
 * Firestore and Storage are mocked here as THROWING modules: if any code on
 * this path ever reaches them — directly or through an import added later — the
 * call fails loudly instead of quietly writing a record. The structural proof
 * lives in `beforeWorkPageCheckHost.test.ts`; this is the behavioural one.
 */

// Both of these are manual mocks rather than `importActual` spreads on purpose:
// the real modules bootstrap Firebase, and loading them would trip the
// deliberately-throwing Firestore mock below for a reason that has nothing to
// do with this path's own behaviour.
const chat = vi.fn()
vi.mock('../ai/useAI', () => ({
  TaskType: { Scan: 'scan', PageCheck: 'pageCheck' },
  useAI: () => ({ chat }),
}))

// jsdom has no canvas decode; the format resolution is tested in its own suite.
vi.mock('../utils/compressImage', () => ({
  compressIfNeeded: vi.fn(async (file: File) => file),
  compressImage: vi.fn(async (file: File) => file),
}))

const reportError = vi.fn()
vi.mock('../observability', () => ({
  ErrorSource: { Handled: 'handled' },
  reportError: (...args: unknown[]) => reportError(...args),
}))

vi.mock('firebase/firestore', () => {
  throw new Error('the before-work page check must not reach Firestore')
})
vi.mock('firebase/storage', () => {
  throw new Error('the before-work page check must not reach Storage')
})

const file = () => new File(['bytes'], 'page.jpg', { type: 'image/jpeg' })
const request = { familyId: 'fam', childId: 'lincoln' }

/** A page several steps ahead of the child — a real answer, not a failure. */
const FAR_AHEAD = JSON.stringify({
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: 'long division with remainders',
  skillsTargeted: [],
  estimatedDifficulty: 'too-hard',
  recommendation: 'do',
  recommendationReason: 'Several steps past the addition he is working on.',
  estimatedMinutes: 25,
  teacherNotes: 'Do the first one together, or save it for later in the year.',
})

function runner() {
  const { result } = renderHook(() => useProspectivePageCheck())
  return result.current
}

beforeEach(() => {
  chat.mockReset()
  reportError.mockReset()
})

describe('useProspectivePageCheck', () => {
  it('asks for the DISTINCT pageCheck task, and sends no intent flag', async () => {
    chat.mockResolvedValue({ message: FAR_AHEAD })
    const outcome = await runner().check(file(), request)

    expect(outcome.results?.pageType).toBe('worksheet')
    expect(PAGE_CHECK_TASK).toBe('pageCheck')
    expect(chat.mock.calls[0][0]).toMatchObject({
      familyId: 'fam',
      childId: 'lincoln',
      taskType: 'pageCheck',
    })
    const payload = JSON.parse(chat.mock.calls[0][0].messages[0].content)
    expect(payload.imageBase64).toBeTruthy()
    // No purpose field: nothing on the server reads one, and sending one would
    // imply a fallback that deliberately does not exist.
    expect(payload.checkPurpose).toBeUndefined()
    expect(chat.mock.calls[0][0].taskType).not.toBe('scan')
  })

  it.each([
    'taskType must be one of: plan, chat, generate, evaluate, scan',
    'invalid-argument: taskType must be one of: plan, scan',
  ])('reports an old service that refuses the task as UNSUPPORTED (%s)', async (message) => {
    // Release skew: hosting deploys before functions, so the previous
    // dispatcher rejects this task by name — before its rate-limit check, its
    // workbook backfill and any handler, so nothing at all was written (and the
    // rate-limit check writes nothing in any case: it counts `aiUsage` rows).
    //
    // What this case pins is the CLASSIFICATION, against a client that throws.
    // The real `useAI.chat` catches a callable rejection and returns `null`, so
    // the production path for this refusal is the generic send failure asserted
    // below in "reports a null/undefined response as a send failure, exactly
    // once, carrying the shape only" — which is also where that path's
    // diagnostic row is pinned; `unsupported` is not
    // established as reachable through the shipped client.
    chat.mockRejectedValue(new Error(message))
    const outcome = await runner().check(file(), request)
    expect(outcome).toEqual({ results: null, sendFailed: true, unsupported: true })
  })

  it('but an ordinary failure is NOT labelled a version skew', async () => {
    chat.mockRejectedValue(new Error('internal: the AI took too long to respond'))
    const outcome = await runner().check(file(), request)
    expect(outcome).toEqual({ results: null, sendFailed: true })
  })

  it('passes the row context when it has one, and omits it entirely when it does not', async () => {
    chat.mockResolvedValue({ message: FAR_AHEAD })
    await runner().check(file(), {
      ...request,
      captureContext: { itemLabel: 'GATB Math', subjectBucket: 'Math' },
    })
    expect(JSON.parse(chat.mock.calls[0][0].messages[0].content).captureContext).toEqual({
      itemLabel: 'GATB Math',
      subjectBucket: 'Math',
    })

    chat.mockClear()
    await runner().check(file(), request)
    expect(JSON.parse(chat.mock.calls[0][0].messages[0].content).captureContext).toBeUndefined()
  })

  it.each([
    ['a blank page the model could not place', JSON.stringify({ pageType: 'other', subject: '', specificTopic: '', skillsTargeted: [], estimatedDifficulty: 'easy', recommendation: 'do', recommendationReason: 'Blank sheet.', estimatedMinutes: 0, teacherNotes: '' })],
    ['a page far ahead', FAR_AHEAD],
  ])('returns the analysis for %s and reports nothing', async (_label, message) => {
    chat.mockResolvedValue({ message })
    const outcome = await runner().check(file(), request)
    expect(outcome.results).not.toBeNull()
    expect(outcome.sendFailed).toBeUndefined()
    expect(reportError).not.toHaveBeenCalled()
  })

  it.each([
    ['an unreadable reply', { message: 'I had a look and...' }, ScanFailureKind.Unreadable],
    ['a truncated reply', { message: '{"pageType": "works', stopReason: 'max_tokens' }, ScanFailureKind.CutShort],
    ['a refusal', { message: 'I will not analyse this.', stopReason: 'refusal' }, ScanFailureKind.Refused],
    ['the handler’s own error envelope', { message: '{"error":"imageBase64 is required"}' }, ScanFailureKind.NotDelivered],
  ])('reports %s as a named failure with no analysis', async (_label, response, kind) => {
    chat.mockResolvedValue(response)
    const outcome = await runner().check(file(), request)
    expect(outcome.results).toBeNull()
    expect(outcome.kind).toBe(kind)
    expect(outcome.sendFailed).toBeUndefined()
    // Logged with the app's own words and the picture's SHAPE — never the
    // model's text and never the photo.
    const logged = reportError.mock.calls[0][0] as { name: string; message: string }
    expect(logged.name).toContain('PageCheck')
    expect(logged.message).toContain('door=scan-page-check')
    expect(logged.message).not.toContain('page.jpg')
  })

  it('a thrown failure is a send failure, not an answer, and never rejects', async () => {
    chat.mockRejectedValue(new Error('network down'))
    const outcome = await runner().check(file(), request)
    expect(outcome).toEqual({ results: null, sendFailed: true })
  })

  // The branch the SHIPPED client actually takes when a call is refused:
  // `useAI.chat` catches the callable's rejection and resolves with nothing. It
  // returned silently before deployment review caught it, so the door's most
  // common real failure left no diagnostic row at all.
  it.each([
    ['a null response', null],
    ['an undefined response', undefined],
  ])('reports %s as a send failure, exactly once, carrying the shape only', async (_label, response) => {
    chat.mockResolvedValue(response)
    const outcome = await runner().check(file(), {
      ...request,
      // Supplied so the row can be checked for it: the parent's own row context
      // must not travel into the log just because it was available here.
      captureContext: { itemLabel: 'GATB Math', subjectBucket: 'Math' },
    })

    // What the caller reads is unchanged — a generic send failure, no kind, no
    // version-skew claim (the reason was swallowed before it got here).
    expect(outcome).toEqual({ results: null, sendFailed: true })

    // One row: not zero (the bug) and not two (no double-report with the
    // reply-failure path, which this return skips).
    expect(reportError).toHaveBeenCalledTimes(1)
    const logged = reportError.mock.calls[0][0] as {
      name: string
      message: string
      section: string
      stack: string | null
    }
    // The app's own constant words, and the picture's SHAPE.
    expect(logged.name).toBe('PageCheck:no-response')
    expect(logged.section).toBe('scan-page-check')
    expect(logged.stack).toBeNull()
    expect(logged.message).toContain('door=scan-page-check')
    expect(logged.message).toContain('in=image/jpeg')
    expect(logged.message).toContain('call returned no reply')
    // And nothing else: no bytes, no file name, no row context, no ids.
    const serialized = JSON.stringify(logged)
    for (const mustNotLeak of ['page.jpg', 'Ynl0ZXM', 'GATB', 'Math', 'lincoln', 'fam']) {
      expect(serialized).not.toContain(mustNotLeak)
    }
  })
})
