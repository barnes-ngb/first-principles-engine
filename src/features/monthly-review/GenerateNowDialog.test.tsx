import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child, MonthlyReview } from '../../core/types'
import { WAIT_GRACE_MS } from './monthlyDraftWatch'

// ── Mocks at the boundaries ────────────────────────────────────────────────
const { httpsCallableMock, callableMock, useMonthlyReviewMock } = vi.hoisted(
  () => ({
    httpsCallableMock: vi.fn(),
    callableMock: vi.fn(),
    useMonthlyReviewMock: vi.fn(),
  }),
)

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args: unknown[]) => {
    httpsCallableMock(...args)
    return callableMock
  },
}))

vi.mock('../../core/firebase/firebase', () => ({ app: {} }))
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/hooks/useMonthlyReviews', () => ({
  useMonthlyReview: (...args: unknown[]) => useMonthlyReviewMock(...args),
}))

// Imported after the mocks so module-scope `httpsCallable` is captured.
const { GenerateNowDialog } = await import('./GenerateNowDialog')

/** What the doc subscription is currently reporting. */
let watched: {
  review: MonthlyReview | null
  loading: boolean
  error: Error | null
} = { review: null, loading: false, error: null }

/** Doc ids the dialog subscribed to, in order (`undefined` = not watching). */
let subscribedTo: (string | undefined)[] = []

const CHILDREN = [{ id: 'lincoln', name: 'Lincoln' }] as Child[]

/**
 * The dialog defaults to last month (`months[1]`), so derive the expectation
 * from the clock rather than pinning a date the suite would outlive.
 */
const LAST_MONTH = (() => {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()
const EXPECTED_REVIEW_ID = `lincoln_${LAST_MONTH}`

function deadlineError() {
  return Object.assign(new Error('deadline-exceeded'), {
    code: 'functions/deadline-exceeded',
  })
}

function reviewDoc(generatedAt: string): MonthlyReview {
  return { id: EXPECTED_REVIEW_ID, generatedAt } as MonthlyReview
}

function renderDialog(onGenerated = vi.fn()) {
  const utils = render(
    <GenerateNowDialog
      open
      onClose={vi.fn()}
      childOptions={CHILDREN}
      defaultChildId="lincoln"
      onGenerated={onGenerated}
    />,
  )
  return {
    ...utils,
    onGenerated,
    rerender: () =>
      utils.rerender(
        <GenerateNowDialog
          open
          onClose={vi.fn()}
          childOptions={CHILDREN}
          defaultChildId="lincoln"
          onGenerated={onGenerated}
        />,
      ),
  }
}

/** Last month is already selected by default — just tap Generate. */
async function tapGenerate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Generate$/i }))
}

