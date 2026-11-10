import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DownloadIcon from '@mui/icons-material/Download'
import ErrorIcon from '@mui/icons-material/Error'
import SendIcon from '@mui/icons-material/Send'
import WarningIcon from '@mui/icons-material/Warning'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'

import Page from '../../components/Page'
import { LoadingState, EmptyState, ErrorState } from '../../components/states'
import { useAI, TaskType } from '../../core/ai/useAI'
import type { ChatMessage as AIChatMessage } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  evaluationSessionsCollection,
  hoursCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import { domainToSubjectBucket } from '../../core/utils/domainMapping'
import { useSessionTimer } from '../../core/utils/sessionTimer'
import { todayKey } from '../../core/utils/dateKey'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type {
  Child,
  ChatMessage,
  ConceptualBlock,
  EvaluationFinding,
  EvaluationRecommendation,
  EvaluationSession,
  SkillSnapshot,
} from '../../core/types'
import { DIAMOND_EVENTS } from '../../core/types'
import { mergeBlock } from '../../core/utils/blockerLifecycle'
import { PROGRESS_TABS, progressPath } from '../progress/progressNav'
import FoundationsSection from './FoundationsSection'
import { syncEvalFindingsToModel } from './evalModelWriteback'
import {
  finalizeGuidedEvaluation,
  GuidedEvaluationSourceMismatch,
  newGuidedEvaluationSourceId,
  type GuidedEvaluationReceipt,
} from './guidedEvaluationSource'
import { ChatMessageRole, EvaluationDomain, MasteryGate, SkillLevel } from '../../core/types/enums'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { deriveWorkingLevelFromEvaluation, canOverwriteWorkingLevel } from '../quest/workingLevels'

// ── Helpers ─────────────────────────────────────────────────────

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function extractFindings(text: string): EvaluationFinding[] {
  const findings: EvaluationFinding[] = []
  const regex = /<finding>([\s\S]*?)<\/finding>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      findings.push({
        skill: parsed.skill || '',
        status: parsed.status || 'not-tested',
        evidence: parsed.evidence || '',
        notes: parsed.notes,
        testedAt: new Date().toISOString(),
      })
    } catch {
      /* skip unparseable */
    }
  }
  return findings
}

interface CompleteBlock {
  summary: string
  frontier?: string
  recommendations: EvaluationRecommendation[]
  skipList?: Array<{ skill: string; reason: string }>
  supports?: Array<{ label: string; description: string }>
  stopRules?: Array<{ label: string; trigger: string; action: string }>
  evidenceDefinitions?: Array<{ label: string; description: string }>
  nextEvalDate?: string
}

function extractComplete(text: string): CompleteBlock | null {
  const regex = /<complete>([\s\S]*?)<\/complete>/g
  const match = regex.exec(text)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    return {
      summary: parsed.summary || '',
      frontier: parsed.frontier,
      recommendations: (parsed.recommendations || []).map(
        (r: EvaluationRecommendation, i: number) => ({
          priority: r.priority ?? i + 1,
          skill: r.skill || '',
          action: r.action || '',
          duration: r.duration || '',
          materials: r.materials,
          frequency: r.frequency || '',
        }),
      ),
      skipList: parsed.skipList,
      supports: parsed.supports,
      stopRules: parsed.stopRules,
      evidenceDefinitions: parsed.evidenceDefinitions,
      nextEvalDate: parsed.nextEvalDate,
    }
  } catch {
    return null
  }
}

function stripTags(text: string): string {
  return text
    .replace(/<finding>[\s\S]*?<\/finding>/g, '')
    .replace(/<complete>[\s\S]*?<\/complete>/g, '')
    .trim()
}

/** Convert skill tags like "phonics.cvc.short-o" to readable labels like "Phonics > CVC > Short o" */
function formatSkillLabel(tag: string): string {
  return tag
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' → ')
    .replace(/-/g, ' ')
    .replace(/cvc/i, 'CVC')
    .replace(/cvce/i, 'CVCe')
}

const DOMAIN_TABS: { value: EvaluationDomain; label: string }[] = [
  { value: EvaluationDomain.Reading, label: 'Reading' },
  { value: EvaluationDomain.Math, label: 'Math' },
  { value: EvaluationDomain.Speech, label: 'Speech' },
  { value: EvaluationDomain.Writing, label: 'Writing' },
]

const READY_DOMAINS: EvaluationDomain[] = [
  EvaluationDomain.Reading,
  EvaluationDomain.Speech,
  EvaluationDomain.Math,
]

function findingStatusIcon(status: EvaluationFinding['status']) {
  switch (status) {
    case 'mastered':
      return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
    case 'emerging':
      return <WarningIcon sx={{ color: 'warning.main', fontSize: 18 }} />
    case 'not-yet':
      return <ErrorIcon sx={{ color: 'error.main', fontSize: 18 }} />
    default:
      return null
  }
}

// ── Visit + draft ownership (UX-491) ────────────────────────────
//
// The shell's child chip can change the scoped identity under a long guided
// evaluation at any moment — the `CLAUDE.md` rail `FIX-220` / `UX-329` found one
// more surface for on every round. Here it was reachable from the ordinary
// controls: hold Lincoln's Start (or Send) reply, switch to London, let London's
// sessions land, then release the old completion. Lincoln's finding was
// published under London's name, and an Apply tapped afterwards wrote Lincoln's
// retained content to LONDON's skill snapshot and learner model with a
// London-shaped fallback source id (the session record itself stayed under
// Lincoln, because that closure held its own id).
//
// The repair is two committed boundaries rather than a guard per callback:
//
//   * **the visit** — `EvaluateVisit` is handed a SETTLED family, child and
//     domain and is keyed by them, so a committed change unmounts it and the old
//     read, history list, draft and timer go in the same commit. `A → B → A` is
//     a third visit and the same child id in another family is a different one.
//     No closure can retarget: the family, child and domain a closure sees are
//     its own instance's props and cannot change value.
//   * **the draft** — `EvaluateDraft` is keyed inside the visit, so Clear &
//     Restart mounts a new draft with its own `useAI` (loading + error), its own
//     admission slots, its own timer and nothing resumed. The visit keeps the
//     read, so Clear does not re-read or re-resume the draft just cleared, and
//     the same-scope history list survives it.
//
// `draftLiveRef` / `visitLiveRef` are set in LAYOUT effects, so between a
// commit's teardown and its setup there is no live owner and a retained callback
// cannot borrow the authority of the one that just left (`BookReaderPage`'s
// rule). Every retained action asks at the tap and again after each await. A
// write or Apply already admitted finishes with its own captured destination,
// source id and contents; only its late UI feedback is dropped.

