import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallback, useState } from 'react'

import BeforeWorkPageCheckCard from './BeforeWorkPageCheckCard'
import BeforeWorkPageCheckDialog from './BeforeWorkPageCheckDialog'
import { useBeforeWorkPageCheck } from './useBeforeWorkPageCheck'
import type { ProspectivePageCheckOutcome } from '../../core/hooks/useProspectivePageCheck'
import type { WorksheetScanResult } from '../../core/types'

/**
 * The check as a parent drives it — the real card, the real sheet, the real
 * controller and the real file inputs, composed exactly as `TodayPage` composes
 * them (entry → sheet keyed to the live SCOPE → picker session retired on
 * open/close/cancel/retry → `start` with the session the picker was opened
 * under).
 *
 * These are the behavioural regressions for the three things independent host
 * testing found, none of which a static read of the source could see:
 *
 *  - switch child while the native picker is open, then choose a file;
 *  - the same with an A-B-A switch, where comparing scopes passes;
 *  - **close the sheet** while the picker is open and then choose a file — the
 *    input survives the MUI exit transition, and the first version let that
 *    file through.
 *
 * What it does NOT cover, stated plainly: this renders the composition, not
 * `TodayPage` itself. That the page composes these three this way is pinned by
 * `beforeWorkPageCheckWiring.source.test.ts`.
 *
 * The runner is mocked at the module boundary, so nothing here reaches the AI
 * callable, Firestore or Storage.
 */

// Referenced only when the mocked hook is CALLED (during render), so the
// factory does not touch it before this module's body has run.
const runCheck = vi.fn()
vi.mock('../../core/hooks/useProspectivePageCheck', () => ({
  useProspectivePageCheck: () => ({ check: runCheck }),
}))

const results = (over: Partial<WorksheetScanResult> = {}): WorksheetScanResult => ({
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: 'adding tens',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: 'Sits beside the work he is on.',
  estimatedMinutes: 15,
  teacherNotes: 'Six problems at a time.',
  ...over,
})

/**
 * The same composition `TodayPage` renders: the sheet's open state is the SCOPE
 * it was opened under (so a retry cannot close it), and opening retires the
 * previous picker session.
 */
function PageCheckSurface({
  familyId = 'fam',
  childId,
  childName,
  dateKey = '2026-10-16',
  canCheck = true,
}: {
  familyId?: string
  childId: string
  childName: string
  dateKey?: string
  canCheck?: boolean
}) {
  const pageCheck = useBeforeWorkPageCheck({ familyId, childId, dateKey, canCheck })
  const [openScope, setOpenScope] = useState<string | null>(null)
  const open = openScope === pageCheck.scopeToken

  const onPick = useCallback(
    (file: File, token: string) => {
      void pageCheck.start(file, undefined, token)
    },
    [pageCheck],
  )

  return (
    <>
      <BeforeWorkPageCheckCard
        childName={childName}
        canCheck={canCheck}
        onOpen={() => {
          pageCheck.beginPickerSession()
          setOpenScope(pageCheck.scopeToken)
        }}
      />
      <BeforeWorkPageCheckDialog
        open={open}
        childName={childName}
        status={pageCheck.status}
        summary={pageCheck.summary}
        photoPreviewUrl={pageCheck.photoPreviewUrl}
        itemLabel={pageCheck.itemLabel}
        cancelled={pageCheck.cancelled}
        selectionToken={pageCheck.selectionToken}
        onPick={onPick}
        onCancel={pageCheck.cancel}
        onRetry={pageCheck.close}
        onClose={() => {
          setOpenScope(null)
          pageCheck.close()
        }}
      />
    </>
  )
}

const aFile = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })
const uploadInput = () => screen.getByLabelText('Upload a photo of the page') as HTMLInputElement

/** Tap the entry — MUI hides the background while a modal is open, so wait. */
async function openSheetFor(name: RegExp) {
  const entry = await screen.findByRole('button', { name })
  fireEvent.click(entry)
  await screen.findByRole('dialog')
}

/** Tap Upload — which is what opens the native picker on a phone. */
function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /upload a photo/i }))
  return uploadInput()
}

/** Deliver a file the way a native picker does: a change on the input. */
async function deliver(input: HTMLInputElement) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [aFile()] } })
  })
}

const sheetClosed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

beforeEach(() => {
  runCheck.mockReset()
  runCheck.mockResolvedValue({ results: results() })
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview') as unknown as typeof URL.createObjectURL
  globalThis.URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
})

