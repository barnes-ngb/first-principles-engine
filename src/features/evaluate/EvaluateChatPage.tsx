import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
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
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type {
  ChatMessage,
  EvaluationFinding,
  EvaluationRecommendation,
  EvaluationSession,
  SkillSnapshot,
} from '../../core/types/domain'
import { ChatMessageRole, EvaluationDomain } from '../../core/types/enums'

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
  recommendations: EvaluationRecommendation[]
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
  const { chat, loading: aiLoading, error: aiError } = useAI()

  const [domain, setDomain] = useState<EvaluationDomain>(EvaluationDomain.Reading)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [findings, setFindings] = useState<EvaluationFinding[]>([])
  const [recommendations, setRecommendations] = useState<EvaluationRecommendation[]>([])
  const [completeSummary, setCompleteSummary] = useState<string | null>(null)
  const [nextEvalDate, setNextEvalDate] = useState<string | undefined>()
  const [sessionDocId, setSessionDocId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'in-progress' | 'complete'>('in-progress')
  const [previousSessions, setPreviousSessions] = useState<EvaluationSession[]>([])
  const [inputText, setInputText] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
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
      setRecommendations(complete.recommendations)
      setCompleteSummary(complete.summary)
      setNextEvalDate(complete.nextEvalDate)
      setSessionStatus('complete')
    }

    await persistSession(newMessages, allFindings, complete)
  }, [activeChildId, activeChild, familyId, domain, chat, persistSession])

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
      setRecommendations(complete.recommendations)
      setCompleteSummary(complete.summary)
      setNextEvalDate(complete.nextEvalDate)
      setSessionStatus('complete')
    }

    await persistSession(finalMessages, allFindings, complete)
  }, [inputText, activeChildId, aiLoading, messages, findings, familyId, domain, chat, persistSession])

  // ── Save & Apply (update skill snapshot) ────────────────────

  const handleSaveAndApply = useCallback(async () => {
    if (!activeChildId || findings.length === 0) return

    try {
      const snapshotRef = doc(skillSnapshotsCollection(familyId), activeChildId)
      const snapshotSnap = await getDoc(snapshotRef)
      const existing: Partial<SkillSnapshot> = snapshotSnap.exists()
        ? snapshotSnap.data()
        : {}

      // Merge findings into prioritySkills
      const existingSkills = existing.prioritySkills || []
      const updatedSkills = [...existingSkills]

      for (const finding of findings) {
        if (finding.status === 'not-tested') continue
        const existingIdx = updatedSkills.findIndex((s) => s.tag === finding.skill)
        const level =
          finding.status === 'mastered'
            ? 'secure'
            : finding.status === 'emerging'
              ? 'developing'
              : 'emerging'

        if (existingIdx >= 0) {
          updatedSkills[existingIdx] = {
            ...updatedSkills[existingIdx],
            level,
            label: updatedSkills[existingIdx].label || finding.skill,
          }
        } else {
          updatedSkills.push({
            tag: finding.skill,
            label: finding.skill,
            level,
          })
        }
      }

      await setDoc(snapshotRef, {
        ...existing,
        childId: activeChildId,
        prioritySkills: updatedSkills,
        supports: existing.supports || [],
        stopRules: existing.stopRules || [],
        evidenceDefinitions: existing.evidenceDefinitions || [],
        updatedAt: new Date().toISOString(),
      } satisfies Omit<SkillSnapshot, 'id'>)
    } catch (err) {
      console.error('Failed to apply findings to skill snapshot', err)
    }
  }, [activeChildId, familyId, findings])

  // ── Clear & Restart ───────────────────────────────────────

  const handleClear = useCallback(() => {
    setMessages([])
    setFindings([])
    setRecommendations([])
    setCompleteSummary(null)
    setNextEvalDate(undefined)
    setSessionDocId(null)
    setSessionStatus('in-progress')
    setClearDialogOpen(false)
  }, [])

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
                  <Stack key={i} direction="row" spacing={1} alignItems="center">
                    {findingStatusIcon(f.status)}
                    <Typography variant="body2">
                      <strong>{f.skill}:</strong> {f.evidence}
                      {f.notes ? ` — ${f.notes}` : ''}
                    </Typography>
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
                Assessment Complete
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {completeSummary}
              </Typography>

              {recommendations.length > 0 && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Recommendations
                  </Typography>
                  <Stack spacing={1}>
                    {recommendations.map((r, i) => (
                      <Box
                        key={i}
                        sx={{
                          pl: 2,
                          borderLeft: '3px solid',
                          borderColor: 'primary.main',
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {r.priority}. {r.skill}
                        </Typography>
                        <Typography variant="body2">{r.action}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.frequency} · {r.duration}
                          {r.materials?.length ? ` · Materials: ${r.materials.join(', ')}` : ''}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}

              {nextEvalDate && (
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                  Next evaluation: {nextEvalDate}
                </Typography>
              )}

              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button variant="contained" onClick={handleSaveAndApply}>
                  Apply to Skill Snapshot
                </Button>
                <Button variant="outlined" onClick={() => navigate('/planner/chat')}>
                  Plan Week
                </Button>
              </Stack>
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
            {!completeSummary && hasMessages && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => void persistSession(messages, findings)}
              >
                Save Progress
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
