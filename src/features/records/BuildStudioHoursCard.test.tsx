import type { ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HoursEntry } from '../../core/types'
import type { BuildStudioCreditProvenance } from '../../core/types/buildStudio'

/**
 * Parent Records: Build Studio hours card.
 *
 * Boundaries mocked: the four guarded writer operations and the versions hook.
 * What is under test is the card's own contract — gating, the propose → confirm →
 * write order, same-proposal retry, exact-version links, and that no answer from a
 * retired request or another child is ever shown.
 */

const preview = vi.fn()
const confirm = vi.fn()
const correct = vi.fn()
const readVersion = vi.fn()
vi.mock('../../core/firebase/buildStudioHoursCreditWrites', () => ({
  previewBuildStudioCredit: (...a: unknown[]) => preview(...a),
  confirmBuildStudioCredit: (...a: unknown[]) => confirm(...a),
  correctBuildStudioCreditHours: (...a: unknown[]) => correct(...a),
  readBuildStudioCreditedVersion: (...a: unknown[]) => readVersion(...a),
}))

const mockVersions = vi.fn()
vi.mock('../build-studio/useBuildStudioVersions', () => ({
  VersionsStatus: { Loading: 'loading', Ready: 'ready', Failed: 'failed' },
  useBuildStudioVersions: (...a: unknown[]) => mockVersions(...a),
}))

vi.mock('../build-studio/buildStudioExport', () => ({
  buildStudioDownloadsForArchive: () => [{ filename: 'g-source.json', mime: 'application/json', text: '{}' }],
  downloadTextFile: vi.fn(),
}))

import BuildStudioHoursCard from './BuildStudioHoursCard'
import { buildStudioCardAllowed } from './buildStudioHoursCard.logic'

const PROJECT = 'apple-dash-starter'
const retry = vi.fn()

function ts(iso: string) {
  return { toMillis: () => Date.parse(iso) }
}

function version(childId: string, versionId: string, over: Record<string, unknown> = {}) {
  return {
    id: `${childId}__${PROJECT}__${versionId}`,
    childId,
    projectId: PROJECT,
    versionId,
    label: `Game ${versionId}`,
    createdAt: '2026-11-20T15:00:00.000Z',
    sourceArchive: '{}',
    byteSize: 10,
    fileCount: 2,
    sourceDigest: 'abc123',
    acceptedAt: ts('2026-11-20T15:00:01.000Z'),
    ...over,
  }
}

function setVersions(childId: string, versions: unknown[], status = 'ready') {
  mockVersions.mockReturnValue({ status, versions, childId, projectId: PROJECT, error: null, retry })
}

const prov = (childId: string, versionId: string, over: Partial<BuildStudioCreditProvenance> = {}): BuildStudioCreditProvenance => ({
  schema: 1,
  receiptId: `${childId}.${PROJECT}.${versionId}`,
  kind: 'freeBuild',
  projectId: PROJECT,
  versionId,
  versionDocId: `${childId}__${PROJECT}__${versionId}`,
  admittedMinutes: 15,
  workAtMs: Date.parse('2026-11-20T15:00:01.000Z'),
  timeZone: 'America/Chicago',
  ...over,
})

function row(childId: string, versionId: string, over: Partial<HoursEntry> = {}): HoursEntry {
  return {
    id: `bsc.${childId}.${PROJECT}.${versionId}`,
    childId,
    date: '2026-11-20',
    minutes: 15,
    subjectBucket: 'PracticalArts',
    source: 'build-studio-credit',
    notes: 'Build Studio: changed own game',
    buildStudioCredit: prov(childId, versionId),
    ...over,
  } as HoursEntry
}

const proposal = (childId = 'lincoln', versionId = 'v-aaa111') => ({
  familyId: 'fam-1',
  childId,
  projectId: PROJECT,
  versionId,
  versionDocId: `${childId}__${PROJECT}__${versionId}`,
  source: { kind: 'freeBuild', projectId: PROJECT, versionId },
  workMs: Date.parse('2026-11-20T15:00:01.000Z'),
  timeZone: 'America/Chicago',
  schoolDate: '2026-11-20',
  minutes: 15,
  subjectBucket: 'PracticalArts',
  predecessorDocId: null,
  sourceDigest: 'abc123',
  baselineDigest: null,
})

