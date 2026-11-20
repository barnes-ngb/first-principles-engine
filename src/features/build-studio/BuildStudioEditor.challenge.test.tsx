import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The optional Build Challenge card inside the ready editor
 * (LOCAL-VISION-007, slice 2).
 *
 * The bridge is a controllable fake (the same idea as
 * `BuildStudioEditor.behavior.test.tsx`, trimmed to what this needs). What is
 * pinned: the card is optional and never touches MakeCode, the guess is taken
 * before Play and fixed after it, a Play request is recorded as a request, the
 * exact record is frozen with the exact Save and sent identically on retry, an
 * outcome after a Save waits for the next explicit Save, and a new visit or
 * another child does not inherit an attempt.
 */

interface FakeProject {
  header: { id: string; name: string; targetVersion?: string }
  files: Record<string, string>
}

const starterFiles = (): Record<string, string> => ({ ...starterSourceFiles() })

const bridges: FakeBridgeStub[] = []

class FakeBridgeStub {
  readonly frameId: string
  onEditorLoaded: () => void
  nextCapture: Record<string, string> = starterFiles()
  played = 0
  edited = 0
  imported: Record<string, string>[] = []
  disposed = false

  constructor(options: { newId: () => string; onEditorLoaded?: () => void }) {
    this.frameId = options.newId()
    this.onEditorLoaded = options.onEditorLoaded ?? (() => {})
    bridges.push(this)
  }
  frameUrl() {
    return `https://arcade.makecode.com/?controller=1&frameId=${this.frameId}`
  }
  attach() {}
  handleMessage = () => {}
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
  async playFullscreen() {
    this.played += 1
    return true
  }
  async backToBlocks() {
    this.edited += 1
    return true
  }
  async requestSnapshot(): Promise<FakeProject> {
    return {
      header: { id: 'h1', name: 'Apple Dash starter', targetVersion: '0.0.0' },
      files: { ...this.nextCapture },
    }
  }
  dispose() {
    this.disposed = true
  }
  ready() {
    this.onEditorLoaded()
  }
}

vi.mock('./arcadeBridge', () => ({
  ARCADE_OPENING_TIMEOUT_MS: 45_000,
  ArcadeBridge: FakeBridgeStub,
}))

const saveVersion = vi.fn()
const saveNote = vi.fn()
vi.mock('../../core/firebase/buildStudioVersionWrites', () => ({
  BuildStudioRefused: class extends Error {},
  saveBuildStudioVersion: (args: unknown) => saveVersion(args),
}))
vi.mock('../../core/firebase/buildStudioNoteWrites', () => ({
  BuildStudioNoteRefused: class extends Error {},
  saveBuildStudioNote: (args: unknown) => saveNote(args),
}))

vi.mock('react-router-dom', () => ({
  useBlocker: () => ({ state: 'unblocked', proceed: () => {}, reset: () => {} }),
}))
// The profile-change guard is the same departure rule the router blocker uses,
// and it can be driven without a router: the editor registers it, a test calls it.
const selectProfile = vi.fn()
let profileGuard: ((next: unknown) => boolean) | null = null
const profileValue = {
  selectProfile,
  registerProfileChangeGuard: (guard: (next: unknown) => boolean) => {
    profileGuard = guard
    return () => {
      if (profileGuard === guard) profileGuard = null
    }
  },
}
vi.mock('../../core/profile/useProfile', () => ({ useProfile: () => profileValue }))
const speak = vi.fn()
const ttsValue = { speak }
vi.mock('../../core/hooks/useTTS', () => ({ useTTS: () => ttsValue }))
vi.mock('../../components/VoiceInput', async () => {
  const React = await import('react')
  return {
    default: (props: { onTranscript: (text: string, meta?: { eventId?: string }) => void }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: () => props.onTranscript('I made the hero faster', { eventId: 'ev-1' }) },
        'Pretend mic',
      ),
  }
})
vi.mock('./BuildStudioVersionShelf', () => ({ default: () => null }))
vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  buildStudioVersionsCollection: () => ({ __col: 'buildStudioVersions' }),
}))

