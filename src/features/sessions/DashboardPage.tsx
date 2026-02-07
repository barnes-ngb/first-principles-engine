import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  childrenCollection,
  dailyPlansCollection,
  laddersCollection,
  sessionsCollection,
} from '../../core/firebase/firestore'
import type { Child, DailyPlan, Ladder, Session } from '../../core/types/domain'
import { EnergyLevel, StreamId } from '../../core/types/enums'
import type { EnergyLevel as EnergyLevelType } from '../../core/types/enums'
import { calculateStreak } from './sessions.logic'
import {
  buildPlanASessions,
  buildPlanBSessions,
  ladderIdForChild,
  streamIcon,
  streamLabel,
} from './sessions.model'

const energyOptions: Array<{ value: EnergyLevelType; label: string; icon: string }> = [
  { value: EnergyLevel.Normal, label: 'Normal', icon: '\uD83D\uDFE2' },
  { value: EnergyLevel.Low, label: 'Low', icon: '\uD83D\uDFE1' },
  { value: EnergyLevel.Overwhelmed, label: 'Overwhelmed', icon: '\uD83D\uDD34' },
]

const allStreams = Object.values(StreamId) as StreamId[]

function getActiveRungForLadder(ladder: Ladder | undefined): number {
  if (!ladder || ladder.rungs.length === 0) return 1
  return 1
}

export default function DashboardPage() {
  const familyId = useFamilyId()
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)

  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [energy, setEnergy] = useState<EnergyLevelType>(EnergyLevel.Normal)
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const [childrenSnap, sessionsSnap, laddersSnap] = await Promise.all([
      getDocs(childrenCollection(familyId)),
      getDocs(sessionsCollection(familyId)),
      getDocs(laddersCollection(familyId)),
    ])

    const loadedChildren = childrenSnap.docs.map((d) => ({
      ...(d.data() as Child),
      id: d.id,
    }))
    const loadedSessions = sessionsSnap.docs.map((d) => ({
      ...(d.data() as Session),
      id: d.id,
    }))
    const loadedLadders = laddersSnap.docs.map((d) => ({
      ...(d.data() as Ladder),
      id: d.id,
    }))

    return { loadedChildren, loadedSessions, loadedLadders }
  }, [familyId])

  useEffect(() => {
    let cancelled = false
    fetchData().then((data) => {
      if (cancelled) return
      setChildren(data.loadedChildren)
      setSessions(data.loadedSessions)
      setLadders(data.loadedLadders)
      setSelectedChildId((cur) => cur || data.loadedChildren[0]?.id || '')
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchData])

  // Load today's plan for selected child
  useEffect(() => {
    if (!selectedChildId) return
    let cancelled = false
    const loadPlan = async () => {
      const q = query(
        dailyPlansCollection(familyId),
        where('childId', '==', selectedChildId),
        where('date', '==', today),
      )
      const snap = await getDocs(q)
      if (cancelled) return
      if (snap.docs.length > 0) {
        const d = snap.docs[0]
        setDailyPlan({ ...(d.data() as DailyPlan), id: d.id })
      } else {
        setDailyPlan(null)
      }
    }
    loadPlan()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, today])

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

  const completedStreams = useMemo(
    () => new Set(todaySessions.map((s) => s.streamId)),
    [todaySessions],
  )

  const rungsByStream = useMemo(() => {
    const result = {} as Record<StreamId, number>
    for (const stream of allStreams) {
      const lid = ladderIdForChild(selectedChildId, stream)
      const ladder = ladders.find((l) => l.id === lid)
      result[stream] = getActiveRungForLadder(ladder)
    }
    return result
  }, [ladders, selectedChildId])

  const handleEnergyChange = useCallback(
    async (_: unknown, value: EnergyLevelType | null) => {
      if (!value || !selectedChildId) return
      setEnergy(value)

      const planType = value === EnergyLevel.Normal ? 'A' : 'B'
      const plannedSessions =
        planType === 'A'
          ? buildPlanASessions(selectedChildId, rungsByStream)
          : buildPlanBSessions(selectedChildId, rungsByStream)

      const plan: DailyPlan = {
        childId: selectedChildId,
        date: today,
        energy: value,
        planType,
        sessions: plannedSessions,
      }

      if (dailyPlan?.id) {
        await setDoc(doc(dailyPlansCollection(familyId), dailyPlan.id), plan)
        setDailyPlan({ ...plan, id: dailyPlan.id })
      } else {
        const ref = await addDoc(dailyPlansCollection(familyId), plan)
        setDailyPlan({ ...plan, id: ref.id })
      }
    },
    [dailyPlan, familyId, rungsByStream, selectedChildId, today],
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

  const planSessions = dailyPlan?.sessions ?? []

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Dashboard
      </Typography>

      <SectionCard title="Select Child">
        {isLoading ? (
          <Typography color="text.secondary">Loading...</Typography>
        ) : children.length === 0 ? (
          <Typography color="text.secondary">
            No children found. Seed demo data in Settings.
          </Typography>
        ) : (
          <Tabs
            value={selectedChildId}
            onChange={(_, v) => setSelectedChildId(v)}
          >
            {children.map((child) => (
              <Tab key={child.id} value={child.id} label={child.name} />
            ))}
          </Tabs>
        )}
      </SectionCard>

      {!isLoading && selectedChildId && (
        <>
          <SectionCard title="How's the energy today?">
            <ToggleButtonGroup
              value={energy}
              exclusive
              onChange={handleEnergyChange}
              fullWidth
              size="large"
            >
              {energyOptions.map((opt) => (
                <ToggleButton key={opt.value} value={opt.value}>
                  <Stack alignItems="center" spacing={0.5}>
                    <Typography variant="h5">{opt.icon}</Typography>
                    <Typography variant="body2">{opt.label}</Typography>
                  </Stack>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {energy !== EnergyLevel.Normal && (
              <Alert severity="info" sx={{ mt: 1 }}>
                {energy === EnergyLevel.Low
                  ? 'Plan B: shorter sessions to keep momentum.'
                  : 'Just Formation today. Keep it gentle.'}
              </Alert>
            )}
          </SectionCard>

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

          <SectionCard
            title={`Today's Plan ${dailyPlan ? `(Plan ${dailyPlan.planType})` : ''}`}
          >
            {planSessions.length === 0 ? (
              <Stack spacing={2} alignItems="center">
                <Typography color="text.secondary">
                  No plan set yet. Pick an energy level above to generate today's plan.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() =>
                    handleEnergyChange(null, energy)
                  }
                >
                  Generate Plan
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {planSessions.map((ps, idx) => {
                  const done = completedStreams.has(ps.streamId)
                  return (
                    <Card key={idx} variant="outlined">
                      <CardActionArea
                        disabled={done}
                        onClick={() => handleStartSession(ps.streamId)}
                      >
                        <CardContent>
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Typography variant="h6">
                                {streamIcon[ps.streamId]}
                              </Typography>
                              <Stack>
                                <Typography variant="subtitle1">
                                  {ps.label ?? streamLabel[ps.streamId]}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Rung {ps.targetRungOrder}{' '}
                                  {ps.plannedMinutes
                                    ? `\u00b7 ${ps.plannedMinutes} min`
                                    : ''}
                                </Typography>
                              </Stack>
                            </Stack>
                            {done && (
                              <Chip label="Done" color="success" size="small" />
                            )}
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  )
                })}
              </Stack>
            )}
          </SectionCard>

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
    </Page>
  )
}