// ── The finalized source, and the Apply gate (UX-492) ───────────
//
// UX-491 bound a turn to its visit. What it left filed — in its own census row
// — was the *day* the completion lands on: the daily record id is
// `{childId}_{domain}_{date}`, so both of a day's completed attempts write the
// same document and the later replaces the earlier. Two attempts can project
// the SAME evidence summary with opposite help notes, so after the replacement
// nothing stored could say which attempt a learner-model ref was evidence of.
// And a final save that FAILED, or was still in flight, left Apply enabled, so
// the write-back could stamp a source that was absent or uncommitted.
//
// Three things close that here, and the daily record is untouched by all of them
// (same id, same shape plus one optional field, same history, resume, rewards):
//
//   * **one final-save boundary**, shared by the initial-response completion and
//     an ordinary Send. The family, child, domain, day id, ordered findings and
//     a FRESH finalization id are admitted and pinned SYNCHRONOUSLY before the
//     save starts, into a slot that is create-once per draft — so a completed
//     reply cannot open a replacement finalization, and an in-progress save can
//     neither mark the final source saved nor replace it.
//   * **the receipt is the authority.** Apply is disabled and refused until the
//     exact pinned save is acknowledged, and what it then writes back — source
//     id, finalization id and findings — comes from the receipt, never from a
//     current-session read or a reconstructed fallback. A pending or failed
//     finalization admits nothing downstream.
//   * **an explicit retry** of the same captured payload and id, single-flight,
//     with no new AI request and no second hour log. Success clears the failure
//     and lets the same original findings be applied once by the usual path; a
//     retry whose first attempt had in fact landed is acknowledged without
//     rewriting the day record, which by then a newer attempt may own.

/** How this draft's one final save stands. */
type FinalSaveStatus =
  | 'none'
  /** Admitted and in flight — the parent is told, and Apply is closed. */
  | 'saving'
  /** Acknowledged. The receipt exists, so Apply may run. */
  | 'saved'
  /** Rejected. Summary + download stay; an explicit retry is offered. */
  | 'failed'
  /**
   * The captured id already holds different content. Fails closed: no retry is
   * offered, because retrying would either refuse again or overwrite evidence.
   */
  | 'conflict'

/**
 * The pinned final save of one draft — captured before the save's first await,
 * so a save already admitted finishes for its ORIGINAL scope whatever happens on
 * screen afterwards.
 */
interface PinnedFinalSave {
  familyId: string
  childId: string
  domain: EvaluationDomain
  sessionDocId: string
  sourceId: string
  finalizedAt: string
  findings: EvaluationFinding[]
  session: Omit<EvaluationSession, 'id'>
}

/** The settled scope one evaluation visit is bound to. */
interface EvaluateVisitScope {
  familyId: string
  childId: string
  childName: string
  domain: EvaluationDomain
}

/** The in-progress session a visit resumes, read once by the visit. */
interface EvaluateResume {
  sessionDocId: string
  messages: ChatMessage[]
  findings: EvaluationFinding[]
  recommendations: EvaluationRecommendation[]
  summary: string | null
  nextEvalDate?: string
}

// ── Page (scope resolution only) ────────────────────────────────

