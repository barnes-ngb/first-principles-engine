import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocs, query, where, orderBy, limit as firestoreLimit } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import { ErrorState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { evaluationSessionsCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import { useChildSkillSnapshot } from '../../core/hooks/useChildSkillSnapshot'
import type { EvaluationSession, SkillSnapshot } from '../../core/types'
import { EvaluationDomain, SkillLevel } from '../../core/types/enums'
import { useLearnerModel } from '../../core/hooks/useLearnerModel'
import MinecraftAvatar from '../avatar/MinecraftAvatar'
import { MINE_RETURN_LABEL } from '../avatar/stonebridge/libraryReturnCopy'
import {
  LibraryReturnDestination,
  LibraryReturnPhase,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
  libraryReturnForDestination,
  libraryReturnPath,
  requestLibraryReturn,
  subscribeLibraryIdentityEpoch,
  subscribeLibraryReturnFlow,
} from '../avatar/stonebridge/libraryReturnFlow'
import {
  selectMineInvitation,
  MineInvitationSource,
  type MineInvitation,
} from '../avatar/stonebridge/mineInvitation'
import { MINE_ADDITION_PROBE_CONCEPT } from './mineAdditionProbe'
import type {
  MineAdditionPilotOffer,
  MineAdditionPilotRequest,
} from './mineAdditionPilot'
import { useXpLedger } from '../../core/xp/useXpLedger'
import QuestQuestionScreen, { QuestFeedback, QuestLoading } from './ReadingQuest'
import BuildWordQuestionScreen from './BuildWordQuestion'
import BuildSentenceQuestionScreen from './BuildSentenceQuestion'
import QuestSummary from './QuestSummary'
import FluencyPractice from './FluencyPractice'
import { questOwnerLines } from './questSessionOwner'
import { extractTargetWord } from './questHelpers'
import { hasMathCalibration, hasReadingCalibration } from './knowledgeMineAccess'
import {
  QUEST_RECOVERY_COPY,
  QUEST_RESUME_REFUSAL_COPY,
  QUEST_UNSAVED_COPY,
} from './questSaveCopy'
import { questResumeCardRefusal, type QuestResumeFailure } from './questRun'
import type { InteractiveSessionData, QuestDomainConfig } from './questTypes'
import { QuestScreen } from './questTypes'
import { useQuestSession, type QuestExitBinding } from './useQuestSession'
import QuestExitGuardDialog from './QuestExitGuardDialog'
import type { QuestExitPhase } from './questSaveCopy'

/**
 * A departure the Mine is holding, and everything that authorises it (UX-496).
 *
 * One at a time, identified by `id` so the deliberate tap can admit the exact
 * intent it was raised for rather than "whatever is held now".
 */
interface HeldQuestExit {
  id: number
  /** The action's own work — its reset and its own destination, unchanged. */
  depart: () => void
  binding: QuestExitBinding
  /** The journey the departure would consume, where it has one. */
  tripGeneration?: number
}
import { kidPalette } from '../../app/tokens'

const MC = {
  bg: kidPalette.bg,
  gold: kidPalette.gold,
  green: kidPalette.xpGreen,
  diamond: kidPalette.diamond,
  stone: kidPalette.stone,
  white: '#FFFFFF',
  darkStone: kidPalette.darkStone,
  font: '"Press Start 2P", monospace',
} as const

// ── Quest mode configs ─────────────────────────────────────────

const READING_MODES: QuestDomainConfig[] = [
  {
    domain: EvaluationDomain.Reading,
    questMode: 'phonics',
    label: 'Phonics Quest',
    icon: '⛏️',
    enabled: true,
    description: 'Letters & sounds · Levels 1-8',
  },
  {
    domain: EvaluationDomain.Reading,
    questMode: 'comprehension',
    label: 'Comprehension Quest',
    icon: '🧠',
    enabled: true,
    description: 'Vocabulary & meaning · Levels 1-6',
  },
  {
    domain: EvaluationDomain.Reading,
    questMode: 'fluency',
    label: 'Fluency Practice',
    icon: '📖',
    enabled: true,
    description: 'Read aloud · Build speed',
  },
]

const MATH_MODES: QuestDomainConfig[] = [
  {
    domain: EvaluationDomain.Math,
    questMode: 'math',
    label: 'Math Quest',
    icon: '⛏️',
    enabled: true,
    description: 'Numbers & operations',
  },
]

const SPEECH_MODES: QuestDomainConfig[] = [
  {
    domain: EvaluationDomain.Speech,
    label: 'Speech Quest',
    icon: '🗣️',
    enabled: false,
    description: 'Coming soon!',
  },
]

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never played'
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return `${diff} days ago`
}

/** Check if phonics is marked secure in the skill snapshot */
function isPhonicsSecure(snapshot: SkillSnapshot | null): boolean {
  if (!snapshot) return false
  // If Reading Eggs or similar is in completedPrograms, phonics is secure
  if (snapshot.completedPrograms?.length) return true
  // Check if phonics skills are all secure
  const phonicsSkills = snapshot.prioritySkills.filter((s) => s.tag.startsWith('phonics.'))
  if (phonicsSkills.length === 0) return false
  return phonicsSkills.every((s) => s.level === SkillLevel.Secure)
}

export default function KnowledgeMinePage() {
  const {
    activeChild,
    activeChildId,
    childrenFamilyId,
    isChildProfile,
    isLoading: childrenLoading,
    loadFailed: childrenLoadFailed,
  } = useActiveChild()
  const { profile } = useProfile()
  const familyId = useFamilyId()
  const quest = useQuestSession()
  const xpLedger = useXpLedger(familyId, activeChildId ?? '')
  const [activeDomain, setActiveDomain] = useState<QuestDomainConfig | null>(null)

  const childName = activeChild?.name || 'Explorer'

  // Load skill snapshot for recommendation badges (shared eligibility fetch)
  const { snapshot } = useChildSkillSnapshot(familyId, activeChildId || undefined)

  /**
   * The saved quest offered on the intro (within 24h), WITH the recovery
   * identity it was read under — the `graphRecovery` shape, for the same reason
   * and checked the same way (UX-494).
   *
   * A bare session outlived its scope: the previous child's card stayed live
   * over the new one until the next read landed, and `onResume` then updated
   * state after its await with no guard at all, unlike *Start fresh*. Binding
   * the row to the committed scope/epoch lets render retire a previous scope's
   * card on the frame the identity moves, before any new read completes.
   */
  const [resumeRead, setResumeRead] = useState<{
    scope: string
    epoch: number
    session: (EvaluationSession & Partial<InteractiveSessionData>) | null
  } | null>(null)
  /**
   * UX-494 — why a Resume tap did nothing, when it did nothing.
   *
   * The old fallback started an unrelated fresh quest, which is a paid run the
   * child never asked for, in a mode a parent never picked. A refusal now says
   * so and leaves every mode card exactly where it was.
   */
  const [resumeRefusal, setResumeRefusal] = useState<QuestResumeFailure | null>(null)

  /**
   * UX-338 — the resume card belongs to the child whose session it is, and a
   * child change drops it rather than leaving it live over the new one.
   *
   * This page has no `ChildSelector` of its own; the shell's chip is the only
   * way the child changes here, which is why the census marks it *Shell only*
   * and why `FIX-231` is what made it reachable. The load below is a Firestore
   * round trip, so between the switch and its answer the card held the previous
   * boy's partial quest with both of its buttons live — and *Start fresh*
   * writes `status: 'abandoned'` onto that session document, closing out one
   * boy's unfinished quest because a parent tidied up while looking at his
   * brother. Nothing recovers it: the ledger row is the record.
   *
   * **RESET with no notice.** Nothing is lost — the session is safe in
   * Firestore and reappears on switching back, and the new child's own resume
   * card arrives one read later — so there is nothing to make visible.
   * `activeDomain` goes with it because it is the domain picked for the
   * previous child's run and it labels the quest screens.
   *
   * It is a render-time compare rather than a clear inside the effect below,
   * because that effect also re-runs on `quest.screen` — clearing there would
   * blank the card every time a parent returned to the intro.
   *
   * Adjusting state during render is React's own answer to "derive from a
   * changed value"; this repo's lint forbids the set-state-in-effect form
   * (the `ArmorTab` / UX-336 precedent).
   */
  /**
   * UX-494 — ONE saved source whose map update has not been applied, waiting for
   * its scoped retry.
   *
   * Durable by construction: `modelProjection` stays `pending` until the
   * projection stamps it inside its own transaction, so a rejected attempt and a
   * lost response leave exactly the same recoverable state and no failure stamp
   * or raw provider error is written onto a child's record.
   *
   * The query asks for pending work DIRECTLY — `childId ==` plus
   * `modelProjection == 'pending'`, no `orderBy`, which Firestore serves by
   * merging two single-field indexes, so no composite index is added. Reading
   * the newest five completes and filtering them was the wrong shape: five newer
   * unrelated quests hid the one still waiting.
   *
   * Exactly one is consumed at a time, and the query is re-run after a
   * successful retry, so a queue of two drains in two taps rather than
   * disappearing.
   */
  /**
   * The answer is kept WITH the identity it was read under, not beside it: a
   * bare session could outlive its scope and then be drawn — or retried — in a
   * new one that happens to name the same id. The card shown is DERIVED from
   * this binding during render, which is also what lets the effect below
   * return without a synchronous setState.
   */
  const [graphRecovery, setGraphRecovery] = useState<{
    scope: string
    epoch: number
    session: (EvaluationSession & Partial<InteractiveSessionData> & { id: string }) | null
  } | null>(null)
  /** Bumped to re-run the pending read after a retry settles one source. */
  const [graphRecoveryNonce, setGraphRecoveryNonce] = useState(0)

  const [resumeChildId, setResumeChildId] = useState(activeChildId)
  if (resumeChildId !== activeChildId) {
    setResumeChildId(activeChildId)
    setResumeRead(null)
    setGraphRecovery(null)
    setResumeRefusal(null)
    setActiveDomain(null)
  }

  const recoveryScope = quest.recoveryScope
  const recoveryEpoch = quest.recoveryEpoch

  /**
   * The recovery identity this page most recently COMMITTED (UX-494).
   *
   * Written in a layout effect, the `MineTripSuggestion` shape, for the same
   * reason: a render React abandons must not authorise a read or a write, and a
   * handler captured by an older render has to have something CURRENT to
   * compare itself against. The previous version compared `scopeAtRead` to
   * `quest.recoveryScope` from the same closure — the same value, so the check
   * could never fail and the guard did nothing.
   *
   * Both recovery reads and all three of the cards' handlers — Resume included
   * — check themselves against this one ref.
   */
  const liveRecovery = useRef({ scope: recoveryScope, epoch: recoveryEpoch })
  useLayoutEffect(() => {
    liveRecovery.current = { scope: recoveryScope, epoch: recoveryEpoch }
  }, [recoveryScope, recoveryEpoch])

  useEffect(() => {
    if (!activeChildId || !familyId) return
    // Same gate as the graph card: an unsettled identity vouches for nobody, so
    // it reads nothing and the render below draws nothing.
    if (recoveryScope === 'unsettled') return
    let cancelled = false
    const scopeAtRead = recoveryScope
    const epochAtRead = recoveryEpoch
    const childAtRead = activeChildId
    async function loadResume() {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        // Resumable sessions are saved as 'partial' (new) — also accept legacy
        // 'in-progress' docs saved before the partials-count change, and
        // 'resumed' docs (UX-494): an accepted claim whose UI was retired — a
        // reload, a child switch, a route change before the child ever saw the
        // question — left an intact saved point stored under a status nothing
        // offered again. The claim helper already accepts `resumed` and
        // converges on the same run, so reoffering it reopens the ORIGINAL id
        // and plan rather than starting anything. Nothing reopens by itself.
        const q = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          where('status', 'in', ['partial', 'in-progress', 'resumed']),
          orderBy('evaluatedAt', 'desc'),
          // Three statuses can match now, so the newest row is not necessarily
          // an eligible one: read a few and take the first that is. Same
          // query and same index, bounded.
          firestoreLimit(5),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        // Scoped like the graph read: the effect is live, the committed
        // identity is still the one that asked, and that epoch is still the
        // store's own.
        const live = liveRecovery.current
        if (live.scope !== scopeAtRead || live.epoch !== epochAtRead) return
        if (epochAtRead !== getLibraryIdentityEpoch()) return
        const sessions = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as EvaluationSession & Partial<InteractiveSessionData>)
          // The shared eligibility, against what is stored: finalized,
          // abandoned, another child's and non-interactive rows stay out.
          // `savedQuestState` is still required on top of it — a 'partial'
          // saved at endSession (e.g. AI failed before the mastery threshold)
          // counts in Records but is no saved point.
          .filter(
            (s) =>
              s.evaluatedAt >= cutoff &&
              !!s.savedQuestState &&
              questResumeCardRefusal(s, childAtRead) === null,
          )
        setResumeRead({
          scope: scopeAtRead,
          epoch: epochAtRead,
          session: sessions[0] ?? null,
        })
      } catch {
        // Non-blocking — resume card is optional
      }
    }
    void loadResume()
    return () => { cancelled = true }
    // `resumeReloadNonce` re-reads after a partial has actually LANDED: this
    // query can otherwise finish before the exit's own write does (UX-494).
  }, [
    activeChildId,
    familyId,
    quest.screen,
    quest.resumeReloadNonce,
    recoveryScope,
    recoveryEpoch,
  ])

  useEffect(() => {
    // An unsettled identity vouches for nobody, so it reads nothing — and it
    // writes nothing here either. Clearing the state synchronously was both a
    // lint failure (`react-hooks/set-state-in-effect`) and the wrong place for
    // the decision: the render-time derivation below retires a previous
    // scope's card on the frame the identity moves, without waiting for an
    // effect or for the new query to settle.
    if (recoveryScope === 'unsettled' || !activeChildId || !familyId) return
    let cancelled = false
    const scopeAtRead = recoveryScope
    const epochAtRead = recoveryEpoch
    const childAtRead = activeChildId
    async function loadGraphRecovery() {
      try {
        const q = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          where('modelProjection', '==', 'pending'),
          firestoreLimit(5),
        )
        const snap = await getDocs(q)
        // Three things, not one: this effect was not torn down, the committed
        // identity is still the one that asked (an A → B → A moves the epoch
        // while leaving family and child alone), and that epoch is still the
        // store's own — comparing the closure's child against the closure's
        // child, as this did, could never fail and guarded nothing.
        if (cancelled) return
        const live = liveRecovery.current
        if (live.scope !== scopeAtRead || live.epoch !== epochAtRead) return
        if (epochAtRead !== getLibraryIdentityEpoch()) return
        const waiting = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as EvaluationSession & Partial<InteractiveSessionData> & { id: string })
          .filter(
            (s) =>
              s.sessionType === 'interactive' &&
              s.status === 'complete' &&
              Boolean(s.sourceCommittedAt) &&
              s.childId === childAtRead,
          )
        setGraphRecovery({
          scope: scopeAtRead,
          epoch: epochAtRead,
          session: waiting[0] ?? null,
        })
      } catch {
        // Non-blocking — the recovery card is optional, exactly like the resume card.
      }
    }
    void loadGraphRecovery()
    return () => { cancelled = true }
  }, [activeChildId, familyId, quest.screen, recoveryScope, recoveryEpoch, graphRecoveryNonce])

  /**
   * The card to draw, decided during render: the loaded answer counts only
   * while the identity it was READ under is still the identity on screen. Any
   * other state — unsettled, a newer scope whose query has not landed, a
   * same-tick A → B → A — draws nothing.
   */
  const graphRecoveryCard =
    graphRecovery &&
    graphRecovery.session &&
    recoveryScope !== 'unsettled' &&
    graphRecovery.scope === recoveryScope &&
    graphRecovery.epoch === recoveryEpoch
      ? graphRecovery
      : null

  /** The Resume card, decided the same way and under the same identity. */
  const resumeCard =
    resumeRead &&
    resumeRead.session &&
    recoveryScope !== 'unsettled' &&
    resumeRead.scope === recoveryScope &&
    resumeRead.epoch === recoveryEpoch
      ? { ...resumeRead, session: resumeRead.session }
      : null

  /**
   * A trip here from the village's Square invitation, if there is one (UX-493).
   *
   * The SAME module-memory journey the Books trip uses — no second store, no URL
   * state, nothing persisted — read for this scope and this destination only. A
   * direct arrival at `/quest`, a reload, a journey that belongs to another
   * child and a journey to the shelf all leave this null, and then this page is
   * exactly the page it has always been.
   *
   * The identity has to be SETTLED, and it has to be THIS family's answer:
   * `useChildren` keeps the previous answer's list and `activeChild` beside an
   * unsettled, failed or newly-scoped read, so the id alone would vouch for a
   * child nobody can confirm — or for one belonging to another family. The
   * resolved object must also BE the resolved id. Fail-closed on all of it; the
   * shell's own readiness watch is what ENDS such a journey, and this gate is
   * what stops it being served in the frames before that lands.
   *
   * The epoch is subscribed rather than sampled for the same reason the town
   * subscribes it: a raw same-tick `A → B → A` leaves family and child
   * unchanged, and it is what keys the arrival suggestion's reads below.
   */
  const returnFlow = useSyncExternalStore(subscribeLibraryReturnFlow, getLibraryReturnFlow)
  const identityEpoch = useSyncExternalStore(
    subscribeLibraryIdentityEpoch,
    getLibraryIdentityEpoch,
  )
  const tripScopeTrusted =
    !childrenLoading &&
    !childrenLoadFailed &&
    isChildProfile &&
    profile !== null &&
    Boolean(familyId) &&
    childrenFamilyId === familyId &&
    Boolean(activeChildId) &&
    activeChild?.id === activeChildId
  const mineTrip = tripScopeTrusted
    ? libraryReturnForDestination(
        returnFlow,
        { familyId, childId: activeChildId },
        LibraryReturnDestination.Mine,
      )
    : null

  // ── UX-496: leaving a finished quest whose answers have not landed ────────
  //
  // The baseline: a denied close left *Try saving again* on the summary, and
  // the three exits beside it — *Back to village*, *Done*, *Try another quest*
  // — threw the held payload away, so re-entering the Mine found no source, no
  // evidence, no Retry and no Resume. Staying and retrying kept everything. So
  // the departure asks first, and the default is to stay.
  //
  // The SAME loss, from the other screen: Sol reproduced it on phone and tablet
  // as *Back to mine* → intro → *Back to village* with the manual exit's
  // partial source still saving or waiting on its Retry. So the intro's own
  // approved return takes this gate too, bound to the PARTIAL payload and the
  // intro view that owns it, and a successful Retry there leaves the child free
  // to go and to Resume later under the original id. No other intro action and
  // no global navigation is touched.
  //
  // What is held, and what is NOT. The question is the SOURCE save alone (see
  // `questExitVerdict`). A pending or failed MAP update is not an unsaved
  // quest: it is recoverable from the saved source after a village return and
  // re-entry, and the Mine's own recovery card offers it there.
  //
  // ── Stale is not clear ──────────────────────────────────────────────────
  //
  // Sol reproduced an OLD *Done* navigating after the same child had re-entered
  // the Mine following a saved return. A handler authorised by a view that no
  // longer exists must do NOTHING — not depart, not reset, not consume the
  // trip — however healthy the current save looks. So every control hands back
  // the identity of its OWN render (committed scope, epoch, view generation,
  // payload, trip) plus this mount, and the hook judges staleness before phase.
  //
  // ── One intent, consumed synchronously ──────────────────────────────────
  //
  // The prompt's intent lives in a ref as well as in state, because a retained
  // *Leave anyway* handler must not be able to navigate after a Stay, an
  // Escape, an acknowledgement or a newer prompt. The deliberate tap ADMITS
  // whatever the ref holds and clears it in the same step, then re-checks the
  // live phase and identity before it departs. A second tap keeps the first
  // valid intent. Nothing times out and nothing escapes on its own: an
  // acknowledged save closes the door and the next exit is a fresh tap.
  const exitIntentSeq = useRef(0)
  /** The one intent that may act, readable and clearable synchronously. */
  const exitIntentRef = useRef<HeldQuestExit | null>(null)
  /** The same intent, for rendering only. */
  const [exitPrompt, setExitPrompt] = useState<HeldQuestExit | null>(null)
  /**
   * Is this component instance still mounted?
   *
   * A handler retained by a PRIOR route mount closes over that instance's refs
   * and would still reach the live history object, so the mount itself is part
   * of what authorises an exit.
   *
   * Set true in SETUP as well as false in cleanup — the `AudioRecorder.liveRef`
   * shape, and not optional. StrictMode (which `main.tsx` uses, and which Sol's
   * app therefore runs) mounts, cleans up and mounts again: a ref that is only
   * ever cleared stays false after that second setup, and every guarded exit on
   * the page is then silently dead. Initialising to `true` is not enough,
   * because the initial value is not re-applied on the remount.
   */
  const exitMountedRef = useRef(true)
  useEffect(() => {
    exitMountedRef.current = true
    return () => {
      exitMountedRef.current = false
    }
  }, [])

  /** Is the journey a departure would consume still the one it was drawn for? */
  const exitTripStillLive = (generation: number) => {
    const live = getLibraryReturnFlow()
    return live !== null && live.generation === generation && live.phase === LibraryReturnPhase.Away
  }

  /**
   * Is a held intent still real — still held, and still able to act?
   *
   * Asked in the handler that is about to use it, never from an effect. An
   * intent is retired by a source ACKNOWLEDGEMENT (the verdict goes `clear`),
   * by a newer run or a new epoch (`stale`), and by its own journey ending.
   */
  const heldExitStillValid = (intent: HeldQuestExit) => {
    if (intent.tripGeneration !== undefined && !exitTripStillLive(intent.tripGeneration)) {
      return false
    }
    return quest.questExitVerdict(intent.binding).kind === 'hold'
  }

  /**
   * Admit the intent a RENDERED door was drawn for — and only that one.
   *
   * The door's three callbacks used to take whatever `exitIntentRef` happened
   * to hold, so a callback captured while prompt A was open could clear, retry
   * or depart for prompt B. Each rendered door carries its own prompt's id and
   * is admitted against the live one, which is the current-versus-retained
   * distinction this guard is built on.
   */
  const admitPromptIntent = (promptId: number | null) => {
    if (!exitMountedRef.current) return null
    const intent = exitIntentRef.current
    if (!intent || promptId === null || intent.id !== promptId) return null
    return intent
  }

  /**
   * The gate every guarded Mine exit passes through, for one payload kind.
   *
   * Called BEFORE the action mutates the trip, resets or navigates. `clear`
   * calls the action straight through, so an ordinary acknowledged exit is the
   * exit it has always been; `stale` does nothing at all.
   */
  const requestQuestExit =
    (kind: 'final' | 'partial') =>
    (depart: () => void, extra?: { tripGeneration?: number }) => {
      if (!exitMountedRef.current) return
      if (extra?.tripGeneration !== undefined && !exitTripStillLive(extra.tripGeneration)) return
      // The render's own identity, not the tap's.
      const binding: QuestExitBinding = {
        kind,
        scope: recoveryScope,
        epoch: recoveryEpoch,
        viewGeneration: quest.viewGeneration,
        runInstanceId: quest.visibleSourceSave.runInstanceId,
      }
      const verdict = quest.questExitVerdict(binding)
      if (verdict.kind === 'stale') return
      if (verdict.kind === 'clear') {
        depart()
        return
      }
      // A second tap keeps the first VALID intent rather than replacing it.
      // A hidden one that has already been retired — by an acknowledgement, a
      // newer run, a new epoch or an ended journey — must not block a fresh
      // prompt, so it is dropped here, in the tap that found it.
      const held = exitIntentRef.current
      if (held) {
        if (heldExitStillValid(held)) return
        exitIntentRef.current = null
      }
      const intent: HeldQuestExit = {
        id: (exitIntentSeq.current += 1),
        depart,
        binding,
        tripGeneration: extra?.tripGeneration,
      }
      exitIntentRef.current = intent
      setExitPrompt(intent)
    }

  const requestSummaryExit = requestQuestExit('final')
  const requestIntroExit = requestQuestExit('partial')

  /**
   * Which face the door is showing, derived from THIS render's state.
   *
   * Render state alone — no ref reads — so there is no effect, no cascading
   * setState and nothing to go stale between the render and the paint. A moved
   * identity, a retired view, a different payload or an ACKNOWLEDGED save all
   * make this null, which closes the door and leaves the ordinary actions
   * available on the next tap. The intent itself is left where it is: the
   * handlers below refuse it on their own, which is the invariant that matters.
   *
   * ── A hold always has a door ────────────────────────────────────────────
   *
   * The phase itself comes from `quest.questExitFace`, which reads the SAME
   * unfiltered notice the hook's verdict holds on. Deriving it here from
   * `visibleSourceSave` was the gap: a final save denied and then a switch to a
   * sibling's profile leaves the bound summary mounted while the notice is
   * hidden, so a freshly rendered *Done* was still held — the verdict reads the
   * real notice — and drew nothing at all. The tap vanished and every repeat
   * vanished with it. Hold and door now answer from one source, and the only
   * thing visibility changes is WHAT the door may say: where the notice is
   * hidden, `face.generic` drops the owner, the phase and the Retry and leaves
   * the plain stay-or-leave choice. It is still re-derived every render, so an
   * acknowledgement closes it and the deliberate leave re-checks live.
   */
  const exitPromptFace = (() => {
    if (!exitPrompt) return null
    const bound = exitPrompt.binding
    // The same test the hook applies, on this render's values: the epoch and
    // the view generation always, the scope only when both are settled — a read
    // that merely has not settled is not evidence that anything moved, and must
    // not shut a door the child is standing at.
    if (bound.epoch !== recoveryEpoch) return null
    if (bound.viewGeneration !== quest.viewGeneration) return null
    if (
      bound.scope !== 'unsettled' &&
      recoveryScope !== 'unsettled' &&
      bound.scope !== recoveryScope
    ) {
      return null
    }
    // The payload half — kind, run instance, owning generation, phase — asked
    // of the real notice, so a hidden one cannot close a door a hold is behind.
    return quest.questExitFace(bound)
  })()
  const exitPromptPhase: QuestExitPhase | null = exitPromptFace?.phase ?? null

  /**
   * *Stay here*, a backdrop tap and Escape: keep the screen, drop the intent.
   *
   * Only its OWN prompt's intent. A Stay retained from an earlier prompt must
   * not dismiss the one the child is looking at now.
   */
  const stayWithQuest = (promptId: number | null) => {
    if (!admitPromptIntent(promptId)) return
    exitIntentRef.current = null
    setExitPrompt(null)
  }

  /** The same same-source Retry the screen behind the door offers. */
  const retryHeldQuestSave = (promptId: number | null) => {
    const intent = admitPromptIntent(promptId)
    if (!intent) return
    if (intent.tripGeneration !== undefined && !exitTripStillLive(intent.tripGeneration)) return
    // A hidden notice's payload is not this viewer's to re-send: the generic
    // door draws no Retry, and a retained one from before the switch is refused
    // here too. Only the owner's own screen may retry it.
    if (quest.questExitFace(intent.binding)?.generic) return
    const verdict = quest.questExitVerdict(intent.binding)
    if (verdict.kind !== 'hold' || !verdict.canRetry) return
    void quest.retrySourceSave({
      runInstanceId: verdict.runInstanceId ?? intent.binding.runInstanceId,
      viewGeneration: quest.visibleSourceSave.viewGeneration,
      scopeKey: intent.binding.scope,
      epoch: intent.binding.epoch,
    })
    // The intent stays: the door waits for the outcome, and a denial comes back
    // to this same door with its Retry intact.
  }

  /** The deliberate departure — admitted once, re-checked, then taken. */
  const leaveQuestAnyway = (promptId: number | null) => {
    // Admitted against the live intent and consumed in one synchronous step,
    // so a retained handler cannot fire twice, cannot fire at all after a
    // Stay, an Escape or an acknowledgement, and cannot depart for a prompt it
    // was not drawn for.
    const intent = admitPromptIntent(promptId)
    if (!intent) return
    exitIntentRef.current = null
    setExitPrompt(null)
    if (intent.tripGeneration !== undefined && !exitTripStillLive(intent.tripGeneration)) return
    // Still held, and still this view's? An acknowledged save is NOT a licence
    // to depart from a door the child never saw resolve — it closes the door
    // and asks for a fresh tap.
    if (quest.questExitVerdict(intent.binding).kind !== 'hold') return
    intent.depart()
  }

  /**
   * The one door, rendered in BOTH branches that own a guarded exit.
   *
   * The intro returns its own `<Page>` before the quest screens do, so a door
   * placed only in the second would hold an intro's departure and show the
   * child nothing. It renders null unless `exitPromptPhase` says otherwise, so
   * putting it in both costs nothing on either.
   */
  const exitDoor = (
    <QuestExitGuardDialog
      phase={exitPromptPhase}
      generic={exitPromptFace?.generic ?? false}
      // The Retry is the visible notice's own, so a hidden one offers none —
      // the door itself refuses it under `generic`, and this says so too.
      canRetry={!exitPromptFace?.generic && quest.visibleSourceSave.canRetry}
      // Each door's callbacks carry the id of the prompt THIS render drew, so
      // a callback retained from an earlier prompt admits nothing.
      onRetry={() => retryHeldQuestSave(exitPrompt?.id ?? null)}
      onStay={() => stayWithQuest(exitPrompt?.id ?? null)}
      onLeaveAnyway={() => leaveQuestAnyway(exitPrompt?.id ?? null)}
    />
  )

  /**
   * The ordinary Start, taken by the suggested mode's own card — and only by a
   * tap that is still the trip it was drawn for.
   *
   * Keying the suggestion does not protect a handler already captured by a
   * rendered card, which is how a role change to parent still started a real
   * quest (and a real AI call). So the activation re-checks, against the store
   * rather than against the closure: the identity epoch this page committed
   * with, and a live Mine journey of this generation for this scope. Refused
   * means nothing starts.
   */
  const startSuggestedMode = (
    config: QuestDomainConfig,
    generation: number,
    /**
     * UX-495 — the offer the card COMMITTED, when it is the one the addition
     * pilot may run on. Absent for every other suggestion, and absent on every
     * ordinary mode card, so those Starts are untouched.
     */
    pilotOffer?: MineAdditionPilotOffer | null,
  ) => {
    if (!tripScopeTrusted) return
    if (identityEpoch !== getLibraryIdentityEpoch()) return
    const live = libraryReturnForDestination(
      getLibraryReturnFlow(),
      { familyId, childId: activeChildId },
      LibraryReturnDestination.Mine,
    )
    if (!live || live.generation !== generation) return
    setActiveDomain(config)
    /**
     * The request, assembled where each half is actually known: the card owns
     * the offer, this host owns the scope and the journey, and the Start owns
     * the model, the level and the calibration. `tripStillLive` is read from
     * the STORE when the Start asks — after its own awaited reads — so a
     * journey that ended in that window takes the pilot with it and leaves the
     * ordinary calibrated Math Start exactly as it is.
     */
    if (!pilotOffer) {
      // The ordinary suggested Start, called exactly as it always has been.
      void quest.startQuest(config.domain, config.questMode)
      return
    }
    const pilot: MineAdditionPilotRequest = {
      ...pilotOffer,
      familyId,
      childId: activeChildId,
      tripGeneration: generation,
      tripStillLive: () => {
        if (identityEpoch !== getLibraryIdentityEpoch()) return false
        const trip = libraryReturnForDestination(
          getLibraryReturnFlow(),
          { familyId, childId: activeChildId },
          LibraryReturnDestination.Mine,
        )
        return trip !== null && trip.generation === generation
      },
    }
    void quest.startQuest(config.domain, config.questMode, pilot)
  }

  const phonicsSecure = isPhonicsSecure(snapshot)

  // Per-quest domain gating (ARCH-16): each quest family requires its own
  // domain's calibration. The hub entry is generic (any Mine-domain data), but
  // a child sees only the quests they're calibrated for — an uncalibrated quest
  // is simply absent (no "not ready" message). Closes the math-only → reading leak.
  const showReadingQuests = hasReadingCalibration(snapshot)
  const showMathQuests = hasMathCalibration(snapshot)

  // Build reading modes with recommendation badges
  const readingModes = READING_MODES.map((m) => ({
    ...m,
    recommended: m.questMode !== 'phonics' && phonicsSecure,
  }))

  // Reorder: if phonics secure, put comprehension and fluency first
  const orderedReadingModes = phonicsSecure
    ? [...readingModes.filter((m) => m.questMode !== 'phonics'), ...readingModes.filter((m) => m.questMode === 'phonics')]
    : readingModes

  /**
   * UX-339 — BIND, said out loud. The header can move to another child while a
   * quest is running, and every write this session makes still belongs to the
   * child it was started for. Say so on the screen, BEFORE the last question,
   * rather than in a receipt afterwards (the UX-313 rule) — this is the surface
   * that reaches `hours`, `skillSnapshots` and `xpLedger` in one go.
   *
   * Kid copy, held to the shared readability bar: the parent moved the header,
   * but the boy is the one looking at the screen.
   */
  const ownerBanner = quest.sessionLeftItsChild ? (
    <Box
      sx={{
        border: `2px solid ${MC.stone}`,
        bgcolor: 'rgba(0,0,0,0.35)',
        px: 1.5,
        py: 1,
        mb: 1.5,
      }}
    >
      {questOwnerLines(quest.sessionOwnerName).map((line) => (
        <Typography
          key={line}
          sx={{ fontFamily: MC.font, fontSize: '0.5rem', color: MC.white, lineHeight: 1.8 }}
        >
          {line}
        </Typography>
      ))}
    </Box>
  ) : null

  // ── Fluency mode screens ────────────────────────────────────
  if (
    quest.screen === QuestScreen.FluencyPassage ||
    quest.screen === QuestScreen.FluencyRecording ||
    quest.screen === QuestScreen.FluencySelfCheck ||
    quest.screen === QuestScreen.FluencySummary
  ) {
    return (
      <Page>
        <Button
          onClick={quest.resetToIntro}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.4rem',
            color: MC.stone,
            textTransform: 'none',
            mb: 1,
            '&:hover': { color: MC.white },
          }}
        >
          ← Back to mine
        </Button>
        {/* The trip's way back, on the fluency SUMMARY only — this branch
            returns before the general summary's copy of it. A fluency session
            still in progress keeps only its own existing exit. */}
        {mineTrip && quest.screen === QuestScreen.FluencySummary && (
          <MineTripExit generation={mineTrip.generation} />
        )}
        {ownerBanner}
        <FluencyPractice quest={quest} />
      </Page>
    )
  }

  // ── Intro screen ──────────────────────────────────────────────
  if (quest.screen === QuestScreen.Intro) {
    return (
      <Page>
        {/* The way back to the village, for THIS trip only. Nothing starts,
            finishes or saves here: it is the journey's own one-use request. */}
        {/* UX-496 — the same approved return, guarded by the PARTIAL payload
            this intro owns: a manual exit whose write is still saving, or
            waiting on the Retry on the card below, must not lose it to a
            village return. Ordinary intros are unaffected — nothing is owed,
            so the tap goes straight through. */}
        {mineTrip && (
          <MineTripExit generation={mineTrip.generation} requestExit={requestIntroExit} />
        )}
        <Box
          sx={{
            bgcolor: MC.bg,
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>⛏️</Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.8rem',
              color: MC.gold,
              mb: 1,
              lineHeight: 1.8,
            }}
          >
            Knowledge Mine
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.5rem',
              color: MC.white,
              mb: 2,
              lineHeight: 1.8,
            }}
          >
            Hey {childName}! Ready to mine some knowledge?
          </Typography>

          {/* Avatar + armor tier */}
          {!xpLedger.loading && (
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mb: 3 }}>
              <MinecraftAvatar xp={xpLedger.totalXp} scale={2} />
              <Box sx={{ textAlign: 'left' }}>
                <Typography
                  sx={{
                    fontFamily: MC.font,
                    fontSize: '0.45rem',
                    color: xpLedger.armorTier.color,
                    lineHeight: 1.8,
                  }}
                >
                  {xpLedger.armorTier.title}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: MC.font,
                    fontSize: '0.4rem',
                    color: MC.stone,
                  }}
                >
                  {xpLedger.totalXp} XP
                </Typography>
              </Box>
            </Stack>
          )}

          {/* ── Resume card ──────────────────────────────────── */}
          {resumeCard && (
            <ResumeCard
              /* Keyed by the identity it was read under, so a card from a
                 previous scope cannot be reused for a new one. */
              key={`${resumeCard.scope}|${resumeCard.epoch}|${resumeCard.session.id ?? 'row'}`}
              session={resumeCard.session}
              /* UX-494 — a reoffered `resumed` row may still be open in
                 another tab, where discarding it would write `abandoned` over
                 that run's only saved point. Resume converges; discard cannot,
                 so it is not offered (and the write refuses it too). The
                 ordinary fresh mode cards below are the way on. */
              allowStartFresh={resumeCard.session.status !== 'resumed'}
              onResume={() => {
                const session = resumeCard.session
                const domain = session.domain as EvaluationDomain
                const mode = session.questMode
                const scopeAtTap = resumeCard.scope
                const epochAtTap = resumeCard.epoch
                setResumeRefusal(null)
                void (async () => {
                  const outcome = await quest.resumeSession(session)
                  // Scoped AFTER the await, like *Start fresh* and the graph
                  // retry: a result arriving once the identity has moved
                  // belongs to nobody's screen, and it must not write a
                  // refusal or a domain onto the new child's intro.
                  const live = liveRecovery.current
                  if (live.scope !== scopeAtTap || live.epoch !== epochAtTap) return
                  if (outcome !== true) {
                    // UX-494 — say so, and start NOTHING. The old fallback ran a
                    // fresh paid quest nobody asked for, in whatever mode this
                    // card happened to name.
                    setResumeRefusal(outcome)
                    // Retire ONLY this exact row, and only when the SOURCE
                    // refused it. A rejected claim transport and a busy intro
                    // lane leave the saved point intact and still eligible, so
                    // the card stays and the copy asks for another tap —
                    // dropping it there told a child their quest was gone.
                    if (outcome !== 'claim-failed' && outcome !== 'stale-scope') {
                      setResumeRead((current) =>
                        current &&
                        current.scope === scopeAtTap &&
                        current.epoch === epochAtTap &&
                        current.session?.id === session.id
                          ? { ...current, session: null }
                          : current,
                      )
                    }
                    return
                  }
                  setActiveDomain(
                    [...READING_MODES, ...MATH_MODES].find(
                      (m) => m.domain === domain && m.questMode === mode,
                    ) ?? READING_MODES[0],
                  )
                })()
              }}
              onStartFresh={() => {
                // UX-494 — the hook's discard, which holds the SAME intro
                // action claim Start and Resume hold, so the card's two buttons
                // cannot race each other: a discard tapped while a Resume's
                // claim transaction is in flight is refused rather than landing
                // an `abandoned` stamp on the record that Resume is about to
                // reopen. (It is still the guarded transition underneath, so a
                // finalized or another child's record is refused as before.)
                const session = resumeCard.session
                const scopeAtTap = resumeCard.scope
                const epochAtTap = resumeCard.epoch
                const retireThisCard = () =>
                  setResumeRead((current) =>
                    current &&
                    current.scope === scopeAtTap &&
                    current.epoch === epochAtTap &&
                    current.session?.id === session.id
                      ? { ...current, session: null }
                      : current,
                  )
                if (!session.id || !session.childId) {
                  retireThisCard()
                  return
                }
                setResumeRefusal(null)
                void (async () => {
                  const outcome = await quest.discardPartial(
                    { id: session.id, childId: session.childId },
                    { scopeKey: scopeAtTap, epoch: epochAtTap },
                  )
                  // Scoped AFTER the await: a result that arrives once the
                  // identity has moved belongs to nobody's screen.
                  const live = liveRecovery.current
                  if (live.scope !== scopeAtTap || live.epoch !== epochAtTap) return
                  if (outcome === 'abandoned' || outcome === 'already-abandoned') {
                    retireThisCard()
                    return
                  }
                  // The record was not closed out, so the card must not pretend
                  // it was — and it stays on screen, because a refused discard
                  // during a Resume is a *tap it again*, not a loss.
                  setResumeRefusal(
                    outcome === 'refused'
                      ? 'finalized'
                      : outcome === 'stale-scope'
                        ? 'stale-scope'
                        : 'missing',
                  )
                })()
              }}
            />
          )}

          {/* ── A Resume or Start fresh that was refused (UX-494) ──
              One line, and no reassurance underneath it: *"Your answers are
              safe"* is the saved source's sentence, and a refusal may be about
              a record that is gone. */}
          {resumeRefusal && (
            <RecoveryNotice title={QUEST_RESUME_REFUSAL_COPY[resumeRefusal]} />
          )}

          {/* ── A held payload that never reached Firestore (UX-494) ──
              The manual-exit partial's owning view: its save is a transaction
              and can be rejected offline, and the minutes are already recorded,
              so the answers get the same scoped retry a failed close gets.
              Its copy is its OWN: these answers are not safe yet, and the
              recovery card's sentence saying they are would be a lie here. */}
          {/* The notice follows its OWNER, not the intro (UX-494): a child
              change re-renders this intro under a sibling, and the previous
              child's unsaved answers are neither that child's business nor
              retryable from there — by a parent either. It comes back when an
              authorised view returns to the owning child. */}
          {quest.visibleSourceSave.kind === 'partial' &&
            Boolean(activeChildId) &&
            quest.visibleSourceSave.originalChildId === activeChildId &&
            (quest.visibleSourceSave.state === 'failed' ||
              quest.visibleSourceSave.state === 'saving') && (
              <RecoveryNotice
                key={quest.visibleSourceSave.runInstanceId ?? 'partial-save'}
                title={
                  quest.visibleSourceSave.state === 'saving'
                    ? QUEST_UNSAVED_COPY.saving
                    : QUEST_UNSAVED_COPY.title
                }
                body={QUEST_UNSAVED_COPY.body}
                action={quest.visibleSourceSave.canRetry ? QUEST_UNSAVED_COPY.action : undefined}
                onAction={
                  quest.visibleSourceSave.canRetry
                    ? () =>
                        quest.retrySourceSave({
                          runInstanceId: quest.visibleSourceSave.runInstanceId,
                          viewGeneration: quest.visibleSourceSave.viewGeneration,
                          // This render's identity, which is what authorises the
                          // tap — the payload's own run selects what it writes.
                          scopeKey: recoveryScope,
                          epoch: recoveryEpoch,
                        })
                    : undefined
                }
              />
            )}

          {/* ── Map still waiting (UX-494) ─────────────────────
              Scoped at render AND re-checked at the write: the key drops the
              card on any identity change, the scope and epoch the tap carries
              are compared against the committed ones, and only this card's own
              settled attempt may clear and re-read it. */}
          {graphRecoveryCard?.session && (
            <RecoveryNotice
              key={`${graphRecoveryCard.scope}|${graphRecoveryCard.epoch}|${graphRecoveryCard.session.id}`}
              title={QUEST_RECOVERY_COPY.title}
              body={QUEST_RECOVERY_COPY.body}
              action={QUEST_RECOVERY_COPY.action}
              onAction={async () => {
                // The retry targets the binding the card was DRAWN from — the
                // same session, scope and epoch the query read under — so it
                // can never address a coincidentally equal id in a newer scope.
                const card = graphRecoveryCard.session
                if (!card) return
                const cardId = card.id
                const scopeAtTap = graphRecoveryCard.scope
                const epochAtTap = graphRecoveryCard.epoch
                const outcome = await quest.retryGraphProjection(cardId, card.childId, {
                  domain: card.domain,
                  questMode: card.questMode,
                  scopeKey: scopeAtTap,
                  epoch: epochAtTap,
                  viewGeneration: quest.viewGeneration,
                })
                // A failure, a refusal, an attempt already in flight, or a model
                // that does not exist yet all leave the source pending and the
                // card with it.
                if (
                  outcome === 'failed' ||
                  outcome === 'identity-mismatch' ||
                  outcome === 'busy' ||
                  outcome === 'no-model'
                ) {
                  return
                }
                // Only THIS card's own settled attempt may retire it: the
                // identity must still be the one it was tapped under, and the
                // loaded answer must still be the one it was drawn from.
                const live = liveRecovery.current
                if (live.scope !== scopeAtTap || live.epoch !== epochAtTap) return
                setGraphRecovery((current) =>
                  current &&
                  current.scope === scopeAtTap &&
                  current.epoch === epochAtTap &&
                  current.session?.id === cardId
                    ? { ...current, session: null }
                    : current,
                )
                setGraphRecoveryNonce((n) => n + 1)
              }}
            />
          )}

          {/* ── The village's suggestion, revalidated here (UX-493) ──
              Mounted under family, child, profile and the identity epoch, so a
              child change, a role change and a raw same-tick A → B → A each
              destroy its reads rather than carrying them, and rendered only
              while THIS page's own read still recommends the mode the village
              offered. It is an offer with the mode's ordinary Start, guarded at
              activation; the sections below keep every calibrated choice, and
              the Resume card above keeps its place. */}
          {mineTrip && (
            <MineTripSuggestion
              key={`${familyId}_${activeChildId}|${profile}|${identityEpoch}`}
              familyId={familyId}
              childId={activeChildId}
              suggestion={mineTrip.suggestion}
              generation={mineTrip.generation}
              onStart={startSuggestedMode}
            />
          )}

          {/* ── READING section (only if reading-calibrated) ─── */}
          {showReadingQuests && (
            <DomainSection label="READING" icon="📖">
              {orderedReadingModes.map((qd) => (
                <QuestCard
                  key={`${qd.domain}-${qd.questMode}`}
                  config={qd}
                  onSelect={() => {
                    setActiveDomain(qd)
                    void quest.startQuest(qd.domain, qd.questMode)
                  }}
                />
              ))}
            </DomainSection>
          )}

          {/* ── MATH section (only if math-calibrated) ───────── */}
          {showMathQuests && (
            <DomainSection label="MATH" icon="➕">
              {MATH_MODES.map((qd) => (
                <QuestCard
                  key={`${qd.domain}-${qd.questMode}`}
                  config={qd}
                  onSelect={() => {
                    setActiveDomain(qd)
                    void quest.startQuest(qd.domain, qd.questMode)
                  }}
                />
              ))}
            </DomainSection>
          )}

          {/* ── SPEECH section ──────────────────────────────── */}
          <DomainSection label="SPEECH" icon="🗣️">
            {SPEECH_MODES.map((qd) => (
              <QuestCard
                key={`${qd.domain}-${qd.questMode}`}
                config={qd}
                onSelect={() => {}}
              />
            ))}
          </DomainSection>

          {/* Error display with retry */}
          {(quest.startQuestError || quest.aiError) && (
            <Alert
              severity="error"
              sx={{ mb: 2, fontFamily: MC.font, fontSize: '0.4rem' }}
              action={
                activeDomain ? (
                  <Button
                    color="inherit"
                    size="small"
                    sx={{ fontFamily: MC.font, fontSize: '0.35rem' }}
                    onClick={() => void quest.startQuest(activeDomain.domain, activeDomain.questMode)}
                  >
                    Try Again
                  </Button>
                ) : undefined
              }
            >
              {quest.startQuestError || quest.aiError?.message || 'Something went wrong'}
            </Alert>
          )}

          {/* Streak display */}
          <Box sx={{ mb: 2 }}>
            {quest.streak.currentStreak > 0 && (
              <Typography
                sx={{
                  fontFamily: MC.font,
                  fontSize: '0.45rem',
                  color: MC.gold,
                  mb: 0.5,
                }}
              >
                {'⭐'.repeat(Math.min(quest.streak.currentStreak, 7))} {quest.streak.currentStreak} day streak!
              </Typography>
            )}
            <Typography
              sx={{
                fontFamily: MC.font,
                fontSize: '0.4rem',
                color: MC.stone,
              }}
            >
              Last quest: {daysAgo(quest.streak.lastQuestDate)}
            </Typography>
          </Box>
        </Box>
        {/* UX-496 — the door for this intro's own return, while the partial
            source a manual exit left behind is still saving or unsaved. */}
        {exitDoor}
      </Page>
    )
  }

  // ── Active quest screens ──────────────────────────────────────

  return (
    <Page>
      {ownerBanner}

      {/* Back button (not on summary) */}
      {quest.screen !== QuestScreen.Summary && (
        <Button
          onClick={quest.resetToIntro}
          sx={{
            fontFamily: MC.font,
            fontSize: '0.4rem',
            color: MC.stone,
            textTransform: 'none',
            mb: 1,
            '&:hover': { color: MC.white },
          }}
        >
          ← Back to mine
        </Button>
      )}

      {/* Loading */}
      {quest.screen === QuestScreen.Loading && <QuestLoading />}

      {/* Question */}
      {quest.screen === QuestScreen.Question && quest.currentQuestion && quest.questState && (
        quest.currentQuestion.type === 'build-sentence' ? (
          <BuildSentenceQuestionScreen
            question={quest.currentQuestion}
            questState={quest.questState}
            consecutiveWrong={quest.questState.consecutiveWrong}
            onAnswer={quest.submitAnswer}
            onAnswerWithMethod={quest.submitAnswer}
            onSkip={quest.handleSkip}
            domainLabel="Sentence Builder"
          />
        ) : quest.currentQuestion.type === 'build-word' || quest.currentQuestion.type === 'spell-word' ? (
          <BuildWordQuestionScreen
            question={quest.currentQuestion}
            questState={quest.questState}
            consecutiveWrong={quest.questState.consecutiveWrong}
            onAnswer={quest.submitAnswer}
            onAnswerWithMethod={quest.submitAnswer}
            onSkip={quest.handleSkip}
            domainLabel={quest.currentQuestion.type === 'spell-word' ? 'Spelling' : (activeDomain?.label || 'Reading Quest')}
          />
        ) : (
          <QuestQuestionScreen
            question={quest.currentQuestion}
            questState={quest.questState}
            consecutiveWrong={quest.questState.consecutiveWrong}
            onAnswer={quest.submitAnswer}
            onAnswerWithMethod={quest.submitAnswer}
            onSkip={quest.handleSkip}
            domainLabel={activeDomain?.label || 'Reading Quest'}
            domain={activeDomain?.domain || 'reading'}
            questMode={quest.questMode}
          />
        )
      )}

      {/* Feedback */}
      {quest.screen === QuestScreen.Feedback && quest.lastAnswer && quest.questState && (
        <QuestFeedback
          correct={quest.lastAnswer.correct}
          correctAnswer={quest.lastAnswer.correctAnswer}
          encouragement={quest.lastAnswer.encouragement}
          childAnswer={quest.lastAnswer.correctAnswer}
        />
      )}

      {/* The same one way back, on the summary — the other screen this trip is
          offered from. Done, Try again and every writer behind them are
          untouched; an active quest still exits through its own reset. */}
      {mineTrip && quest.screen === QuestScreen.Summary && (
        <MineTripExit generation={mineTrip.generation} requestExit={requestSummaryExit} />
      )}

      {/* Summary */}
      {quest.screen === QuestScreen.Summary && quest.questState && (
        <QuestSummary
          totalCorrect={quest.questState.totalCorrect}
          finalLevel={quest.questState.currentLevel}
          streak={quest.streak}
          findings={quest.findings}
          previousTotalXp={Math.max(0, xpLedger.totalXp - quest.questState.totalCorrect * 2)}
          skippedCount={quest.answeredQuestions.filter((q) => q.skipped).length}
          flaggedErrorCount={quest.answeredQuestions.filter((q) => q.flaggedAsError).length}
          strugglingWords={[...new Set(
            quest.answeredQuestions
              .filter((q) => (!q.correct || q.skipped) && !q.flaggedAsError)
              .map((q) => extractTargetWord(q))
              .filter((w): w is string => w !== null),
          )]}
          hitLevelCap={quest.hitLevelCap}
          questMode={quest.questMode}
          // UX-494 — the two save successes, and their retries. The source
          // retry is the held payload's own; the map retry reads the saved
          // source, so it works here and again after a reload.
          sourceSave={quest.visibleSourceSave}
          graphSync={quest.graphSync}
          // Both retries carry the identity of the view they were RENDERED in,
          // so an old summary's settled attempt cannot relabel a newer
          // same-child summary (UX-494).
          onRetrySourceSave={() =>
            void quest.retrySourceSave({
              runInstanceId: quest.visibleSourceSave.runInstanceId,
              viewGeneration: quest.visibleSourceSave.viewGeneration,
              // A summary stays bound to its owner across a same-family child
              // change (UX-339), so a FRESH button here is authorised by this
              // render's identity rather than by the close's (UX-494).
              scopeKey: recoveryScope,
              epoch: recoveryEpoch,
            })
          }
          onRetryGraphSync={() => {
            const { sessionId, childId } = quest.graphSync
            if (!sessionId || !childId) return
            void quest.retryGraphProjection(sessionId, childId, {
              domain: quest.questDomain,
              questMode: quest.questMode,
              scopeKey: recoveryScope,
              epoch: recoveryEpoch,
              viewGeneration: quest.viewGeneration,
            })
          }}
          onDone={quest.resetToIntro}
          onTryAgain={() => {
            quest.resetToIntro()
          }}
          // UX-496 — Done, Try another quest and the conditional practice-story
          // button all leave this summary, so all three take the same gate.
          requestExit={requestSummaryExit}
        />
      )}

      {/* UX-496 — the same door, for the completion summary's close.
          `exitPromptPhase` is null unless THIS render's state still owes the
          held payload something, so a moved identity, a retired view and an
          acknowledged save all close it. */}
      {exitDoor}

      {/* Error display */}
      {quest.aiError && (
        <Box sx={{ mt: 2 }}>
          <ErrorState message="Something went wrong" error={quest.aiError} />
        </Box>
      )}
    </Page>
  )
}

