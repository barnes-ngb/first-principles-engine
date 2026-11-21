import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lantern Cove through the REAL editor component (FEAT-247): the second editable
 * game rides the same editor, immutable archive and save path, and differs only
 * by its descriptor.
 *
 * The bridge is the same controllable stand-in the lifecycle suite uses, with one
 * addition that matters here: it applies the `acceptsFiles` rule the editor
 * hands it exactly where the real bridge does (on the capture), so "an
 * incomplete capture fails closed" is exercised through the editor's own wiring
 * and not asserted about a fake. The real bridge's side of that rule is covered
 * in `arcadeBridge.lanternCove.test.ts`.
 */

interface FakeProject {
  header: { id: string; name: string; target?: string; targetVersion?: string }
  files: Record<string, string>
}

interface FakeOptions {
  projectName: string
  acceptsFiles?: (files: Record<string, string>) => boolean
  newId: () => string
  onEditorLoaded?: () => void
  onEditorSave?: (p: FakeProject) => void
  isScopeLive: () => boolean
}

const bridges: FakeBridge[] = []

class FakeBridge {
  readonly frameId: string
  readonly options: FakeOptions
  nextCapture: Record<string, string> = {}
  captures = 0
  disposed = false
  imported: Record<string, string>[] = []

  constructor(options: FakeOptions) {
    this.options = options
    this.frameId = options.newId()
    bridges.push(this)
  }
  frameUrl() {
    return `https://arcade.makecode.com/?controller=1&frameId=${this.frameId}`
  }
  attach() {}
  handleMessage = () => {}
  isLoaded() {
    return true
  }
  editorSaveSeen() {
    return null
  }
  sourceOverCaps() {
    return false
  }
  oversizedSourceForDownload() {
    return null
  }
  runtimeVersions() {
    return null
  }
  async requestInfo() {
    return null
  }
  async importProject(files: Record<string, string>) {
    this.imported.push(files)
  }
  async switchToBlocks() {
    return true
  }
  async playFullscreen() {
    return true
  }
  async backToBlocks() {
    return true
  }
  async requestSnapshot(): Promise<FakeProject> {
    this.captures += 1
    const files = { ...this.nextCapture }
    // The real bridge's admission, at the real place: after the minimum shape,
    // before anything is handed to the caller.
    if (this.options.acceptsFiles && !this.options.acceptsFiles(files)) {
      throw Object.assign(
        new Error(
          'The editor said it saved but did not hand the game over. Nothing was saved — try Save again.',
        ),
        { kind: 'bad-project', tooBig: false },
      )
    }
    return { header: { id: 'h1', name: this.options.projectName, targetVersion: '0.0.0' }, files }
  }
  dispose() {
    this.disposed = true
  }
  ready() {
    this.options.onEditorLoaded?.()
  }
}

vi.mock('./arcadeBridge', () => ({
  ARCADE_OPENING_TIMEOUT_MS: 45_000,
  ArcadeBridge: FakeBridge,
}))

