import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The parent's Records link opens the exact game and the exact immutable saved
 * version a credit was given for (FEAT-247, slice 4). The reader is the unit that
 * proves the scope (`buildStudioHoursCreditWrites.lanternCove.test.ts`); here the
 * dialog is shown to hand it the row's own provenance, to name the game it
 * belongs to, and to stay read-only.
 */

const read = vi.fn()
vi.mock('../../core/firebase/buildStudioHoursCreditWrites', () => ({
  readBuildStudioCreditedVersion: (args: unknown) => read(args),
}))

import BuildStudioCreditedWorkDialog from './BuildStudioCreditedWorkDialog'

const provenance = (projectId: string, versionId: string) =>
  ({
    schema: 1,
    receiptId: `child-lincoln.${projectId}.${versionId}`,
    kind: 'freeBuild',
    projectId,
    versionId,
    versionDocId: `child-lincoln__${projectId}__${versionId}`,
    admittedMinutes: 15,
    workAtMs: Date.parse('2026-11-20T16:00:00.000Z'),
    timeZone: 'America/Chicago',
  }) as never

const version = (projectId: string, versionId: string, label: string) => ({
  id: `child-lincoln__${projectId}__${versionId}`,
  childId: 'child-lincoln',
  projectId,
  versionId,
  label,
  createdAt: '2026-11-20T15:59:00.000Z',
  sourceArchive: '{}',
  byteSize: 2,
  fileCount: 5,
  sourceDigest: 'abc123',
})

afterEach(() => {
  cleanup()
  read.mockReset()
})

function open(projectId: string, versionId: string, label: string) {
  const prov = provenance(projectId, versionId)
  read.mockResolvedValue({ status: 'ok', version: version(projectId, versionId, label) })
  render(
    <BuildStudioCreditedWorkDialog
      familyId="fam-1"
      childId="child-lincoln"
      childName="Lincoln"
      provenance={prov}
      rowDate="2026-11-20"
      onClose={vi.fn()}
    />,
  )
  return prov
}

describe('Saved work from a credited row', () => {
  it('names Lantern Cove and shows the exact version the provenance names', async () => {
    const prov = open('lantern-cove-starter', 'v-cove01', 'Cove at dusk')
    await waitFor(() => expect(screen.getByText('Cove at dusk')).toBeInTheDocument())
    expect(screen.getByText(/Lantern Cove/)).toBeInTheDocument()
    expect(screen.queryByText(/Apple Dash/)).not.toBeInTheDocument()
    expect(read).toHaveBeenCalledWith({ familyId: 'fam-1', childId: 'child-lincoln', provenance: prov })
    expect(screen.getByText(/Read-only/)).toBeInTheDocument()
  })

  it('names Apple Dash for an Apple Dash row (control)', async () => {
    open('apple-dash-starter', 'v-apple1', 'Fast apples')
    await waitFor(() => expect(screen.getByText('Fast apples')).toBeInTheDocument())
    expect(screen.getByText(/Apple Dash/)).toBeInTheDocument()
    expect(screen.queryByText(/Lantern Cove/)).not.toBeInTheDocument()
  })

  it('a version the reader will not vouch for is not shown at all', async () => {
    read.mockResolvedValue({ status: 'malformed', reason: 'bad-provenance' })
    render(
      <BuildStudioCreditedWorkDialog
        familyId="fam-1"
        childId="child-lincoln"
        childName="Lincoln"
        provenance={provenance('block-muncher', 'v-aaa111')}
        rowDate="2026-11-20"
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText(/does not match this credit’s record/)).toBeInTheDocument())
    expect(screen.queryByText(/Block Muncher/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Download source archive/)).not.toBeInTheDocument()
  })
})
