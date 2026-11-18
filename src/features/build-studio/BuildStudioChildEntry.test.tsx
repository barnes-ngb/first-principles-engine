import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The child's door: which game opens, and what is NEVER chosen for him.
 *
 * Every case here is about a decision, not a layout. The states a shelf read
 * can be in are four and they are four different sentences — looking, failed,
 * settled-and-empty, settled-with-saves — and this screen is where "a read that
 * failed is not an empty shelf" stops being an argument and becomes something
 * a seven-year-old reads. Beyond that: the chosen version is the EXACT one the
 * label named, a later snapshot cannot swap it, a second tap cannot change it,
 * an answer about another child is not an answer, and work that did not land
 * comes before any of it.
 */

// The hook module is real — `versionBelongsTo` and `VersionsStatus` are the
// product's own — so the collection accessor is stubbed and this suite
// initialises no Firebase app.
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

/** Every set of props the editor was mounted with, newest last. */
const editorProps: Array<{
  familyId: string
  childId: string
  projectId: string
  childVoiceInputEnhanced?: boolean
  initialVersion?: BuildStudioVersion | null
}> = []
vi.mock('./BuildStudioEditor', () => ({
  default: (props: {
    familyId: string
    childId: string
    projectId: string
    childVoiceInputEnhanced?: boolean
    initialVersion?: BuildStudioVersion | null
  }) => {
    editorProps.push({
      familyId: props.familyId,
      childId: props.childId,
      projectId: props.projectId,
      childVoiceInputEnhanced: props.childVoiceInputEnhanced,
      initialVersion: props.initialVersion,
    })
    return null
  },
}))