import type { BuildStudioChallengeAttempt } from '../../core/types/buildStudio'
import { normalizeChallengeAttempt, serializeBuildStudioSource } from '../../core/types/buildStudio'
import { holdPendingSave, readPendingSave, resetPendingSaveStore } from './buildStudioPendingStore'
import type { PendingSave } from './buildStudioScope'
import { starterSourceFiles } from './buildStudioStarter'
import { VersionsStatus } from './useBuildStudioVersions'

const { default: BuildStudioEditor } = await import('./BuildStudioEditor')

const OWNER = { familyId: 'fam1', childId: 'c1', projectId: 'apple-dash-starter' }

function element(childId = OWNER.childId) {
  return (
    <BuildStudioEditor
      familyId={OWNER.familyId}
      childId={childId}
      childName="Lincoln"
      projectId={OWNER.projectId}
      versions={{
        status: VersionsStatus.Ready,
        versions: [],
        childId,
        projectId: OWNER.projectId,
        error: null,
        retry: vi.fn(),
      }}
    />
  )
}

async function openEditor(childId = OWNER.childId) {
  const view = render(element(childId))
  const bridge = bridges[bridges.length - 1]
  await act(async () => {
    bridge.ready()
  })
  await waitFor(() => expect(screen.getByText('💾 Save my version')).toBeEnabled())
  return { bridge, view }
}

const tap = async (text: string) => {
  await act(async () => {
    screen.getByText(text).click()
  })
}
const tapRole = async (name: string | RegExp) => {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
}

beforeEach(() => {
  bridges.length = 0
  speak.mockClear()
  selectProfile.mockClear()
  saveVersion.mockReset()
  saveVersion.mockImplementation(async (args: { versionId: string }) => ({
    outcome: 'created',
    version: { id: `doc-${args.versionId}` },
  }))
  saveNote.mockReset()
  saveNote.mockResolvedValue({ id: 'n', alreadySaved: false })
  resetPendingSaveStore()
})
afterEach(cleanup)

const savedAttempt = (call = 0): BuildStudioChallengeAttempt | undefined =>
  saveVersion.mock.calls[call]?.[0]?.challengeAttempt

describe('the card is an optional invitation', () => {
  it('shows "Make the hero faster." once the editor is ready, and not before', async () => {
    render(element())
    expect(screen.queryByText('Make the hero faster.')).not.toBeInTheDocument()
    const bridge = bridges[bridges.length - 1]
    await act(async () => {
      bridge.ready()
    })
    await waitFor(() => expect(screen.getByText('Make the hero faster.')).toBeInTheDocument())
  })

  it('a Save with no challenge activity carries no challenge record', async () => {
    await openEditor()
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect('challengeAttempt' in saveVersion.mock.calls[0][0]).toBe(false)
    // A visible card alone never labels a game with a challenge it did not take.
    expect(saveVersion.mock.calls[0][0].goalId).toBe('one-more-life')
  })

  it('after the invitation is hidden, a Save names the old fixed goal — never an attempt', async () => {
    await openEditor()
    await tap('Not now')
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect(saveVersion.mock.calls[0][0].goalId).toBe('one-more-life')
    expect('challengeAttempt' in saveVersion.mock.calls[0][0]).toBe(false)
  })

  it('swap and skip never touch MakeCode', async () => {
    const { bridge } = await openEditor()
    const imports = bridge.imported.length
    await tap('🔀 A different one')
    expect(screen.getByText('Give the hero one more heart.')).toBeInTheDocument()
    await tap('Not now')
    expect(screen.queryByText('Give the hero one more heart.')).not.toBeInTheDocument()
    await tap('💭 Show me something to try')
    expect(screen.getByText('Give the hero one more heart.')).toBeInTheDocument()
    expect(bridge.imported).toHaveLength(imports)
    expect(bridge.played).toBe(0)
    expect(bridge.edited).toBe(0)
    expect(bridges).toHaveLength(1)
    // …and Save is still available and unchanged.
    expect(screen.getByText('💾 Save my version')).toBeEnabled()
  })

  it('reads the card and its own hint aloud, and the hint is a question about where to look', async () => {
    await openEditor()
    await tap('🔊 Read this to me')
    expect(speak).toHaveBeenLastCalledWith('Make the hero faster. Can you cross the screen in less time?')
    await tap('💡 Where to look')
    const hint = speak.mock.calls.at(-1)![0] as string
    expect(hint).toMatch(/on start blocks/)
    expect(hint.trim().endsWith('?')).toBe(true)
    expect(screen.getByText(hint)).toBeInTheDocument()
  })

  it('shows the challenge as the only assignment and the only help lane while it is offered', async () => {
    await openEditor()
    expect(screen.getByText('Make the hero faster.')).toBeInTheDocument()
    expect(screen.queryByText(/Your job/)).not.toBeInTheDocument()
    expect(screen.queryByText('🔊 Hear it')).not.toBeInTheDocument()
    expect(screen.queryByText('💡 Hint')).not.toBeInTheDocument()
    expect(screen.getAllByText(/💡/)).toHaveLength(1) // the card's "Where to look"
  })

  it('brings the free-building controls back, with a neutral cue, once the card is hidden', async () => {
    await openEditor()
    await tap('Not now')
    expect(screen.getByText('Change the game any way you like.')).toBeInTheDocument()
    expect(screen.queryByText(/Your job/)).not.toBeInTheDocument()
    expect(screen.getByText('🔊 Hear it')).toBeInTheDocument()
    await tap('💡 Hint')
    expect(speak.mock.calls.at(-1)![0]).toMatch(/one more life/)
  })
})