const saveVersion = vi.fn()
vi.mock('../../core/firebase/buildStudioVersionWrites', () => ({
  BuildStudioRefused: class extends Error {},
  saveBuildStudioVersion: (args: unknown) => saveVersion(args),
}))
vi.mock('../../core/firebase/buildStudioNoteWrites', () => ({
  BuildStudioNoteRefused: class extends Error {},
  saveBuildStudioNote: vi.fn(),
}))
vi.mock('react-router-dom', () => ({
  useBlocker: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
}))
const profileValue = {
  selectProfile: vi.fn(),
  registerProfileChangeGuard: () => () => {},
}
vi.mock('../../core/profile/useProfile', () => ({ useProfile: () => profileValue }))
vi.mock('../../core/hooks/useTTS', () => ({ useTTS: () => ({ speak: vi.fn() }) }))
vi.mock('../../components/VoiceInput', () => ({ default: () => null }))
vi.mock('./BuildStudioVersionShelf', () => ({ default: () => null }))
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import {
  buildStudioSourceDigest,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../../core/types/buildStudio'
import { readPendingSave, resetPendingSaveStore } from './buildStudioPendingStore'
import { starterSourceFiles } from './buildStudioStarter'
import {
  LANTERN_COVE_ARCHIVE_INCOMPLETE,
  LANTERN_COVE_PROJECT_ID,
  lanternCoveStarterFiles,
} from './lanternCoveStarter'
import { VersionsStatus } from './useBuildStudioVersions'

const { default: BuildStudioEditor } = await import('./BuildStudioEditor')

const FAMILY = 'fam1'
const CHILD = 'c1'
const COVE = { familyId: FAMILY, childId: CHILD, projectId: LANTERN_COVE_PROJECT_ID }
const APPLE = { familyId: FAMILY, childId: CHILD, projectId: 'apple-dash-starter' }

/** The starter with the hero's starting spot moved — the suggested first edit. */
function movedHero(): BuildStudioSourceFiles {
  const files = lanternCoveStarterFiles()
  return {
    ...files,
    'main.ts': files['main.ts'].replace(
      'tiles.placeOnTile(hero, tiles.getTileLocation(1, 1))',
      'tiles.placeOnTile(hero, tiles.getTileLocation(3, 2))',
    ),
  }
}

function storedVersion(
  files: BuildStudioSourceFiles,
  label = 'Cove v2',
  versionId = 'v-cove-2',
): BuildStudioVersion {
  const sourceArchive = serializeBuildStudioSource(files)
  return {
    id: buildStudioVersionDocId(CHILD, LANTERN_COVE_PROJECT_ID, versionId),
    childId: CHILD,
    projectId: LANTERN_COVE_PROJECT_ID,
    versionId,
    label,
    createdAt: '2026-11-20T10:00:00.000Z',
    sourceArchive,
    byteSize: sourceArchive.length,
    fileCount: Object.keys(files).length,
    sourceDigest: buildStudioSourceDigest(sourceArchive),
  }
}

const onOutOfScopeSave = vi.fn()

function element(projectId: string, initialVersion?: BuildStudioVersion | null) {
  return (
    <BuildStudioEditor
      familyId={FAMILY}
      childId={CHILD}
      childName="Lincoln"
      projectId={projectId}
      initialVersion={initialVersion}
      onOutOfScopeSave={onOutOfScopeSave}
      versions={{
        status: VersionsStatus.Ready,
        versions: [],
        childId: CHILD,
        projectId,
        error: null,
        retry: vi.fn(),
      }}
    />
  )
}

/** Mount, make the fake editor return `capture`, finish the handshake. */
async function open(
  projectId: string,
  capture: BuildStudioSourceFiles,
  initialVersion?: BuildStudioVersion | null,
) {
  const view = render(element(projectId, initialVersion))
  const bridge = bridges[bridges.length - 1]
  bridge.nextCapture = capture
  await act(async () => {
    bridge.ready()
  })
  await waitFor(() => expect(bridge.captures).toBeGreaterThan(0))
  return { bridge, view }
}

async function openReady(
  projectId: string,
  capture: BuildStudioSourceFiles,
  initialVersion?: BuildStudioVersion | null,
) {
  const opened = await open(projectId, capture, initialVersion)
  await waitFor(() => expect(screen.getByText('💾 Save my version')).toBeEnabled())
  return opened
}

async function tapSave() {
  await act(async () => {
    screen.getByText('💾 Save my version').click()
  })
}

beforeEach(() => {
  bridges.length = 0
  onOutOfScopeSave.mockClear()
  saveVersion.mockReset()
  saveVersion.mockImplementation(async (args: { versionId: string }) => ({
    outcome: 'created',
    version: { id: `doc-${args.versionId}` },
  }))
  resetPendingSaveStore()
})
afterEach(cleanup)

describe('opening the starter', () => {
  it('imports the five staged files untouched, binds on the manifest name, and enforces the whole archive', async () => {
    const { bridge } = await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    expect(bridge.imported).toHaveLength(1)
    expect(bridge.imported[0]).toEqual(lanternCoveStarterFiles())
    expect(bridge.options.projectName).toBe('Lantern Cove')
    expect(typeof bridge.options.acceptsFiles).toBe('function')
  })

  it('says it is a prepared starter, and suggests moving the hero’s starting spot', async () => {
    await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    expect(screen.getByText(/This is a prepared starter game\. Walk around the cove/)).toBeInTheDocument()
    expect(screen.getByText(/move your hero’s starting spot/)).toBeInTheDocument()
  })

  it('draws none of Apple Dash’s surfaces: no challenge help, no numbers list, no reflection, no PNG', async () => {
    await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    expect(screen.queryByText('Say what you were trying (if you want to)')).not.toBeInTheDocument()
    expect(screen.queryByText('Numbers you can change')).not.toBeInTheDocument()
    expect(screen.queryByText('💡 Hint')).not.toBeInTheDocument()
    expect(screen.queryByText(/starter project file/)).not.toBeInTheDocument()
    expect(screen.getByText('Change the game any way you like.')).toBeInTheDocument()
  })

  it('control: Apple Dash binds on its own name, enforces nothing extra, and keeps every surface', async () => {
    const { bridge } = await openReady('apple-dash-starter', starterSourceFiles())
    expect(bridge.options.projectName).toBe('Apple Dash starter')
    expect(bridge.options.acceptsFiles).toBeUndefined()
    expect(screen.getByText('Say what you were trying (if you want to)')).toBeInTheDocument()
    expect(screen.getByText('Numbers you can change')).toBeInTheDocument()
    expect(screen.queryByText(/move your hero’s starting spot/)).not.toBeInTheDocument()
  })

  it('turns saving OFF when the first readback has lost the map, and does not offer a partial copy', async () => {
    const { bridge } = await open(LANTERN_COVE_PROJECT_ID, {
      'pxt.json': lanternCoveStarterFiles()['pxt.json'],
      'main.ts': lanternCoveStarterFiles()['main.ts'],
    })
    await waitFor(() => expect(screen.getByText(/could not read the game back/)).toBeInTheDocument())
    expect(screen.getByText('💾 Save my version')).toBeDisabled()
    expect(saveVersion).not.toHaveBeenCalled()
    expect(bridge.disposed).toBe(false)
  })
})

describe('saving', () => {
  it('Lantern Cove: not credit-eligible, no challenge record, no goal id — and Apple Dash on the same path IS eligible', async () => {
    // Positive control first: if Apple Dash stopped being creditable the Lantern
    // Cove assertion below would prove nothing.
    const apple = await openReady('apple-dash-starter', starterSourceFiles())
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect(saveVersion.mock.calls[0][0].creditEligible).toBe(true)
    expect(saveVersion.mock.calls[0][0].projectId).toBe('apple-dash-starter')
    expect(apple.bridge.captures).toBeGreaterThan(1)
    cleanup()
    saveVersion.mockClear()
    resetPendingSaveStore()

    const { bridge } = await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    bridge.nextCapture = movedHero()
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    const args = saveVersion.mock.calls[0][0]
    expect(args.projectId).toBe(LANTERN_COVE_PROJECT_ID)
    expect(args.creditEligible).toBe(false)
    expect(args.files).toEqual(movedHero())
    expect('challengeAttempt' in args).toBe(false)
    expect(args.goalId).toBeUndefined()
    await waitFor(() =>
      expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument(),
    )
    expect(readPendingSave(COVE)).toBeNull()
  })

  it('retries a NAMED version with the same id, name, bytes and project after a failed write', async () => {
    const { bridge } = await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    bridge.nextCapture = movedHero()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name this save' }), {
      target: { value: 'Cove at dusk' },
    })
    saveVersion.mockRejectedValue(new Error('offline'))
    await tapSave()
    await waitFor(() => expect(screen.getByText('offline')).toBeInTheDocument())

    // The failed payload is held for ITS owner, exactly.
    const held = readPendingSave(COVE)
    expect(held?.label).toBe('Cove at dusk')
    expect(held?.files).toEqual(movedHero())
    expect(readPendingSave(APPLE)).toBeNull()

    const firstId = saveVersion.mock.calls[0][0].versionId
    for (const call of saveVersion.mock.calls) {
      expect(call[0].versionId).toBe(firstId)
      expect(call[0].label).toBe('Cove at dusk')
    }
    const capturesBeforeRetry = bridge.captures

    saveVersion.mockReset()
    saveVersion.mockImplementation(async (args: { versionId: string }) => ({
      outcome: 'created',
      version: { id: `doc-${args.versionId}` },
    }))
    await act(async () => {
      screen.getByText('Try again').click()
    })
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    const retried = saveVersion.mock.calls[0][0]
    expect(retried.versionId).toBe(firstId)
    expect(retried.label).toBe('Cove at dusk')
    expect(retried.files).toEqual(movedHero())
    expect(retried.projectId).toBe(LANTERN_COVE_PROJECT_ID)
    expect(retried.creditEligible).toBe(false)
    // A retry re-sends the held bytes; it does not re-read the editor.
    expect(bridge.captures).toBe(capturesBeforeRetry)
    await waitFor(() => expect(readPendingSave(COVE)).toBeNull())
  })

  it('fails CLOSED on an incomplete current capture: nothing is written, nothing earlier is reused', async () => {
    const { bridge } = await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    // The editor's current state has lost its map pair. The complete starter that
    // was captured a moment ago must not be substituted for it.
    bridge.nextCapture = {
      'pxt.json': lanternCoveStarterFiles()['pxt.json'],
      'main.ts': movedHero()['main.ts'],
      'main.blocks': lanternCoveStarterFiles()['main.blocks'],
    }
    await tapSave()
    await waitFor(() => expect(screen.getByText(/did not hand the game over/)).toBeInTheDocument())
    expect(saveVersion).not.toHaveBeenCalled()
    expect(readPendingSave(COVE)).toBeNull()
  })

  it('a delayed acknowledgement after leaving is reported out of scope and clears only its own held save', async () => {
    const { bridge, view } = await openReady(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles())
    bridge.nextCapture = movedHero()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name this save' }), {
      target: { value: 'Cove at dusk' },
    })
    let release: () => void = () => {}
    saveVersion.mockImplementation(
      (args: { versionId: string }) =>
        new Promise((resolve) => {
          release = () => resolve({ outcome: 'created', version: { id: `doc-${args.versionId}` } })
        }),
    )
    await tapSave()
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    // Held for its owner while the write is out.
    expect(readPendingSave(COVE)?.label).toBe('Cove at dusk')

    view.unmount()
    await act(async () => {
      release()
    })
    expect(onOutOfScopeSave).toHaveBeenCalledWith(expect.stringContaining('Cove at dusk'))
    await waitFor(() => expect(readPendingSave(COVE)).toBeNull())
  })
})