describe('a parent checks a page', () => {
  it('reaches the check with no plan at all, and gets an answer', async () => {
    // No day log, no checklist, no workbook row, no skip guidance: the entry is
    // the day's own card and depends on none of them.
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)

    await deliver(openPicker())

    await waitFor(() => expect(screen.getByText('Looks about right for today')).toBeTruthy())
    expect(runCheck).toHaveBeenCalledTimes(1)
    expect(runCheck.mock.calls[0][1]).toMatchObject({ familyId: 'fam', childId: 'lincoln' })
    // Said inside the answer, not only on the card behind it.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/No learning or progress records change/i)).toBeTruthy()
  })

  it('REGRESSION: a file chosen after switching child is not sent for the new child', async () => {
    const { rerender } = render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)

    // The picker is open over the app; keep the element it will fire on.
    const openedInput = openPicker()

    // The parent switches child in the shell while the picker is still open.
    rerender(<PageCheckSurface childId="london" childName="London" />)

    // …and only now chooses the file.
    await deliver(openedInput)

    expect(runCheck).not.toHaveBeenCalled()
    // The sheet itself was retired with the scope it was opened under.
    await sheetClosed()
    expect(await screen.findByRole('button', { name: /check this page for london/i })).toBeTruthy()
  })

  it('REGRESSION: nor after an A-B-A switch, where the scope matches again', async () => {
    const { rerender } = render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    const openedInput = openPicker()

    rerender(<PageCheckSurface childId="london" childName="London" />)
    rerender(<PageCheckSurface childId="lincoln" childName="Lincoln" />)

    await deliver(openedInput)

    expect(runCheck).not.toHaveBeenCalled()
    await sheetClosed()
  })

  it('REGRESSION: nor after the sheet is CLOSED while the picker is still open', async () => {
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    const openedInput = openPicker()

    // Close the sheet. MUI keeps the content mounted through its exit
    // transition, so the input the picker will fire on is still there.
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))

    // Deliver into whatever is still mounted — the element the picker was
    // opened on, and (if the sheet has not finished leaving) the current one.
    await deliver(openedInput)
    const stillMounted = screen.queryByLabelText('Upload a photo of the page') as HTMLInputElement | null
    if (stillMounted) await deliver(stillMounted)

    expect(runCheck).not.toHaveBeenCalled()
    await sheetClosed()
    expect(screen.queryByText('Looks about right for today')).toBeNull()
  })

  it('and the next, fresh selection for the new child works normally', async () => {
    const { rerender } = render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    openPicker()
    rerender(<PageCheckSurface childId="london" childName="London" />)
    await sheetClosed()

    await openSheetFor(/check this page for london/i)
    await deliver(openPicker())

    await waitFor(() => expect(runCheck).toHaveBeenCalledTimes(1))
    expect(runCheck.mock.calls[0][1]).toMatchObject({ childId: 'london' })
  })

  it('retry stays usable: the sheet stays open and the next page is checked', async () => {
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    await deliver(openPicker())
    await waitFor(() => expect(screen.getByText('Looks about right for today')).toBeTruthy())

    runCheck.mockResolvedValue({ results: results({ estimatedDifficulty: 'too-hard' }) })
    fireEvent.click(screen.getByRole('button', { name: /check another page/i }))

    // Still open, back at the disclosure — a retry must not close the sheet.
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: /take a photo/i })).toBeTruthy()

    await deliver(openPicker())
    await waitFor(() => expect(screen.getByText('Looks like a stretch today')).toBeTruthy())
    expect(runCheck).toHaveBeenCalledTimes(2)
  })

  it('an answer for one child never flashes on the next', async () => {
    const { rerender } = render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    await deliver(openPicker())
    await waitFor(() => expect(screen.getByText('Looks about right for today')).toBeTruthy())

    rerender(<PageCheckSurface childId="london" childName="London" />)
    expect(screen.queryByText('Looks about right for today')).toBeNull()
    expect(screen.queryByText('math — adding tens')).toBeNull()

    await sheetClosed()
    await openSheetFor(/check this page for london/i)
    expect(screen.queryByText('Looks about right for today')).toBeNull()
    expect(screen.getByRole('button', { name: /take a photo/i })).toBeTruthy()
  })

  it('two quick picks ask once — the duplicate is dropped, not queued', async () => {
    let release: (outcome: ProspectivePageCheckOutcome) => void = () => {}
    runCheck.mockImplementation(
      () => new Promise<ProspectivePageCheckOutcome>((resolve) => { release = resolve }),
    )
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    const input = openPicker()

    await act(async () => {
      fireEvent.change(input, { target: { files: [aFile()] } })
      fireEvent.change(input, { target: { files: [aFile()] } })
    })
    expect(runCheck).toHaveBeenCalledTimes(1)

    await act(async () => {
      release({ results: results() })
    })
    await waitFor(() => expect(screen.getByText('Looks about right for today')).toBeTruthy())
  })

  it('RECOVERY: a browser that cannot make a preview still answers, and can retry', async () => {
    globalThis.URL.createObjectURL = vi.fn(() => {
      throw new Error('not implemented')
    }) as unknown as typeof URL.createObjectURL

    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    await deliver(openPicker())

    await waitFor(() => expect(screen.getByText('Looks about right for today')).toBeTruthy())
    expect(screen.queryByAltText(/page you asked about/i)).toBeNull()

    // And the door is not latched shut behind it.
    fireEvent.click(screen.getByRole('button', { name: /check another page/i }))
    await deliver(openPicker())
    await waitFor(() => expect(runCheck).toHaveBeenCalledTimes(2))
  })

  it('a failed request is an honest non-answer with only close and retry', async () => {
    runCheck.mockResolvedValue({ results: null, sendFailed: true })
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    await deliver(openPicker())

    await waitFor(() => expect(screen.getByText("Can't tell from this photo")).toBeTruthy())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/may or may not have reached the AI/i)).toBeTruthy()
    const labels = within(dialog).getAllByRole('button').map((b) => b.textContent ?? '')
    expect(labels.filter((label) => /add to plan|accept skip|update position|record/i.test(label))).toEqual([])
  })

  it('a service older than the app says the check is unavailable, not "try again"', async () => {
    runCheck.mockResolvedValue({ results: null, sendFailed: true, unsupported: true })
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" />)
    await openSheetFor(/check this page for lincoln/i)
    await deliver(openPicker())

    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByText(/isn’t available yet/i)).toBeTruthy(),
    )
    expect(within(dialog).getByText(/nothing at all was written/i)).toBeTruthy()
  })

  it('a kid profile sees no door at all', () => {
    render(<PageCheckSurface childId="lincoln" childName="Lincoln" canCheck={false} />)
    expect(screen.queryByRole('button', { name: /check this page/i })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
