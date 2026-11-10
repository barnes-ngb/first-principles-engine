import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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


// UX-326 moved three sections into this tab. They are self-contained (the two
// diagnostic panels gate themselves on `canEdit` and then `?diag=1`, and reach
// their own Firestore doors), so they are markers here — their placement and
// their gating from the new home are pinned in
// `FoundationsTab.movedSections.test.tsx`, with the real panels.
vi.mock('../foundations-review/FoundationsReviewLauncher', () => ({
  default: () => <div>REVIEW_LAUNCHER</div>,
}))
vi.mock('./FoundationsDiagPanel', () => ({ default: () => <div>DIAG_PANEL</div> }))
vi.mock('../records/DataReviewExportPanel', () => ({
  default: () => <div>DATA_REVIEW_EXPORT</div>,
}))

// The write seam (FEAT-66). Firestore itself is never touched in tests; the
// projector + merge shape are pinned in their own suites.
const mockApplyAndWrite = vi.fn(async (...args: unknown[]) => {
  void args
  return {} as LearnerModel
})
/** The confirmed action is the 3rd arg: (modelRef, base, action, nowIso). */
const confirmedAction = (call = 0) => mockApplyAndWrite.mock.calls[call][2]
/** The stored-basis expectation is the 5th arg — opt-in, this surface only. */
const confirmedExpectation = (call = 0) => mockApplyAndWrite.mock.calls[call][4]
vi.mock('../foundations-review/writeReviewAction', () => ({
  applyAndWriteReviewAction: (...args: unknown[]) => mockApplyAndWrite(...(args as [])),
}))
/** `doc(collection, childId)` — the destination, asserted by its child id. */
const mockDoc = vi.fn((..._args: unknown[]) => ({}))
vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...(args as [])),
}))

// UX-286 — the create-only bootstrap seam. The decision and the write are pinned
// in `foundationsBootstrap.test.ts` / `useFoundationsBootstrap.test.tsx`; here we
// only assert what the tab renders while it runs and when it fails.
const mockBootstrap = vi.fn(() => ({
  bootstrapping: false,
  failed: false,
  retry: vi.fn(),
}))
vi.mock('./useFoundationsBootstrap', () => ({
  useFoundationsBootstrap: (...args: unknown[]) => mockBootstrap(...(args as [])),
}))
vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: vi.fn(() => ({})),
}))

