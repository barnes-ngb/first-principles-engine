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
import { LoadingState, ErrorState } from '../../components/states'
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

// ── Visit ownership (FIX-248) ───────────────────────────────────
//
// A guided evaluation is a long conversation that writes to five collections,
// and the shell's child chip can change the scoped identity under it at any
// moment — the `CLAUDE.md` rail every `FIX-220` / `UX-329` round found one more
// surface for. Here it was reachable from the ordinary controls: hold Lincoln's
// Start (or Send) reply, switch to London, let London's sessions land, then let
// the old completion arrive, and Lincoln's finding is published under London's
// name, persisted to a London-shaped session id, and projected onto London's
// skill snapshot and learner model.
//
// The repair is a **committed visit boundary**, not another guard per callback.
// `EvaluateChatEditor` holds every piece of editable state, is handed a SETTLED
// family, child and domain as props, and is **keyed** by them — so a committed
// change unmounts the visit and mounts a new one, and the old visit's input,
// messages, findings, recommendations, analysis, dialogs, feedback, admission
// guards and session timer go with it in the same commit. Because each visit is
// its own component instance, `A → B → A` is a third visit, the same child id in
// a different family is a different visit, and no closure can retarget: the
// family, child and domain a closure sees are its own instance's props and can
// never change value.
//
// Two things the key cannot own live inside the instance:
//
//   * **the draft lifetime** (`lifetimeRef`) — Clear & Restart ends the draft
//     without ending the visit, so in-flight work from before the Clear must be
//     discarded too. It is also what stops the initial read from re-resuming the
//     draft the parent just cleared.
//   * **the committed-mounted flag** (`visitLiveRef`) — set in a LAYOUT effect,
//     so between a commit's teardown and its setup there is no live visit and a
//     retained callback cannot borrow the authority of the one that just left
//     (`useBookshelf` / `BookReaderPage`'s rule).
//
// `isCurrent(lifetime)` is the single question every awaited step asks before it
// publishes state or starts a side effect. A write or Apply that was already
// admitted finishes with its own captured destination and contents — but its
// late UI feedback is dropped.

/** The settled scope one evaluation visit is bound to. */
interface EvaluateVisitScope {
  familyId: string
  childId: string
  childName: string
  domain: EvaluationDomain
}

/**
 * One synchronous admission slot per operation per lifetime.
 *
 * Holds the lifetime that owns the operation, so release cannot unlock a later
 * visit or a later draft: it clears the slot only if the slot is still its own.
 */
type AdmissionSlot = { current: number | null }

function admit(slot: AdmissionSlot, lifetime: number): boolean {
  if (slot.current !== null) return false
  slot.current = lifetime
  return true
}

function release(slot: AdmissionSlot, lifetime: number): void {
  if (slot.current === lifetime) slot.current = null
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
    isChildProfile,
  } = useActiveChild()

  const [domain, setDomain] = useState<EvaluationDomain>(EvaluationDomain.Reading)

  const isDomainReady = READY_DOMAINS.includes(domain)

  // The visit's scope, or `null` while the identity is not settled. A FAILED
  // children read is handled separately below: it is not an affirmative empty
  // family, and it must not look like one.
  const resolved: { familyId: string; child: Child } | null =
    !childrenLoading && !childrenLoadFailed && familyId && activeChildId && activeChild
      ? { familyId, child: activeChild }
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
          Evaluate {activeChild?.name || 'Child'}
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
      ) : childrenLoadFailed ? (
        // GATE on a FAILED read — recoverable and visibly distinct from an
        // empty family, which is `useBusinessGoal`'s round-5 lesson.
        <ErrorState
          message="We couldn't load your children, so an evaluation can't be started yet."
          onRetry={retryChildren}
        />
      ) : !resolved ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <LoadingState size={40} />
        </Box>
      ) : (
        <EvaluateChatEditor
          // The visit boundary. Everything editable lives below this key.
          key={`${resolved.familyId}|${resolved.child.id}|${role}|${domain}`}
          familyId={resolved.familyId}
          childId={resolved.child.id}
          childName={resolved.child.name}
          domain={domain}
        />
      )}
    </Page>
  )
}