// ── Sub-components ──────────────────────────────────────────────

/**
 * The village's way back, for a live Mine trip only (UX-493).
 *
 * Holds nothing and reads nothing: the journey decides whether the tap is
 * accepted and WHERE it goes (the entry the child actually left from), so a tap
 * that lands after the scope moved navigates nowhere at all. One use per
 * journey, by the generation this render was given.
 */
function MineTripExit({
  generation,
  requestExit,
}: {
  generation: number
  /**
   * UX-496 — the departure gate, on the two screens that own a payload: the
   * completion summary and the intro a manual exit landed on. Absent on the
   * fluency summary, and then this button is byte-for-byte the one it has
   * always been.
   *
   * The journey is consumed INSIDE the departure, never before it, and the
   * generation this render was given is handed to the gate so a held or
   * refused exit leaves the one-use return intact — *Stay here* keeps a
   * working way back.
   */
  requestExit?: (depart: () => void, extra?: { tripGeneration?: number }) => void
}) {
  const navigate = useNavigate()
  const depart = () => {
    const returning = requestLibraryReturn(generation)
    if (!returning) return
    navigate(libraryReturnPath(returning))
  }
  return (
    <Button
      onClick={() =>
        requestExit ? requestExit(depart, { tripGeneration: generation }) : depart()
      }
      sx={{
        // NEW child-facing text, so this feature's readability rule applies and
        // the legacy Mine's 0.4rem pixel font around it does not: plain, at
        // least 14px, on the 44px target it already had.
        fontSize: '14px',
        lineHeight: 1.45,
        color: MC.stone,
        textTransform: 'none',
        minHeight: 44,
        mb: 1,
        '&:hover': { color: MC.white },
      }}
    >
      🏰 {MINE_RETURN_LABEL}
    </Button>
  )
}