describe('the guess comes before Play, and Play does not need it', () => {
  it('records a Play request as a request, with the guess fixed from then on', async () => {
    const { bridge } = await openEditor()
    const group = screen.getByRole('group', { name: 'Your guess' })
    await act(async () => {
      within(group).getByRole('button', { name: 'Faster' }).click()
    })
    expect(within(group).getByRole('button', { name: 'Faster' })).toHaveAttribute('aria-pressed', 'true')
    await tap('▶ Play it')
    expect(bridge.played).toBe(1)
    // Fixed now: every option is closed.
    for (const name of ['Faster', 'Slower', 'The same']) {
      expect(within(group).getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.getByText('Your guess is locked in: Faster.')).toBeInTheDocument()

    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    const attempt = savedAttempt()!
    expect(attempt.prediction?.optionId).toBe('faster')
    expect(attempt.playRequest?.at).toEqual(expect.any(String))
    expect(attempt.reportedOutcome).toBeUndefined()
    // Scoped to this Save's own child, project and version.
    expect(attempt).toMatchObject({
      childId: 'c1',
      projectId: 'apple-dash-starter',
      versionId: saveVersion.mock.calls[0][0].versionId,
      challengeId: 'faster-hero',
      challengeRevision: 1,
      subjectBucket: 'PracticalArts',
    })
    expect(normalizeChallengeAttempt(attempt)).toEqual(attempt)
  })

  it('treats Play without a guess as free play: no challenge record, no warning, and a later guess still counts', async () => {
    const { bridge } = await openEditor()
    await tap('▶ Play it')
    expect(bridge.played).toBe(1)
    expect(screen.queryByText('Did it match your guess?')).not.toBeInTheDocument()
    // The guess is still open after the unrelated free play.
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect(savedAttempt()!.prediction?.optionId).toBe('faster')
    expect(savedAttempt()!.playRequest).toBeDefined()
    expect(saveVersion.mock.calls[0][0].goalId).toBe('faster-hero')
  })

  it('saves free work after ordinary Play with no challenge record and a clean editor has no warning', async () => {
    await openEditor()
    await tap('▶ Play it')
    expect(screen.queryByText(/challenge guess or answer/)).not.toBeInTheDocument()
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect('challengeAttempt' in saveVersion.mock.calls[0][0]).toBe(false)
    expect(saveVersion.mock.calls[0][0].goalId).toBe('one-more-life')
  })

  it('binds the guess from the Save tap even if the guess changes while the source is resolving', async () => {
    const { bridge } = await openEditor()
    await tapRole('Faster')
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = bridge.requestSnapshot.bind(bridge)
    bridge.requestSnapshot = async () => {
      await held
      return original()
    }
    await tap('💾 Save my version')
    // Edits made while the capture is held must not reach the held payload.
    const slower = screen.queryByRole('button', { name: 'Slower' })
    if (slower && !(slower as HTMLButtonElement).disabled) {
      await act(async () => {
        slower.click()
      })
    }
    await tap('🔀 A different one').catch(() => {})
    await act(async () => {
      release()
    })
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    const attempt = savedAttempt()!
    expect(attempt.challengeId).toBe('faster-hero')
    expect(attempt.prediction?.optionId).toBe('faster')
    expect(saveVersion.mock.calls[0][0].goalId).toBe('faster-hero')
  })

  it('offers Matched, Different and Unsure only after a guess and an explicit Play', async () => {
    await openEditor()
    expect(screen.queryByText('Did it match your guess?')).not.toBeInTheDocument()
    await tapRole('Slower')
    expect(screen.queryByText('Did it match your guess?')).not.toBeInTheDocument()
    await tap('▶ Play it')
    const group = screen.getByRole('group', { name: 'How it went' })
    for (const name of ['Matched', 'Different', 'Unsure']) {
      expect(within(group).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('a swap starts a fresh attempt: the old guess and Play do not follow it', async () => {
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('🔀 A different one')
    // A staged response is not thrown away silently: it asks first.
    expect(screen.getByText(/not saved yet\. Swapping throws it away/)).toBeInTheDocument()
    expect(screen.getByText('Make the hero faster.')).toBeInTheDocument()
    await tap('Swap and throw it away')
    expect(screen.queryByText('Did it match your guess?')).not.toBeInTheDocument()
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect(savedAttempt()).toBeUndefined()
  })

  it('Keep my answer leaves a staged response where it was', async () => {
    await openEditor()
    await tapRole('Faster')
    await tap('Not now')
    await tap('Keep my answer')
    expect(screen.queryByText('Keep my answer')).not.toBeInTheDocument()
    expect(screen.getByText('Make the hero faster.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Faster' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('a challenge answer is not lost while the game itself is clean', () => {
  const askToSwitch = async () => {
    let allowed: boolean | undefined
    await act(async () => {
      allowed = profileGuard!({ id: 'other' })
    })
    return allowed
  }

  it('lets a clean editor with no response go without a prompt', async () => {
    await openEditor()
    expect(await askToSwitch()).toBe(false) // the live editor is always read first…
    await waitFor(() => expect(selectProfile).toHaveBeenCalledTimes(1)) // …then it just goes
    expect(screen.queryByText('Switch profile?')).not.toBeInTheDocument()
  })

  it('holds a guess nobody saved, names it, and offers Stay and Save my answer', async () => {
    await openEditor()
    await tapRole('Faster')
    expect(await askToSwitch()).toBe(false)
    await waitFor(() =>
      expect(screen.getByText(/challenge guess or answer is not saved with a game yet/)).toBeInTheDocument(),
    )
    expect(selectProfile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save my answer' })).toBeInTheDocument()
    await tapRole('Stay here')
    expect(selectProfile).not.toHaveBeenCalled()
  })

  it('after Save my answer lands, the same clean editor goes without another prompt', async () => {
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await askToSwitch()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save my answer' })).toBeEnabled())
    await tapRole('Save my answer')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect(savedAttempt()?.prediction?.optionId).toBe('faster')
    await tapRole('Stay here')
    await askToSwitch()
    await waitFor(() => expect(selectProfile).toHaveBeenCalledTimes(1))
  })

  it('holds a result reported AFTER the save, which that save does not contain', async () => {
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument())
    await tapRole('Matched')
    await askToSwitch()
    await waitFor(() =>
      expect(screen.getByText(/challenge guess or answer is not saved with a game yet/)).toBeInTheDocument(),
    )
    expect(selectProfile).not.toHaveBeenCalled()
  })

  it('keeps the original unfinished save and its retry exact while naming the newer answer', async () => {
    saveVersion.mockRejectedValue(new Error('offline'))
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
    await tapRole('Matched')
    await askToSwitch()
    await waitFor(() => expect(screen.getByText(/did not finish\. Switching now leaves it behind/)).toBeInTheDocument())
    expect(screen.getByText(/something newer than the save that did not finish/)).toBeInTheDocument()
    // No second save is offered over the first one's slot.
    expect(screen.queryByRole('button', { name: 'Save my answer' })).not.toBeInTheDocument()
    expect(saveVersion).toHaveBeenCalledTimes(2)
  })

  it('does not hold for a card that was only looked at, or one that was hidden', async () => {
    await openEditor()
    await tap('Not now')
    await tap('💭 Show me something to try')
    expect(await askToSwitch()).toBe(false)
    await waitFor(() => expect(selectProfile).toHaveBeenCalledTimes(1))
  })
})

describe('an outcome after a Save is never written back', () => {
  it('waits for the next explicit Save and says so', async () => {
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(screen.getByText('Saved. Your game is on your shelf.')).toBeInTheDocument())
    expect(saveVersion).toHaveBeenCalledTimes(1)

    await tapRole('Matched')
    expect(
      screen.getByText(/Your answer is not on a saved game yet\. It goes with your next Save my version\./),
    ).toBeInTheDocument()
    // Nothing was written or created by giving an answer.
    expect(saveVersion).toHaveBeenCalledTimes(1)

    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(2))
    const first = savedAttempt(0)!
    const second = savedAttempt(1)!
    expect(first.reportedOutcome).toBeUndefined()
    expect(second.reportedOutcome?.result).toBe('matched')
    expect(second.versionId).toBe(saveVersion.mock.calls[1][0].versionId)
    expect(second.versionId).not.toBe(first.versionId)
    expect(second.attemptId).toBe(first.attemptId)
    // The prediction was not changed on the way.
    expect(second.prediction).toEqual(first.prediction)
    await waitFor(() =>
      expect(screen.getByText(/Your answer is saved with your game/)).toBeInTheDocument(),
    )
  })

  it('says a failed save keeps what it had, and that the answer goes with the next Save', async () => {
    saveVersion.mockRejectedValue(new Error('offline'))
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(2)) // the try and its one auto-retry
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
    await tapRole('Unsure')
    expect(screen.getByText(/The save that did not finish keeps what it had/)).toBeInTheDocument()
  })
})

describe('an exact Save retry sends the identical record', () => {
  it('freezes the record with the payload: a later answer or swap does not enter the retry', async () => {
    saveVersion.mockRejectedValue(new Error('offline'))
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())

    // The child answers and swaps while the failed Save waits.
    await tapRole('Matched')
    await tap('🔀 A different one')
    await tap('Swap and throw it away')

    saveVersion.mockResolvedValue({ outcome: 'created', version: { id: 'doc-x' } })
    await tap('Try again')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(3))

    const [a, b, c] = [0, 1, 2].map((i) => saveVersion.mock.calls[i][0])
    expect(b.versionId).toBe(a.versionId)
    expect(c.versionId).toBe(a.versionId)
    expect(JSON.stringify(b.challengeAttempt)).toBe(JSON.stringify(a.challengeAttempt))
    expect(JSON.stringify(c.challengeAttempt)).toBe(JSON.stringify(a.challengeAttempt))
    expect(c.challengeAttempt.reportedOutcome).toBeUndefined()
    expect(c.challengeAttempt.challengeId).toBe('faster-hero')
  })

  it('reads a pending payload from an older build, and retries it exactly as it was', async () => {
    // What an older build held: the legacy goal id, and no challenge key at all.
    const legacy: PendingSave = {
      scope: { ...OWNER, visitId: 's-old', versionId: null },
      versionId: 'v-legacy-1',
      label: 'Before challenges',
      createdAt: '2026-11-17T02:00:00.000Z',
      files: { ...starterFiles() },
      goalId: 'one-more-life',
      attempts: 1,
      capturedSignature: 'sig-legacy',
    }
    expect('challengeAttempt' in legacy).toBe(false)
    holdPendingSave(OWNER, legacy)
    await openEditor()
    expect(screen.getByText(/A save called “Before challenges” did not finish/)).toBeInTheDocument()
    await tap('Try again')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    const sent = saveVersion.mock.calls[0][0]
    expect(sent.versionId).toBe('v-legacy-1')
    expect(sent.goalId).toBe('one-more-life')
    expect('challengeAttempt' in sent).toBe(false)
    expect(readPendingSave(OWNER)).toBeNull()
  })
})

describe('words stay on the existing note lane, bound to their own version', () => {
  it('Save my words files against the acknowledged version, not the challenge', async () => {
    await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(screen.getByText('Pretend mic')).toBeInTheDocument())
    await tap('Pretend mic')
    // A challenge outcome given now does not retarget the words.
    await tapRole('Matched')
    await tap('Save my words')
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1))
    const note = saveNote.mock.calls[0][0]
    expect(note.versionId).toBe(saveVersion.mock.calls[0][0].versionId)
    expect(note.versionDocId).toBe(`doc-${saveVersion.mock.calls[0][0].versionId}`)
    expect(note.text).toBe('I made the hero faster')
    expect(note.capture).toBe('voice')
    expect(Object.keys(note)).not.toContain('challengeAttempt')
  })

  it('counts the challenge’s own hint as help offered on the note', async () => {
    await openEditor()
    await tap('💡 Where to look')
    await tap('💾 Save my version')
    await waitFor(() => expect(screen.getByText('Pretend mic')).toBeInTheDocument())
    await tap('Pretend mic')
    await tap('Save my words')
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1))
    expect(saveNote.mock.calls[0][0].help).toBe('hints-offered')
  })
})

describe('visit and child ownership', () => {
  it('a new visit starts the attempt empty — a guess about one game is not carried into another', async () => {
    const { bridge } = await openEditor()
    await tapRole('Faster')
    await tap('▶ Play it')
    expect(screen.getByRole('group', { name: 'How it went' })).toBeInTheDocument()

    // Opening a downloaded game file is the editor's own way to a new visit:
    // a new id, a new bridge, the old one retired. The editor is clean, so the
    // replacement goes ahead by itself.
    const recovered = {
      ...starterFiles(),
      'main.ts': starterFiles()['main.ts'].replace('info.setLife(3)', 'info.setLife(4)'),
    }
    const body = serializeBuildStudioSource(recovered)
    const file = new File([body], 'my-game-source.json', { type: 'application/json' })
    if (typeof file.text !== 'function') {
      Object.defineProperty(file, 'text', { value: async () => body })
    }
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Open a downloaded game file'), {
        target: { files: [file] },
      })
    })
    // The code is clean but the guess and Play tap are not saved, so the
    // replacement asks first instead of quietly dropping them.
    await waitFor(() => expect(screen.getByText('Replace it anyway')).toBeInTheDocument())
    expect(screen.getByText(/challenge guess or answer is not/)).toBeInTheDocument()
    expect(bridges).toHaveLength(1)
    await tap('Replace it anyway')
    await waitFor(() => expect(bridges).toHaveLength(2))
    expect(bridge.disposed).toBe(true)
    const second = bridges[1]
    await act(async () => {
      second.ready()
    })
    await waitFor(() => expect(screen.getByText('💾 Save my version')).toBeEnabled())

    // The same challenge, a new empty attempt: nothing carried over.
    expect(screen.getByText('Make the hero faster.')).toBeInTheDocument()
    expect(screen.queryByText('Did it match your guess?')).not.toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Your guess' })
    for (const name of ['Faster', 'Slower', 'The same']) {
      expect(within(group).getByRole('button', { name })).toBeEnabled()
      expect(within(group).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    expect(savedAttempt()).toBeUndefined()
  })

  it('a record is scoped to the child it was captured for', async () => {
    await openEditor('c2')
    await tapRole('Faster')
    await tap('▶ Play it')
    await tap('💾 Save my version')
    await waitFor(() => expect(saveVersion).toHaveBeenCalledTimes(1))
    const call = saveVersion.mock.calls[0][0]
    expect(call.childId).toBe('c2')
    expect(call.challengeAttempt.childId).toBe('c2')
    expect(call.challengeAttempt.versionId).toBe(call.versionId)
  })
})
