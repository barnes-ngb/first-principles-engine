import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useProfile } from '../../core/profile/useProfile'
import {
  daysCollection,
  laddersCollection,
  milestoneProgressCollection,
  sessionsCollection,
  weeksCollection,
} from '../../core/firebase/firestore'
import { useChildren } from '../../core/hooks/useChildren'
import type { DayLog, Ladder, MilestoneProgress, Session, WeekPlan } from '../../core/types/domain'
import { StreamId } from '../../core/types/enums'
import type { ProgressByRungId } from '../kids/ladder.logic'
import { getActiveRungId, rungIdFor } from '../kids/ladder.logic'
import { getWeekRange } from '../engine/engine.logic'
import { blockMeta } from '../today/blockMeta'
import { dayLogDocId, legacyDayLogDocId } from '../today/daylog.model'
import { calculateStreak, findLevelUpCandidates } from './sessions.logic'
import {
  ladderIdForChild,
  streamIcon,
  streamLabel,
} from './sessions.model'
import type { TodayBlock } from './weekplan-today'
import { buildTodayBlocks, createMinimalWeekPlan } from './weekplan-today'

const allStreams = Object.values(StreamId) as StreamId[]

function getActiveRungOrder(
  ladder: Ladder | undefined,
  progressByRungId: ProgressByRungId,
): number {
  if (!ladder || ladder.rungs.length === 0) return 1
  const activeId = getActiveRungId(ladder.rungs, progressByRungId)
  if (!activeId) {
    // All rungs achieved — return the last rung
    const sorted = [...ladder.rungs].sort((a, b) => a.order - b.order)
    return sorted[sorted.length - 1]?.order ?? 1
  }
  const rung = ladder.rungs.find((r) => rungIdFor(r) === activeId)
  return rung?.order ?? 1
}