describe('reopening a saved Lantern Cove', () => {
  it('opens the exact saved bytes, reads clean, and says it is the child’s own saved game', async () => {
    const saved = storedVersion(movedHero())
    const { bridge } = await openReady(LANTERN_COVE_PROJECT_ID, movedHero(), saved)
    expect(bridge.imported).toHaveLength(1)
    expect(bridge.imported[0]).toEqual(movedHero())
    expect(screen.getByText(/You are back in your saved game “Cove v2”/)).toBeInTheDocument()
    // Not the starter, so no first-edit suggestion about the starter.
    expect(screen.queryByText(/move your hero’s starting spot/)).not.toBeInTheDocument()
    expect(screen.queryByText(/could not read the game back/)).not.toBeInTheDocument()
  })

  it('refuses a saved version that lost its map: nothing is imported and the starter is not substituted', async () => {
    const mapless: BuildStudioSourceFiles = {
      'pxt.json': lanternCoveStarterFiles()['pxt.json'],
      'main.ts': movedHero()['main.ts'],
      'main.blocks': lanternCoveStarterFiles()['main.blocks'],
    }
    const { bridge } = await open(LANTERN_COVE_PROJECT_ID, lanternCoveStarterFiles(), storedVersion(mapless))
    await waitFor(() =>
      expect(screen.getByText(LANTERN_COVE_ARCHIVE_INCOMPLETE)).toBeInTheDocument(),
    )
    expect(bridge.imported).toHaveLength(0)
    // Nothing was opened, so nothing can be saved over the saved game.
    expect(saveVersion).not.toHaveBeenCalled()
    expect(screen.queryByText(/prepared starter game/)).not.toBeInTheDocument()
  })
})
