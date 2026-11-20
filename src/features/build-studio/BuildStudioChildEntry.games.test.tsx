import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The games shelf (LOCAL-VISION-007, slice 1): Apple Dash keeps every control it
 * had, in its own card, and Block Muncher is a play-only link beside it.
 *
 * What is pinned is the boundary: the link is fixed and opens a separate tab, it
 * gives the studio nothing to save or request, it is not drawn while the shelf
 * read is unsettled or about somebody else, and held work still wins on arrival.
 */

vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

const editorMounts: Array<{ childId: string; initialVersion?: unknown }> = []
vi.mock('./BuildStudioEditor', () => ({
  default: (props: { childId: string; initialVersion?: unknown }) => {
    editorMounts.push({ childId: props.childId, initialVersion: props.initialVersion })
    return null
  },
}))

import {
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import { holdPendingNote, holdPendingSave, resetPendingSaveStore } from './buildStudioPendingStore'
import type { PendingNote, PendingSave } from './buildStudioScope'
import { EDITABLE_GAMES, PLAY_ONLY_GAMES } from './buildStudioGames'
import { VersionsStatus, type BuildStudioVersionsRead } from './useBuildStudioVersions'

const { default: BuildStudioChildEntry } = await import('./BuildStudioChildEntry')

const OWNER = { familyId: 'fam1', childId: 'c1', projectId: 'apple-dash-starter' }
const retry = vi.fn()

function saved(versionId: string, label: string, createdAt: string): BuildStudioVersion {
  return {
    id: buildStudioVersionDocId(OWNER.childId, OWNER.projectId, versionId),
    childId: OWNER.childId,
    projectId: OWNER.projectId,
    versionId,
    label,
    createdAt,
    sourceArchive: serializeBuildStudioSource({ 'main.ts': 'let a = 1', 'pxt.json': '{}' }),
    byteSize: 10,
    fileCount: 2,
    sourceDigest: 'd',
  }
}

const NEWEST = saved('v-newest', 'My rocket version', '2026-11-17T01:00:00.000Z')

const read = (
  status: BuildStudioVersionsRead['status'],
  versions: BuildStudioVersion[] = [],
  childId: string | null = OWNER.childId,
): BuildStudioVersionsRead => ({
  status,
  versions,
  childId,
  projectId: OWNER.projectId,
  error: null,
  retry,
})

function entry(r: BuildStudioVersionsRead) {
  return (
    <BuildStudioChildEntry
      familyId={OWNER.familyId}
      childId={OWNER.childId}
      childName="Lincoln"
      projectId={OWNER.projectId}
      versions={r}
    />
  )
}

beforeEach(() => {
  editorMounts.length = 0
  retry.mockClear()
  resetPendingSaveStore()
})
afterEach(cleanup)

const BLOCK_MUNCHER_URL = 'https://barnes-ngb.github.io/block-muncher/'

describe('the catalogs keep editable and play-only games apart', () => {
  it('has Apple Dash as the only editable game, with its existing project id', () => {
    expect(EDITABLE_GAMES.map((g) => g.id)).toEqual(['apple-dash'])
    expect(EDITABLE_GAMES[0].projectId).toBe('apple-dash-starter')
  })

  it('has Block Muncher as a play-only link with no project of its own', () => {
    expect(PLAY_ONLY_GAMES).toHaveLength(1)
    expect(PLAY_ONLY_GAMES[0].url).toBe(BLOCK_MUNCHER_URL)
    expect(PLAY_ONLY_GAMES[0]).not.toHaveProperty('projectId')
    expect(EDITABLE_GAMES.some((g) => g.id === PLAY_ONLY_GAMES[0].id)).toBe(false)
  })
})

describe('the settled chooser shows two cards', () => {
  it('groups every Apple Dash control in its own card', () => {
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    const apple = screen.getByRole('region', { name: /Apple Dash/ })
    expect(within(apple).getByText('▶ Continue my saved game')).toBeInTheDocument()
    expect(within(apple).getByText('🍎 Start Apple Dash')).toBeInTheDocument()
    expect(within(apple).getByText(/My rocket version/)).toBeInTheDocument()
    // …and nothing of Block Muncher's is inside it.
    expect(within(apple).queryByText(/Block Muncher/)).not.toBeInTheDocument()
  })

  it('gives Block Muncher a fixed, accessible Play link in a separate tab', () => {
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    const card = screen.getByRole('region', { name: /Block Muncher/ })
    const play = within(card).getByRole('link', {
      name: 'Play Block Muncher (opens in a new tab)',
    })
    expect(play).toHaveAttribute('href', BLOCK_MUNCHER_URL)
    expect(play).toHaveAttribute('target', '_blank')
    expect(play.getAttribute('rel')).toContain('noopener')
    // Phone-sized tap target.
    expect(play).toHaveStyle({ minHeight: '56px' })
  })

  it('shows both cards for a settled empty shelf too', () => {
    render(entry(read(VersionsStatus.Ready, [])))
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Play Block Muncher/ })).toBeInTheDocument()
  })

  it('following the link opens no editor and leaves the chooser in place', () => {
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    const play = screen.getByRole('link', { name: /Play Block Muncher/ })
    // The browser follows a target=_blank link; the app has no handler to run.
    fireEvent.click(play)
    expect(editorMounts).toHaveLength(0)
    expect(screen.getByText('▶ Continue my saved game')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Play Block Muncher/ })).toBeInTheDocument()
  })

  it('Apple Dash still opens the exact saved game and the prepared starter', async () => {
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    await act(async () => {
      screen.getByText('▶ Continue my saved game').click()
    })
    expect(editorMounts.at(-1)?.initialVersion).toBe(NEWEST)
    cleanup()
    editorMounts.length = 0
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    await act(async () => {
      screen.getByText('🍎 Start Apple Dash').click()
    })
    expect(editorMounts.at(-1)?.initialVersion).toBeNull()
  })
})

