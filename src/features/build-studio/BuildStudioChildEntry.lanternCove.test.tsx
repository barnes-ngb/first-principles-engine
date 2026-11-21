import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The chooser with a SECOND editable game (FEAT-247).
 *
 * What is pinned: each editable game is its own named card on its own project's
 * shelf; exactly one editor ever mounts, for exactly the game chosen; the
 * play-only card is never duplicated; a saved Lantern Cove that lost part of
 * itself opens nothing; and work that did not land still comes first — whichever
 * game owns it.
 */

vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

const editorMounts: Array<{ childId: string; projectId: string; initialVersion?: unknown }> = []
vi.mock('./BuildStudioEditor', () => ({
  default: (props: { childId: string; projectId: string; initialVersion?: unknown }) => {
    editorMounts.push({
      childId: props.childId,
      projectId: props.projectId,
      initialVersion: props.initialVersion,
    })
    return null
  },
}))

import {
  buildStudioSourceDigest,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import { holdPendingSave, resetPendingSaveStore } from './buildStudioPendingStore'
import type { PendingSave } from './buildStudioScope'
import { lanternCoveStarterFiles, LANTERN_COVE_PROJECT_ID } from './lanternCoveStarter'
import { VersionsStatus, type BuildStudioVersionsRead } from './useBuildStudioVersions'

const { default: BuildStudioChildEntry } = await import('./BuildStudioChildEntry')

const FAMILY = 'fam1'
const CHILD = 'c1'
const APPLE_PROJECT = 'apple-dash-starter'
const retryApple = vi.fn()
const retryCove = vi.fn()

function row(
  projectId: string,
  versionId: string,
  label: string,
  createdAt: string,
  files: BuildStudioSourceFiles,
): BuildStudioVersion {
  const sourceArchive = serializeBuildStudioSource(files)
  return {
    id: buildStudioVersionDocId(CHILD, projectId, versionId),
    childId: CHILD,
    projectId,
    versionId,
    label,
    createdAt,
    sourceArchive,
    byteSize: sourceArchive.length,
    fileCount: Object.keys(files).length,
    sourceDigest: buildStudioSourceDigest(sourceArchive),
  }
}

const APPLE_ROW = row(APPLE_PROJECT, 'v-apple', 'My rocket version', '2026-11-17T01:00:00.000Z', {
  'main.ts': 'let a = 1',
  'pxt.json': '{}',
})
const COVE_ROW = row(
  LANTERN_COVE_PROJECT_ID,
  'v-cove',
  'Cove at dusk',
  '2026-11-18T01:00:00.000Z',
  lanternCoveStarterFiles(),
)
/** Looks like a save, but the map pair is gone. */
const COVE_BROKEN = row(
  LANTERN_COVE_PROJECT_ID,
  'v-broken',
  'Half a cove',
  '2026-11-19T01:00:00.000Z',
  { 'pxt.json': lanternCoveStarterFiles()['pxt.json'], 'main.ts': lanternCoveStarterFiles()['main.ts'] },
)

function read(
  projectId: string,
  status: BuildStudioVersionsRead['status'],
  versions: BuildStudioVersion[] = [],
): BuildStudioVersionsRead {
  return {
    status,
    versions,
    childId: CHILD,
    projectId,
    error: null,
    retry: projectId === APPLE_PROJECT ? retryApple : retryCove,
  }
}

function entry(apple: BuildStudioVersionsRead, cove?: BuildStudioVersionsRead) {
  return (
    <BuildStudioChildEntry
      familyId={FAMILY}
      childId={CHILD}
      childName="Lincoln"
      projectId={APPLE_PROJECT}
      versions={apple}
      gameReads={cove ? { [LANTERN_COVE_PROJECT_ID]: cove } : undefined}
    />
  )
}

const settled = (appleRows: BuildStudioVersion[] = [], coveRows: BuildStudioVersion[] = []) =>
  entry(
    read(APPLE_PROJECT, VersionsStatus.Ready, appleRows),
    read(LANTERN_COVE_PROJECT_ID, VersionsStatus.Ready, coveRows),
  )

beforeEach(() => {
  editorMounts.length = 0
  retryApple.mockClear()
  retryCove.mockClear()
  resetPendingSaveStore()
})
afterEach(cleanup)

const card = (name: RegExp) => screen.getByRole('region', { name })

describe('two editable cards and one play-only card', () => {
  it('draws Apple Dash and Lantern Cove as separate named cards, each with its own controls', () => {
    render(settled([APPLE_ROW], [COVE_ROW]))
    const apple = card(/Apple Dash/)
    const cove = card(/Lantern Cove/)
    expect(within(apple).getByText(/My rocket version/)).toBeInTheDocument()
    expect(within(apple).queryByText(/Cove at dusk/)).not.toBeInTheDocument()
    expect(within(cove).getByText(/Cove at dusk/)).toBeInTheDocument()
    expect(within(cove).queryByText(/My rocket version/)).not.toBeInTheDocument()
    expect(within(apple).getByText('🍎 Start Apple Dash')).toBeInTheDocument()
    expect(within(cove).getByText('🏮 Start Lantern Cove')).toBeInTheDocument()
    expect(within(cove).getByText('▶ Continue my saved game')).toBeInTheDocument()
  })

  it('keeps ONE Block Muncher card — the play-only card is not repeated per game', () => {
    render(settled([APPLE_ROW], [COVE_ROW]))
    expect(screen.getAllByRole('region', { name: /Block Muncher/ })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /Play Block Muncher/ })).toHaveLength(1)
  })

  it('offers a single starter for a settled empty Lantern Cove shelf', () => {
    render(settled([APPLE_ROW], []))
    const cove = card(/Lantern Cove/)
    expect(within(cove).getByText('Nothing saved yet.')).toBeInTheDocument()
    expect(within(cove).queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(within(cove).getByText('🏮 Start Lantern Cove')).toBeInTheDocument()
  })

  it('shows a Lantern Cove read that is unsettled as looking, with no starter over it', () => {
    render(
      entry(
        read(APPLE_PROJECT, VersionsStatus.Ready, [APPLE_ROW]),
        read(LANTERN_COVE_PROJECT_ID, VersionsStatus.Loading),
      ),
    )
    const cove = card(/Lantern Cove/)
    expect(within(cove).getByText('Looking for your saved games…')).toBeInTheDocument()
    expect(within(cove).queryByText('🏮 Start Lantern Cove')).not.toBeInTheDocument()
    // Apple Dash is not held up by it.
    expect(within(card(/Apple Dash/)).getByText('▶ Continue my saved game')).toBeInTheDocument()
  })

  it('a failed Lantern Cove read is not an empty shelf, and retries its own read', () => {
    render(
      entry(
        read(APPLE_PROJECT, VersionsStatus.Ready, [APPLE_ROW]),
        read(LANTERN_COVE_PROJECT_ID, VersionsStatus.Failed),
      ),
    )
    const cove = card(/Lantern Cove/)
    expect(within(cove).queryByText('Nothing saved yet.')).not.toBeInTheDocument()
    expect(within(cove).getByText('🏮 Start Lantern Cove')).toBeInTheDocument()
    within(cove).getByText('Try again').click()
    expect(retryCove).toHaveBeenCalledTimes(1)
  })

  it('a caller that knows of one game keeps exactly one editable card', () => {
    render(entry(read(APPLE_PROJECT, VersionsStatus.Ready, [APPLE_ROW])))
    expect(screen.queryByRole('region', { name: /Lantern Cove/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Apple Dash/ })).toBeInTheDocument()
  })
})