import FoundationsTab from './FoundationsTab'
import {
  conceptDecisionBasis,
  DECISION_STALE_NOTICE,
  ReviewActionBasisError,
  SCOPE_LOST_NOTICE,
} from './conceptOverride'

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
  mockBootstrap.mockReturnValue({ bootstrapping: false, failed: false, retry: vi.fn() })
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

  // ── UX-286: the create-only bootstrap, as the tab renders it ───────────
  it('passes the tab’s own capability and snapshot state to the bootstrap', () => {
    mockUseLearnerModel.mockReturnValue({ loading: false, model: null })
    render(<FoundationsTab />)
    expect(mockBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1', childId: 'c1', canEdit: true, model: null, loading: false }),
    )
  })

  it('gates the bootstrap on capability, never on a name', () => {
    mockCanEdit.mockReturnValue(false)
    mockUseLearnerModel.mockReturnValue({ loading: false, model: null })
    render(<FoundationsTab />)
    expect(mockBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ canEdit: false }),
    )
  })

  it('says the map is being set up, naming the child, while it runs', () => {
    mockBootstrap.mockReturnValue({ bootstrapping: true, failed: false, retry: vi.fn() })
    mockUseLearnerModel.mockReturnValue({ loading: false, model: null })
    render(<FoundationsTab />)
    expect(screen.getByText(/Setting up Lincoln's map/)).toBeInTheDocument()
    // Not the empty state — nothing is known yet either way.
    expect(document.body.textContent ?? '').not.toMatch(/Nothing has been recorded/)
  })

  it('shows a real failure message and a Try again, not a console warning', async () => {
    const retry = vi.fn()
    mockBootstrap.mockReturnValue({ bootstrapping: false, failed: true, retry })
    mockUseLearnerModel.mockReturnValue({ loading: false, model: null })
    render(<FoundationsTab />)
    expect(screen.getByText(/Could not set up this map/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  // UX-287 — the empty state names a route that works. It used to send the parent
  // to a Knowledge Mine round (returns early with no model) or a Foundations
  // review (confirmed silently into a console.warn).
  it('shows an empty state that names a working route and no dead end', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...fullModel(), status: 'no-data' },
    })
    render(<FoundationsTab />)
    expect(
      screen.getByText(/Nothing has been recorded on Lincoln's map yet/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Foundations Review card above/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/Knowledge Mine/i)
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

// ── FEAT-66 scope repair: the drawer's lifetime, and its decision basis ────
//
// The drawer used to hold a whole concept snapshot and read the child from the
// page at Confirm time, so a committed child switch left one child's concept and
// evidence on screen while the staged action was rebuilt for the newly active
// child — and the write went to the new child. These pin the repair: the scope is
// captured at open, the concept is re-resolved from the live model, and a staged
// decision is bound to the evidence it describes.

/** Make the shell's active child a different boy, with his own model. */
function makeActive(childId: string, name: string, model: LearnerModel | null) {
  mockUseActiveChild.mockReturnValue({
    activeChild: { id: childId, name },
    activeChildId: childId,
    children: [{ id: childId, name }],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
  mockUseLearnerModel.mockReturnValue({ loading: false, model })
}

/** The same model, with a DIFFERENT evaluation standing on the CVC concept. */
function modelWithReplacedEval(sourceId: string, observedAt: string): LearnerModel {
  const m = modelWithReconcile()
  const entry = m.conceptStates[CVC]
  entry.evidence = [
    { ...entry.evidence[0] },
    { ...entry.evidence[1], sourceId, observedAt },
  ]
  return m
}

describe('FoundationsTab — the drawer is scoped to the opening it was tapped in', () => {
  beforeEach(() => {
    mockApplyAndWrite.mockReset()
    mockApplyAndWrite.mockResolvedValue({} as LearnerModel)
    mockUseLearnerModel.mockReturnValue({ loading: false, model: fullModel() })
  })

  it('closes on a committed child switch, loses the staged work visibly, and writes nothing', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.type(screen.getByLabelText(/What did you see/), 'He read the whole page')
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()

    // The shell's chip changes the child. The drawer belongs to the old one.
    makeActive('c2', 'London', fullModel())
    rerender(<FoundationsTab />)

    // No stale frame: the drawer is gone in the same pass, with it the note, the
    // staged proposal and the evidence it was about.
    expect(screen.queryByLabelText(/What did you see/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toContain('He read the whole page')
    // The loss is visible, and the line carries no evidence and no note.
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
  })

  it('does not resurrect the staged work when the first child comes back (A → B → A)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.type(screen.getByLabelText(/What did you see/), 'He read the whole page')
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))

    makeActive('c2', 'London', fullModel())
    rerender(<FoundationsTab />)
    makeActive('c1', 'Lincoln', fullModel())
    rerender(<FoundationsTab />)

    expect(screen.queryByLabelText(/What did you see/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()

    // Opening it again is a NEW lifetime: empty note, nothing staged.
    await openConcept(user, CVC_NAME)
    expect(screen.getByLabelText(/What did you see/)).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('closes and refuses when the model goes away, whatever the cause', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    expect(screen.getByText('Evidence')).toBeInTheDocument()

    mockUseLearnerModel.mockReturnValue({ loading: false, model: null })
    rerender(<FoundationsTab />)

    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
  })

  it('closes when the concept itself is no longer on the model', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    const without = fullModel()
    delete without.conceptStates[CVC]
    mockUseLearnerModel.mockReturnValue({ loading: false, model: without })
    rerender(<FoundationsTab />)

    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
  })

  it('closes when the profile’s capability changes under it', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    mockCanEdit.mockReturnValue(false)
    rerender(<FoundationsTab />)

    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
  })

  it('keeps a save that has already started on the child it was confirmed for', async () => {
    // The write is in flight when the switch lands. It is addressed to the child
    // captured at open, and its receipt names that child — never the new one.
    let settle = (): void => {}
    mockApplyAndWrite.mockImplementation(
      () => new Promise<LearnerModel>((resolve) => {
        settle = () => resolve({} as LearnerModel)
      }),
    )
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(mockApplyAndWrite).toHaveBeenCalledTimes(1)
    expect(confirmedAction()).toMatchObject({ childId: 'c1', conceptId: CVC })
    // The destination was built from the captured child, not the live one.
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'c1')

    makeActive('c2', 'London', fullModel())
    rerender(<FoundationsTab />)
    await act(async () => {
      settle()
    })

    expect(mockDoc).not.toHaveBeenCalledWith(expect.anything(), 'c2')
    expect(screen.getByText(/Recorded — Lincoln has this solid/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/Recorded — London/)
  })

  it('does not let a failed save from a closed drawer touch a later one', async () => {
    // The save is still in flight when the parent closes the drawer and opens it
    // again. Its outcome belongs to the lifetime that started it.
    let fail = (): void => {}
    mockApplyAndWrite.mockImplementationOnce(
      () => new Promise<LearnerModel>((_resolve, reject) => {
        fail = () => reject(new Error('firestore down'))
      }),
    )
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await user.keyboard('{Escape}')
    await openConcept(user, CVC_NAME)
    await act(async () => {
      fail()
    })

    // Nothing inside the new drawer changed: no error line on it, and the
    // proposal it has not staged yet was not invented for it.
    const drawer = screen.getByRole('presentation')
    expect(drawer.textContent ?? '').not.toContain('Could not save that')
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    // The outcome is still reported, in the tab's own voice.
    expect(screen.getByText('Could not save that — try again.')).toBeInTheDocument()
    errSpy.mockRestore()
  })

  it('writes once for two Confirm taps in the same tick', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))

    const confirm = screen.getByRole('button', { name: 'Confirm' })
    await act(async () => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
    })
    expect(mockApplyAndWrite).toHaveBeenCalledTimes(1)
  })

  it('still retries an ordinary failure without re-choosing', async () => {
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

    // The basis has not moved, so the proposal is still there and one tap retries.
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(2))
    errSpy.mockRestore()
  })
})

describe('FoundationsTab — a staged decision is bound to the evidence it describes', () => {
  beforeEach(() => {
    mockApplyAndWrite.mockReset()
    mockApplyAndWrite.mockResolvedValue({} as LearnerModel)
    mockUseLearnerModel.mockReturnValue({ loading: false, model: modelWithReconcile() })
  })

  it('carries the captured child, the exact concept and the basis to the writer', async () => {
    const model = modelWithReconcile()
    mockUseLearnerModel.mockReturnValue({ loading: false, model })
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Take the model’s read' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedExpectation()).toEqual({
      childId: 'c1',
      conceptId: CVC,
      basis: conceptDecisionBasis(model.conceptStates[CVC]),
    })
  })

  it('clears the confirmation and asks for another look when a replacement eval lands', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Take the model’s read' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()

    // A second evaluation, on a different day, asserting the SAME state — the
    // case a state comparison cannot see.
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: modelWithReplacedEval('sess-12', '2026-07-24T00:00:00.000Z'),
    })
    rerender(<FoundationsTab />)

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText(DECISION_STALE_NOTICE)).toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
    // The drawer is still open on the live evidence, which has redrawn.
    expect(screen.getByText(/The evaluation saw: Lincoln is coming along with this/))
      .toBeInTheDocument()
    expect(document.body.textContent ?? '').toContain('2026-07-24')

    // Choosing again stages against what is there now.
    await user.click(screen.getByRole('button', { name: 'Take the model’s read' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedExpectation()).toMatchObject({
      basis: expect.objectContaining({ eval: expect.stringContaining('sess-12') }),
    })
  })

  it('keeps an otherwise current draft when an unrelated concept moves', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.type(screen.getByLabelText(/What did you see/), 'He blended every word')
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))

    const moved = modelWithReconcile()
    moved.conceptStates[LONG] = { state: 'solid', evidence: [] }
    moved.synthesis = { ...moved.synthesis!, narrative: 'A fresh synthesis landed.' }
    mockUseLearnerModel.mockReturnValue({ loading: false, model: moved })
    rerender(<FoundationsTab />)

    expect(screen.queryByText(DECISION_STALE_NOTICE)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApplyAndWrite).toHaveBeenCalledTimes(1))
    expect(confirmedAction()).toMatchObject({
      conceptId: CVC,
      state: 'solid',
      note: 'He blended every word',
    })
  })

  it('does not offer a retry when the writer refuses the stored basis', async () => {
    mockApplyAndWrite.mockRejectedValueOnce(new ReviewActionBasisError('basis-stale'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Keep my word' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getAllByText(DECISION_STALE_NOTICE).length).toBeGreaterThan(0),
    )
    // The staged confirmation is gone — the same tap would be refused again —
    // and the evidence is still there to look at.
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.queryByText(/Recorded —/)).not.toBeInTheDocument()
    expect(mockApplyAndWrite).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })
})
