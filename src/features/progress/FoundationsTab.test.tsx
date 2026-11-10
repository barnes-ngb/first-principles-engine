import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
/** The profile itself, not only what it may do — both are part of the scope. */
const mockProfile = vi.fn((): string | null => 'dad')
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ canEdit: mockCanEdit(), profile: mockProfile() }),
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
const mockDoc = vi.fn((...args: unknown[]) => {
  void args
  return {}
})
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
  RECONCILE_NOTICE,
  ReviewActionBasisError,
  SCOPE_LOST_NOTICE,
} from './conceptOverride'
import {
  FOCUS_EVIDENCE_LABEL,
  FOCUS_EVIDENCE_UNAVAILABLE,
  SYNTHESIS_STALE_NOTICE,
} from './foundationsView'

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
  mockProfile.mockReturnValue('dad')
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

  it('closes when the profile changes, not only when its capability does', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    // Another parent profile — same capability, different person.
    mockProfile.mockReturnValue('mom')
    rerender(<FoundationsTab />)

    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
  })

  it('closes when the model stops being settled', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    // A re-read in progress is not an affirmative answer about this child.
    mockUseLearnerModel.mockReturnValue({ loading: true, model: fullModel() })
    rerender(<FoundationsTab />)

    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
  })

  it('closes on a model that belongs to another child', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...fullModel(), childId: 'c2' },
    })
    rerender(<FoundationsTab />)

    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByText(SCOPE_LOST_NOTICE)).toBeInTheDocument()
  })

  it('keeps the destination it started with, and says nothing late', async () => {
    // The write is in flight when the switch lands. It stays addressed to the
    // child captured at open, and its outcome belongs to that opening only — no
    // receipt, no warning, nothing on the drawer that replaced it.
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
    expect(document.body.textContent ?? '').not.toMatch(/Recorded —/)
  })

  it('says nothing late after an A → B → A return either', async () => {
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

    makeActive('c2', 'London', fullModel())
    rerender(<FoundationsTab />)
    makeActive('c1', 'Lincoln', fullModel())
    rerender(<FoundationsTab />)
    await act(async () => {
      settle()
    })

    expect(document.body.textContent ?? '').not.toMatch(/Recorded —/)
    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
  })

  it('does not let a failed save from a closed drawer touch a later one', async () => {
    // The save is still in flight when the parent closes the drawer and opens it
    // again. Its outcome belongs to the opening that started it, and that
    // opening is gone — so nothing is said anywhere.
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

    expect(document.body.textContent ?? '').not.toContain('Could not save that')
    // The fresh drawer is untouched: nothing staged, and its Confirm is free.
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lincoln has this solid' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(mockApplyAndWrite).toHaveBeenCalledTimes(2)
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
    if (moved.synthesis) moved.synthesis.narrative = 'A fresh synthesis landed.'
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
      expect(screen.getByText(DECISION_STALE_NOTICE)).toBeInTheDocument(),
    )
    // The staged confirmation is gone — the same tap would be refused again —
    // and the evidence is still there to look at.
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.queryByText(/Recorded —/)).not.toBeInTheDocument()
    expect(mockApplyAndWrite).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('does not resurrect a dropped decision when the evidence comes back', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Take the model’s read' }))

    // The eval is replaced…
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: modelWithReplacedEval('sess-12', '2026-07-24T00:00:00.000Z'),
    })
    rerender(<FoundationsTab />)
    expect(screen.getByText(DECISION_STALE_NOTICE)).toBeInTheDocument()

    // …and then the original one is what the snapshot carries again. The
    // decision stays dropped: the parent has been asked to choose again.
    mockUseLearnerModel.mockReturnValue({ loading: false, model: modelWithReconcile() })
    rerender(<FoundationsTab />)

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText(DECISION_STALE_NOTICE)).toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
  })

  it('stops offering the model’s read when the eval is withdrawn, but still shows it', async () => {
    const withdrawn = modelWithReconcile()
    const entry = withdrawn.conceptStates[CVC]
    entry.evidence = [
      { ...entry.evidence[0] },
      { ...entry.evidence[1], status: 'superseded' },
    ]
    mockUseLearnerModel.mockReturnValue({ loading: false, model: withdrawn })
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)

    // Not a choice any more — nothing current says it.
    expect(
      screen.queryByRole('button', { name: 'Take the model’s read' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep my word' })).toBeInTheDocument()
    // The trail still records that an evaluation happened.
    expect(screen.getByText(/From an evaluation/)).toBeInTheDocument()
  })

  it('drops a staged take-the-read when that evaluation is withdrawn', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openConcept(user, CVC_NAME)
    await user.click(screen.getByRole('button', { name: 'Take the model’s read' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()

    const withdrawn = modelWithReconcile()
    const entry = withdrawn.conceptStates[CVC]
    entry.evidence = [
      { ...entry.evidence[0] },
      { ...entry.evidence[1], status: 'superseded' },
    ]
    mockUseLearnerModel.mockReturnValue({ loading: false, model: withdrawn })
    rerender(<FoundationsTab />)

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.getByText(DECISION_STALE_NOTICE)).toBeInTheDocument()
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
  })
})

// ── The focus section's read-only door to the current evidence ────────────
//
// `fullModel()`'s saved focus is LONG, carrying the DENORMALIZED kid name
// "Long vowel words" on the move. The graph names that node "Read long-vowel
// words", so every assertion below also proves the door resolved the stored
// `conceptId` rather than matching on a display name.

/** The graph's own name for the saved focus concept, and for a sibling. */
const LONG_NAME = 'Read long-vowel words'
const BLENDS_NAME = 'Blend two sounds together'

/** The saved focus, with something real recorded against it. */
function focusModel(): LearnerModel {
  const m = fullModel()
  m.conceptStates[LONG] = {
    state: 'frontier',
    evidence: [
      {
        kind: 'eval',
        sourceId: 'sess-4',
        note: 'Guided eval — read cake and bike with a hand on the silent e',
        observedAt: '2026-07-18T00:00:00.000Z',
        readState: 'frontier',
      },
    ],
  }
  return m
}

const openFocusEvidence = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: FOCUS_EVIDENCE_LABEL }))