/**
 * The village's suggested mode, revalidated against this page's own read.
 *
 * The journey carries what the village offered; it is a suggestion, not an
 * authorisation, so nothing here trusts it. This re-reads the child's own model
 * and snapshot inside its own mount scope, runs the SAME pure selector the
 * village ran, and offers the mode only while the two agree. A recommendation
 * that moved while the child was walking over (an evaluation, a quest, a review
 * apply) simply leaves the Mine as it is — every calibrated mode is still listed
 * below, so nothing is taken away by the suggestion going quiet.
 *
 * Nothing autostarts: the card's tap is the mode's ordinary Start, the same call
 * its own section card makes.
 */
function MineTripSuggestion({
  familyId,
  childId,
  suggestion,
  generation,
  onStart,
}: {
  familyId: string
  childId: string
  suggestion: MineInvitation | null
  /** The journey this card was drawn for — re-checked at activation. */
  generation: number
  onStart: (
    config: QuestDomainConfig,
    generation: number,
    pilotOffer?: MineAdditionPilotOffer | null,
  ) => void
}) {
  const { snapshot, loaded } = useChildSkillSnapshot(familyId, childId)
  const { model, loading } = useLearnerModel(familyId, childId)
  const settled = loaded && !loading

  const current = settled
    ? selectMineInvitation({
        model,
        readingCalibrated: hasReadingCalibration(snapshot),
        mathCalibrated: hasMathCalibration(snapshot),
        // UX-495 — a model document stamped for another child cannot lend this
        // read a synthesis generation. The mode decision is unchanged.
        expectedChildId: childId,
      })
    : null

  // The mode is what was offered and what is still recommended — the concept may
  // legitimately differ (the queue moved on inside the same mode), and the offer
  // was only ever a mode.
  const agreed =
    current &&
    suggestion &&
    current.domain === suggestion.domain &&
    current.questMode === suggestion.questMode
      ? current
      : null
  const config = agreed
    ? [...READING_MODES, ...MATH_MODES].find(
        (m) => m.domain === agreed.domain && m.questMode === agreed.questMode,
      )
    : undefined

  /**
   * UX-495 — is this offer the one the addition pilot may run on?
   *
   * Stricter than the ordinary agreement above on purpose. The ordinary offer
   * is a MODE, so a concept that moved inside the same mode still starts the
   * mode; a probe is about one concept from one piece of advice, so all three
   * generations have to be the same one:
   *
   *   • the TOWN's, carried on the trip (`suggestion.synthesisGeneratedAt`);
   *   • this page's own COMMITTED read (`agreed.synthesisGeneratedAt`);
   *   • and the Start's re-read, compared inside `resolveMineAdditionPilot`.
   *
   * Without the first of those, a same-concept synthesis **B** that replaced
   * **A** while the child walked over still looked like the same offer, because
   * the concept, the mode and the source were all unchanged. A missing or blank
   * value on either side is not a usable generation, so there is no pilot and
   * the suggestion behaves exactly as it does today.
   *
   * Derived as two plain strings and assembled in a `useMemo`, so the object
   * below has a stable identity: the layout effect that commits it names it as
   * a dependency, and an object literal rebuilt every render would make that
   * effect re-run every render (the `exhaustive-deps` warning this answers —
   * by deriving it cleanly, not by suppressing it).
   */
  const offeredGeneration =
    typeof suggestion?.synthesisGeneratedAt === 'string'
      ? suggestion.synthesisGeneratedAt.trim()
      : ''
  const pilotGeneration =
    agreed &&
    suggestion &&
    agreed.questMode === 'math' &&
    agreed.conceptId === MINE_ADDITION_PROBE_CONCEPT &&
    agreed.conceptId === suggestion.conceptId &&
    agreed.source === MineInvitationSource.Synthesis &&
    suggestion.source === MineInvitationSource.Synthesis &&
    offeredGeneration !== '' &&
    agreed.synthesisGeneratedAt === offeredGeneration
      ? offeredGeneration
      : ''
  const pilotConceptId = pilotGeneration ? MINE_ADDITION_PROBE_CONCEPT : ''
  const pilotOffer: MineAdditionPilotOffer | null = useMemo(
    () =>
      pilotConceptId && pilotGeneration
        ? {
            conceptId: pilotConceptId,
            domain: EvaluationDomain.Math,
            questMode: 'math',
            offerSource: MineInvitationSource.Synthesis,
            synthesisGeneratedAt: pilotGeneration,
          }
        : null,
    [pilotConceptId, pilotGeneration],
  )

  /**
   * The agreement this card most recently COMMITTED.
   *
   * Keying this component protects it from a change of IDENTITY; the host's own
   * guard protects the start from a change of identity or journey. Neither sees
   * the third case, which is the one that reached a real AI call: the identity
   * and the journey are untouched and the OFFER goes away — the model is
   * removed, the read fails, or the recommendation moves to another mode — while
   * this component stays mounted. The card stops rendering, but a callback a
   * test (or a browser) already captured still held the old agreement.
   *
   * Written in a layout effect, not during render: a render React abandons must
   * not be able to authorise a start, and a commit that renders no card records
   * `null`, which refuses.
   */
  const committed = useRef<{
    settled: boolean
    agreed: MineInvitation | null
    /** The pilot offer this commit made, if any — never a render's (UX-495). */
    pilotOffer: MineAdditionPilotOffer | null
  }>({
    settled: false,
    agreed: null,
    pilotOffer: null,
  })
  useLayoutEffect(() => {
    committed.current = { settled, agreed, pilotOffer }
  }, [settled, agreed, pilotOffer])

  if (!agreed || !config) return null

  return (
    <Box sx={{ mb: 2, textAlign: 'left' }}>
      <QuestCard
        // The invitation's own words, and the mode it opens named underneath —
        // no level, count or score in the offer.
        config={{ ...config, label: agreed.label, description: config.label }}
        suggested
        // Three things have to hold, and this is the one only this component
        // can check: the offer committed on screen is still the offer this
        // handler was drawn for. The host then re-checks the identity and the
        // journey before anything starts.
        onSelect={() => {
          const live = committed.current
          if (!live.settled || !live.agreed) return
          if (
            live.agreed.questMode !== agreed.questMode ||
            live.agreed.domain !== agreed.domain
          )
            return
          /**
           * The pilot offer is taken from the COMMIT, and only when it is
           * still the offer this handler was drawn for. A probe is an
           * observation about one concept from one synthesis, so a concept,
           * source or generation that moved since this render simply drops the
           * pilot — the mode's ordinary Start, which this tap has always been,
           * is unaffected.
           */
          const stillPilot =
            live.pilotOffer &&
            pilotOffer &&
            live.pilotOffer.conceptId === pilotOffer.conceptId &&
            live.pilotOffer.offerSource === pilotOffer.offerSource &&
            live.pilotOffer.synthesisGeneratedAt === pilotOffer.synthesisGeneratedAt
              ? live.pilotOffer
              : null
          onStart(config, generation, stillPilot)
        }}
      />
    </Box>
  )
}