beforeEach(() => {
  callableMock.mockReset()
  useMonthlyReviewMock.mockReset()
  watched = { review: null, loading: false, error: null }
  subscribedTo = []
  useMonthlyReviewMock.mockImplementation((_familyId, reviewId) => {
    subscribedTo.push(reviewId as string | undefined)
    return watched
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GenerateNowDialog — the client waits as long as the server does', () => {
  it('gives the callable the server’s full 540s budget', () => {
    // The SDK default is 70s; the function is configured `timeoutSeconds: 540`.
    expect(httpsCallableMock).toHaveBeenCalledWith(
      expect.anything(),
      'generateMonthlyReviewNow',
      { timeout: 540_000 },
    )
  })

  it('does not promise 30 seconds', () => {
    renderDialog()
    expect(screen.queryByText(/about 30 seconds/i)).not.toBeInTheDocument()
    expect(screen.getByText(/take a few minutes/i)).toBeInTheDocument()
  })

  it('a client-side deadline is waiting, not failing — and a later doc resolves it', async () => {
    const user = userEvent.setup()
    callableMock.mockRejectedValue(deadlineError())
    const { rerender, onGenerated } = renderDialog()

    await tapGenerate(user)

    // Waiting: honest interim copy, nothing red, and no premature success.
    await waitFor(() => {
      expect(screen.getByText(/Still working — the book will open/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onGenerated).not.toHaveBeenCalled()
    expect(subscribedTo).toContain(EXPECTED_REVIEW_ID)

    // The server finishes and writes the doc we were watching.
    watched = {
      review: reviewDoc('2026-08-13T18:03:00.000Z'),
      loading: false,
      error: null,
    }
    rerender()

    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalledWith(EXPECTED_REVIEW_ID)
    })
  })

  it('still renders a genuine function error in red', async () => {
    const user = userEvent.setup()
    callableMock.mockRejectedValue(
      Object.assign(new Error('Something broke server-side'), {
        code: 'functions/internal',
      }),
    )
    const { onGenerated } = renderDialog()

    await tapGenerate(user)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Something broke server-side/i,
      )
    })
    expect(screen.queryByText(/Still working — the book will open/i)).not.toBeInTheDocument()
    expect(onGenerated).not.toHaveBeenCalled()
    // Nothing to watch — a real error is a real error.
    expect(subscribedTo.every((id) => id === undefined)).toBe(true)
  })

  it('never resolves onto a pre-existing draft that did not change', async () => {
    // Codex P2: the readiness rule used to accept an unchanged doc whose
    // `generatedAt` looked later than the tap. Device clocks and server clocks
    // are not the same clock — a phone running slow would open the STALE book
    // while the regenerate it just asked for was still running.
    const user = userEvent.setup()
    callableMock.mockRejectedValue(deadlineError())
    // A draft already exists, stamped far in the future relative to the tap.
    watched = {
      review: reviewDoc('2099-01-01T00:00:00.000Z'),
      loading: false,
      error: null,
    }
    const { rerender, onGenerated } = renderDialog()

    await tapGenerate(user)

    await waitFor(() => {
      expect(
        screen.getByText(/Still working — the book will open/i),
      ).toBeInTheDocument()
    })
    rerender() // another snapshot of the same unchanged doc
    expect(onGenerated).not.toHaveBeenCalled()

    // Only an actual rewrite counts.
    watched = {
      review: reviewDoc('2099-01-02T00:00:00.000Z'),
      loading: false,
      error: null,
    }
    rerender()
    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalledWith(EXPECTED_REVIEW_ID)
    })
  })

  it('stops waiting instead of hanging, and does not call it a failure', async () => {
    // Codex P2: the client's 540s and the function's own `timeoutSeconds: 540`
    // are the same budget, so `deadline-exceeded` can mean the server was
    // killed — no doc write, no subscription error, nothing to end the wait.
    // Only `setTimeout` is faked, and the tap goes through `fireEvent` rather
    // than `userEvent`, so nothing but the grace timer depends on our clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    callableMock.mockRejectedValue(deadlineError())
    const { onGenerated } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }))
    // Flush the rejection directly — RTL's `waitFor` polls on timers we own here.
    await act(async () => {})
    expect(
      screen.getByText(/Still working — the book will open/i),
    ).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(WAIT_GRACE_MS + 1)
    })

    const notice = screen.getByRole('alert')
    expect(notice).toHaveTextContent(/We stopped waiting/i)
    // Not red — we stopped watching, we did not observe a failure.
    expect(notice.className).toMatch(/Warning/i)
    expect(notice.className).not.toMatch(/Error/i)
    expect(onGenerated).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/Still working — the book will open/i),
    ).not.toBeInTheDocument()
    // And the parent can retry.
    expect(screen.getByRole('button', { name: /Try again/i })).toBeEnabled()
  })

  it('opens the book normally when the call returns in time', async () => {
    const user = userEvent.setup()
    callableMock.mockResolvedValue({ data: { reviewId: EXPECTED_REVIEW_ID } })
    const { onGenerated } = renderDialog()

    await tapGenerate(user)

    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalledWith(EXPECTED_REVIEW_ID)
    })
  })
})
