import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ConceptStateEntry, LearnerModel } from '../../core/types/learnerModel'

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

// Parent capability (FEAT-66 gate). `/progress` is not behind `RequireParent`, so
// a kid profile can land here — the override must be capability-gated, not hidden
// by navigation alone.
const mockCanEdit = vi.fn(() => true)
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ canEdit: mockCanEdit() }),
}))

const mockUseLearnerModel = vi.fn()
vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => mockUseLearnerModel(),
}))

// Stub the heavy, self-contained disposition section (makes AI calls) so the tab
// render test stays focused; we only assert it is embedded.
vi.mock('./DispositionProfile', () => ({
  default: () => <div>DISPOSITION_SECTION</div>,
}))

// ChildSelector pulls its own data deps — stub to a marker.
vi.mock('../../components/ChildSelector', () => ({
  default: () => <div>CHILD_SELECTOR</div>,
}))

// The write seam (FEAT-66). Firestore itself is never touched in tests; the
// projector + merge shape are pinned in their own suites.
const mockApplyAndWrite = vi.fn(async (...args: unknown[]) => {
  void args
  return {} as LearnerModel
})
/** The confirmed action is the 3rd arg: (modelRef, base, action, nowIso). */
const confirmedAction = (call = 0) => mockApplyAndWrite.mock.calls[call][2]
vi.mock('../foundations-review/writeReviewAction', () => ({
  applyAndWriteReviewAction: (...args: unknown[]) => mockApplyAndWrite(...(args as [])),
}))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})) }))
vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: vi.fn(() => ({})),
}))

import FoundationsTab from './FoundationsTab'

const CVC = 'reading.phonics.cvc'
const BLENDS = 'reading.phonics.blends'
const LONG = 'reading.phonics.longVowels'

function fullModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'synthesized',
    conceptStates: {
      [CVC]: {
        state: 'solid',
        evidence: [
          {
            kind: 'workingLevel',
            sourceId: 's',
            note: 'Below phonics working level 4 (band 1 < frontier)',
            observedAt: '2026-06-01',
          },
        ],
      },
      [BLENDS]: { state: 'frontier', evidence: [] },
      [LONG]: { state: 'not-yet', evidence: [] },
    },
    modalityCalibration: {
      // Deliberately jargon-laden to prove the §14 scrub bites.
      reading: { level: 4, note: 'Reads around working level 4 — put short reading in activities at this level.' },
      writing: { level: 4, note: 'Spells around working level 4 — scribe by default; tiles and dictation count fully.' },
      math: { level: 3, note: 'Works math around level 3 — heard-aloud word problems count fully.' },
    },
    whatMattersNext: [],
    changeFeed: [
      { conceptId: CVC, from: 'frontier', to: 'solid', cause: 'quest', at: '2026-07-10' },
      { conceptId: BLENDS, from: 'not-yet', to: 'frontier', cause: 'review', at: '2026-07-12' },
    ],
    openQuestions: [
      {
        conceptId: LONG,
        question: 'Can they read silent-e words?',
        routedTo: 'quest',
        reason: 'frontier',
      },
    ],
    synthesis: {
      whatMattersNext: [
        {
          conceptId: LONG,
          kidName: 'Long vowel words',
          why: 'Blends are solid; long vowels are the next unlock in reading.',
          suggestedVehicle: 'quest',
        },
      ],
      narrative: 'Reading is coming together nicely this month.',
      openQuestionsSummary: ['Checking whether long-vowel words are clicking yet.'],
      generatedAt: '2026-07-12',
    },
    seededAt: '2026-07-01',
    updatedAt: '2026-07-12',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCanEdit.mockReturnValue(true)
  mockUseActiveChild.mockReturnValue({
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    children: [{ id: 'c1', name: 'Lincoln' }],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
})