function DomainSection({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2, textAlign: 'left' }}>
      <Typography
        sx={{
          fontFamily: MC.font,
          fontSize: '0.4rem',
          color: MC.stone,
          mb: 1,
          pl: 0.5,
        }}
      >
        {icon} {label}
      </Typography>
      <Stack spacing={1}>
        {children}
      </Stack>
    </Box>
  )
}

function QuestCard({
  config,
  onSelect,
  suggested,
}: {
  config: QuestDomainConfig
  onSelect: () => void
  /** The village's revalidated offer (UX-493) — a label, never a gate. */
  suggested?: boolean
}) {
  const { enabled, icon, label, description, recommended } = config

  return (
    <Box
      role={enabled ? 'button' : undefined}
      tabIndex={enabled ? 0 : undefined}
      onClick={() => {
        if (enabled) onSelect()
      }}
      onKeyDown={(e) => {
        if (enabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect()
        }
      }}
      sx={{
        bgcolor: MC.darkStone,
        border: `2px solid ${enabled ? MC.gold : MC.stone}`,
        borderRadius: 2,
        p: 2,
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.4,
        transition: 'border-color 0.15s',
        '&:hover': enabled ? { borderColor: MC.diamond } : {},
        '&:focus-visible': enabled ? { borderColor: MC.diamond, outline: 'none' } : {},
      }}
    >
      <Typography sx={{ fontSize: '1.5rem' }}>{icon}</Typography>
      <Box sx={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          // The suggested card carries an extra chip beside a sentence-length
          // label, which has nowhere to go on a 390px phone unless the row is
          // allowed to wrap. Ordinary cards keep their single line.
          sx={suggested ? { flexWrap: 'wrap', rowGap: 0.5 } : undefined}
        >
          <Typography
            sx={
              suggested
                ? // NEW child-facing text: plain and readable, not the legacy
                  // pixel font at 0.5rem. Local to this variant on purpose.
                  {
                    fontSize: '16px',
                    fontWeight: 700,
                    lineHeight: 1.4,
                    color: enabled ? MC.white : MC.stone,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }
                : {
                    fontFamily: MC.font,
                    fontSize: '0.5rem',
                    color: enabled ? MC.white : MC.stone,
                  }
            }
          >
            {label}
          </Typography>
          {suggested && (
            <Chip
              label="From your village"
              size="small"
              sx={{
                fontSize: '14px',
                lineHeight: 1.3,
                height: 'auto',
                maxWidth: '100%',
                bgcolor: MC.diamond,
                color: MC.bg,
                fontWeight: 700,
                '& .MuiChip-label': { px: 1, py: 0.25, whiteSpace: 'normal' },
              }}
            />
          )}
          {recommended && (
            <Chip
              label="Recommended"
              size="small"
              sx={{
                fontFamily: MC.font,
                fontSize: '0.3rem',
                height: 18,
                bgcolor: MC.green,
                color: MC.bg,
                fontWeight: 700,
              }}
            />
          )}
        </Stack>
        {description && (
          <Typography
            sx={
              suggested
                ? {
                    fontSize: '14px',
                    lineHeight: 1.45,
                    color: MC.stone,
                    mt: 0.5,
                    overflowWrap: 'anywhere',
                  }
                : {
                    fontFamily: MC.font,
                    fontSize: '0.35rem',
                    color: MC.stone,
                    mt: 0.5,
                  }
            }
          >
            {description}
          </Typography>
        )}
        {/* The reward teaser belongs to the ordinary cards, which all still
            carry it. The village's single offer stays about the MODE it opens:
            the same line repeated here would be the loudest thing on a card
            whose whole job is one invitation. No reward rule changes. */}
        {enabled && !suggested && (
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.3rem',
              color: MC.diamond,
              mt: 0.3,
            }}
          >
            Earn diamonds 💎
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/**
 * The Mine's one scoped recovery notice (UX-494).
 *
 * Three callers, one shape: a refused Resume, a held payload that never reached
 * Firestore, and a saved source whose map update has not been applied. Nothing
 * about a level, a score or a count — his answers are safe and the notice says
 * only what is left to do. A retry runs its ONE write and nothing else, so no
 * completion side effect is repeated, and the button is disabled while it is in
 * flight so a second tap is not a second attempt.
 *
 * NEW child-facing text: plain, at least 14px, on a 44px target.
 */
function RecoveryNotice({
  title,
  body,
  action,
  onAction,
}: {
  title: string
  /** Omitted where the title says the whole truth on its own. */
  body?: string
  action?: string
  onAction?: () => void | Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Box
      sx={{
        bgcolor: MC.darkStone,
        border: `2px solid ${MC.gold}`,
        borderRadius: 2,
        p: 2,
        mb: 2,
        textAlign: 'left',
      }}
    >
      <Typography sx={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.4, color: MC.white }}>
        {title}
      </Typography>
      {body && (
        <Typography sx={{ fontSize: '14px', lineHeight: 1.45, color: MC.stone, mt: 0.5 }}>
          {body}
        </Typography>
      )}
      {action && onAction && (
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void Promise.resolve(onAction()).finally(() => setBusy(false))
          }}
          sx={{
            fontSize: '14px',
            textTransform: 'none',
            minHeight: 44,
            mt: 1,
            color: MC.gold,
            border: `1px solid ${MC.gold}`,
          }}
        >
          {action}
        </Button>
      )}
    </Box>
  )
}