describe('one choice opens one editor, for that game', () => {
  it('Start Lantern Cove mounts exactly one editor on the Lantern Cove project, from its starter', async () => {
    render(settled([APPLE_ROW], [COVE_ROW]))
    await act(async () => {
      within(card(/Lantern Cove/)).getByText('🏮 Start Lantern Cove').click()
    })
    expect(editorMounts).toHaveLength(1)
    expect(editorMounts[0]).toMatchObject({
      childId: CHILD,
      projectId: LANTERN_COVE_PROJECT_ID,
      initialVersion: null,
    })
    // The chooser is gone: no second card to mount a second editor from.
    expect(screen.queryByRole('region', { name: /Apple Dash/ })).not.toBeInTheDocument()
  })

  it('Continue on Lantern Cove opens the exact saved row; Continue on Apple Dash is unchanged', async () => {
    render(settled([APPLE_ROW], [COVE_ROW]))
    await act(async () => {
      within(card(/Lantern Cove/)).getByText('▶ Continue my saved game').click()
    })
    expect(editorMounts.at(-1)?.projectId).toBe(LANTERN_COVE_PROJECT_ID)
    expect(editorMounts.at(-1)?.initialVersion).toBe(COVE_ROW)

    cleanup()
    editorMounts.length = 0
    render(settled([APPLE_ROW], [COVE_ROW]))
    await act(async () => {
      within(card(/Apple Dash/)).getByText('▶ Continue my saved game').click()
    })
    expect(editorMounts).toHaveLength(1)
    expect(editorMounts[0].projectId).toBe(APPLE_PROJECT)
    expect(editorMounts[0].initialVersion).toBe(APPLE_ROW)
  })

  it('a row that is not Lantern Cove’s opens nothing, even if it is this child’s', async () => {
    // An Apple Dash row smuggled onto the Lantern Cove shelf.
    render(settled([APPLE_ROW], [APPLE_ROW]))
    await act(async () => {
      within(card(/Lantern Cove/)).getByText('▶ Continue my saved game').click()
    })
    expect(editorMounts).toHaveLength(0)
    expect(
      within(card(/Lantern Cove/)).getByText(/not part of this one, so nothing was opened/),
    ).toBeInTheDocument()
  })

  it('a saved Lantern Cove that lost its map opens nothing, says so on ITS card, and leaves the starter as its own choice', async () => {
    render(settled([APPLE_ROW], [COVE_BROKEN, COVE_ROW]))
    const cove = card(/Lantern Cove/)
    await act(async () => {
      within(cove).getByText('▶ Continue my saved game').click()
    })
    expect(editorMounts).toHaveLength(0)
    expect(within(cove).getByText(/missing part of its map or blocks/)).toBeInTheDocument()
    expect(within(card(/Apple Dash/)).queryByText(/missing part of its map/)).not.toBeInTheDocument()
    // The ORIGINAL starter is still there, but only as an explicit tap.
    expect(within(cove).getByText('🏮 Start Lantern Cove')).toBeInTheDocument()
  })
})

