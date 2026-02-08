import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, getDocs, query, where } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  dailyPlansCollection,
  laddersCollection,
  sessionsCollection,
} from '../../core/firebase/firestore'
import type { DailyPlan, Ladder, Rung, Session } from '../../core/types/domain'
import { SessionResult, SupportTag } from '../../core/types/enums'
import type {
  SessionResult as SessionResultType,
  StreamId,
  SupportTag as SupportTagType,
} from '../../core/types/enums'
import { checkLevelUp, resultEmoji, resultLabel } from './sessions.logic'
import { streamIcon, streamLabel } from './sessions.model'

const supportOptions: Array<{ value: SupportTagType; label: string }> = [
  { value: SupportTag.Prompts, label: 'Prompts' },
  { value: SupportTag.FingerTracking, label: 'Finger tracking' },
  { value: SupportTag.Manipulatives, label: 'Manipulatives' },
  { value: SupportTag.SentenceFrames, label: 'Sentence frames' },
  { value: SupportTag.VisualAid, label: 'Visual aid' },
  { value: SupportTag.Timer, label: 'Timer' },
]

const resultOptions: Array<{ value: SessionResultType; label: string; emoji: string }> = [
  { value: SessionResult.Hit, label: 'Hit', emoji: '\u2714\uFE0F' },
  { value: SessionResult.Near, label: 'Near', emoji: '\u25B3' },
  { value: SessionResult.Miss, label: 'Miss', emoji: '\u2716' },
]

