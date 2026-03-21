import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import CircularProgress from '@mui/material/CircularProgress'
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
import { doc, getDoc, getDocs, orderBy, query, setDoc, where } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import { useAI, TaskType } from '../../core/ai/useAI'
import type { ChatMessage as AIChatMessage } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  evaluationSessionsCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type {
  ChatMessage,
  ConceptualBlock,
  EvaluationFinding,
  EvaluationRecommendation,
  EvaluationSession,
  SkillSnapshot,
} from '../../core/types'
import FoundationsSection from './FoundationsSection'
import { ChatMessageRole, EvaluationDomain, MasteryGate, SkillLevel } from '../../core/types/enums'

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
    .join(' \u2192 ')
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

// ── Component ───────────────────────────────────────────────────

export default function EvaluateChatPage() {
  const familyId = useFamilyId()
  const navigate = useNavigate()
  const { activeChildId, activeChild, children, setActiveChildId } = useActiveChild()
  const { chat, analyzePatterns, loading: aiLoading, error: aiError } = useAI()

  const [domain, setDomain] = useState<EvaluationDomain>(EvaluationDomain.Reading)
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
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [patternAnalysisState, setPatternAnalysisState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [conceptualBlocks, setConceptualBlocks] = useState<ConceptualBlock[]>([])
  const [blocksSummary, setBlocksSummary] = useState<string | undefined>(undefined)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Load or create session ──────────────────────────────────

  useEffect(() => {
    if (!activeChildId || !familyId) return

    let cancelled = false

    async function loadSession() {
      setInitializing(true)
      try {
        // Load all sessions for this child + domain
        const allQ = query(
          evaluationSessionsCollection(familyId),
          where('childId', '==', activeChildId),
          where('domain', '==', domain),
          orderBy('evaluatedAt', 'desc'),
        )
        const allSnap = await getDocs(allQ)

        if (cancelled) return

        const allSessions = allSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
        setPreviousSessions(allSessions.filter((s) => s.status === 'complete'))

        // Check for an in-progress session to resume
        const inProgress = allSessions.find((s) => s.status === 'in-progress')

        if (inProgress) {
          setSessionDocId(inProgress.id!)
          setMessages(inProgress.messages || [])
          setFindings(inProgress.findings || [])
          setRecommendations(inProgress.recommendations || [])
          setSessionStatus(inProgress.status)
          setCompleteSummary(inProgress.summary || null)
          setNextEvalDate(inProgress.nextEvalDate)
        } else {
          // Fresh session
          setSessionDocId(null)
          setMessages([])
          setFindings([])
          setRecommendations([])
          setCompleteSummary(null)
          setNextEvalDate(undefined)
          setSessionStatus('in-progress')
        }
      } catch (err) {
        console.error('Failed to load evaluation session', err)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    void loadSession()
    return () => {
      cancelled = true
    }
  }, [activeChildId, familyId, domain])

  // ── Persist session to Firestore ────────────────────────────

  const persistSession = useCallback(
    async (
      msgs: ChatMessage[],
      fndgs: EvaluationFinding[],
      complete?: CompleteBlock | null,
    ) => {
      if (!activeChildId) return

      const session: Omit<EvaluationSession, 'id'> = {
        childId: activeChildId,
        domain,
        status: complete ? 'complete' : 'in-progress',
        messages: msgs,
        findings: fndgs,
        recommendations: complete?.recommendations || recommendations,
        summary: complete?.summary || completeSummary || undefined,
        evaluatedAt: new Date().toISOString(),
        nextEvalDate: complete?.nextEvalDate || nextEvalDate,
      }

      try {
        if (sessionDocId) {
          const ref = doc(evaluationSessionsCollection(familyId), sessionDocId)
          await setDoc(ref, session)
        } else {
          // Create with a deterministic ID: {childId}_{domain}_{date}
          const newDocId = `${activeChildId}_${domain}_${new Date().toISOString().slice(0, 10)}`
          const ref = doc(evaluationSessionsCollection(familyId), newDocId)
          await setDoc(ref, session)
          setSessionDocId(newDocId)
        }
      } catch (err) {
        console.error('Failed to persist evaluation session', err)
      }
    },
    [activeChildId, domain, familyId, sessionDocId, recommendations, completeSummary, nextEvalDate],
  )

  // ── Trigger pattern analysis after <complete> ────────────────

  const triggerPatternAnalysis = useCallback(
    async (sessionId: string, allFindings: EvaluationFinding[]) => {
      if (!activeChildId) return
      setPatternAnalysisState('loading')
      try {
        const result = await analyzePatterns({
          familyId,
          childId: activeChildId,
          evaluationSessionId: sessionId,
          currentFindings: allFindings.map((f) => ({
            skill: f.skill,
            status: f.status,
            evidence: f.evidence,
            notes: f.notes,
          })),
        })
        if (result) {
          setConceptualBlocks(result.blocks as ConceptualBlock[])
          setBlocksSummary(result.summary)
        }
        setPatternAnalysisState('done')
      } catch (err) {
        console.warn('Pattern analysis failed:', err)
        setPatternAnalysisState('done')
        setBlocksSummary(undefined)
      }
    },
    [activeChildId, familyId, analyzePatterns],
  )

  // ── Start evaluation (first AI message) ─────────────────────

  const startEvaluation = useCallback(async () => {
    if (!activeChildId || !activeChild) return

    const aiMessages: AIChatMessage[] = [
      {
        role: 'user',
        content: `I'd like to evaluate ${activeChild.name}'s ${domain} skills. Let's start the diagnostic assessment.`,
      },
    ]

    const response = await chat({
      familyId,
      childId: activeChildId,
      taskType: TaskType.Evaluate,
      messages: aiMessages,
      domain,
    })

    if (!response) return

    const newFindings = extractFindings(response.message)
    const complete = extractComplete(response.message)
    const displayText = stripTags(response.message)

    const userMsg: ChatMessage = {
      id: generateMessageId(),
      role: ChatMessageRole.User,
      text: `I'd like to evaluate ${activeChild.name}'s ${domain} skills. Let's start the diagnostic assessment.`,
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
    }

    await persistSession(newMessages, allFindings, complete)

    if (complete) {
      // Determine the session doc ID (may have been set by persistSession)
      const sid = sessionDocId ?? `${activeChildId}_${domain}_${new Date().toISOString().slice(0, 10)}`
      void triggerPatternAnalysis(sid, allFindings)
    }
  }, [activeChildId, activeChild, familyId, domain, chat, persistSession, sessionDocId, triggerPatternAnalysis])

  // ── Send message ────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !activeChildId || aiLoading) return

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
      childId: activeChildId,
      taskType: TaskType.Evaluate,
      messages: aiMessages,
      domain,
    })

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
    }

    await persistSession(finalMessages, allFindings, complete)

    if (complete) {
      const sid = sessionDocId ?? `${activeChildId}_${domain}_${new Date().toISOString().slice(0, 10)}`
      void triggerPatternAnalysis(sid, allFindings)
    }
  }, [inputText, activeChildId, aiLoading, messages, findings, familyId, domain, chat, persistSession, sessionDocId, triggerPatternAnalysis])

  // ── Save & Apply (update skill snapshot) ────────────────────

  const handleSaveAndApply = useCallback(async () => {
    if (!activeChildId || findings.length === 0) return

    try {
      const snapshotRef = doc(skillSnapshotsCollection(familyId), activeChildId)
      const snapshotSnap = await getDoc(snapshotRef)
      const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
        ? snapshotSnap.data()
        : {}

      // Build priority skills from findings (frontier skills — emerging/not-yet)
      const newPrioritySkills: SkillSnapshot['prioritySkills'] = findings
        .filter((f) => f.status === 'emerging' || f.status === 'not-yet')
        .map((f) => ({
          tag: f.skill,
          label: formatSkillLabel(f.skill),
          level: f.status === 'emerging' ? SkillLevel.Emerging : SkillLevel.Emerging,
          masteryGate: MasteryGate.NotYet,
          notes: `${f.evidence}${f.notes ? ' \u2014 ' + f.notes : ''} (Evaluated ${new Date().toLocaleDateString()})`,
        }))

      // Add recommendations as priority skills if not already covered
      for (const rec of recommendations) {
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
      for (const finding of findings) {
        if (finding.status === 'mastered') {
          const existingIdx = newPrioritySkills.findIndex((s) => s.tag === finding.skill)
          if (existingIdx < 0) {
            newPrioritySkills.push({
              tag: finding.skill,
              label: formatSkillLabel(finding.skill),
              level: SkillLevel.Secure,
              masteryGate: MasteryGate.IndependentConsistent,
              notes: `${finding.evidence}${finding.notes ? ' \u2014 ' + finding.notes : ''} (Evaluated ${new Date().toLocaleDateString()})`,
            })
          }
        }
      }

      // Build supports, stop rules, evidence definitions from <complete> data
      const newSupports = completeData?.supports?.map((s) => ({
        label: s.label,
        description: s.description,
      })) || []

      const newStopRules = completeData?.stopRules?.map((r) => ({
        label: r.label,
        trigger: r.trigger,
        action: r.action,
      })) || []

      const newEvidenceDefs = completeData?.evidenceDefinitions?.map((e) => ({
        label: e.label,
        description: e.description,
      })) || []

      // Merge with existing (keep existing items not covered by evaluation)
      const existingSkills = (existing.prioritySkills || []).filter(
        (s) => !newPrioritySkills.some((n) => n.tag === s.tag),
      )

      const now = new Date().toISOString()
      const updated: Omit<SkillSnapshot, 'id'> = {
        childId: activeChildId,
        prioritySkills: [...existingSkills, ...newPrioritySkills],
        supports: newSupports.length > 0 ? newSupports : existing.supports || [],
        stopRules: newStopRules.length > 0 ? newStopRules : existing.stopRules || [],
        evidenceDefinitions: newEvidenceDefs.length > 0 ? newEvidenceDefs : existing.evidenceDefinitions || [],
        updatedAt: now,
        // Overwrite conceptual blocks with most recent evaluation's findings
        ...(conceptualBlocks.length > 0 ? {
          conceptualBlocks,
          blocksUpdatedAt: now,
        } : {}),
      }

      await setDoc(snapshotRef, JSON.parse(JSON.stringify(updated)))
      setSnackText('Skill snapshot updated! Priority skills, supports, stop rules, and evidence all set.')

      // Award XP for completing an evaluation (once per evaluation session)
      if (sessionDocId) {
        void addXpEvent(
          familyId,
          activeChildId,
          'EVALUATION_COMPLETE',
          25,
          `eval_${sessionDocId}`,
        )
      }
    } catch (err) {
      console.error('Failed to apply findings to skill snapshot', err)
    }
  }, [activeChildId, familyId, findings, recommendations, completeData, sessionDocId, conceptualBlocks])

  // ── Clear & Restart ───────────────────────────────────────

  const handleClear = useCallback(() => {
    setMessages([])
    setFindings([])
    setRecommendations([])
    setCompleteSummary(null)
    setCompleteData(null)
    setNextEvalDate(undefined)
    setSessionDocId(null)
    setSessionStatus('in-progress')
    setClearDialogOpen(false)
    setSnackText(null)
    setPatternAnalysisState('idle')
    setConceptualBlocks([])
    setBlocksSummary(undefined)
  }, [])

  // ── Download Report ─────────────────────────────────────────

  const handleDownloadReport = useCallback(() => {
    if (!activeChild || !completeSummary) return

    const date = new Date().toLocaleDateString()
    let md = `# ${activeChild.name} — Reading Evaluation\n`
    md += `**Date:** ${date}\n\n`
    md += `## Summary\n${completeSummary}\n\n`

    if (completeData?.frontier) {
      md += `## Learning Frontier\n${completeData.frontier}\n\n`
    }

    // Findings
    md += `## Skill Map\n`
    for (const f of findings) {
      const icon = f.status === 'mastered' ? '\u2705' : f.status === 'emerging' ? '\u26A0\uFE0F' : '\u274C'
      md += `${icon} **${formatSkillLabel(f.skill)}:** ${f.evidence}`
      if (f.notes) md += ` \u2014 ${f.notes}`
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
    link.download = `${activeChild.name}-reading-eval-${new Date().toISOString().split('T')[0]}.md`
    link.click()
    URL.revokeObjectURL(url)
  }, [activeChild, completeSummary, findings, recommendations, completeData])

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

  const isDomainReady = domain === EvaluationDomain.Reading
  const hasMessages = messages.length > 0

  return (
    <Page>
      <Stack direction="row" alignItems="center" spacing={1}>
        <AssessmentIcon color="primary" />
        <Typography variant="h5">
          Evaluate {activeChild?.name || 'Child'}
        </Typography>
      </Stack>

      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
      />

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
              label={tab.value === EvaluationDomain.Reading ? tab.label : `${tab.label} (coming soon)`}
              disabled={tab.value !== EvaluationDomain.Reading}
            />
          ))}
        </Tabs>
      </Box>

      {/* Previous evaluations */}
      {previousSessions.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Previous evaluations:
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
            {previousSessions.map((session) => (
              <Chip
                key={session.id}
                label={`${session.domain} — ${new Date(session.evaluatedAt).toLocaleDateString()}`}
                variant="outlined"
                size="small"
              />
            ))}
          </Stack>
        </Box>
      )}

      {!isDomainReady ? (
        <Alert severity="info">
          {domain.charAt(0).toUpperCase() + domain.slice(1)} evaluation coming soon. Start with Reading.
        </Alert>
      ) : initializing ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          {/* Start button (no messages yet) */}
          {!hasMessages && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" gutterBottom>
                Ready to assess {activeChild?.name}'s reading skills? Have {activeChild?.name} nearby — you'll show letters and words, then report what you see.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<AssessmentIcon />}
                onClick={startEvaluation}
                disabled={aiLoading}
              >
                {aiLoading ? 'Starting...' : 'Start Reading Assessment'}
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
                    <CircularProgress size={20} />
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
            <Alert severity="error">AI error: {aiError.message}</Alert>
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
                              {isFirst ? '\u2192 NOW: ' : ''}{formatSkillLabel(rec.skill)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {rec.duration} \u00B7 {rec.frequency}
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
                <Button variant="contained" onClick={handleSaveAndApply}>
                  Apply to Skill Snapshot
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadReport}
                >
                  Download Report
                </Button>
                <Button variant="outlined" onClick={() => navigate('/progress')}>
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
    </Page>
  )
}