export default function EvaluateChatPage() {
  const familyId = useFamilyId()
  // UX-425: this page no longer chooses or adds a child — it reads the active
  // one. The shell's chip is the one control that changes it.
  const {
    activeChildId,
    activeChild,
    isLoading: childrenLoading,
    loadFailed: childrenLoadFailed,
    retryLoad: retryChildren,
    childrenFamilyId,
    isChildProfile,
  } = useActiveChild()

  const [domain, setDomain] = useState<EvaluationDomain>(EvaluationDomain.Reading)

  const isDomainReady = READY_DOMAINS.includes(domain)

  // A failed children read keeps `isLoading` true on purpose (`useChildren`), so
  // the failure is its own word and "settled" means ANSWERED WITH CHILDREN.
  const identityFailed = childrenLoadFailed === true
  // Provenance, as `BookReaderPage` gates it: the children list is SHARED, so
  // after an auth change it can still hold the previous family's children with
  // `isLoading` already false. Until the list says it belongs to this family,
  // nothing here may name a child, query an evaluation or become editable.
  const identitySettled =
    Boolean(familyId) &&
    childrenLoading !== true &&
    !identityFailed &&
    childrenFamilyId === familyId

  // The resolved child must be the active one, found in THIS family's list.
  const resolvedChild: Child | null =
    identitySettled && activeChildId && activeChild && activeChild.id === activeChildId
      ? activeChild
      : null

  // `/evaluate` sits outside `RequireParent` and the profile menu switches in
  // place, so the parent role is part of the visit identity — a kid profile
  // resolving to the same child is still a different visit (the planner's
  // `usePlannerAskSource` reading).
  const role = isChildProfile ? 'child' : 'parent'

  return (
    <Page>
      <Stack direction="row" alignItems="center" spacing={1}>
        <AssessmentIcon color="primary" />
        <Typography variant="h5">
          Evaluate {resolvedChild?.name || 'Child'}
        </Typography>
      </Stack>

      {/* UX-425: the in-page selector is gone — the shell's chip is the one
          place a parent chooses the child. The heading above already names him,
          so no `ActiveChildLine` is needed here (UX-426). */}

      {/* Domain Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={domain}
          onChange={(_, v: EvaluationDomain) => setDomain(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {DOMAIN_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={READY_DOMAINS.includes(tab.value) ? tab.label : `${tab.label} (coming soon)`}
              disabled={!READY_DOMAINS.includes(tab.value)}
            />
          ))}
        </Tabs>
      </Box>

      {!isDomainReady ? (
        <Alert severity="info">
          {domain.charAt(0).toUpperCase() + domain.slice(1)} evaluation coming soon. Start with Reading.
        </Alert>
      ) : identityFailed ? (
        // GATE on a FAILED read — recoverable, and distinct from an empty
        // family (`useBusinessGoal`'s round-5 lesson).
        <ErrorState
          message="We couldn't load your children, so an evaluation can't be started yet."
          onRetry={retryChildren}
        />
      ) : !identitySettled ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <LoadingState size={40} />
        </Box>
      ) : !resolvedChild ? (
        // Settled, this family's own list, and nobody to evaluate: an answer,
        // so it reads as one rather than as a spinner that never ends.
        <EmptyState
          title="No child to evaluate yet"
          description="Add a child in Settings, then come back to run a guided evaluation."
        />
      ) : (
        <EvaluateVisit
          // The visit boundary. Everything editable lives below this key.
          key={`${familyId}|${resolvedChild.id}|${role}|${domain}`}
          familyId={familyId}
          childId={resolvedChild.id}
          childName={resolvedChild.name}
          domain={domain}
        />
      )}
    </Page>
  )
}

// ── Visit (one settled scope: the read, the history, the draft) ─

function EvaluateVisit({ familyId, childId, childName, domain }: EvaluateVisitScope) {
  const [previousSessions, setPreviousSessions] = useState<EvaluationSession[]>([])
  const [resume, setResume] = useState<EvaluateResume | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  /** Bumped by Clear & Restart: the key of the draft below. */
  const [draftKey, setDraftKey] = useState(0)

  /** Committed-mounted: false until this visit's layout effect has run. */
  const visitLiveRef = useRef(false)
  useLayoutEffect(() => {
    visitLiveRef.current = true
    return () => {
      visitLiveRef.current = false
    }
  }, [])

  // ── Load the session history once per visit ────────────────
  //
  // The read lives HERE rather than in the draft, so Clear & Restart cannot
  // re-read it or re-resume the draft the parent just cleared, and the
  // same-scope history list survives the restart.

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      setInitializing(true)
      setLoadFailed(false)
      try {
        // Load all sessions for this child + domain
        const allQ = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', childId),
          where('domain', '==', domain),
          orderBy('evaluatedAt', 'desc'),
        )
        const allSnap = await getDocs(allQ)

        if (cancelled || !visitLiveRef.current) return

        const allSessions = allSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setPreviousSessions(allSessions.filter((s) => s.status === 'complete'))

        // Check for an in-progress session to resume — same selection as before.
        const inProgress = allSessions.find((s) => s.status === 'in-progress')
        setResume(
          inProgress
            ? {
                sessionDocId: inProgress.id!,
                messages: inProgress.messages || [],
                findings: inProgress.findings || [],
                recommendations: inProgress.recommendations || [],
                summary: inProgress.summary || null,
                nextEvalDate: inProgress.nextEvalDate,
              }
            : null,
        )
      } catch (err) {
        console.error('Failed to load evaluation session', err)
        // A failed read is not an empty history: refuse to be editable and say
        // so, with a way back (`useBusinessGoal`'s GATE).
        if (!cancelled && visitLiveRef.current) setLoadFailed(true)
      } finally {
        if (!cancelled && visitLiveRef.current) setInitializing(false)
      }
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [familyId, childId, domain, reloadNonce])

  const handleClearRestart = useCallback(() => {
    // The restart IS the new draft: a fresh `useAI`, fresh admission slots, a
    // fresh timer and nothing resumed.
    setDraftKey((k) => k + 1)
  }, [])

  return (
    <>
      {/* Previous evaluations */}
      {previousSessions.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Previous evaluations:
          </Typography>
          <Stack spacing={0.75} sx={{ mt: 0.5 }}>
            {previousSessions.map((session) => (
              <Box key={session.id}>
                <Chip
                  label={`${session.domain} — ${new Date(session.evaluatedAt).toLocaleDateString()}`}
                  variant="outlined"
                  size="small"
                />
                {/* FEAT-75: retained learning frontier, surfaced read-only. */}
                {session.frontier && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.25, ml: 0.5 }}
                  >
                    Learning frontier (from {new Date(session.evaluatedAt).toLocaleDateString()}): {session.frontier}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {initializing ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <LoadingState size={40} />
        </Box>
      ) : loadFailed ? (
        <ErrorState
          message={`We couldn't load ${childName}'s evaluation history, so this evaluation isn't editable yet.`}
          onRetry={() => setReloadNonce((n) => n + 1)}
        />
      ) : (
        <EvaluateDraft
          // The draft boundary. Clear & Restart lands here, not on the read.
          key={draftKey}
          familyId={familyId}
          childId={childId}
          childName={childName}
          domain={domain}
          // Only the visit's FIRST draft resumes; a restarted one starts empty.
          resume={draftKey === 0 ? resume : null}
          onClearRestart={handleClearRestart}
        />
      )}
    </>
  )
}

// ── Draft (one lifetime of editable work) ───────────────────────

interface EvaluateDraftProps extends EvaluateVisitScope {
  resume: EvaluateResume | null
  onClearRestart: () => void
}

function EvaluateDraft({
  familyId,
  childId,
  childName,
  domain,
  resume,
  onClearRestart,
}: EvaluateDraftProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // One `useAI` per draft, so a restarted draft owns its own loading and error
  // and a pending turn from the cleared one can neither disable its Start nor
  // raise an error in it.
  const { chat, analyzePatterns, loading: aiLoading, error: aiError } = useAI()

  const [messages, setMessages] = useState<ChatMessage[]>(resume?.messages ?? [])
  const [findings, setFindings] = useState<EvaluationFinding[]>(resume?.findings ?? [])
  const [recommendations, setRecommendations] = useState<EvaluationRecommendation[]>(
    resume?.recommendations ?? [],
  )
  const [completeSummary, setCompleteSummary] = useState<string | null>(resume?.summary ?? null)
  // A resumed in-progress session has no <complete> block yet, so apply state
  // opens empty — a later in-progress save can't stamp a prior eval's frontier.
  const [completeData, setCompleteData] = useState<CompleteBlock | null>(null)
  const [nextEvalDate, setNextEvalDate] = useState<string | undefined>(resume?.nextEvalDate)
  const [snackText, setSnackText] = useState<string | null>(null)
  const [sessionDocId, setSessionDocId] = useState<string | null>(resume?.sessionDocId ?? null)
  const [sessionStatus, setSessionStatus] = useState<'in-progress' | 'complete'>('in-progress')
  const [inputText, setInputText] = useState('')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [reapplyDialogOpen, setReapplyDialogOpen] = useState(false)
  const [hasAppliedThisSession, setHasAppliedThisSession] = useState(false)
  const [patternAnalysisState, setPatternAnalysisState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [conceptualBlocks, setConceptualBlocks] = useState<ConceptualBlock[]>([])
  const [blocksSummary, setBlocksSummary] = useState<string | undefined>(undefined)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const sessionTimer = useSessionTimer()
  const hoursLoggedRef = useRef(false)

  // ── This draft's committed lifetime ─────────────────────────

  /** Committed-mounted: false until this draft's layout effect has run. */
  const draftLiveRef = useRef(false)
  useLayoutEffect(() => {
    draftLiveRef.current = true
    return () => {
      draftLiveRef.current = false
    }
  }, [])

  /** May a retained callback still act on, or publish to, this draft? */
  const isLive = useCallback(() => draftLiveRef.current, [])

  // One synchronous admission slot per operation. They are per-draft by
  // construction, so releasing one can never unlock a later draft or visit.
  const startBusyRef = useRef(false)
  const sendBusyRef = useRef(false)
  const applyBusyRef = useRef(false)

  /**
   * The render-side twin of `sendBusyRef`, for the WHOLE accepted Send — not
   * just the model call. `useAI.chat` drops `aiLoading` as soon as a reply
   * returns, but a non-final turn still has its evaluation save in flight and
   * `sendBusyRef` is still closed, so on `aiLoading` alone the composer looked
   * editable while the handler silently refused (round-one review, UX-491).
   * `'saving'` is what the parent is told about that gap. Like every other
   * slot here it is per-draft, so a late result cannot speak for the draft
   * that replaced this one.
   */
  const [sendPhase, setSendPhase] = useState<'idle' | 'sending' | 'saving'>('idle')

  // ── This draft's one finalization (UX-492) ──────────────────
  //
  // The pin, the receipt and the single-flight slot are REFS: a retained
  // callback and an Apply admitted mid-flight must read what this draft
  // actually pinned, not what a render closed over. The status is state because
  // it is what the parent is shown.

  const [finalSaveStatus, setFinalSaveStatus] = useState<FinalSaveStatus>('none')
  /** Create-once per draft: the final save this draft admitted, or none. */
  const pinnedFinalSaveRef = useRef<PinnedFinalSave | null>(null)
  /** The acknowledged receipt — the ONLY thing Apply reads its source from. */
  const finalReceiptRef = useRef<GuidedEvaluationReceipt | null>(null)
  /** One final save (or retry) in flight at a time. */
  const finalSaveBusyRef = useRef(false)
  /** The one pattern analysis this finalization is allowed to ask for. */
  const patternAnalysisAskedRef = useRef(false)

  /** Unchanged day-based shape: `{childId}_{domain}_{date}`. */
  const defaultSessionDocId = useCallback(
    () => `${childId}_${domain}_${new Date().toISOString().slice(0, 10)}`,
    [childId, domain],
  )

  // A resumed draft continues its session's clock; a fresh one waits for Start.
  useEffect(() => {
    if (resume) {
      hoursLoggedRef.current = false
      sessionTimer.startTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Log session hours when evaluation completes ────────────

  const logSessionHours = useCallback(async () => {
    if (hoursLoggedRef.current) return
    // An old completion must not stop a later draft's timer or log minutes for
    // it — `UX-327`'s rule, one surface over.
    if (!isLive()) return
    hoursLoggedRef.current = true

    const activeSeconds = sessionTimer.stop()
    const minutes = Math.ceil(activeSeconds / 60 / 5) * 5 // round up to nearest 5
    if (minutes < 5) return // too short to log

    try {
      await addDoc(hoursCollection(familyId), {
        childId,
        date: todayKey(),
        minutes,
        subjectBucket: domainToSubjectBucket(domain),
        quickCapture: true,
        notes: `${domain.charAt(0).toUpperCase() + domain.slice(1)} evaluation session`,
        source: 'evaluation-session',
      })
    } catch (err) {
      console.error('[SessionTimer] Failed to log evaluation hours:', err)
    }
  }, [childId, familyId, domain, sessionTimer, isLive])

  // ── Trigger pattern analysis after <complete> ────────────────

  const triggerPatternAnalysis = useCallback(
    async (sessionId: string, allFindings: EvaluationFinding[]) => {
      if (!isLive()) return
      setPatternAnalysisState('loading')
      try {
        const result = await analyzePatterns({
          familyId,
          childId,
          evaluationSessionId: sessionId,
          currentFindings: allFindings.map((f) => ({
            skill: f.skill,
            status: f.status,
            evidence: f.evidence,
            notes: f.notes,
          })),
        })
        // A late analysis belongs to the draft that asked for it, nobody else.
        if (!isLive()) return
        if (result) {
          setConceptualBlocks(result.blocks as ConceptualBlock[])
          setBlocksSummary(result.summary)
        }
        setPatternAnalysisState('done')
      } catch (err) {
        console.warn('Pattern analysis failed:', err)
        if (!isLive()) return
        setPatternAnalysisState('done')
        setBlocksSummary(undefined)
      }
    },
    [childId, familyId, analyzePatterns, isLive],
  )

  // ── Persist session to Firestore ────────────────────────────

  /**
   * Build the daily record this draft would write. Synchronous and pure, so a
   * caller can pin it before its save's first await. Shape, id and every stored
   * field are exactly what they were; the completing save adds the one optional
   * `finalizedSourceId` pointer, inside the finalization transaction.
   */
  const buildSession = useCallback(
    (
      msgs: ChatMessage[],
      fndgs: EvaluationFinding[],
      complete: CompleteBlock | null | undefined,
      evaluatedAt: string,
    ): Omit<EvaluationSession, 'id'> => ({
      childId,
      domain,
      status: complete ? 'complete' : 'in-progress',
      messages: msgs,
      findings: fndgs,
      recommendations: complete?.recommendations || recommendations,
      summary: complete?.summary || completeSummary || undefined,
      // FEAT-75: retain the completed eval's learning frontier on the record so
      // the Evaluation History can surface it read-only after the fact.
      frontier: complete?.frontier ?? completeData?.frontier,
      evaluatedAt,
      nextEvalDate: complete?.nextEvalDate || nextEvalDate,
    }),
    [childId, domain, recommendations, completeSummary, completeData, nextEvalDate],
  )

  /**
   * The in-progress save, unchanged. It never touches the finalization: it
   * cannot mark the final source saved, replace it, or re-open a replacement
   * draft, and a `complete` turn does not come through here at all.
   */
  const persistInProgress = useCallback(
    async (msgs: ChatMessage[], fndgs: EvaluationFinding[]): Promise<string> => {
      // Destination captured before the await: this draft's child and domain,
      // and the session id this call is writing.
      const existingDocId = sessionDocId
      const targetDocId = existingDocId ?? defaultSessionDocId()
      const session = buildSession(msgs, fndgs, null, new Date().toISOString())

      try {
        const ref = doc(evaluationSessionsCollection(familyId), targetDocId)
        await setDoc(ref, session)
        // Only a live draft learns the id its save was given.
        if (!existingDocId && isLive()) setSessionDocId(targetDocId)
      } catch (err) {
        console.error('Failed to persist evaluation session', err)
      }

      return targetDocId
    },
    [familyId, sessionDocId, defaultSessionDocId, buildSession, isLive],
  )

  // ── The one final save (UX-492) ─────────────────────────────

  /**
   * Run (or re-run) an ALREADY PINNED final save.
   *
   * Assumes `finalSaveBusyRef` is closed by the caller, which is what makes the
   * admission and the retry single-flight with one another. The pin it is handed
   * is the authority: late UI feedback is dropped when the draft has gone or has
   * pinned something else, but the write itself finishes for the scope it
   * captured.
   */
  const runPinnedFinalSave = useCallback(
    async (pinned: PinnedFinalSave): Promise<GuidedEvaluationReceipt | null> => {
      try {
        const receipt = await finalizeGuidedEvaluation(pinned)
        // The receipt is recorded unconditionally — an Apply admitted before a
        // switch is entitled to the source its findings came from — while the
        // visible state is only moved for the draft that is still on screen.
        if (pinnedFinalSaveRef.current === pinned) {
          finalReceiptRef.current = receipt
        }
        if (isLive() && pinnedFinalSaveRef.current === pinned) {
          setSessionDocId(pinned.sessionDocId)
          setFinalSaveStatus('saved')
          // One analysis per finalization, asked only once the evidence it
          // describes is actually on the record. A retry does not buy a second
          // AI call.
          if (!patternAnalysisAskedRef.current) {
            patternAnalysisAskedRef.current = true
            void triggerPatternAnalysis(pinned.sessionDocId, receipt.findings)
          }
        }
        return receipt
      } catch (err) {
        console.error('Failed to finalize guided evaluation', err)
        if (isLive() && pinnedFinalSaveRef.current === pinned) {
          setFinalSaveStatus(
            err instanceof GuidedEvaluationSourceMismatch ? 'conflict' : 'failed',
          )
        }
        return null
      } finally {
        finalSaveBusyRef.current = false
      }
    },
    [isLive, triggerPatternAnalysis],
  )

  /**
   * Admit and pin the completing save, then run it. Everything up to the
   * transaction is synchronous, so the family, child, domain, day id, ordered
   * findings and the fresh finalization id are fixed before any await.
   *
   * Create-once per draft: a second completed reply in the same draft finds the
   * slot taken and is refused rather than opening a replacement finalization.
   */
  const finalizeCompletion = useCallback(
    async (
      msgs: ChatMessage[],
      fndgs: EvaluationFinding[],
      complete: CompleteBlock,
    ): Promise<string> => {
      if (pinnedFinalSaveRef.current || finalSaveBusyRef.current) {
        return pinnedFinalSaveRef.current?.sessionDocId ?? (sessionDocId ?? defaultSessionDocId())
      }

      const finalizedAt = new Date().toISOString()
      const pinned: PinnedFinalSave = {
        familyId,
        childId,
        domain,
        sessionDocId: sessionDocId ?? defaultSessionDocId(),
        sourceId: newGuidedEvaluationSourceId(familyId),
        finalizedAt,
        findings: fndgs.map((f) => ({ ...f })),
        session: buildSession(msgs, fndgs, complete, finalizedAt),
      }

      finalSaveBusyRef.current = true
      pinnedFinalSaveRef.current = pinned
      setFinalSaveStatus('saving')

      await runPinnedFinalSave(pinned)
      return pinned.sessionDocId
    },
    [
      familyId,
      childId,
      domain,
      sessionDocId,
      defaultSessionDocId,
      buildSession,
      runPinnedFinalSave,
    ],
  )

  /**
   * Retry the SAME captured payload and id after a rejection or an unknown
   * result. No new AI request, no second hour log, no new finalization id — and
   * single-flight, so a double-tap cannot open two. A callback from a cleared
   * draft cannot reach this: `isLive()` is asked at the tap.
   */
  const handleRetryFinalSave = useCallback(() => {
    if (!isLive()) return
    const pinned = pinnedFinalSaveRef.current
    if (!pinned) return
    if (finalSaveBusyRef.current) return
    // Already acknowledged: there is nothing to retry, and a second run would
    // only re-read its own committed source.
    if (finalReceiptRef.current) return

    finalSaveBusyRef.current = true
    setFinalSaveStatus('saving')
    void runPinnedFinalSave(pinned)
  }, [isLive, runPinnedFinalSave])

  // ── Start evaluation (first AI message) ─────────────────────

  const startEvaluation = useCallback(async () => {
    // Asked at the TAP as well as after each await: a control still on screen
    // from a draft that has gone may not act for the one that replaced it.
    if (!isLive()) return
    // One synchronous admission per draft — a double-tap cannot open two.
    if (startBusyRef.current) return
    startBusyRef.current = true

    try {
      hoursLoggedRef.current = false
      sessionTimer.startTimer()

      const openingText = `I'd like to evaluate ${childName}'s ${domain} skills. Let's start the diagnostic assessment.`

      const aiMessages: AIChatMessage[] = [{ role: 'user', content: openingText }]

      const response = await chat({
        familyId,
        childId,
        taskType: TaskType.Evaluate,
        messages: aiMessages,
        domain,
      })

      // The defect: an answer that arrived after the parent moved on. Nothing
      // was admitted for it, so it is discarded whole — no message, no finding,
      // no evaluation record, no hours, no analysis.
      if (!isLive()) return
      if (!response) return

      const newFindings = extractFindings(response.message)
      const complete = extractComplete(response.message)
      const displayText = stripTags(response.message)

      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: ChatMessageRole.User,
        text: openingText,
        createdAt: new Date().toISOString(),
      }

      const aiMsg: ChatMessage = {
        id: generateMessageId(),
        role: ChatMessageRole.Assistant,
        text: displayText,
        createdAt: new Date().toISOString(),
      }

      const newMessages = [userMsg, aiMsg]
      const allFindings = [...newFindings]

      setMessages(newMessages)
      setFindings(allFindings)

      if (complete) {
        setCompleteData(complete)
        setRecommendations(complete.recommendations)
        setCompleteSummary(complete.summary)
        setNextEvalDate(complete.nextEvalDate)
        setSessionStatus('complete')
        void logSessionHours()
      }

      // Both completion paths share one boundary: a direct completion on the
      // very first reply finalizes exactly as an ordinary Send does.
      if (complete) {
        await finalizeCompletion(newMessages, allFindings, complete)
      } else {
        await persistInProgress(newMessages, allFindings)
      }
    } finally {
      startBusyRef.current = false
    }
  }, [
    childId,
    childName,
    familyId,
    domain,
    chat,
    persistInProgress,
    finalizeCompletion,
    sessionTimer,
    logSessionHours,
    isLive,
  ])

  // ── Send message ────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || aiLoading) return
    if (!isLive()) return
    if (sendBusyRef.current) return
    sendBusyRef.current = true
    setSendPhase('sending')

    try {
      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: ChatMessageRole.User,
        text,
        createdAt: new Date().toISOString(),
      }

      const updatedMessages = [...messages, userMsg]
      setMessages(updatedMessages)
      setInputText('')

      // Build AI message history
      const aiMessages: AIChatMessage[] = updatedMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text || '',
      }))

      const response = await chat({
        familyId,
        childId,
        taskType: TaskType.Evaluate,
        messages: aiMessages,
        domain,
      })

      // Same discard as Start: the ordinary Send control reproduced the same
      // cross-child write.
      if (!isLive()) return
      if (!response) return

      const newFindings = extractFindings(response.message)
      const complete = extractComplete(response.message)
      const displayText = stripTags(response.message)

      const aiMsg: ChatMessage = {
        id: generateMessageId(),
        role: ChatMessageRole.Assistant,
        text: displayText,
        createdAt: new Date().toISOString(),
      }

      const finalMessages = [...updatedMessages, aiMsg]
      const allFindings = [...findings, ...newFindings]

      setMessages(finalMessages)
      setFindings(allFindings)

      if (complete) {
        setCompleteData(complete)
        setRecommendations(complete.recommendations)
        setCompleteSummary(complete.summary)
        setNextEvalDate(complete.nextEvalDate)
        setSessionStatus('complete')
        void logSessionHours()
      }

      // The reply is on screen but the turn is not saved yet. On a completing
      // turn the composer is replaced by the summary, so only a continuing
      // one needs to say why it is still holding the input.
      if (!complete) setSendPhase('saving')

      // The shared final-save boundary — the same one a direct completion takes.
      if (complete) {
        await finalizeCompletion(finalMessages, allFindings, complete)
      } else {
        await persistInProgress(finalMessages, allFindings)
      }
    } finally {
      sendBusyRef.current = false
      // Resolved or rejected, THIS draft's composer comes back — and only if
      // this draft is still the one on screen, so a late save cannot reopen
      // the input of the draft that replaced it.
      if (isLive()) setSendPhase('idle')
    }
  }, [
    inputText,
    aiLoading,
    messages,
    findings,
    childId,
    familyId,
    domain,
    chat,
    persistInProgress,
    finalizeCompletion,
    logSessionHours,
    isLive,
  ])

  // ── Save & Apply (update skill snapshot) ────────────────────

  const handleSaveAndApply = useCallback(async () => {
    if (findings.length === 0) return
    if (!isLive()) return
    /**
     * The gate (UX-492). Nothing downstream may run until this draft's own final
     * save is ACKNOWLEDGED: while it is pending there is no committed source to
     * point at, and if it was rejected there is none at all. Read off the ref
     * rather than the status state, so a tap that races the acknowledgement
     * cannot be admitted by a stale render.
     */
    const receipt = finalReceiptRef.current
    if (!receipt) return
    if (applyBusyRef.current) return
    applyBusyRef.current = true

    // Everything this Apply writes is captured BEFORE the first await: the
    // destination (`familyId` / `childId` / `domain` are this draft's props and
    // cannot change value) and the contents. An Apply already admitted finishes
    // against these and nothing else; only its UI feedback is dropped if the
    // parent has moved on.
    /**
     * The findings as the FINALIZED SOURCE recorded them, in its own order —
     * not a current-session read. That is what makes a repeat Apply land on the
     * intended revision: the day document may by then hold a later attempt with
     * the same projected evidence and different help notes, and the receipt is
     * the only thing that still names this one.
     */
    const applyFindings = receipt.findings
    const applyRecommendations = recommendations
    const applyComplete = completeData
    const applyBlocks = conceptualBlocks
    /** The SAVED id. Award eligibility and dedup keys read this, as before. */
    const applySessionDocId = receipt.sessionDocId
    /**
     * The evidence ref's `sourceId` stays the DAILY id, unchanged, for every
     * existing reader — taken from the receipt, so it is the id the save
     * actually committed rather than a fallback computed after the snapshot I/O
     * (which is how an Apply admitted at 23:59:55 once stamped the next day's
     * id). The finalization id below is what disambiguates two attempts on it.
     */
    const applySourceId = receipt.sessionDocId
    /** The exact winner this Apply is evidence of (UX-492). */
    const applyFinalizedSourceId = receipt.sourceId

    try {
      const snapshotRef = doc(skillSnapshotsCollection(familyId), childId)
      const snapshotSnap = await getDoc(snapshotRef)
      const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
        ? snapshotSnap.data()
        : {}

      // Build priority skills from findings (frontier skills — emerging/not-yet)
      const newPrioritySkills: SkillSnapshot['prioritySkills'] = applyFindings
        .filter((f) => f.status === 'emerging' || f.status === 'not-yet')
        .map((f) => ({
          tag: f.skill,
          label: formatSkillLabel(f.skill),
          level: f.status === 'emerging' ? SkillLevel.Emerging : SkillLevel.Emerging,
          masteryGate: MasteryGate.NotYet,
          notes: `${f.evidence}${f.notes ? ' — ' + f.notes : ''} (Evaluated ${new Date().toLocaleDateString()})`,
        }))

      // Add recommendations as priority skills if not already covered
      for (const rec of applyRecommendations) {
        if (!newPrioritySkills.some((s) => s.tag === rec.skill)) {
          newPrioritySkills.push({
            tag: rec.skill,
            label: formatSkillLabel(rec.skill),
            level: SkillLevel.Emerging,
            masteryGate: MasteryGate.NotYet,
            notes: `${rec.action} (${rec.frequency}, ${rec.duration})`,
          })
        }
      }

      // Also update mastered findings in existing skills
      for (const finding of applyFindings) {
        if (finding.status === 'mastered') {
          const existingIdx = newPrioritySkills.findIndex((s) => s.tag === finding.skill)
          if (existingIdx < 0) {
            newPrioritySkills.push({
              tag: finding.skill,
              label: formatSkillLabel(finding.skill),
              level: SkillLevel.Secure,
              masteryGate: MasteryGate.IndependentConsistent,
              notes: `${finding.evidence}${finding.notes ? ' — ' + finding.notes : ''} (Evaluated ${new Date().toLocaleDateString()})`,
            })
          }
        }
      }

      // Build supports, stop rules, evidence definitions from <complete> data
      const newSupports = applyComplete?.supports?.map((s) => ({
        label: s.label,
        description: s.description,
      })) || []

      const newStopRules = applyComplete?.stopRules?.map((r) => ({
        label: r.label,
        trigger: r.trigger,
        action: r.action,
      })) || []

      const newEvidenceDefs = applyComplete?.evidenceDefinitions?.map((e) => ({
        label: e.label,
        description: e.description,
      })) || []

      // Merge with existing (keep existing items not covered by evaluation)
      const existingSkills = (existing.prioritySkills || []).filter(
        (s) => !newPrioritySkills.some((n) => n.tag === s.tag),
      )

      // Derive working levels from evaluation findings
      let mergedWorkingLevels = existing.workingLevels ?? {}
      if (domain === 'reading') {
        // Phonics working level
        const phonicsLevel = deriveWorkingLevelFromEvaluation(applyFindings, 'phonics')
        if (phonicsLevel && canOverwriteWorkingLevel(mergedWorkingLevels.phonics, phonicsLevel)) {
          mergedWorkingLevels = { ...mergedWorkingLevels, phonics: phonicsLevel }
        }
        // Comprehension working level
        const compLevel = deriveWorkingLevelFromEvaluation(applyFindings, 'comprehension')
        if (compLevel && canOverwriteWorkingLevel(mergedWorkingLevels.comprehension, compLevel)) {
          mergedWorkingLevels = { ...mergedWorkingLevels, comprehension: compLevel }
        }
      }
      // Math evaluations: derive math working level if domain is math
      if (domain === 'math') {
        const mathLevel = deriveWorkingLevelFromEvaluation(applyFindings, 'math')
        if (mathLevel && canOverwriteWorkingLevel(mergedWorkingLevels.math, mathLevel)) {
          mergedWorkingLevels = { ...mergedWorkingLevels, math: mathLevel }
        }
      }

      const now = new Date().toISOString()

      // Merge evaluation-derived blocks with existing blocks rather than overwriting.
      // This preserves blocks from quest/scan/parent writers that this evaluation didn't touch.
      let mergedBlocks: ConceptualBlock[] = existing.conceptualBlocks ?? []
      for (const block of applyBlocks) {
        const b = block as Partial<ConceptualBlock>
        if (!b.id) continue
        mergedBlocks = mergeBlock(mergedBlocks, b as Parameters<typeof mergeBlock>[1])
      }
      const blocksChanged = applyBlocks.length > 0

      const updated: Omit<SkillSnapshot, 'id'> = {
        childId,
        prioritySkills: [...existingSkills, ...newPrioritySkills],
        supports: newSupports.length > 0 ? newSupports : existing.supports || [],
        stopRules: newStopRules.length > 0 ? newStopRules : existing.stopRules || [],
        evidenceDefinitions: newEvidenceDefs.length > 0 ? newEvidenceDefs : existing.evidenceDefinitions || [],
        workingLevels: mergedWorkingLevels,
        updatedAt: now,
      }

      await setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)), { merge: true })

      if (blocksChanged) {
        await updateDoc(snapshotRef, {
          conceptualBlocks: JSON.parse(JSON.stringify(mergedBlocks)),
          blocksUpdatedAt: now,
        })
      }
      // Late feedback from a finished Apply is dropped rather than shown over
      // whoever is on screen now.
      if (isLive()) {
        setSnackText('Skill snapshot updated! Priority skills, supports, stop rules, and evidence all set.')
        setHasAppliedThisSession(true)
      }

      // Update Learning Map from findings (fire-and-forget)
      updateSkillMapFromFindings(familyId, childId, applyFindings)
        .catch((err) => console.warn('[LearningMap] Failed to update from evaluation findings', err))

      // FEAT-76: project the guided eval onto the learner-model frontier — the
      // calibrated (up OR down) write, alongside the snapshot write above.
      // Fire-and-forget, guarded model-exists inside the writer; never blocks apply.
      // UX-492: both ids come from the acknowledged receipt — the daily
      // `applySourceId` the existing readers key on, plus the finalization id
      // that identifies WHICH of the day's completed attempts this evidence is.
      // There is no fallback left to compute: an Apply with no receipt was never
      // admitted.
      void syncEvalFindingsToModel(
        familyId,
        childId,
        applySourceId,
        applyFindings,
        now,
        applyFinalizedSourceId,
      ).catch((err) => console.warn('[eval] learner-model write-back failed', err))

      // Award XP for completing an evaluation (once per evaluation session)
      if (applySessionDocId) {
        void addXpEvent(
          familyId,
          childId,
          'EVALUATION_COMPLETE',
          25,
          `eval_${applySessionDocId}`,
        ).catch((err) => console.error('[XP] Award failed:', err))

        void addDiamondEvent({
          familyId,
          childId,
          amount: 5,
          type: DIAMOND_EVENTS.EVALUATION_COMPLETE,
          reason: `Evaluation completed (${domain})`,
          dedupKey: `eval_${applySessionDocId}-diamond`,
        }).catch((err) => console.error('[Diamond] Evaluation award failed:', err))
      }
    } catch (err) {
      console.error('Failed to apply findings to skill snapshot', err)
    } finally {
      applyBusyRef.current = false
    }
  }, [
    childId,
    familyId,
    findings,
    recommendations,
    completeData,
    conceptualBlocks,
    domain,
    isLive,
  ])

  // Apply is repeatable (FEAT-75). The first apply runs straight through; a
  // re-apply in the same session confirms first so a double-tap can't silently
  // re-write the snapshot + learner model.
  const handleApplyClick = useCallback(() => {
    if (!isLive()) return
    // The same gate as the write itself, so a pending or rejected finalization
    // cannot even open the re-apply confirmation (UX-492).
    if (!finalReceiptRef.current) return
    if (hasAppliedThisSession) {
      setReapplyDialogOpen(true)
    } else {
      void handleSaveAndApply()
    }
  }, [hasAppliedThisSession, handleSaveAndApply, isLive])

  const handleConfirmReapply = useCallback(() => {
    setReapplyDialogOpen(false)
    if (!isLive()) return
    void handleSaveAndApply()
  }, [handleSaveAndApply, isLive])

  // ── Clear & Restart ───────────────────────────────────────

  const handleClear = useCallback(() => {
    setClearDialogOpen(false)
    // The restart is a new draft, so there is nothing to reset by hand: this
    // one's state, AI hook, timer, slots and in-flight work all go with it, and
    // work already admitted finishes at the target it captured.
    onClearRestart()
  }, [onClearRestart])

  // ── Download Report ─────────────────────────────────────────

  const handleDownloadReport = useCallback(() => {
    if (!completeSummary) return

    const date = new Date().toLocaleDateString()
    let md = `# ${childName} — Reading Evaluation\n`
    md += `**Date:** ${date}\n\n`
    md += `## Summary\n${completeSummary}\n\n`

    if (completeData?.frontier) {
      md += `## Learning Frontier\n${completeData.frontier}\n\n`
    }

    // Findings
    md += `## Skill Map\n`
    for (const f of findings) {
      const icon = f.status === 'mastered' ? '✅' : f.status === 'emerging' ? '⚠️' : '❌'
      md += `${icon} **${formatSkillLabel(f.skill)}:** ${f.evidence}`
      if (f.notes) md += ` — ${f.notes}`
      md += `\n`
    }
    md += `\n`

    // Recommendations
    if (recommendations.length > 0) {
      md += `## What to Work On\n`
      for (const rec of recommendations) {
        md += `### ${rec.priority}. ${formatSkillLabel(rec.skill)}\n`
        md += `${rec.action}\n`
        md += `- Frequency: ${rec.frequency}\n`
        md += `- Duration: ${rec.duration}\n`
        if (rec.materials?.length) md += `- Materials: ${rec.materials.join(', ')}\n`
        md += `\n`
      }
    }

    // What to skip
    if (completeData?.skipList && completeData.skipList.length > 0) {
      md += `## What to Skip\n`
      for (const item of completeData.skipList) {
        md += `- **${item.skill}:** ${item.reason}\n`
      }
      md += `\n`
    }

    // Next eval
    if (completeData?.nextEvalDate) {
      md += `## Next Evaluation\n`
      md += `Suggested: ${new Date(completeData.nextEvalDate).toLocaleDateString()}\n`
    }

    // Trigger download
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${childName}-reading-eval-${new Date().toISOString().split('T')[0]}.md`
    link.click()
    URL.revokeObjectURL(url)
  }, [childName, completeSummary, findings, recommendations, completeData])

  // ── Handle Enter key ────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  // ── Render ──────────────────────────────────────────────────

  const hasMessages = messages.length > 0

  return (
    <>
      <Stack spacing={2}>
          {/* Start button (no messages yet) */}
          {!hasMessages && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" gutterBottom>
                {domain === EvaluationDomain.Math
                  ? <>Ready to assess {childName}'s math skills? Have {childName} nearby — you'll pose problems and report what you see.</>
                  : domain === EvaluationDomain.Speech
                  ? <>Ready to assess {childName}'s speech? Have {childName} nearby — you'll ask them to say specific words and report what you hear.</>
                  : <>Ready to assess {childName}'s reading skills? Have {childName} nearby — you'll show letters and words, then report what you see.</>
                }
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<AssessmentIcon />}
                onClick={startEvaluation}
                disabled={aiLoading}
              >
                {aiLoading
                  ? 'Starting...'
                  : `Start ${domain.charAt(0).toUpperCase() + domain.slice(1)} Assessment`}
              </Button>
            </Box>
          )}

          {/* Chat messages */}
          {hasMessages && (
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: { xs: '45vh', md: '55vh' },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                bgcolor: 'grey.50',
              }}
            >
              <Stack spacing={1.5}>
                {messages.map((msg) => (
                  <Box
                    key={msg.id}
                    sx={{
                      alignSelf: msg.role === ChatMessageRole.User ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      bgcolor:
                        msg.role === ChatMessageRole.User
                          ? 'primary.main'
                          : 'background.paper',
                      color:
                        msg.role === ChatMessageRole.User
                          ? 'primary.contrastText'
                          : 'text.primary',
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      boxShadow: 1,
                    }}
                  >
                    {msg.text && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                        {msg.text}
                      </Typography>
                    )}
                  </Box>
                ))}
                {aiLoading && (
                  <Box sx={{ alignSelf: 'flex-start', px: 2, py: 1 }}>
                    <LoadingState size={20} />
                  </Box>
                )}
                <div ref={chatEndRef} />
              </Stack>
            </Box>
          )}

          {/* Input area */}
          {hasMessages && sessionStatus === 'in-progress' && (
            <Stack direction="row" spacing={1} alignItems="flex-end">
              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder="Type your response..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={aiLoading || sendPhase !== 'idle'}
                size="small"
              />
              <IconButton
                color="primary"
                aria-label="Send"
                onClick={handleSend}
                disabled={!inputText.trim() || aiLoading || sendPhase !== 'idle'}
              >
                <SendIcon />
              </IconButton>
            </Stack>
          )}

          {/* Why the composer is still closed after the reply arrived. */}
          {hasMessages && sessionStatus === 'in-progress' && sendPhase === 'saving' && (
            <Typography variant="caption" color="text.secondary" role="status">
              Saving this turn…
            </Typography>
          )}

          {aiError && (
            <ErrorState message={`AI error: ${aiError.message}`} />
          )}

          {/* Findings panel */}
          {findings.length > 0 && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Findings So Far
              </Typography>
              <Stack spacing={0.5}>
                {findings.map((f, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.5 }}>
                    {findingStatusIcon(f.status)}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        <strong>{formatSkillLabel(f.skill)}:</strong> {f.evidence}
                      </Typography>
                      {f.notes && (
                        <Typography variant="caption" color="text.secondary">{f.notes}</Typography>
                      )}
                    </Box>
                    <Chip
                      label={f.status}
                      size="small"
                      color={
                        f.status === 'mastered'
                          ? 'success'
                          : f.status === 'emerging'
                            ? 'warning'
                            : 'error'
                      }
                      variant="outlined"
                    />
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Complete summary + recommendations */}
          {completeSummary && (
            <Box
              sx={{
                border: '2px solid',
                borderColor: 'success.main',
                borderRadius: 2,
                p: 2,
                bgcolor: 'success.50',
              }}
            >
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Evaluation Complete
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {completeSummary}
              </Typography>

              {/* Frontier callout */}
              {completeData?.frontier && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Learning frontier:</strong> {completeData.frontier}
                  </Typography>
                </Alert>
              )}

              {/* Learning Roadmap */}
              {recommendations.length > 0 && (
                <Box sx={{ my: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Learning Roadmap</Typography>
                  <Stack spacing={0}>
                    {recommendations.map((rec, i) => {
                      const isFirst = i === 0
                      const isLast = i === recommendations.length - 1
                      return (
                        <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                          {/* Timeline */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                            <Box sx={{
                              width: 16, height: 16, borderRadius: '50%',
                              bgcolor: isFirst ? 'primary.main' : 'grey.300',
                              border: '2px solid',
                              borderColor: isFirst ? 'primary.main' : 'grey.400',
                            }} />
                            {!isLast && (
                              <Box sx={{ width: 2, height: 48, bgcolor: 'grey.300' }} />
                            )}
                          </Box>
                          {/* Content */}
                          <Box sx={{ pb: isLast ? 0 : 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: isFirst ? 700 : 400 }}>
                              {isFirst ? '→ NOW: ' : ''}{formatSkillLabel(rec.skill)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {rec.duration} · {rec.frequency}
                            </Typography>
                          </Box>
                        </Stack>
                      )
                    })}
                    {/* Future milestone */}
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                        <Box sx={{
                          width: 16, height: 16, borderRadius: '50%',
                          bgcolor: 'success.main', border: '2px solid', borderColor: 'success.main',
                        }} />
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                          Re-evaluate & advance
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {completeData?.nextEvalDate
                            ? new Date(completeData.nextEvalDate).toLocaleDateString()
                            : '4-6 weeks from now'}
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </Box>
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    What to Work On:
                  </Typography>
                  {recommendations.map((rec, i) => (
                    <Box key={i} sx={{ mb: 1.5, pl: 1.5, borderLeft: '3px solid', borderColor: 'primary.main' }}>
                      <Typography variant="body2"><strong>{rec.priority}. {formatSkillLabel(rec.skill)}</strong></Typography>
                      <Typography variant="body2">{rec.action}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {rec.frequency} · {rec.duration}
                        {rec.materials?.length ? ` · Materials: ${rec.materials.join(', ')}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </>
              )}

              {/* What to skip */}
              {completeData?.skipList && completeData.skipList.length > 0 && (
                <>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    What to Skip:
                  </Typography>
                  {completeData.skipList.map((item, i) => (
                    <Box key={i} sx={{ mb: 0.5, pl: 1.5, borderLeft: '3px solid', borderColor: 'warning.main' }}>
                      <Typography variant="body2">
                        <strong>{item.skill}:</strong> {item.reason}
                      </Typography>
                    </Box>
                  ))}
                </>
              )}

              {/* Conceptual Foundations */}
              {(patternAnalysisState === 'loading' || patternAnalysisState === 'done') && (
                <Box sx={{ mt: 2 }}>
                  <FoundationsSection
                    blocks={conceptualBlocks}
                    summary={blocksSummary}
                    loading={patternAnalysisState === 'loading'}
                  />
                </Box>
              )}

              {/* Snack feedback */}
              {snackText && (
                <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSnackText(null)}>
                  {snackText}
                </Alert>
              )}

              {/* UX-492 — how the finalization of THIS completed evaluation
                  stands. The summary above and the download below stay on
                  screen whatever it says; what waits on it is Apply. Local,
                  announced feedback, with the retry an ordinary full-width
                  phone-friendly button. */}
              {finalSaveStatus === 'saving' && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  role="status"
                  sx={{ display: 'block', mt: 2 }}
                >
                  Saving the completed evaluation…
                </Typography>
              )}
              {finalSaveStatus === 'failed' && (
                <Alert
                  severity="warning"
                  role="status"
                  sx={{ mt: 2 }}
                  action={
                    <Button color="inherit" size="small" onClick={handleRetryFinalSave}>
                      Retry save
                    </Button>
                  }
                >
                  This evaluation didn't save, so it can't be applied yet. Your summary and
                  report are still here — retry the save to apply it.
                </Alert>
              )}
              {finalSaveStatus === 'conflict' && (
                <Alert severity="warning" role="status" sx={{ mt: 2 }}>
                  We couldn't confirm this evaluation was saved, so it can't be applied. Your
                  summary and report are still here — download the report and run the
                  assessment again when you're ready.
                </Alert>
              )}

              {/* Action buttons */}
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  onClick={handleApplyClick}
                  // Nothing may be applied until the finalization this Apply
                  // would point at is acknowledged (UX-492).
                  disabled={finalSaveStatus !== 'saved'}
                >
                  {hasAppliedThisSession ? 'Re-apply to Skill Snapshot' : 'Apply to Skill Snapshot'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadReport}
                >
                  Download Report
                </Button>
                {/* UX-52: the button names Skill Snapshot, so it lands there
                    rather than on Foundations (tab 0), and carries `?diag=1`. */}
                <Button
                  variant="outlined"
                  onClick={() =>
                    navigate(progressPath(PROGRESS_TABS.SkillSnapshot, searchParams))
                  }
                >
                  View Skill Snapshot
                </Button>
                <Button variant="outlined" onClick={() => navigate('/planner/chat')}>
                  Plan Week from Evaluation
                </Button>
              </Stack>

              {/* Next eval reminder */}
              {completeData?.nextEvalDate && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Next evaluation suggested: {new Date(completeData.nextEvalDate).toLocaleDateString()}
                </Typography>
              )}
            </Box>
          )}

          {/* Action buttons */}
          <Stack direction="row" spacing={1}>
            {hasMessages && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={() => setClearDialogOpen(true)}
              >
                Clear & Restart
              </Button>
            )}
          </Stack>
      </Stack>

      {/* Clear confirmation dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear & Restart?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will clear all messages and findings from the current session. A new session will start fresh. Previous completed evaluations are not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClear} color="warning" variant="contained">
            Clear & Restart
          </Button>
        </DialogActions>
      </Dialog>

      {/* Re-apply confirmation dialog (FEAT-75) */}
      <Dialog open={reapplyDialogOpen} onClose={() => setReapplyDialogOpen(false)}>
        <DialogTitle>Re-apply this evaluation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You already applied this evaluation. Re-applying updates the skill snapshot
            and learner-model frontier again from the same findings. This is safe — it
            re-runs the same additive write.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReapplyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmReapply} color="primary" variant="contained">
            Re-apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