type RunnerStep = 'ready' | 'running' | 'result' | 'done'

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SessionRunnerPage() {
  const familyId = useFamilyId()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const childId = searchParams.get('child') ?? ''
  const streamId = (searchParams.get('stream') ?? '') as StreamId
  const ladderId = searchParams.get('ladder') ?? ''
  const targetRungOrder = Number(searchParams.get('rung') ?? '1')

  const [ladder, setLadder] = useState<Ladder | null>(null)
  const [step, setStep] = useState<RunnerStep>('ready')
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [result, setResult] = useState<SessionResultType | null>(null)
  const [notes, setNotes] = useState('')
  const [supports, setSupports] = useState<SupportTagType[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [levelUpTriggered, setLevelUpTriggered] = useState(false)
  const [nextSessionUrl, setNextSessionUrl] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!ladderId) return
    let cancelled = false
    const load = async () => {
      const d = await getDoc(doc(laddersCollection(familyId), ladderId))
      if (cancelled || !d.exists()) return
      setLadder({ ...(d.data() as Ladder), id: d.id })
    }
    load()
    return () => { cancelled = true }
  }, [familyId, ladderId])

  const targetRung: Rung | undefined = useMemo(
    () =>
      ladder?.rungs
        .slice()
        .sort((a, b) => a.order - b.order)
        .find((r) => r.order === targetRungOrder),
    [ladder, targetRungOrder],
  )

  // Timer
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1)
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerRunning])

  const handleStart = useCallback(() => {
    setStep('running')
    setTimerRunning(true)
  }, [])

  const handleEndSession = useCallback(() => {
    setTimerRunning(false)
    setStep('result')
  }, [])

  const handleSupportToggle = useCallback(
    (tag: SupportTagType) => {
      setSupports((prev) =>
        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
      )
    },
    [],
  )

  const handleSave = useCallback(async () => {
    if (!result || !childId) return
    setIsSaving(true)

    const session: Omit<Session, 'id'> = {
      childId,
      date: new Date().toISOString().slice(0, 10),
      streamId: streamId as StreamId,
      ladderId,
      targetRungOrder,
      result,
      durationSeconds: timerSeconds || undefined,
      notes: notes.trim() || undefined,
      supports: supports.length > 0 ? supports : undefined,
      createdAt: new Date().toISOString(),
    }

    await addDoc(sessionsCollection(familyId), session)

    // Check level-up
    if (result === SessionResult.Hit) {
      const levelUpQ = query(
        sessionsCollection(familyId),
        where('childId', '==', childId),
        where('ladderId', '==', ladderId),
      )
      const snap = await getDocs(levelUpQ)
      const allSessions = snap.docs.map((d) => ({
        ...(d.data() as Session),
        id: d.id,
      }))
      // Add the one we just saved
      allSessions.push({ ...session, id: 'new' })
      if (checkLevelUp(allSessions, ladderId, targetRungOrder)) {
        setLevelUpTriggered(true)
      }
    }

    // Find next planned session
    const today = new Date().toISOString().slice(0, 10)
    const planQ = query(
      dailyPlansCollection(familyId),
      where('childId', '==', childId),
      where('date', '==', today),
    )
    const planSnap = await getDocs(planQ)
    if (planSnap.docs.length > 0) {
      const plan = planSnap.docs[0].data() as DailyPlan
      // Get all completed streams for today (including current one)
      const sessionsQ = query(
        sessionsCollection(familyId),
        where('childId', '==', childId),
        where('date', '==', today),
      )
      const todaySnap = await getDocs(sessionsQ)
      const doneStreams = new Set(todaySnap.docs.map((d) => (d.data() as Session).streamId))
      doneStreams.add(streamId) // include the one we just finished

      const next = plan.sessions.find((ps) => !doneStreams.has(ps.streamId))
      if (next) {
        setNextSessionUrl(
          `/sessions/run?child=${childId}&stream=${next.streamId}&ladder=${next.ladderId}&rung=${next.targetRungOrder}`,
        )
      }
    }

    setIsSaving(false)
    setStep('done')
  }, [
    childId,
    familyId,
    ladderId,
    notes,
    result,
    streamId,
    supports,
    targetRungOrder,
    timerSeconds,
  ])

  const handleNext = useCallback(() => {
    if (nextSessionUrl) {
      navigate(nextSessionUrl)
    } else {
      navigate('/dashboard')
    }
  }, [navigate, nextSessionUrl])

  return (
    <Page>
      <Typography variant="h4" component="h1">
        {streamIcon[streamId]} {streamLabel[streamId] ?? 'Session'}
      </Typography>

      {/* Step: Ready */}
      {step === 'ready' && (
        <SectionCard title="Get Ready">
          <Stack spacing={2}>
            {targetRung ? (
              <>
                <Typography variant="h6">
                  Target: {targetRung.title} (Rung {targetRung.order})
                </Typography>
                {targetRung.description && (
                  <Typography color="text.secondary">
                    {targetRung.description}
                  </Typography>
                )}
                {targetRung.proofExamples && targetRung.proofExamples.length > 0 && (
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">What counts as a win:</Typography>
                    {targetRung.proofExamples.map((ex, i) => (
                      <Typography key={i} variant="body2">
                        \u2022 {ex}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </>
            ) : (
              <Typography color="text.secondary">
                Loading rung info...
              </Typography>
            )}
            <Button
              variant="contained"
              size="large"
              onClick={handleStart}
              sx={{ py: 2, fontSize: '1.1rem' }}
            >
              Start Session
            </Button>
          </Stack>
        </SectionCard>
      )}

      {/* Step: Running */}
      {step === 'running' && (
        <SectionCard title="Session in Progress">
          <Stack spacing={3} alignItems="center">
            <Box
              sx={{
                width: 180,
                height: 180,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '4px solid',
                borderColor: 'primary.main',
                bgcolor: 'background.default',
              }}
            >
              <Typography variant="h3" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTimer(timerSeconds)}
              </Typography>
            </Box>

            {targetRung && (
              <Typography variant="subtitle1" color="text.secondary">
                {targetRung.title}
              </Typography>
            )}

            <Button
              variant="contained"
              color="warning"
              size="large"
              onClick={handleEndSession}
              sx={{ py: 2, px: 6, fontSize: '1.1rem' }}
            >
              End Session
            </Button>
          </Stack>
        </SectionCard>
      )}

      {/* Step: Result */}
      {step === 'result' && (
        <>
          <SectionCard title="How did it go?">
            <Stack spacing={3}>
              <ToggleButtonGroup
                value={result}
                exclusive
                onChange={(_, v) => { if (v) setResult(v) }}
                fullWidth
                size="large"
              >
                {resultOptions.map((opt) => (
                  <ToggleButton key={opt.value} value={opt.value}>
                    <Stack alignItems="center" spacing={0.5}>
                      <Typography variant="h4">{opt.emoji}</Typography>
                      <Typography variant="body2">{opt.label}</Typography>
                    </Stack>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              {timerSeconds > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Duration: {formatTimer(timerSeconds)}
                </Typography>
              )}
            </Stack>
          </SectionCard>

          <SectionCard title="Supports Used (optional)">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {supportOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  variant={supports.includes(opt.value) ? 'filled' : 'outlined'}
                  color={supports.includes(opt.value) ? 'primary' : 'default'}
                  onClick={() => handleSupportToggle(opt.value)}
                />
              ))}
            </Stack>
          </SectionCard>

          <SectionCard title="Notes (optional)">
            <TextField
              multiline
              minRows={2}
              placeholder="What helped? Where did they get stuck?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
            />
          </SectionCard>

          <Button
            variant="contained"
            size="large"
            onClick={handleSave}
            disabled={!result || isSaving}
            sx={{ py: 2, fontSize: '1.1rem' }}
          >
            {isSaving ? 'Saving...' : 'Save & Continue'}
          </Button>
        </>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <SectionCard title="Session Logged">
          <Stack spacing={2} alignItems="center">
            <Typography variant="h2">
              {result ? resultEmoji(result) : ''}
            </Typography>
            <Typography variant="h6">
              {result ? resultLabel(result) : ''} — {streamLabel[streamId]}
            </Typography>

            {levelUpTriggered && (
              <Alert severity="success" sx={{ width: '100%' }}>
                <Typography variant="subtitle1">
                  Level-up candidate! 3 hits in a row at Rung {targetRungOrder}.
                  Consider moving to the next rung.
                </Typography>
              </Alert>
            )}

            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </Button>
              <Button variant="contained" onClick={handleNext}>
                {nextSessionUrl ? 'Next Session' : 'Done'}
              </Button>
            </Stack>
          </Stack>
        </SectionCard>
      )}
    </Page>
  )
}
