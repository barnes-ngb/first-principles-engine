import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
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
  type MineInvitation,
} from '../avatar/stonebridge/mineInvitation'
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
import {
  abandonQuestSource,
  questSourceRef,
  type QuestAbandonOutcome,
} from './questSourceWrites'
import type { QuestResumeRefusal } from './questRun'
import type { InteractiveSessionData, QuestDomainConfig } from './questTypes'
import { QuestScreen } from './questTypes'
import { useQuestSession } from './useQuestSession'
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

  // Load in-progress quest sessions (within 24h) for resume card
  const [resumeSession, setResumeSession] = useState<(EvaluationSession & Partial<InteractiveSessionData>) | null>(null)
  /**
   * UX-494 — why a Resume tap did nothing, when it did nothing.
   *
   * The old fallback started an unrelated fresh quest, which is a paid run the
   * child never asked for, in a mode a parent never picked. A refusal now says
   * so and leaves every mode card exactly where it was.
   */
  const [resumeRefusal, setResumeRefusal] = useState<QuestResumeRefusal | null>(null)

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
  const [graphRecovery, setGraphRecovery] = useState<
    (EvaluationSession & Partial<InteractiveSessionData> & { id: string }) | null
  >(null)
  /** Bumped to re-run the pending read after a retry settles one source. */
  const [graphRecoveryNonce, setGraphRecoveryNonce] = useState(0)

  const [resumeChildId, setResumeChildId] = useState(activeChildId)
  if (resumeChildId !== activeChildId) {
    setResumeChildId(activeChildId)
    setResumeSession(null)
    setGraphRecovery(null)
    setResumeRefusal(null)
    setActiveDomain(null)
  }

  useEffect(() => {
    if (!activeChildId || !familyId) return
    let cancelled = false
    async function loadResume() {
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        // Resumable sessions are saved as 'partial' (new) — also accept legacy
        // 'in-progress' docs saved before the partials-count change.
        const q = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          where('status', 'in', ['partial', 'in-progress']),
          orderBy('evaluatedAt', 'desc'),
          firestoreLimit(1),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        const sessions = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as EvaluationSession & Partial<InteractiveSessionData>)
          // Only offer to resume genuinely resumable docs: a 'partial' saved at
          // endSession (e.g. AI failed before the mastery threshold) carries no
          // savedQuestState, so it counts in Records but isn't resumable.
          .filter((s) => s.sessionType === 'interactive' && s.evaluatedAt >= cutoff && !!s.savedQuestState)
        setResumeSession(sessions[0] ?? null)
      } catch {
        // Non-blocking — resume card is optional
      }
    }
    void loadResume()
    return () => { cancelled = true }
    // `resumeReloadNonce` re-reads after a partial has actually LANDED: this
    // query can otherwise finish before the exit's own write does (UX-494).
  }, [activeChildId, familyId, quest.screen, quest.resumeReloadNonce])

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
   */
  const liveRecovery = useRef({ scope: recoveryScope, epoch: recoveryEpoch })
  useLayoutEffect(() => {
    liveRecovery.current = { scope: recoveryScope, epoch: recoveryEpoch }
  }, [recoveryScope, recoveryEpoch])

  useEffect(() => {
    // An unsettled identity vouches for nobody, so it reads nothing.
    if (recoveryScope === 'unsettled' || !activeChildId || !familyId) {
      setGraphRecovery(null)
      return
    }
    let cancelled = false
    const scopeAtRead = recoveryScope
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
        // scope is still the one that asked (an A → B → A moves the epoch while
        // leaving family and child alone), and the child has not moved under us.
        if (cancelled) return
        if (liveRecovery.current.scope !== scopeAtRead) return
        if (childAtRead !== activeChildId) return
        const waiting = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as EvaluationSession & Partial<InteractiveSessionData> & { id: string })
          .filter(
            (s) =>
              s.sessionType === 'interactive' &&
              s.status === 'complete' &&
              Boolean(s.sourceCommittedAt) &&
              s.childId === childAtRead,
          )
        setGraphRecovery(waiting[0] ?? null)
      } catch {
        // Non-blocking — the recovery card is optional, exactly like the resume card.
      }
    }
    void loadGraphRecovery()
    return () => { cancelled = true }
  }, [activeChildId, familyId, quest.screen, recoveryScope, graphRecoveryNonce])

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
  const startSuggestedMode = (config: QuestDomainConfig, generation: number) => {
    if (!tripScopeTrusted) return
    if (identityEpoch !== getLibraryIdentityEpoch()) return
    const live = libraryReturnForDestination(
      getLibraryReturnFlow(),
      { familyId, childId: activeChildId },
      LibraryReturnDestination.Mine,
    )
    if (!live || live.generation !== generation) return
    setActiveDomain(config)
    void quest.startQuest(config.domain, config.questMode)
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
        {mineTrip && <MineTripExit generation={mineTrip.generation} />}
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
          {resumeSession && (
            <ResumeCard
              session={resumeSession}
              onResume={() => {
                const domain = resumeSession.domain as EvaluationDomain
                const mode = resumeSession.questMode
                setResumeRefusal(null)
                void (async () => {
                  const outcome = await quest.resumeSession(resumeSession)
                  if (outcome !== true) {
                    // UX-494 — say so, and start NOTHING. The old fallback ran a
                    // fresh paid quest nobody asked for, in whatever mode this
                    // card happened to name.
                    setResumeRefusal(outcome)
                    setResumeSession(null)
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
                // UX-494 — the SAME guarded transition the Resume claim uses,
                // so the card's two buttons cannot disagree about which
                // document they are looking at. The bare `updateDoc` this
                // replaces could close out a run a delayed close had already
                // finalized, or one belonging to the child a parent had just
                // switched away from.
                const sessionId = resumeSession.id
                const owner = resumeSession.childId
                const scopeAtTap = recoveryScope
                if (!sessionId || !owner || scopeAtTap === 'unsettled') {
                  setResumeSession(null)
                  return
                }
                void (async () => {
                  let outcome: QuestAbandonOutcome | 'failed'
                  try {
                    outcome = await abandonQuestSource(questSourceRef(familyId, sessionId), {
                      childId: owner,
                    })
                  } catch (err) {
                    console.error('Failed to mark session as abandoned', err)
                    outcome = 'failed'
                  }
                  // Scoped AFTER the await: a result that arrives once the
                  // identity has moved belongs to nobody's screen.
                  if (liveRecovery.current.scope !== scopeAtTap) return
                  if (outcome === 'refused' || outcome === 'failed') {
                    // The record was not closed out, so the card must not
                    // pretend it was.
                    setResumeRefusal(outcome === 'refused' ? 'finalized' : 'missing')
                    return
                  }
                  setResumeSession(null)
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
          {quest.sourceSave.kind === 'partial' &&
            (quest.sourceSave.state === 'failed' || quest.sourceSave.state === 'saving') && (
              <RecoveryNotice
                key={quest.sourceSave.runInstanceId ?? 'partial-save'}
                title={
                  quest.sourceSave.state === 'saving'
                    ? QUEST_UNSAVED_COPY.saving
                    : QUEST_UNSAVED_COPY.title
                }
                body={QUEST_UNSAVED_COPY.body}
                action={quest.sourceSave.canRetry ? QUEST_UNSAVED_COPY.action : undefined}
                onAction={
                  quest.sourceSave.canRetry
                    ? () =>
                        quest.retrySourceSave({
                          runInstanceId: quest.sourceSave.runInstanceId,
                          viewGeneration: quest.sourceSave.viewGeneration,
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
          {graphRecovery && recoveryScope !== 'unsettled' && (
            <RecoveryNotice
              key={`${recoveryScope}|${graphRecovery.id}`}
              title={QUEST_RECOVERY_COPY.title}
              body={QUEST_RECOVERY_COPY.body}
              action={QUEST_RECOVERY_COPY.action}
              onAction={async () => {
                const cardId = graphRecovery.id
                const scopeAtTap = recoveryScope
                const outcome = await quest.retryGraphProjection(cardId, graphRecovery.childId, {
                  domain: graphRecovery.domain,
                  questMode: graphRecovery.questMode,
                  scopeKey: scopeAtTap,
                  epoch: recoveryEpoch,
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
                // Only THIS card's own settled attempt may retire it: the scope
                // must still be the one it was tapped under, and the card on
                // screen must still be the one it was drawn for.
                if (liveRecovery.current.scope !== scopeAtTap) return
                setGraphRecovery((current) => (current?.id === cardId ? null : current))
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
        <MineTripExit generation={mineTrip.generation} />
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
          sourceSave={quest.sourceSave}
          graphSync={quest.graphSync}
          // Both retries carry the identity of the view they were RENDERED in,
          // so an old summary's settled attempt cannot relabel a newer
          // same-child summary (UX-494).
          onRetrySourceSave={() =>
            void quest.retrySourceSave({
              runInstanceId: quest.sourceSave.runInstanceId,
              viewGeneration: quest.sourceSave.viewGeneration,
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
        />
      )}

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
function MineTripExit({ generation }: { generation: number }) {
  const navigate = useNavigate()
  return (
    <Button
      onClick={() => {
        const returning = requestLibraryReturn(generation)
        if (!returning) return
        navigate(libraryReturnPath(returning))
      }}
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
  onStart: (config: QuestDomainConfig, generation: number) => void
}) {
  const { snapshot, loaded } = useChildSkillSnapshot(familyId, childId)
  const { model, loading } = useLearnerModel(familyId, childId)
  const settled = loaded && !loading

  const current = settled
    ? selectMineInvitation({
        model,
        readingCalibrated: hasReadingCalibration(snapshot),
        mathCalibrated: hasMathCalibration(snapshot),
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
  const committed = useRef<{ settled: boolean; agreed: MineInvitation | null }>({
    settled: false,
    agreed: null,
  })
  useLayoutEffect(() => {
    committed.current = { settled, agreed }
  }, [settled, agreed])

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
          onStart(config, generation)
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
}: {
  session: EvaluationSession & Partial<InteractiveSessionData>
  onResume: () => void
  onStartFresh: () => void
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
    </Box>
  )
}
