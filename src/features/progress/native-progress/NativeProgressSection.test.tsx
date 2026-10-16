import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'

/**
 * The surface: propose → confirm → write, and the things it must never do.
 *
 * FEAT-241. Every case here is one of the run's own requirements rather than a
 * tour of the component: nothing is written without an explicit second tap, a
 * failure leaves the entry on screen and unsaved, a retry cannot write twice, the
 * child is named before the write and the draft is dropped when it changes, a kid
 * profile has no door, a correction is linked and the original is kept, and a
 * failed read is never rendered as an empty record.
 */

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

/**
 * The clock is pinned and nothing else is.
 *
 * The form refuses a future day, so a test with real dates in it would start
 * failing on its own at some point in the past or future depending on when the
 * suite runs. Only `todayKey` is replaced; `formatDateShort` stays real, because
 * the displayed dates are part of what is being asserted.
 */
vi.mock('../../../core/utils/dateKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/utils/dateKey')>()
  return { ...actual, todayKey: () => '2026-10-16' }
})

let isChildProfile = false
let activeChildId = 'lincoln'
const CHILDREN: Record<string, { id: string; name: string }> = {
  lincoln: { id: 'lincoln', name: 'Lincoln' },
  london: { id: 'london', name: 'London' },
}
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId,
    activeChild: CHILDREN[activeChildId],
    children: Object.values(CHILDREN),
    setActiveChildId: vi.fn(),
    isChildProfile,
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

let observations: NativeProgressObservation[] = []
let observationsChildId: string | null = 'lincoln'
let readError: string | null = null
let loading = false
const saveMock = vi.fn()
vi.mock('./useNativeProgressObservations', () => ({
  NATIVE_PROGRESS_SAVE_IN_FLIGHT: 'in flight',
  useNativeProgressObservations: () => ({
    observations,
    loading,
    error: readError,
    observationsChildId,
    saving: false,
    save: (...a: unknown[]) => saveMock(...a),
  }),
}))

import NativeProgressSection from './NativeProgressSection'

function row(overrides: Partial<NativeProgressObservation> = {}): NativeProgressObservation {
  return {
    id: 'lincoln__e1',
    childId: 'lincoln',
    program: NativeProgressProgram.Mathseeds,
    nativeNumber: 42,
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn: '2026-10-12',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-14T15:00:00.000Z',
    entryKey: 'e1',
    ...overrides,
  }
}

/** Fill the number and the date, the two typed fields. */
async function fillEntry(
  user: ReturnType<typeof userEvent.setup>,
  number = '42',
  date = '2026-10-12',
) {
  const field = screen.getByLabelText('Lesson number')
  await user.clear(field)
  await user.type(field, number)
  fireEvent.change(screen.getByLabelText('Day you saw this'), { target: { value: date } })
}

const savedOk = (overrides: Partial<NativeProgressObservation> = {}) => ({
  ok: true as const,
  observation: row(overrides),
  alreadyRecorded: false,
})

beforeEach(() => {
  isChildProfile = false
  activeChildId = 'lincoln'
  observations = []
  observationsChildId = 'lincoln'
  readError = null
  loading = false
  saveMock.mockReset()
  saveMock.mockResolvedValue(savedOk())
})

describe('before anything is written', () => {
  it('names the child and says planning has not moved', () => {
    render(<NativeProgressSection />)
    expect(screen.getByText(/Recording for/)).toHaveTextContent('Lincoln')
    expect(screen.getByText(/changes nothing the app plans/i)).toBeInTheDocument()
  })

  it('asks for the unit the chosen program uses', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    expect(screen.getByLabelText('Lesson number')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Program' }))
    await user.click(screen.getByRole('option', { name: 'Fast Phonics' }))

    expect(await screen.findByLabelText('Peak number')).toBeInTheDocument()
  })

  it('checking the entry writes nothing and shows what WOULD be saved', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(
      await screen.findByText('Lincoln: Mathseeds — working on lesson 42, seen Oct 12.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Nothing has been saved yet.')).toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('refuses a number that is not one, without reaching the writer', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user, '4.5')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(await screen.findByText('Use a whole number, like 42.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing has been saved yet.')).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('refuses a day that has not happened, without reaching the writer', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user, '42', '2099-01-01')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(await screen.findByText("That day hasn't happened yet.")).toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('going Back from the confirm step writes nothing', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))

    expect(saveMock).not.toHaveBeenCalled()
    // Her typing is still there.
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')
  })
})

