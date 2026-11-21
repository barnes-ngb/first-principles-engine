import type { ComponentProps } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HoursEntry } from '../../core/types'
import type { BuildStudioCreditProvenance } from '../../core/types/buildStudio'

/**
 * Parent Records: Build Studio hours card.
 *
 * Credit is automatic now, so the card has NO review or approve control. Boundaries
 * mocked: the guarded writer's correction/read operations and the automatic worker
 * (its own lifecycle is tested in `useBuildStudioAutoCredit.test.tsx`). What is under
 * test is the card's own contract — gating, that the worker is mounted for exactly
 * this family and child and a settlement refreshes Records, exact-version links, the
 * parent's correction, and that no answer from a retired request or another child is
 * ever shown.
 */

const correct = vi.fn()
const readVersion = vi.fn()
vi.mock('../../core/firebase/buildStudioHoursCreditWrites', () => ({
  correctBuildStudioCreditHours: (...a: unknown[]) => correct(...a),
  readBuildStudioCreditedVersion: (...a: unknown[]) => readVersion(...a),
}))

interface WorkerProps {
  familyId: string
  childId: string
  enabled: boolean
  onSettled?: () => unknown
}
const workerMounts: WorkerProps[] = []
vi.mock('../build-studio/BuildStudioAutoCredit', () => ({
  default: (props: WorkerProps) => {
    workerMounts.push(props)
    return null
  },
}))

vi.mock('../build-studio/buildStudioExport', () => ({
  buildStudioDownloadsForArchive: () => [{ filename: 'g-source.json', mime: 'application/json', text: '{}' }],
  downloadTextFile: vi.fn(),
}))

import BuildStudioHoursCard from './BuildStudioHoursCard'
import { buildStudioCardAllowed } from './buildStudioHoursCard.logic'

const PROJECT = 'apple-dash-starter'

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
    ...over,
  }
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
  workerMounts.length = 0
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
  it('renders nothing visible for a child with no credits', () => {
    const { container } = render(card())
    expect(container).toBeEmptyDOMElement()
  })

  it('never lists another child’s credit', () => {
    const { container } = render(card({ hoursEntries: [row('london', 'v-aaa111')] }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('automatic credit: no adult approval control', () => {
  it.each([
    ['no credits yet', []],
    ['a credited row', [row('lincoln', 'v-aaa111')]],
  ])('offers no review, confirm or approve button with %s', (_name, hoursEntries) => {
    render(card({ hoursEntries }))
    expect(screen.queryByRole('button', { name: /review|confirm|approve|accept/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/new saves to review/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('never previews or confirms a credit itself — the worker is the only path', () => {
    // The mocked writer module exports no preview or confirm: a card that reached
    // for either would throw on access. Rendering with rows proves it does not.
    render(card({ hoursEntries: [row('lincoln', 'v-aaa111')] }))
    expect(screen.getByText(/added automatically/i)).toBeInTheDocument()
  })

  it('mounts the worker for exactly this family and child, even before any row shows', () => {
    render(card())
    expect(workerMounts.at(-1)).toMatchObject({ familyId: 'fam-1', childId: 'lincoln', enabled: true })
  })

  it('a settlement refreshes Records once through the page’s existing refresh', async () => {
    const onChanged = vi.fn(async () => true)
    render(card({ onChanged }))
    await workerMounts.at(-1)?.onSettled?.()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('a refresh that throws is not an unhandled failure', async () => {
    const onChanged = vi.fn(async () => {
      throw new Error('offline')
    })
    render(card({ onChanged }))
    await expect(Promise.resolve(workerMounts.at(-1)?.onSettled?.())).resolves.toBe(false)
  })

  it('does not keep the first child’s worker for the next child', () => {
    const { rerender } = render(card())
    rerender(card({ childId: 'london', childName: 'London' }))
    expect(workerMounts.at(-1)).toMatchObject({ familyId: 'fam-1', childId: 'london' })
  })

  it('keeps the same worker mounted when the first row arrives (no restart)', () => {
    const { rerender } = render(card())
    const mountsBefore = workerMounts.length
    rerender(card({ hoursEntries: [row('lincoln', 'v-aaa111')] }))
    // Re-rendered with identical identity props; never swapped for another scope.
    expect(workerMounts.slice(mountsBefore).every((p) => p.childId === 'lincoln' && p.familyId === 'fam-1')).toBe(true)
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
})

describe('correcting a credited row (the parent’s only write here)', () => {
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

  it('a correction that lands after the child switched still refreshes Records', async () => {
    let resolve!: (v: unknown) => void
    correct.mockReturnValue(new Promise((r) => (resolve = r)))
    const onChanged = vi.fn(async () => true)
    const { rerender } = render(card({ hoursEntries: hours, onChanged }))
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Remove this row' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove row' }))

    rerender(card({ childId: 'london', childName: 'London', onChanged }))
    resolve({ status: 'deleted' })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