describe('waiting, failed and foreign reads stay distinct', () => {
  it('offers nothing — not even the Play link — while the read is unsettled', () => {
    render(entry(read(VersionsStatus.Loading, [], null)))
    expect(screen.getByText('Looking for your saved games…')).toBeInTheDocument()
    expect(screen.queryByText(/Block Muncher/)).not.toBeInTheDocument()
    expect(screen.queryByText('🍎 Start Apple Dash')).not.toBeInTheDocument()
  })

  it('treats a list about another child as unsettled', () => {
    render(entry(read(VersionsStatus.Ready, [NEWEST], 'someone-else')))
    expect(screen.getByText('Looking for your saved games…')).toBeInTheDocument()
    expect(screen.queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(screen.queryByText(/Block Muncher/)).not.toBeInTheDocument()
  })

  it('says the list did not load, never "nothing saved", and keeps the starter', () => {
    render(entry(read(VersionsStatus.Failed)))
    expect(screen.getByText(/this is the list that didn.t load/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing saved yet.')).not.toBeInTheDocument()
    expect(screen.getByText('🍎 Start Apple Dash')).toBeInTheDocument()
    screen.getByText('Try again').click()
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('work that did not land still comes first', () => {
  const heldSave: PendingSave = {
    scope: { ...OWNER, visitId: 's-old', versionId: null },
    versionId: 'v-unfinished',
    label: 'Half done',
    createdAt: '2026-11-17T02:00:00.000Z',
    files: { 'main.ts': 'let a = 2', 'pxt.json': '{}' },
    attempts: 1,
    capturedSignature: 'sig',
  }

  it('opens the studio on arrival and draws no chooser or play card', () => {
    holdPendingSave(OWNER, heldSave)
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    expect(editorMounts).toHaveLength(1)
    expect(screen.queryByText(/Block Muncher/)).not.toBeInTheDocument()
  })

  it('a stale click is refused once words turn up, and the link is not a way round it', async () => {
    render(entry(read(VersionsStatus.Ready, [NEWEST])))
    const words: PendingNote = {
      target: {
        ...OWNER,
        versionId: 'v-newest',
        versionDocId: NEWEST.id,
        visitId: 's-old',
        noteActionId: 'n-1',
        help: 'none-offered',
      },
      text: 'I made it faster',
      capture: 'typed',
      createdAt: '2026-11-17T02:00:00.000Z',
      attempts: 0,
      state: 'unsent',
    }
    holdPendingNote(OWNER, words)
    await act(async () => {
      screen.getByText('🍎 Start Apple Dash').click()
    })
    expect(editorMounts).toHaveLength(0)
    expect(screen.getByText('Something from last time is still here')).toBeInTheDocument()
    // The held-work notice has one action; the play card is not drawn over it.
    expect(screen.queryByText(/Block Muncher/)).not.toBeInTheDocument()
  })
})