const receipt = { minutes: 15, subjectBucket: 'PracticalArts', schoolDate: '2026-11-20' }

function card(over: Partial<ComponentProps<typeof BuildStudioHoursCard>> = {}) {
  return (
    <BuildStudioHoursCard
      familyId="fam-1"
      childId="lincoln"
      childName="Lincoln"
      startDate="2026-08-01"
      endDate="2027-07-31"
      hoursEntries={[]}
      onChanged={vi.fn(async () => true)}
      {...over}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setVersions('lincoln', [])
})

describe('buildStudioCardAllowed — every term is affirmative', () => {
  const ok = {
    canEdit: true,
    isChildProfile: false,
    profileChildResolved: true as boolean | undefined,
    familyId: 'fam-1' as string | null,
    childrenFamilyId: 'fam-1' as string | null | undefined,
    childrenLoading: false,
    activeChildId: 'lincoln',
    activeChildFound: true,
    recordsLoading: false,
    readScope: { familyId: 'fam-1', startDate: '2026-08-01', endDate: '2027-07-31' } as
      | { familyId: string; startDate: string; endDate: string }
      | null,
    startDate: '2026-08-01',
    endDate: '2027-07-31',
  }
  it('allows a settled parent', () => expect(buildStudioCardAllowed(ok)).toBe(true))
  it.each([
    ['a child profile', { canEdit: false, isChildProfile: true }],
    ['a profile that cannot edit', { canEdit: false }],
    ['unproven identity (older mock)', { profileChildResolved: undefined }],
    ['children read from another family', { childrenFamilyId: 'fam-2' }],
    ['children still loading', { childrenLoading: true }],
    ['no child document found', { activeChildFound: false }],
    ['records still loading', { recordsLoading: true }],
    ['no read yet', { readScope: null }],
    [
      'an array read for ANOTHER family with the same child id',
      { readScope: { familyId: 'fam-2', startDate: '2026-08-01', endDate: '2027-07-31' } },
    ],
    [
      'an array read for another range',
      { readScope: { familyId: 'fam-1', startDate: '2026-08-01', endDate: '2026-12-31' } },
    ],
  ])('withholds for %s', (_name, patch) => {
    expect(buildStudioCardAllowed({ ...ok, ...patch })).toBe(false)
  })
})