/** The sheet, by the accessible name it is given for the focus entrance. */
const focusSheet = (kidName = LONG_NAME) =>
  screen.getByRole('dialog', { name: `Current evidence — ${kidName}` })

describe('FoundationsTab — “See current evidence” on the focus (read-only)', () => {
  beforeEach(() => {
    mockApplyAndWrite.mockReset()
    mockApplyAndWrite.mockResolvedValue({} as LearnerModel)
    mockUseLearnerModel.mockReturnValue({ loading: false, model: focusModel() })
  })

  it('opens the exact saved concept id, names the child, and shows what is recorded', async () => {
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openFocusEvidence(user)

    const sheet = focusSheet()
    // The child and the concept, by the graph's name — not the move's.
    expect(within(sheet).getByText(/Lincoln/)).toBeInTheDocument()
    expect(within(sheet).getByText(LONG_NAME)).toBeInTheDocument()
    // The state as recorded now, with the evidence's source and date.
    expect(within(sheet).getByText('Frontier')).toBeInTheDocument()
    expect(
      within(sheet).getByText('From an evaluation · 2026-07-18'),
    ).toBeInTheDocument()
    // The source label, never the raw seeded note behind it.
    expect(sheet.textContent ?? '').not.toContain('Guided eval')
    // No sibling, and no second frame.
    expect(within(sheet).queryByText(CVC_NAME)).not.toBeInTheDocument()
    expect(within(sheet).queryByText(BLENDS_NAME)).not.toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // Opening evidence is a read: nothing was written.
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
  })

  it('exposes no correction controls, and closes with focus returned to the button', async () => {
    // Flagged for a disagreement — the notice still reads, its two ways out do not.
    const flagged = focusModel()
    flagged.conceptStates[LONG] = {
      ...flaggedCvc(),
      state: 'frontier',
    }
    mockUseLearnerModel.mockReturnValue({ loading: false, model: flagged })
    const user = userEvent.setup()
    render(<FoundationsTab />)
    const opener = screen.getByRole('button', { name: FOCUS_EVIDENCE_LABEL })
    await user.click(opener)

    const sheet = focusSheet()
    expect(within(sheet).getByText(RECONCILE_NOTICE)).toBeInTheDocument()
    expect(within(sheet).getByText('Evidence')).toBeInTheDocument()
    expect(screen.queryByLabelText(/What did you see/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Record what you’ve seen/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Lincoln has this solid' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep my word' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Take the model’s read' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    // A reachable way out, and the keyboard lands back where it started.
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
    expect(mockApplyAndWrite).not.toHaveBeenCalled()
  })

  it('offers the door to a parent only — a kid profile keeps the terrain alone', () => {
    mockCanEdit.mockReturnValue(false)
    render(<FoundationsTab />)
    expect(
      screen.queryByRole('button', { name: FOCUS_EVIDENCE_LABEL }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(FOCUS_EVIDENCE_UNAVAILABLE)).not.toBeInTheDocument()
    // Reading the terrain is untouched.
    expect(screen.getByText(CVC_NAME)).toBeInTheDocument()
  })

  it('keeps the opened concept when the saved focus moves, and keeps its evidence live', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FoundationsTab />)
    await openFocusEvidence(user)
    expect(focusSheet()).toBeInTheDocument()

    // A re-synthesis points the focus somewhere else, and LONG gains a ref.
    const moved = focusModel()
    if (moved.synthesis) {
      moved.synthesis.whatMattersNext = [
        {
          conceptId: BLENDS,
          kidName: 'Blends',
          why: 'Blends are the next unlock.',
          suggestedVehicle: 'quest',
        },
      ]
    }
    moved.conceptStates[LONG].evidence = [
      ...moved.conceptStates[LONG].evidence,
      {
        kind: 'attestation',
        sourceId: 'reviewChat',
        note: 'He read the silent-e page to me',
        observedAt: '2026-07-25T00:00:00.000Z',
        overriddenBy: 'parent',
      },
    ]
    mockUseLearnerModel.mockReturnValue({ loading: false, model: moved })
    rerender(<FoundationsTab />)

    // Same concept, no sibling swap — and the evidence refreshed under it.
    const sheet = focusSheet()
    expect(within(sheet).getByText(LONG_NAME)).toBeInTheDocument()
    expect(within(sheet).getByText('You confirmed this · 2026-07-25')).toBeInTheDocument()
    expect(within(sheet).queryByText(BLENDS_NAME)).not.toBeInTheDocument()
  })

  it('shows the honest empty state for a known concept with nothing recorded', async () => {
    const bare = focusModel()
    bare.conceptStates[LONG] = { state: 'not-yet', evidence: [] }
    mockUseLearnerModel.mockReturnValue({ loading: false, model: bare })
    const user = userEvent.setup()
    render(<FoundationsTab />)
    await openFocusEvidence(user)

    expect(within(focusSheet()).getByText('No evidence captured yet.')).toBeInTheDocument()
  })

  it('explains instead of offering a dead button when the saved concept is unresolvable', () => {
    const orphan = focusModel()
    delete orphan.conceptStates[LONG]
    mockUseLearnerModel.mockReturnValue({ loading: false, model: orphan })
    render(<FoundationsTab />)

    expect(
      screen.queryByRole('button', { name: FOCUS_EVIDENCE_LABEL }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(FOCUS_EVIDENCE_UNAVAILABLE)).toBeInTheDocument()
    // The suggestion itself still reads.
    expect(screen.getAllByText(/Long vowel words/).length).toBeGreaterThan(0)
  })

  it('warns on the stale marker wherever the saved suggestion reads, and not otherwise', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...focusModel(), synthesisStaleAt: '2026-07-20T00:00:00.000Z' },
    })
    const { rerender, unmount } = render(<FoundationsTab />)
    // Both places the stored prose appears carry the qualification.
    expect(screen.getAllByText(SYNTHESIS_STALE_NOTICE)).toHaveLength(2)

    // A marker that reads OLDER than the synthesis is still a stale marker —
    // truthiness is the signal, never a date comparison.
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...focusModel(), synthesisStaleAt: '2026-01-01T00:00:00.000Z' },
    })
    rerender(<FoundationsTab />)
    expect(screen.getAllByText(SYNTHESIS_STALE_NOTICE).length).toBeGreaterThan(0)

    // Null (the beat cleared it) and absent both claim nothing.
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...focusModel(), synthesisStaleAt: null },
    })
    rerender(<FoundationsTab />)
    expect(screen.queryByText(SYNTHESIS_STALE_NOTICE)).not.toBeInTheDocument()
    unmount()

    mockUseLearnerModel.mockReturnValue({ loading: false, model: focusModel() })
    render(<FoundationsTab />)
    expect(screen.queryByText(SYNTHESIS_STALE_NOTICE)).not.toBeInTheDocument()
  })
})