describe('work that did not land comes first, whichever game owns it', () => {
  const heldFor = (projectId: string): PendingSave => ({
    scope: { familyId: FAMILY, childId: CHILD, projectId, visitId: 's-old', versionId: null },
    versionId: 'v-unfinished',
    label: 'Half done',
    createdAt: '2026-11-17T02:00:00.000Z',
    files: { 'main.ts': 'let a = 2', 'pxt.json': '{}' },
    attempts: 1,
    capturedSignature: 'sig',
  })

  it('opens the Lantern Cove studio on arrival when ITS save is the one waiting', () => {
    holdPendingSave({ familyId: FAMILY, childId: CHILD, projectId: LANTERN_COVE_PROJECT_ID }, heldFor(LANTERN_COVE_PROJECT_ID))
    render(settled([APPLE_ROW], [COVE_ROW]))
    expect(editorMounts).toHaveLength(1)
    expect(editorMounts[0].projectId).toBe(LANTERN_COVE_PROJECT_ID)
    expect(screen.queryByText(/Block Muncher/)).not.toBeInTheDocument()
  })

  it('a tap on Apple Dash is held when a Lantern Cove save turned up, names the game, and opens THAT studio', async () => {
    render(settled([APPLE_ROW], [COVE_ROW]))
    holdPendingSave({ familyId: FAMILY, childId: CHILD, projectId: LANTERN_COVE_PROJECT_ID }, heldFor(LANTERN_COVE_PROJECT_ID))
    await act(async () => {
      within(card(/Apple Dash/)).getByText('🍎 Start Apple Dash').click()
    })
    expect(editorMounts).toHaveLength(0)
    expect(screen.getByText('Something from last time is still here')).toBeInTheDocument()
    expect(screen.getByText(/“Half done” did not finish in Lantern Cove, so that comes first/)).toBeInTheDocument()
    await act(async () => {
      screen.getByText('Open my studio').click()
    })
    expect(editorMounts).toHaveLength(1)
    expect(editorMounts[0].projectId).toBe(LANTERN_COVE_PROJECT_ID)
  })

  it('Apple Dash’s own held save keeps its exact released wording', async () => {
    render(settled([APPLE_ROW], [COVE_ROW]))
    holdPendingSave({ familyId: FAMILY, childId: CHILD, projectId: APPLE_PROJECT }, heldFor(APPLE_PROJECT))
    await act(async () => {
      within(card(/Lantern Cove/)).getByText('🏮 Start Lantern Cove').click()
    })
    expect(editorMounts).toHaveLength(0)
    expect(screen.getByText('A save called “Half done” did not finish, so that comes first.')).toBeInTheDocument()
  })

  it('a save held for ANOTHER child is not this child’s', () => {
    holdPendingSave(
      { familyId: FAMILY, childId: 'someone-else', projectId: LANTERN_COVE_PROJECT_ID },
      {
        ...heldFor(LANTERN_COVE_PROJECT_ID),
        scope: { familyId: FAMILY, childId: 'someone-else', projectId: LANTERN_COVE_PROJECT_ID, visitId: 's', versionId: null },
      },
    )
    render(settled([APPLE_ROW], [COVE_ROW]))
    expect(editorMounts).toHaveLength(0)
    expect(screen.getByRole('region', { name: /Lantern Cove/ })).toBeInTheDocument()
  })
})