describe('FoundationsTab', () => {
  it('renders the focus, terrain, what-moved, and dispositions sections', () => {
    mockUseLearnerModel.mockReturnValue({ loading: false, model: fullModel() })
    render(<FoundationsTab />)

    // 1 — This week's foundation focus (whatMattersNext[0]).
    expect(screen.getByText("This week's foundation focus")).toBeInTheDocument()
    expect(screen.getAllByText(/Long vowel words/).length).toBeGreaterThan(0)
    // The `why` appears in both the focus card and the full what-matters-next list.
    expect(screen.getAllByText(/next unlock in reading/).length).toBeGreaterThan(0)

    // 2 — Terrain (state summary chips + at least one concept chip by kid-name).
    expect(screen.getByText('The terrain')).toBeInTheDocument()
    expect(screen.getByText(/Solid: 1/)).toBeInTheDocument()

    // 5 — What moved + loop-confirmation (→ solid).
    expect(screen.getByText('What moved')).toBeInTheDocument()
    expect(screen.getByText(/moved to solid ✓/)).toBeInTheDocument()

    // 7 — Dispositions embedded.
    expect(screen.getByText('DISPOSITION_SECTION')).toBeInTheDocument()
  })

  it('obeys §14 — no band number, no percentage, no working-level number leaks', () => {
    mockUseLearnerModel.mockReturnValue({ loading: false, model: fullModel() })
    render(<FoundationsTab />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\bband\s*\d/i)
    expect(text).not.toContain('%')
    expect(text).not.toMatch(/\bworking level\s*\d/i)
    expect(text).not.toMatch(/\blevel\s*\d/i)
    // The node id must never leak — only the plain kid-name.
    expect(text).not.toContain(CVC)
  })

  it('shows a warm empty state when the model is no-data', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...fullModel(), status: 'no-data' },
    })
    render(<FoundationsTab />)
    expect(screen.getByText(/Getting to know how Lincoln learns/)).toBeInTheDocument()
  })
})

// ── FEAT-66: the parent override + the reconcile affordance ───────────────

/** The CVC entry with a parent attestation that a later eval disagreed with. */
function flaggedCvc(): ConceptStateEntry {
  return {
    state: 'solid',
    evidence: [
      {
        kind: 'attestation',
        sourceId: 'reviewChat',
        note: 'He read cat, run, sit for me',
        observedAt: '2026-07-01T00:00:00.000Z',
        overriddenBy: 'parent',
      },
      {
        kind: 'eval',
        sourceId: 'sess-9',
        note: 'Guided eval — "Sound out short words": needed a hand on a few',
        observedAt: '2026-07-20T00:00:00.000Z',
        readState: 'forming',
      },
    ],
    needsReconcile: true,
  }
}

function modelWithReconcile(): LearnerModel {
  const m = fullModel()
  m.conceptStates[CVC] = flaggedCvc()
  return m
}

/** Open the drawer for a terrain concept by its kid-name chip. */
async function openConcept(user: ReturnType<typeof userEvent.setup>, kidName: string) {
  await user.click(screen.getByText(kidName))
}

const CVC_NAME = 'Sound out short words'

describe('FoundationsTab — parent concept override (FEAT-66 A)', () => {
  beforeEach(() => {
    mockApplyAndWrite.mockReset()
    mockApplyAndWrite.mockResolvedValue({} as LearnerModel)
    mockUseLearnerModel.mockReturnValue({ loading: false, model: fullModel() })
  })

  it('stages a proposal on tap and writes NOTHING until Confirm', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    // The override affordance is there, with the shared plain-language wording.
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))

    // Confirm preview rendered; nothing written.
    expect(
      screen.getByText(`Record that Lincoln has this solid: "${CVC_NAME}"`),
    ).toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({
      kind: 'attest', childId: 'c1', conceptId: CVC, state: 'solid', origin: 'foundationsTab',
    })
  })

  it('passes the parent’s note through so the evidence line is honest', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    await user.type(screen.getByLabelText(/What did you see/), 'He read the whole page')
    await user.click(screen.getByRole('button', { name: 'Lincoln is working on this' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({
      state: 'frontier',
      note: 'He read the whole page',
    })
  })

  it('rebuilds the staged proposal when the note is edited after choosing', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    // Choose first, then type — the note must still reach the durable evidence.
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.type(screen.getByLabelText(/What did you see/), 'read it aloud twice')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({
      state: 'solid',
      note: 'read it aloud twice',
    })
  })

  it('hides the override and refuses the write for a non-parent profile', async () => {
    mockCanEdit.mockReturnValue(false)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    // The evidence trail still reads — only the write is gated.
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.queryByLabelText(/What did you see/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Lincoln has this solid' }),
    ).not.toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('writes nothing when the proposal is dismissed', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
  })

  it('confirms with success feedback naming what was recorded, and closes the drawer', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByText(/Recorded — Lincoln has this solid/)).toBeInTheDocument(),
    )
    // Drawer closed — the override section is gone; the terrain redraws from the
    // snapshot, not from local state.
    await waitFor(() =>
      expect(screen.queryByLabelText(/What did you see/)).not.toBeInTheDocument(),
    )
  })

  it('surfaces a failed write and leaves the drawer open with the proposal intact', async () => {
    mockApplyAndWrite.mockRejectedValueOnce(new Error('firestore down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByText('Could not save that — try again.')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText(/What did you see/)).toBeInTheDocument() // still open
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument() // still staged
    expect(screen.queryByText(/Recorded —/)).not.toBeInTheDocument()
    errSpy.mockRestore()
  })
})