describe('the write', () => {
  it('saves on the second tap, with the family, child and draft pinned', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const request = saveMock.mock.calls[0][0]
    expect(request).toMatchObject({
      familyId: 'fam-1',
      childId: 'lincoln',
      observation: {
        program: 'mathseeds',
        nativeNumber: 42,
        meaning: 'workingOn',
        observedOn: '2026-10-12',
        source: 'parentReport',
      },
    })
    expect(request.entryKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(request.correctsObservationId).toBeUndefined()
  })

  it('shows a receipt that names the child and claims nothing else', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(await screen.findByText(/Recorded for Lincoln/)).toHaveTextContent(
      'Nothing else changed.',
    )
    // The form is ready for the next entry rather than still holding the last.
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
  })

  it('a failed save leaves the entry on screen, unsaved, and says so', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: false, message: 'That was not saved. Your entry is still here — try again.' })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(await screen.findByText(/That was not saved/)).toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')
    expect(screen.queryByText(/Recorded for Lincoln/)).not.toBeInTheDocument()
  })

  it('retrying the same failed entry reuses its key, so it cannot become two rows', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: false, message: 'That was not saved.' })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))

    expect(saveMock.mock.calls[1][0].entryKey).toBe(saveMock.mock.calls[0][0].entryKey)
  })

  it('EDITING after a failure makes it a new entry, with a new key', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: false, message: 'That was not saved.' })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Lesson number'), '3')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))

    expect(saveMock.mock.calls[1][0].entryKey).not.toBe(saveMock.mock.calls[0][0].entryKey)
    expect(saveMock.mock.calls[1][0].observation.nativeNumber).toBe(423)
  })

  it('reports an entry that was already recorded, without claiming a second save', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: true, observation: row(), alreadyRecorded: true })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(await screen.findByText(/Already recorded for Lincoln/)).toHaveTextContent(
      'Nothing was saved twice.',
    )
  })
})

describe('the parent gate', () => {
  it('offers a kid profile no form at all', () => {
    isChildProfile = true
    render(<NativeProgressSection />)
    expect(screen.getByText('A parent keeps this record.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Lesson number')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Check this entry' }),
    ).not.toBeInTheDocument()
  })

  it('takes the confirm step away if the profile changes with one open', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    expect(await screen.findByRole('button', { name: 'Save this record' })).toBeInTheDocument()

    isChildProfile = true
    rerender(<NativeProgressSection />)

    expect(screen.queryByRole('button', { name: 'Save this record' })).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })
})

describe('when the child changes under it', () => {
  it('clears the draft and says what was lost', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    activeChildId = 'london'
    observationsChildId = 'london'
    rerender(<NativeProgressSection />)

    expect(await screen.findByText(/was cleared and not saved/)).toHaveTextContent('Lincoln')
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
    expect(screen.queryByText(/Lincoln: Mathseeds/)).not.toBeInTheDocument()
    expect(screen.getByText(/Recording for/)).toHaveTextContent('London')
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('does not keep a receipt written under the previous child', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()

    activeChildId = 'london'
    observationsChildId = 'london'
    rerender(<NativeProgressSection />)

    expect(screen.queryByText(/Recorded for Lincoln/)).not.toBeInTheDocument()
  })
})

describe('the history', () => {
  it('shows each entry with the day seen, the meaning and the source', () => {
    observations = [row()]
    render(<NativeProgressSection />)
    expect(
      screen.getByText('Mathseeds — working on lesson 42, seen Oct 12 (parent report)'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Entered Oct 1[45]/)).toBeInTheDocument()
  })

  it('reports the latest READING, and flags entries made out of order', () => {
    observations = [
      row({ id: 'a', observedOn: '2026-10-12', recordedAt: '2026-10-12T10:00:00.000Z' }),
      row({
        id: 'b',
        nativeNumber: 30,
        observedOn: '2026-09-20',
        recordedAt: '2026-10-15T10:00:00.000Z',
      }),
    ]
    render(<NativeProgressSection />)
    expect(screen.getByText(/Latest record: working on lesson 42, as of Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/added out of order/)).toBeInTheDocument()
  })

  it('keeps both of two entries that disagree about the same day', () => {
    observations = [
      row({ id: 'a', nativeNumber: 42, recordedAt: '2026-10-12T10:00:00.000Z' }),
      row({ id: 'b', nativeNumber: 44, recordedAt: '2026-10-12T11:00:00.000Z' }),
    ]
    render(<NativeProgressSection />)
    expect(screen.getByText(/working on lesson 42, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/working on lesson 44, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/both are kept/)).toBeInTheDocument()
  })

  it('a correction is linked, and the entry it corrects is still there', () => {
    observations = [
      row({ id: 'a', nativeNumber: 42, recordedAt: '2026-10-12T10:00:00.000Z' }),
      row({
        id: 'b',
        nativeNumber: 41,
        recordedAt: '2026-10-15T10:00:00.000Z',
        correctsObservationId: 'a',
      }),
    ]
    render(<NativeProgressSection />)
    expect(screen.getByText(/working on lesson 41, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/working on lesson 42, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/Correction of the entry seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText('Later corrected')).toBeInTheDocument()
  })

  it('correcting an entry seeds the form and links the save to the original', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    expect(await screen.findByText(/That entry stays on the record/)).toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')

    const field = screen.getByLabelText('Lesson number')
    await user.clear(field)
    await user.type(field, '41')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      correctsObservationId: 'lincoln__e1',
      observation: { nativeNumber: 41 },
    })
  })

  it('a failed read is never shown as an empty record', () => {
    readError = 'permission-denied'
    render(<NativeProgressSection />)
    expect(screen.getByText(/Couldn't load the entries you have saved/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing recorded yet')).not.toBeInTheDocument()
  })

  it('does not present another child’s rows while this child’s read is unsettled', () => {
    observations = [row()]
    observationsChildId = 'london'
    loading = true
    render(<NativeProgressSection />)
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(screen.getByText('Loading your entries…')).toBeInTheDocument()
  })
})