describe('card visibility', () => {
  it('renders nothing for a child with no eligible saves or credits', () => {
    const { container } = render(card())
    expect(container).toBeEmptyDOMElement()
  })

  it('does not offer an older save that carries no server acceptance time', () => {
    setVersions('lincoln', [version('lincoln', 'v-old1111', { acceptedAt: undefined })])
    const { container } = render(card())
    expect(container).toBeEmptyDOMElement()
  })

  it('does not offer a save that already has its credit row showing', () => {
    setVersions('lincoln', [version('lincoln', 'v-aaa111')])
    const { container } = render(card({ hoursEntries: [row('lincoln', 'v-aaa111')] }))
    expect(screen.queryByText('New saves to review')).not.toBeInTheDocument()
    expect(container).not.toBeEmptyDOMElement() // the credited row is there
  })

  it('says a failed read failed, with Retry, and does not claim there is nothing', async () => {
    setVersions('lincoln', [], 'failed')
    render(card())
    expect(screen.getByText(/couldn.t check lincoln.s saved games/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('ignores an answer that is about another child', () => {
    setVersions('london', [version('london', 'v-aaa111')])
    const { container } = render(card())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the review list is never capped for good', () => {
  it('Show more reveals an older save that eight newer ones hide', async () => {
    const newer = Array.from({ length: 8 }, (_, i) =>
      version('lincoln', `v-new${i}`, { createdAt: `2026-11-20T16:0${i}:00.000Z` }),
    )
    const older = version('lincoln', 'v-older9', { createdAt: '2026-11-19T10:00:00.000Z' })
    setVersions('lincoln', [...newer, older])
    render(card())
    expect(screen.queryByText('Game v-older9')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getByText('Game v-older9')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })
})

describe('propose → confirm → write, never automatic', () => {
  beforeEach(() => setVersions('lincoln', [version('lincoln', 'v-aaa111')]))

  it('lists the save and touches the writer only on a click', () => {
    render(card())
    expect(screen.getByText('Game v-aaa111')).toBeInTheDocument()
    expect(preview).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('previews the exact scope, shows the proposal, and confirms only on the second click', async () => {
    const p = proposal()
    preview.mockResolvedValue({ status: 'ready', proposal: p })
    confirm.mockResolvedValue({ status: 'credited', receipt })
    const onChanged = vi.fn(async () => true)
    render(card({ onChanged }))

    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    expect(preview).toHaveBeenCalledWith({
      familyId: 'fam-1',
      childId: 'lincoln',
      projectId: PROJECT,
      versionId: 'v-aaa111',
    })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/15 minutes/)).toBeInTheDocument()
    expect(within(dialog).getByText('2026-11-20')).toBeInTheDocument()
    expect(within(dialog).getByText('Lincoln')).toBeInTheDocument()
    expect(within(dialog).getByText('Saved work: Game v-aaa111')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm credit' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toBe(p) // the exact preview, not a rebuilt one
    expect(await within(dialog).findByText(/Credited 15 minutes/)).toBeInTheDocument()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('a network failure is retryable with the SAME proposal and is never shown as success', async () => {
    const p = proposal()
    preview.mockResolvedValue({ status: 'ready', proposal: p })
    confirm
      .mockResolvedValueOnce({ status: 'failed', retryable: true, reason: 'write-failed' })
      .mockResolvedValueOnce({ status: 'credited', receipt })
    const onChanged = vi.fn(async () => true)
    render(card({ onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm credit' }))

    expect(await within(dialog).findByText(/couldn.t confirm whether this was recorded/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Credited/)).not.toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(preview).toHaveBeenCalledTimes(1)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(confirm.mock.calls[1][0]).toBe(p)
    expect(preview).toHaveBeenCalledTimes(1) // not re-derived
    expect(await within(dialog).findByText(/Credited 15 minutes/)).toBeInTheDocument()
  })

  it('a daily-full preview says so and offers no confirmation', async () => {
    preview.mockResolvedValue({ status: 'declined', reason: 'over-daily-cap', proposal: proposal() })
    render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/credit is full/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /confirm credit/i })).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it.each([
    [{ status: 'declined', reason: 'challenge-already-credited-today', proposal: proposal() }, /already credited/i],
    [{ status: 'unproven', reason: 'unchanged' }, /nothing changed/i],
    [{ status: 'alreadySettled', receipt }, /can.t\s+be credited again/i],
    [{ status: 'unavailable' }, /can.t be credited/i],
  ])('explains %j and offers no confirmation', async (result, text) => {
    preview.mockResolvedValue(result)
    render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(text)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /confirm credit/i })).not.toBeInTheDocument()
  })

  it('a competing confirmation (alreadySettled) is reported as already credited, nothing added', async () => {
    preview.mockResolvedValue({ status: 'ready', proposal: proposal() })
    confirm.mockResolvedValue({ status: 'alreadySettled', receipt })
    render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm credit' }))
    expect(await within(dialog).findByText(/Nothing more was added/)).toBeInTheDocument()
  })

  it('work that is no longer eligible offers Close / Reload, not a retry', async () => {
    preview.mockResolvedValue({ status: 'ready', proposal: proposal() })
    confirm.mockResolvedValue({ status: 'stale', reason: 'source-changed' })
    const onChanged = vi.fn(async () => true)
    render(card({ onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm credit' }))
    expect(await within(dialog).findByText(/nothing was added/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /try again|confirm credit/i })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reload records' }))
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('a preview read failure is retryable by re-previewing, and writes nothing', async () => {
    preview
      .mockResolvedValueOnce({ status: 'failed', reason: 'read-failed' })
      .mockResolvedValueOnce({ status: 'ready', proposal: proposal() })
    render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByRole('button', { name: 'Confirm credit' })).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('refuses to send a proposal that is not this card’s family and child', async () => {
    preview.mockResolvedValue({ status: 'ready', proposal: { ...proposal(), childId: 'london' } })
    render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm credit' }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('a confirmation that lands after the child switched still refreshes Records, and shows nothing to the new child', async () => {
    let resolve!: (v: unknown) => void
    preview.mockResolvedValue({ status: 'ready', proposal: proposal() })
    confirm.mockReturnValue(new Promise((r) => (resolve = r)))
    const onChanged = vi.fn(async () => true)
    const { rerender } = render(card({ onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm credit' }))

    setVersions('london', [])
    rerender(card({ childId: 'london', childName: 'London', onChanged }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    resolve({ status: 'credited', receipt })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Credited/)).not.toBeInTheDocument()
  })

  it('a correction that lands after the child switched still refreshes Records', async () => {
    let resolve!: (v: unknown) => void
    correct.mockReturnValue(new Promise((r) => (resolve = r)))
    const onChanged = vi.fn(async () => true)
    const { rerender } = render(card({ hoursEntries: [row('lincoln', 'v-aaa111')], onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Remove this row' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove row' }))

    setVersions('london', [])
    rerender(card({ childId: 'london', childName: 'London', onChanged }))
    resolve({ status: 'deleted' })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('an unconfirmed credit is never claimed as the challenge being finished', async () => {
    preview.mockResolvedValue({
      status: 'ready',
      proposal: { ...proposal(), source: { kind: 'challenge', projectId: PROJECT, versionId: 'v-aaa111' } },
    })
    render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/A prediction was recorded with this saved version\./)).toBeInTheDocument()
    expect(within(dialog).queryByText(/they finished/i)).not.toBeInTheDocument()
  })

  it('a preview that answers after the child switched is never shown or confirmable', async () => {
    let resolve!: (v: unknown) => void
    preview.mockReturnValue(new Promise((r) => (resolve = r)))
    const { rerender } = render(card())
    await userEvent.click(screen.getByRole('button', { name: 'Review credit' }))
    expect(await screen.findByText(/checking this save/i)).toBeInTheDocument()

    setVersions('london', [])
    rerender(card({ childId: 'london', childName: 'London' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    resolve({ status: 'ready', proposal: proposal() })
    await Promise.resolve()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm credit/i })).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('credited rows and the exact saved work', () => {
  it('shows date, amount and subject, and opens each row’s OWN version', async () => {
    const rows = [row('lincoln', 'v-aaa111'), row('lincoln', 'v-bbb222', { date: '2026-11-21' })]
    readVersion.mockImplementation(async ({ provenance }: { provenance: BuildStudioCreditProvenance }) => ({
      status: 'ok',
      version: version('lincoln', provenance.versionId, { label: `Saved ${provenance.versionId}` }),
    }))
    render(card({ hoursEntries: rows }))
    expect(screen.getByText(/2026-11-20 · 15 min · Practical Arts/)).toBeInTheDocument()
    expect(readVersion).not.toHaveBeenCalled()

    const open = screen.getAllByRole('button', { name: 'Open saved work' })
    await userEvent.click(open[1])
    expect(await screen.findByText('Saved v-bbb222')).toBeInTheDocument()
    expect(readVersion).toHaveBeenCalledTimes(1)
    expect(readVersion).toHaveBeenCalledWith({
      familyId: 'fam-1',
      childId: 'lincoln',
      provenance: rows[1].buildStudioCredit, // the FULL recorded provenance
    })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Open saved work' })[0])
    expect(await screen.findByText('Saved v-aaa111')).toBeInTheDocument()
    expect(screen.queryByText('Saved v-bbb222')).not.toBeInTheDocument()
  })

  it('shows loading, then a read failure with Retry that re-reads', async () => {
    readVersion
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'ok', version: version('lincoln', 'v-aaa111') })
    render(card({ hoursEntries: [row('lincoln', 'v-aaa111')] }))
    await userEvent.click(screen.getByRole('button', { name: 'Open saved work' }))
    expect(await screen.findByText(/couldn.t read the saved work/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Game v-aaa111')).toBeInTheDocument()
    expect(readVersion).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ status: 'unavailable' }, /isn.t on file any more/i],
    [{ status: 'malformed', reason: 'bad-archive' }, /does not match this credit/i],
  ])('says plainly when the work is %j', async (result, text) => {
    readVersion.mockResolvedValue(result)
    render(card({ hoursEntries: [row('lincoln', 'v-aaa111')] }))
    await userEvent.click(screen.getByRole('button', { name: 'Open saved work' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download source archive/i })).not.toBeInTheDocument()
  })

  it('a read that answers after the dialog closed, or the child changed, is never shown', async () => {
    let resolve!: (v: unknown) => void
    readVersion.mockReturnValue(new Promise((r) => (resolve = r)))
    const { rerender } = render(card({ hoursEntries: [row('lincoln', 'v-aaa111')] }))
    await userEvent.click(screen.getByRole('button', { name: 'Open saved work' }))
    expect(await screen.findByText(/opening the saved work/i)).toBeInTheDocument()

    setVersions('london', [])
    rerender(card({ childId: 'london', childName: 'London', hoursEntries: [] }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    resolve({ status: 'ok', version: version('lincoln', 'v-aaa111', { label: 'Lincoln private work' }) })
    await Promise.resolve()
    expect(screen.queryByText('Lincoln private work')).not.toBeInTheDocument()
  })

  it('a row whose id or provenance is not exactly this credit gets no link', () => {
    const bad = row('lincoln', 'v-aaa111', { id: 'bsc.lincoln.apple-dash-starter.v-other999' })
    render(card({ hoursEntries: [bad] }))
    expect(screen.queryByRole('button', { name: 'Open saved work' })).not.toBeInTheDocument()
    expect(screen.getByText(/link unavailable/i)).toBeInTheDocument()
  })

  it('never lists another child’s credit', () => {
    const { container } = render(card({ hoursEntries: [row('london', 'v-aaa111')] }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('correcting a credited row', () => {
  const hours = [row('lincoln', 'v-aaa111')]

  it('lowers only after an explicit confirmation naming the row, with the minutes the parent saw', async () => {
    correct.mockResolvedValue({ status: 'corrected', minutes: 10 })
    const onChanged = vi.fn(async () => true)
    render(card({ hoursEntries: hours, onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Lincoln · 2026-11-20 · 15 min/)).toBeInTheDocument()
    const confirmBtn = within(dialog).getByRole('button', { name: 'Lower minutes' })
    expect(confirmBtn).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('New minutes'), '15')
    expect(confirmBtn).toBeDisabled() // not lower
    await userEvent.clear(within(dialog).getByLabelText('New minutes'))
    await userEvent.type(within(dialog).getByLabelText('New minutes'), '10')
    expect(correct).not.toHaveBeenCalled()
    await userEvent.click(confirmBtn)
    expect(correct).toHaveBeenCalledWith({
      familyId: 'fam-1',
      childId: 'lincoln',
      projectId: PROJECT,
      versionId: 'v-aaa111',
      expectedMinutes: 15,
      minutes: 10,
    })
    expect(await within(dialog).findByText(/Lowered to 10 minutes/)).toBeInTheDocument()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('removes the row only on its own confirmation', async () => {
    correct.mockResolvedValue({ status: 'deleted' })
    render(card({ hoursEntries: hours }))
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Remove this row' }))
    expect(correct).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove row' }))
    expect(correct).toHaveBeenCalledWith(expect.objectContaining({ minutes: 'delete', expectedMinutes: 15 }))
    expect(await within(dialog).findByText(/Removed from Records/)).toBeInTheDocument()
  })

  it('a changed row is reported as unchanged, with no success claim', async () => {
    correct.mockResolvedValue({ status: 'stale', reason: 'row-changed' })
    const onChanged = vi.fn(async () => true)
    render(card({ hoursEntries: hours, onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Remove this row' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove row' }))
    expect(await within(dialog).findByText(/nothing was changed/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Removed/)).not.toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })
})