/** Quest mode labels for resume card display */
const QUEST_MODE_LABELS: Record<string, string> = {
  phonics: 'Phonics Quest',
  comprehension: 'Comprehension Quest',
  fluency: 'Fluency Practice',
  math: 'Math Quest',
}

function ResumeCard({
  session,
  onResume,
  onStartFresh,
  /** Off for a reoffered `resumed` row, which may still be live elsewhere. */
  allowStartFresh = true,
}: {
  session: EvaluationSession & Partial<InteractiveSessionData>
  onResume: () => void
  onStartFresh: () => void
  allowStartFresh?: boolean
}) {
  const [timeLabel] = useState(() => {
    const elapsed = Date.now() - new Date(session.evaluatedAt).getTime()
    const hoursAgo = Math.floor(elapsed / (1000 * 60 * 60))
    const minsAgo = Math.floor(elapsed / (1000 * 60))
    return hoursAgo >= 1 ? `${hoursAgo}h ago` : `${minsAgo}m ago`
  })
  const modeLabel = QUEST_MODE_LABELS[session.questMode ?? ''] ?? 'Quest'

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onResume}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onResume()
        }
      }}
      sx={{
        bgcolor: MC.darkStone,
        border: `2px solid ${MC.diamond}`,
        borderRadius: 2,
        p: 2,
        mb: 2,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: MC.gold },
        '&:focus-visible': { borderColor: MC.gold, outline: 'none' },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography sx={{ fontSize: '1.5rem' }}>🔄</Typography>
        <Box sx={{ flex: 1, textAlign: 'left' }}>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.45rem',
              color: MC.diamond,
              lineHeight: 1.8,
            }}
          >
            Pick up where you left off?
          </Typography>
          <Typography
            sx={{
              fontFamily: MC.font,
              fontSize: '0.35rem',
              color: MC.stone,
              mt: 0.3,
            }}
          >
            {modeLabel} · Level {session.finalLevel ?? '?'} · {timeLabel}
          </Typography>
        </Box>
      </Stack>
      {allowStartFresh && (
        <Typography
          component="span"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onStartFresh()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onStartFresh()
            }
          }}
          sx={{
            display: 'block',
            fontFamily: MC.font,
            fontSize: '0.3rem',
            color: MC.stone,
            mt: 1,
            textAlign: 'center',
            textDecoration: 'underline',
            cursor: 'pointer',
            '&:hover': { color: MC.gold },
          }}
        >
          Start fresh instead
        </Typography>
      )}
    </Box>
  )
}