describe('FoundationsTab — reconcile the eval’s new take (FEAT-66 B / FEAT-76)', () => {
  beforeEach(() => {
    mockApplyAndWrite.mockReset()
    mockApplyAndWrite.mockResolvedValue({} as LearnerModel)
    mockUseLearnerModel.mockReturnValue({ loading: false, model: modelWithReconcile() })
  })

  it('marks the terrain chip and shows both reads in the drawer', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    expect(screen.getByTitle('The model has a new take on this')).toBeInTheDocument()

    await openConcept(user, CVC_NAME)
    expect(
      screen.getByText('The model has a new take on this — view & reconcile.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/You recorded: Lincoln has this solid/)).toBeInTheDocument()
    expect(
      screen.getByText(/The evaluation saw: Lincoln is coming along with this/),
    ).toBeInTheDocument()
  })

  it('“keep my word” re-attests the standing state (confirm-gated)', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    await user.click(screen.getByRole('button', { name: 'Keep my word' }))
    expect(mockApplyAndWrite).not.toHaveBeenCalled() // still propose → confirm
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({
      kind: 'attest', conceptId: CVC, state: 'solid', origin: 'reconcileKeep',
    })
  })

  it('“take the model’s read” attests at the eval’s state (confirm-gated)', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    await user.click(screen.getByRole('button', { name: 'Take the model’s read' }))
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({
      kind: 'attest', conceptId: CVC, state: 'forming', origin: 'reconcileTake',
    })
  })

  it('reports and re-attests the state the parent actually said, not later drift', async () => {
    // A quest upgrade moved the entry to solid AFTER the parent attested `forming`
    // and the eval disagreed — the standing disagreement is still flagged.
    const m = modelWithReconcile()
    const entry = m.conceptStates[CVC]
    entry.evidence[0].readState = 'forming'
    entry.state = 'solid'
    mockUseLearnerModel.mockReturnValue({ loading: false, model: m })
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    expect(
      screen.getByText(/You recorded: Lincoln is coming along with this/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep my word' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({ state: 'forming', origin: 'reconcileKeep' })
  })

  it('does not offer the model’s read when the eval ref predates FEAT-66', async () => {
    const m = modelWithReconcile()
    delete m.conceptStates[CVC].evidence[1].readState
    mockUseLearnerModel.mockReturnValue({ loading: false, model: m })
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    expect(screen.getByRole('button', { name: 'Keep my word' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Take the model’s read' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the §14 / ETHOS-02 rails in the whole reconcile + override surface', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln is coming along with this' }))

    const drawer = screen.getByRole('presentation')
    const text = drawer.textContent ?? ''
    // Sanity: we really are sweeping the reconcile + override + confirm copy.
    expect(text).toContain('view & reconcile')
    expect(text).toContain('Record that Lincoln is coming along with this')
    expect(text).not.toMatch(/\bband\s*\d/i)
    expect(text).not.toMatch(/\b(working\s+)?level\s*\d/i)
    expect(text).not.toContain('%')
    expect(text).not.toMatch(/regress|dropped|failed/i)
    expect(text).not.toMatch(/\bscore\b/i)
  })
})