// ── Editor (one visit) ──────────────────────────────────────────

function EvaluateChatEditor({ familyId, childId, childName, domain }: EvaluateVisitScope) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { chat, analyzePatterns, loading: aiLoading, error: aiError } = useAI()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [findings, setFindings] = useState<EvaluationFinding[]>([])
  const [recommendations, setRecommendations] = useState<EvaluationRecommendation[]>([])
  const [completeSummary, setCompleteSummary] = useState<string | null>(null)
  const [completeData, setCompleteData] = useState<CompleteBlock | null>(null)
  const [nextEvalDate, setNextEvalDate] = useState<string | undefined>()
  const [snackText, setSnackText] = useState<string | null>(null)
  const [sessionDocId, setSessionDocId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'in-progress' | 'complete'>('in-progress')
  const [previousSessions, setPreviousSessions] = useState<EvaluationSession[]>([])
  const [inputText, setInputText] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [reapplyDialogOpen, setReapplyDialogOpen] = useState(false)
  const [hasAppliedThisSession, setHasAppliedThisSession] = useState(false)
  const [patternAnalysisState, setPatternAnalysisState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [conceptualBlocks, setConceptualBlocks] = useState<ConceptualBlock[]>([])
  const [blocksSummary, setBlocksSummary] = useState<string | undefined>(undefined)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const sessionTimer = useSessionTimer()
  const hoursLoggedRef = useRef(false)

  // ── Visit + draft lifetime ──────────────────────────────────

  /** Committed-mounted: false until this visit's layout effect has run. */
  const visitLiveRef = useRef(false)
  /** The current draft's lifetime. Clear & Restart ends one and opens the next. */
  const lifetimeRef = useRef(0)

  useLayoutEffect(() => {
    visitLiveRef.current = true
    return () => {
      visitLiveRef.current = false
    }
  }, [])

  /** May work started under `lifetime` still touch this visit? */
  const isCurrent = useCallback(
    (lifetime: number) => visitLiveRef.current && lifetimeRef.current === lifetime,
    [],
  )

  const startSlot = useRef<number | null>(null)
  const sendSlot = useRef<number | null>(null)
  const applySlot = useRef<number | null>(null)

  /**
   * The deterministic session id `persistSession` assigns, rebuilt from THIS
   * visit's child and domain. Unchanged day-based shape (`{childId}_{domain}_{date}`).
   */
  const defaultSessionDocId = useCallback(
    () => `${childId}_${domain}_${new Date().toISOString().slice(0, 10)}`,
    [childId, domain],
  )

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Log session hours when evaluation completes ────────────

  const logSessionHours = useCallback(
    async (lifetime: number) => {
      if (hoursLoggedRef.current) return
      // An old completion must not stop THIS visit's (or this draft's) timer,
      // and must not log minutes for it. `UX-327`'s rule, one surface over.
      if (!isCurrent(lifetime)) return
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
    },
    [childId, familyId, domain, sessionTimer, isCurrent],
  )

  // ── Load or create session ──────────────────────────────────
  //
  // Runs once per visit (family / child / domain are props, fixed for this
  // instance) plus once per explicit retry. It deliberately does NOT depend on
  // anything Clear & Restart changes, so Clear cannot re-resume the draft the
  // parent just cleared — and the lifetime check below means an in-flight read
  // can't either.

  useEffect(() => {
    let cancelled = false
    const lifetime = lifetimeRef.current

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

        if (cancelled || !isCurrent(lifetime)) return

        const allSessions = allSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setPreviousSessions(allSessions.filter((s) => s.status === 'complete'))

        // Check for an in-progress session to resume
        const inProgress = allSessions.find((s) => s.status === 'in-progress')

        if (inProgress) {
          setSessionDocId(inProgress.id!)
          setMessages(inProgress.messages || [])
          setFindings(inProgress.findings || [])
          setRecommendations(inProgress.recommendations || [])
          setSessionStatus('in-progress')
          setCompleteSummary(inProgress.summary || null)
          // A resumed in-progress session has no <complete> block yet — clear any
          // completeData/apply state carried over from a prior child/domain so a
          // later in-progress save can't stamp the previous eval's frontier (and
          // so the re-apply confirm doesn't fire on a different session).
          setCompleteData(null)
          setHasAppliedThisSession(false)
          setNextEvalDate(inProgress.nextEvalDate)
          // Resume timer for continued in-progress session
          hoursLoggedRef.current = false
          sessionTimer.startTimer()
        } else {
          // Fresh session
          setSessionDocId(null)
          setMessages([])
          setFindings([])
          setRecommendations([])
          setCompleteSummary(null)
          setCompleteData(null)
          setHasAppliedThisSession(false)
          setNextEvalDate(undefined)
          setSessionStatus('in-progress')
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, childId, domain, reloadNonce])

  // ── Persist session to Firestore ────────────────────────────

  const persistSession = useCallback(
    async (
      lifetime: number,
      msgs: ChatMessage[],
      fndgs: EvaluationFinding[],
      complete?: CompleteBlock | null,
    ): Promise<string> => {
      // Destination captured before the await: this visit's child and domain,
      // and the session id this call is writing.
      const existingDocId = sessionDocId
      const targetDocId = existingDocId ?? defaultSessionDocId()

      const session: Omit<EvaluationSession, 'id'> = {
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
        evaluatedAt: new Date().toISOString(),
        nextEvalDate: complete?.nextEvalDate || nextEvalDate,
      }

      try {
        const ref = doc(evaluationSessionsCollection(familyId), targetDocId)
        await setDoc(ref, session)
        // Only this visit's current draft learns the id it was given.
        if (!existingDocId && isCurrent(lifetime)) setSessionDocId(targetDocId)
      } catch (err) {
        console.error('Failed to persist evaluation session', err)
      }

      return targetDocId
    },
    [
      childId,
      domain,
      familyId,
      sessionDocId,
      recommendations,
      completeSummary,
      completeData,
      nextEvalDate,
      defaultSessionDocId,
      isCurrent,
    ],
  )

  // ── Trigger pattern analysis after <complete> ────────────────

  const triggerPatternAnalysis = useCallback(
    async (lifetime: number, sessionId: string, allFindings: EvaluationFinding[]) => {
      if (!isCurrent(lifetime)) return
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
        // A late analysis belongs to the visit that asked for it, nobody else.
        if (!isCurrent(lifetime)) return
        if (result) {
          setConceptualBlocks(result.blocks as ConceptualBlock[])
          setBlocksSummary(result.summary)
        }
        setPatternAnalysisState('done')
      } catch (err) {
        console.warn('Pattern analysis failed:', err)
        if (!isCurrent(lifetime)) return
        setPatternAnalysisState('done')
        setBlocksSummary(undefined)
      }
    },
    [childId, familyId, analyzePatterns, isCurrent],
  )

  // ── Start evaluation (first AI message) ─────────────────────

  const startEvaluation = useCallback(async () => {
    const lifetime = lifetimeRef.current
    // One synchronous admission per lifetime — a double-tap cannot open two.
    if (!admit(startSlot, lifetime)) return

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
      if (!isCurrent(lifetime)) return
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
        void logSessionHours(lifetime)
      }

      const sid = await persistSession(lifetime, newMessages, allFindings, complete)

      if (complete && isCurrent(lifetime)) {
        void triggerPatternAnalysis(lifetime, sid, allFindings)
      }
    } finally {
      release(startSlot, lifetime)
    }
  }, [
    childId,
    childName,
    familyId,
    domain,
    chat,
    persistSession,
    triggerPatternAnalysis,
    sessionTimer,
    logSessionHours,
    isCurrent,
  ])

  // ── Send message ────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || aiLoading) return

    const lifetime = lifetimeRef.current
    if (!admit(sendSlot, lifetime)) return

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
      if (!isCurrent(lifetime)) return
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
        void logSessionHours(lifetime)
      }

      const sid = await persistSession(lifetime, finalMessages, allFindings, complete)

      if (complete && isCurrent(lifetime)) {
        void triggerPatternAnalysis(lifetime, sid, allFindings)
      }
    } finally {
      release(sendSlot, lifetime)
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
    persistSession,
    triggerPatternAnalysis,
    logSessionHours,
    isCurrent,
  ])

  // ── Save & Apply (update skill snapshot) ────────────────────

  const handleSaveAndApply = useCallback(async () => {
    const lifetime = lifetimeRef.current
    if (findings.length === 0) return
    if (!admit(applySlot, lifetime)) return

    // Everything this Apply writes is captured BEFORE the first await: the
    // destination (`familyId` / `childId` / `domain` are this visit's props and
    // cannot change value) and the contents. An Apply already admitted finishes
    // against these and nothing else; only its UI feedback is dropped if the
    // parent has moved on.
    const applyFindings = findings
    const applyRecommendations = recommendations
    const applyComplete = completeData
    const applyBlocks = conceptualBlocks
    const applySessionDocId = sessionDocId

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
      if (isCurrent(lifetime)) {
        setSnackText('Skill snapshot updated! Priority skills, supports, stop rules, and evidence all set.')
        setHasAppliedThisSession(true)
      }

      // Update Learning Map from findings (fire-and-forget)
      updateSkillMapFromFindings(familyId, childId, applyFindings)
        .catch((err) => console.warn('[LearningMap] Failed to update from evaluation findings', err))

      // FEAT-76: project the guided eval onto the learner-model frontier — the
      // calibrated (up OR down) write, alongside the snapshot write above.
      // Fire-and-forget, guarded model-exists inside the writer; never blocks apply.
      // Fall back to the same deterministic session id persistSession assigns, so a
      // first-turn/slow-network Apply (sessionDocId still pending) isn't skipped.
      const evalSessionId = applySessionDocId ?? defaultSessionDocId()
      void syncEvalFindingsToModel(familyId, childId, evalSessionId, applyFindings, now)
        .catch((err) => console.warn('[eval] learner-model write-back failed', err))

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
      release(applySlot, lifetime)
    }
  }, [
    childId,
    familyId,
    findings,
    recommendations,
    completeData,
    sessionDocId,
    conceptualBlocks,
    domain,
    defaultSessionDocId,
    isCurrent,
  ])

  // Apply is repeatable (FEAT-75). The first apply runs straight through; a
  // re-apply in the same session confirms first so a double-tap can't silently
  // re-write the snapshot + learner model.
  const handleApplyClick = useCallback(() => {
    if (hasAppliedThisSession) {
      setReapplyDialogOpen(true)
    } else {
      void handleSaveAndApply()
    }
  }, [hasAppliedThisSession, handleSaveAndApply])

  const handleConfirmReapply = useCallback(() => {
    setReapplyDialogOpen(false)
    void handleSaveAndApply()
  }, [handleSaveAndApply])

  // ── Clear & Restart ───────────────────────────────────────

  const handleClear = useCallback(() => {
    // End this draft's lifetime: work already in flight (a pending reply, a
    // pending persist, a pending analysis) belongs to the draft being cleared
    // and must not land on the fresh one.
    lifetimeRef.current += 1
    startSlot.current = null
    sendSlot.current = null
    applySlot.current = null

    sessionTimer.stop() // discard timer without logging
    hoursLoggedRef.current = false
    setMessages([])
    setFindings([])
    setRecommendations([])
    setCompleteSummary(null)
    setCompleteData(null)
    setNextEvalDate(undefined)
    setSessionDocId(null)
    setSessionStatus('in-progress')
    setClearDialogOpen(false)
    setReapplyDialogOpen(false)
    setInputText('')
    setSnackText(null)
    setHasAppliedThisSession(false)
    setPatternAnalysisState('idle')
    setConceptualBlocks([])
    setBlocksSummary(undefined)
  }, [sessionTimer])

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
        // GATE: the read FAILED. Not an empty history, and not editable — the
        // parent gets the honest state and a way to try again.
        <ErrorState
          message={`We couldn't load ${childName}'s evaluation history, so this evaluation isn't editable yet.`}
          onRetry={() => setReloadNonce((n) => n + 1)}
        />
      ) : (
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
                disabled={aiLoading}
                size="small"
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!inputText.trim() || aiLoading}
              >
                <SendIcon />
              </IconButton>
            </Stack>
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

              {/* Action buttons */}
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Button variant="contained" onClick={handleApplyClick}>
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
      )}

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