import {
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import {
  holdPendingNote,
  holdPendingSave,
  readPendingSave,
  resetPendingSaveStore,
} from './buildStudioPendingStore'
import { savedLine } from './buildStudioSavedLine'
import type { PendingNote, PendingSave } from './buildStudioScope'
import { VersionsStatus, type BuildStudioVersionsRead } from './useBuildStudioVersions'

const { default: BuildStudioChildEntry } = await import('./BuildStudioChildEntry')

const OWNER = { familyId: 'fam1', childId: 'c1', projectId: 'apple-dash-starter' }

/** A stored version, with the document id the real writer would have given it. */
function savedVersion(
  versionId: string,
  label: string,
  createdAt: string,
  overrides: Partial<BuildStudioVersion> = {},
): BuildStudioVersion {
  const childId = overrides.childId ?? OWNER.childId
  const projectId = overrides.projectId ?? OWNER.projectId
  return {
    id: buildStudioVersionDocId(childId, projectId, versionId),
    childId,
    projectId,
    versionId,
    label,
    createdAt,
    sourceArchive: serializeBuildStudioSource({
      'main.ts': 'let apples = 1',
      'pxt.json': '{"name":"Apple Dash"}',
    }),
    byteSize: 64,
    fileCount: 2,
    sourceDigest: 'digest-1',
    ...overrides,
  }
}

const NEWEST = savedVersion('v-newest', 'My rocket version', '2026-11-17T01:00:00.000Z')
const OLDER = savedVersion('v-older', 'My first version', '2026-11-10T01:00:00.000Z')

const retry = vi.fn()

/** The page's read, in each of the states it can really be in. */
const readyRead = (versions: BuildStudioVersion[]): BuildStudioVersionsRead => ({
  status: VersionsStatus.Ready,
  // Newest first, as `useBuildStudioVersions` sorts them.
  versions,
  childId: OWNER.childId,
  projectId: OWNER.projectId,
  error: null,
  retry,
})
const loadingRead = (): BuildStudioVersionsRead => ({
  ...readyRead([]),
  status: VersionsStatus.Loading,
  childId: null,
  projectId: null,
})
const failedRead = (): BuildStudioVersionsRead => ({
  ...readyRead([]),
  status: VersionsStatus.Failed,
  error: 'permission-denied',
})

function entry(read: BuildStudioVersionsRead, childId = OWNER.childId) {
  return (
    <BuildStudioChildEntry
      familyId={OWNER.familyId}
      childId={childId}
      childName="Lincoln"
      projectId={OWNER.projectId}
      childVoiceInputEnhanced
      versions={read}
      onOutOfScopeSave={vi.fn()}
    />
  )
}

const lastEditor = () => editorProps.at(-1)
const tap = async (text: string) => {
  await act(async () => {
    screen.getByText(text).click()
  })
}

/** An unfinished Save, held for this owner exactly as a failed write holds it. */
function heldSave(label: string): PendingSave {
  return {
    scope: { ...OWNER, visitId: 's-old', versionId: null },
    versionId: 'v-unfinished',
    label,
    createdAt: '2026-11-17T02:00:00.000Z',
    files: { 'main.ts': 'let apples = 2', 'pxt.json': '{}' },
    attempts: 1,
    capturedSignature: 'sig-unfinished',
  }
}

/** Words nobody wrote down, held for this owner. */
function heldWords(): PendingNote {
  return {
    target: {
      ...OWNER,
      versionId: 'v-older',
      versionDocId: OLDER.id,
      visitId: 's-old',
      noteActionId: 'n-1',
      help: 'none-offered',
    },
    text: 'I made the apples fall faster',
    capture: 'voice',
    createdAt: '2026-11-17T02:00:00.000Z',
    attempts: 0,
    state: 'unsent',
  }
}

beforeEach(() => {
  editorProps.length = 0
  retry.mockClear()
  resetPendingSaveStore()
})
afterEach(cleanup)

describe('the entry opens nothing until the child says which game', () => {
  it('mounts no editor — and so imports nothing — before a choice', () => {
    render(entry(readyRead([NEWEST, OLDER])))
    expect(editorProps).toHaveLength(0)
    expect(screen.getByText('▶ Continue my saved game')).toBeInTheDocument()
    expect(screen.getByText('🍎 Start Apple Dash')).toBeInTheDocument()
  })

  it('names the newest save and when it was saved, before the tap', () => {
    render(entry(readyRead([NEWEST, OLDER])))
    const line = screen.getByText(/That opens/)
    expect(line.textContent).toContain(NEWEST.label)
    expect(line.textContent).toContain(savedLine(NEWEST.createdAt))
    // The offer is about the NEWEST one and says so by naming only it.
    expect(line.textContent).not.toContain(OLDER.label)
  })

  it('hands the editor the EXACT version the label named', async () => {
    render(entry(readyRead([NEWEST, OLDER])))
    await tap('▶ Continue my saved game')
    expect(lastEditor()?.initialVersion).toBe(NEWEST)
    // And the identity it carries is unchanged in every part.
    expect(lastEditor()).toMatchObject({
      familyId: OWNER.familyId,
      childId: OWNER.childId,
      projectId: OWNER.projectId,
      childVoiceInputEnhanced: true,
    })
  })

  it('starts the starter with NO initial version when that is the choice', async () => {
    render(entry(readyRead([NEWEST, OLDER])))
    await tap('🍎 Start Apple Dash')
    expect(editorProps).not.toHaveLength(0)
    expect(lastEditor()?.initialVersion).toBeNull()
  })

  /**
   * POSITIVE CONTROL for the frozen click: drop the `launchedRef` latch and the
   * second tap in this gesture replaces the answer, so the starter opens after
   * he asked for his saved game.
   */
  it('is one frozen click — a second tap cannot change the game', async () => {
    render(entry(readyRead([NEWEST, OLDER])))
    await act(async () => {
      screen.getByText('▶ Continue my saved game').click()
      screen.getByText('🍎 Start Apple Dash').click()
    })
    expect(editorProps.every((p) => p.initialVersion === NEWEST)).toBe(true)
  })

  it('does not let a later snapshot swap the game that is open', async () => {
    const { rerender } = render(entry(readyRead([NEWEST, OLDER])))
    await tap('▶ Continue my saved game')
    const newer = savedVersion('v-newer', 'Saved while he was deciding', '2026-11-18T01:00:00.000Z')
    rerender(entry(readyRead([newer, NEWEST, OLDER])))
    expect(lastEditor()?.initialVersion).toBe(NEWEST)
  })

  it('puts keyboard focus into the studio after an explicit launch', async () => {
    render(entry(readyRead([NEWEST])))
    await tap('▶ Continue my saved game')
    const studio = screen.getByRole('region', { name: /Build Studio/ })
    expect(document.activeElement).toBe(studio)
  })
})

describe('the four states a shelf read can be in', () => {
  it('says it is LOOKING and offers no game at all', () => {
    render(entry(loadingRead()))
    expect(screen.getByText('Looking for your saved games…')).toBeInTheDocument()
    expect(screen.queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(screen.queryByText('🍎 Start Apple Dash')).not.toBeInTheDocument()
    expect(editorProps).toHaveLength(0)
  })

  /**
   * The load-bearing one. A read that did not come back must never be reported
   * as an empty shelf, and the way forward is a retry plus an explicitly named
   * starter — never a starter that opens by itself.
   */
  it('offers Try again AND an explicit starter on a failure, claiming nothing', async () => {
    render(entry(failedRead()))
    expect(screen.getByText(/this is the list that didn/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing saved yet/)).not.toBeInTheDocument()
    expect(screen.queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(editorProps).toHaveLength(0)

    await tap('Try again')
    expect(retry).toHaveBeenCalledTimes(1)
    // The starter is still a choice, and it is still a tap.
    await tap('🍎 Start Apple Dash')
    expect(lastEditor()?.initialVersion).toBeNull()
  })

  it('offers exactly ONE choice on a settled, genuinely empty list', () => {
    render(entry(readyRead([])))
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument()
    expect(screen.queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(screen.getByText('🍎 Start Apple Dash')).toBeInTheDocument()
  })

  /**
   * `A → B → A`. The read carries the child and project it is ABOUT, and an
   * answer about anybody else is not settled — so no label, date or choice can
   * come out of another child's list.
   */
  it('treats a read about another child as not settled', () => {
    render(entry(readyRead([NEWEST, OLDER]), 'c-sibling'))
    expect(screen.getByText('Looking for your saved games…')).toBeInTheDocument()
    expect(screen.queryByText(NEWEST.label)).not.toBeInTheDocument()
  })

  it('treats a read about another project as not settled', () => {
    render(
      entry({ ...readyRead([NEWEST]), projectId: 'some-other-project' }),
    )
    expect(screen.getByText('Looking for your saved games…')).toBeInTheDocument()
  })

  it('refuses a row that is not this child’s in this project, and opens nothing', async () => {
    const foreign = savedVersion('v-foreign', 'Not his', '2026-11-17T01:00:00.000Z', {
      childId: 'c-sibling',
    })
    render(entry(readyRead([foreign])))
    await tap('▶ Continue my saved game')
    expect(editorProps).toHaveLength(0)
    expect(screen.getByText(/not part of this one/)).toBeInTheDocument()
    // The way forward is still there and still explicit.
    await tap('🍎 Start Apple Dash')
    expect(lastEditor()?.initialVersion).toBeNull()
  })
})

describe('work that did not land comes before any game', () => {
  it('opens the studio without asking when an unfinished save is waiting', () => {
    holdPendingSave(OWNER, heldSave('My rocket version'))
    render(entry(readyRead([NEWEST, OLDER])))
    // No question at all: the retry surface is reachable without first
    // choosing a saved game.
    expect(screen.queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(editorProps).not.toHaveLength(0)
    expect(lastEditor()?.initialVersion).toBeNull()
    // And it is still held — nothing here resolved it.
    expect(readPendingSave(OWNER)?.label).toBe('My rocket version')
  })

  it('opens the studio without asking when unsaved words are waiting', () => {
    holdPendingNote(OWNER, heldWords())
    render(entry(readyRead([NEWEST])))
    expect(screen.queryByText('▶ Continue my saved game')).not.toBeInTheDocument()
    expect(editorProps).not.toHaveLength(0)
  })

  it('leaves another child’s held work alone', () => {
    holdPendingSave(
      { ...OWNER, childId: 'c-sibling' },
      {
        ...heldSave('Sibling save'),
        scope: { ...OWNER, childId: 'c-sibling', visitId: 's-old', versionId: null },
      },
    )
    render(entry(readyRead([NEWEST])))
    // This child is still asked, because the waiting work is not his.
    expect(screen.getByText('▶ Continue my saved game')).toBeInTheDocument()
    expect(editorProps).toHaveLength(0)
  })

  /**
   * The recheck. A write started in an earlier mount can land in the recovery
   * slot while this screen is sitting there, so the slot is read again AT THE
   * TAP — and that work takes priority, said in a sentence, with one explicit
   * button into the studio rather than a game chosen for him.
   */
  it('rechecks at the tap, and the save that turned up takes priority', async () => {
    render(entry(readyRead([NEWEST, OLDER])))
    holdPendingSave(OWNER, heldSave('My rocket version'))

    await tap('▶ Continue my saved game')
    // Nothing opened, and the unfinished save is NAMED.
    expect(editorProps).toHaveLength(0)
    expect(screen.getByText(/did not finish/).textContent).toContain('My rocket version')

    await tap('Open my studio')
    expect(lastEditor()?.initialVersion).toBeNull()
    // Untouched: the exact payload is still the editor's to retry.
    expect(readPendingSave(OWNER)?.versionId).toBe('v-unfinished')
  })

  it('rechecks at the tap for words as well', async () => {
    render(entry(readyRead([NEWEST])))
    holdPendingNote(OWNER, heldWords())
    await tap('🍎 Start Apple Dash')
    expect(editorProps).toHaveLength(0)
    expect(screen.getByText(/have not been written down yet/)).toBeInTheDocument()
    await tap('Open my studio')
    expect(editorProps).not.toHaveLength(0)
  })
})