export default function DashboardPage() {
  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const weekRange = useMemo(() => getWeekRange(new Date()), [])

  const { children, selectedChildId, setSelectedChildId, isLoading: childrenLoading, addChild } = useChildren()
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null | undefined>(undefined) // undefined = loading
  const [dayLog, setDayLog] = useState<DayLog | null>(null)
  const [dayLogChildId, setDayLogChildId] = useState(selectedChildId)
  if (dayLogChildId !== selectedChildId) {
    setDayLogChildId(selectedChildId)
    setDayLog(null)
  }
  const [sessions, setSessions] = useState<Session[]>([])
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [milestoneProgress, setMilestoneProgress] = useState<MilestoneProgress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [snackMessage, setSnackMessage] = useState<{
    text: string
    severity: 'success' | 'error'
  } | null>(null)

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId),
    [children, selectedChildId],
  )

  // ─── Load sessions, ladders, milestone progress ─────────────────────────────

  const fetchData = useCallback(async () => {
    const [sessionsSnap, laddersSnap, progressSnap] = await Promise.all([
      getDocs(sessionsCollection(familyId)),
      getDocs(laddersCollection(familyId)),
      getDocs(milestoneProgressCollection(familyId)),
    ])

    const loadedSessions = sessionsSnap.docs.map((d) => ({
      ...(d.data() as Session),
      id: d.id,
    }))
    const loadedLadders = laddersSnap.docs.map((d) => ({
      ...(d.data() as Ladder),
      id: d.id,
    }))
    const loadedProgress = progressSnap.docs.map((d) => ({
      ...(d.data() as MilestoneProgress),
      id: d.id,
    }))

    return { loadedSessions, loadedLadders, loadedProgress }
  }, [familyId])

  const [fetchKey, setFetchKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchData().then((data) => {
      if (cancelled) return
      setSessions(data.loadedSessions)
      setLadders(data.loadedLadders)
      setMilestoneProgress(data.loadedProgress)
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchData, fetchKey])

  useEffect(() => {
    const handleFocus = () => setFetchKey((k) => k + 1)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // ─── Load WeekPlan for current week (real-time) ────────────────────────────

  useEffect(() => {
    const ref = doc(weeksCollection(familyId), weekRange.start)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setWeekPlan(snap.exists() ? snap.data() : null)
      },
      (err) => {
        console.error('Failed to load week plan', err)
        setWeekPlan(null)
        setSnackMessage({ text: 'Could not load week plan.', severity: 'error' })
      },
    )
    return unsubscribe
  }, [familyId, weekRange.start])

  // ─── Load today's DayLog for selected child (real-time) ─────────────────────

  useEffect(() => {
    if (!selectedChildId) return

    const docId = dayLogDocId(today, selectedChildId)
    const ref = doc(daysCollection(familyId), docId)
    let resolvedWithLegacy = false

    const unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        if (snap.exists()) {
          setDayLog(snap.data())
          return
        }
        // Only attempt legacy fallback once (not on every snapshot)
        if (resolvedWithLegacy) {
          setDayLog(null)
          return
        }
        resolvedWithLegacy = true
        try {
          const legacyId = legacyDayLogDocId(selectedChildId, today)
          const legacyRef = doc(daysCollection(familyId), legacyId)
          const legacySnap = await getDoc(legacyRef)
          if (legacySnap.exists()) {
            setDayLog(legacySnap.data())
            return
          }
        } catch {
          // ignore legacy fallback errors
        }
        setDayLog(null)
      },
      (err) => {
        console.error('Failed to load day log', err)
        setDayLog(null)
      },
    )
    return unsubscribe
  }, [familyId, selectedChildId, today])

  // ─── Derived data ───────────────────────────────────────────────────────────

  const streak = useMemo(
    () => calculateStreak(sessions, selectedChildId),
    [sessions, selectedChildId],
  )

  const todaySessions = useMemo(
    () =>
      sessions.filter(
        (s) => s.childId === selectedChildId && s.date === today,
      ),
    [sessions, selectedChildId, today],
  )

  const progressByLadder = useMemo(() => {
    const result: Record<string, ProgressByRungId> = {}
    for (const mp of milestoneProgress) {
      const lid = mp.ladderId
      if (!result[lid]) result[lid] = {}
      result[lid][mp.rungId] = mp
    }
    return result
  }, [milestoneProgress])

  const rungsByStream = useMemo(() => {
    const result = {} as Record<StreamId, number>
    for (const stream of allStreams) {
      const lid = ladderIdForChild(selectedChildId, stream)
      const ladder = ladders.find((l) => l.id === lid)
      const progress = progressByLadder[lid] ?? {}
      result[stream] = getActiveRungOrder(ladder, progress)
    }
    return result
  }, [ladders, selectedChildId, progressByLadder])

  const levelUpCandidates = useMemo(() => {
    if (!selectedChildId) return []
    const streamLadderIds = allStreams.map((stream) => ({
      streamId: stream,
      ladderId: ladderIdForChild(selectedChildId, stream),
      currentRung: rungsByStream[stream] ?? 1,
    }))
    return findLevelUpCandidates(sessions, selectedChildId, streamLadderIds)
  }, [sessions, selectedChildId, rungsByStream])

  // ─── Today's Plan blocks (derived from WeekPlan + child) ───────────────────

  const todayBlocks: TodayBlock[] = useMemo(() => {
    if (!weekPlan || !selectedChild) return []
    return buildTodayBlocks(weekPlan, selectedChild, dayLog)
  }, [weekPlan, selectedChild, dayLog])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateWeekPlan = useCallback(async () => {
    try {
      const childIds = children.map((c) => c.id)
      const plan = createMinimalWeekPlan(weekRange.start, weekRange.end, childIds)
      const ref = doc(weeksCollection(familyId), weekRange.start)
      await setDoc(ref, plan)
      setWeekPlan(plan)
      setSnackMessage({ text: 'Week plan created!', severity: 'success' })
      navigate('/week')
    } catch (err) {
      console.error('Failed to create week plan', err)
      setSnackMessage({ text: 'Could not create week plan.', severity: 'error' })
    }
  }, [children, familyId, navigate, weekRange])

  const handleLogBlock = useCallback(
    (blockType: string) => {
      navigate(`/today#${blockType}`)
    },
    [navigate],
  )

  const handleStartSession = useCallback(
    (streamId: StreamId) => {
      const ladderId = ladderIdForChild(selectedChildId, streamId)
      const rung = rungsByStream[streamId] ?? 1
      navigate(
        `/sessions/run?child=${selectedChildId}&stream=${streamId}&ladder=${ladderId}&rung=${rung}`,
      )
    },
    [navigate, rungsByStream, selectedChildId],
  )

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Dashboard
      </Typography>

      <ChildSelector
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        onChildAdded={addChild}
        isLoading={childrenLoading || isLoading}
        emptyMessage="No children found. Seed demo data in Settings."
      />

      {!childrenLoading && !isLoading && selectedChildId && (
        <>
          {streak > 0 && (
            <Box sx={{ textAlign: 'center' }}>
              <Chip
                label={`${streak} day streak`}
                color="success"
                variant="outlined"
                size="medium"
              />
            </Box>
          )}

          {canEdit && levelUpCandidates.length > 0 && (
            <Alert severity="success">
              <Typography variant="subtitle2" gutterBottom>
                Level-up candidates
              </Typography>
              {levelUpCandidates.map((c) => (
                <Typography key={c.streamId} variant="body2">
                  {streamIcon[c.streamId]} {streamLabel[c.streamId]} — 3 hits at
                  Rung {c.currentRung}, ready to advance
                </Typography>
              ))}
            </Alert>
          )}

          {/* Today's Plan — derived from WeekPlan */}
          <SectionCard title="Today's Plan">
            {weekPlan === undefined ? (
              <Typography color="text.secondary">Loading plan...</Typography>
            ) : weekPlan === null ? (
              <Stack spacing={2} alignItems="center">
                {canEdit ? (
                  <>
                    <Typography color="text.secondary">
                      No plan for this week yet.
                    </Typography>
                    <Button variant="contained" onClick={handleCreateWeekPlan}>
                      Create this week&apos;s plan
                    </Button>
                  </>
                ) : (
                  <Typography color="text.secondary">
                    Ask a parent to set up the plan.
                  </Typography>
                )}
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {todayBlocks.map((tb) => {
                  const meta = blockMeta[tb.type]
                  return (
                    <Card key={tb.type} variant="outlined">
                      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                        <Stack spacing={1}>
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar
                                sx={{
                                  bgcolor: `${meta.color}20`,
                                  color: meta.color,
                                  width: 36,
                                  height: 36,
                                }}
                              >
                                {meta.icon}
                              </Avatar>
                              <Stack>
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                  {tb.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {tb.suggestedMinutes} min
                                </Typography>
                              </Stack>
                            </Stack>
                            {tb.done && (
                              <Chip label="Done" color="success" size="small" />
                            )}
                          </Stack>
                          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                            {tb.instructions.map((inst, i) => (
                              <Typography
                                key={i}
                                component="li"
                                variant="body2"
                                color="text.secondary"
                              >
                                {inst}
                              </Typography>
                            ))}
                          </Box>
                          {!tb.done && (
                            <Button
                              variant="outlined"
                              size="small"
                              sx={{ alignSelf: 'flex-start', borderColor: meta.color, color: meta.color }}
                              onClick={() => handleLogBlock(tb.type)}
                            >
                              Log this
                            </Button>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  )
                })}
                {canEdit && (
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => navigate('/week')}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Edit week plan
                  </Button>
                )}
              </Stack>
            )}
          </SectionCard>

          {canEdit && (
            <SectionCard title="Quick Start">
              <Stack
                direction="row"
                spacing={1.5}
                flexWrap="wrap"
                useFlexGap
              >
                {allStreams.map((stream) => (
                  <Button
                    key={stream}
                    variant="outlined"
                    onClick={() => handleStartSession(stream)}
                    sx={{ minWidth: 140 }}
                  >
                    {streamIcon[stream]} {streamLabel[stream]}
                  </Button>
                ))}
              </Stack>
            </SectionCard>
          )}

          {todaySessions.length > 0 && (
            <SectionCard title="Completed Today">
              <Stack spacing={1}>
                {todaySessions.map((s) => (
                  <Stack
                    key={s.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                  >
                    <Typography>
                      {streamIcon[s.streamId as StreamId]}{' '}
                      {streamLabel[s.streamId as StreamId]}
                    </Typography>
                    <Chip
                      size="small"
                      label={s.result === 'hit' ? '\u2714' : s.result === 'near' ? '\u25B3' : '\u2716'}
                      color={
                        s.result === 'hit'
                          ? 'success'
                          : s.result === 'near'
                            ? 'warning'
                            : 'error'
                      }
                    />
                    {s.durationSeconds && (
                      <Typography variant="caption" color="text.secondary">
                        {Math.round(s.durationSeconds / 60)} min
                      </Typography>
                    )}
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          )}
        </>
      )}

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMessage(null)}
          severity={snackMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackMessage?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}
