import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import { addDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useProfile } from '../../core/profile/useProfile'
import {
  childrenCollection,
  daysCollection,
  sessionsCollection,
  weeksCollection,
  weeklyScoresCollection,
} from '../../core/firebase/firestore'
import type {
  Child,
  DayLog,
  GoalResult,
  ScoreMetric,
  Session,
  WeeklyScore,
} from '../../core/types/domain'
import { SessionResult, StreamId } from '../../core/types/enums'
import type { SessionResult as SessionResultType } from '../../core/types/enums'
import { getWeekRange } from '../engine/engine.logic'
import { checkLevelUp, resultEmoji } from '../sessions/sessions.logic'
import {
  defaultWeeklyMetricLabels,
  ladderIdForChild,
  streamIcon,
  streamLabel,
} from '../sessions/sessions.model'
import { calculateXp, countLoggedCategories } from '../today/xp'

const allStreams = Object.values(StreamId) as StreamId[]

export default function ScoreboardPage() {
  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  const weekRange = useMemo(() => getWeekRange(new Date()), [])
  const weekStart = weekRange.start
  const weekEnd = weekRange.end

  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [dayLogs, setDayLogs] = useState<DayLog[]>([])
  const [weeklyScore, setWeeklyScore] = useState<WeeklyScore | null>(null)
  const [childGoals, setChildGoals] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const [childrenSnap, sessionsSnap, dayLogsSnap] = await Promise.all([
      getDocs(childrenCollection(familyId)),
      getDocs(sessionsCollection(familyId)),
      getDocs(daysCollection(familyId)),
    ])
    return {
      children: childrenSnap.docs.map((d) => ({
        ...(d.data() as Child),
        id: d.id,
      })),
      sessions: sessionsSnap.docs.map((d) => ({
        ...(d.data() as Session),
        id: d.id,
      })),
      dayLogs: dayLogsSnap.docs.map((d) => d.data()),
    }
  }, [familyId])

  useEffect(() => {
    let cancelled = false
    fetchData().then((data) => {
      if (cancelled) return
      setChildren(data.children)
      setSessions(data.sessions)
      setDayLogs(data.dayLogs)
      setSelectedChildId((cur) => cur || data.children[0]?.id || '')
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchData])

  // Load weekly score + goals for selected child
  useEffect(() => {
    if (!selectedChildId) return
    let cancelled = false
    const load = async () => {
      const [scoreSnap, weekPlanSnap] = await Promise.all([
        getDocs(
          query(
            weeklyScoresCollection(familyId),
            where('childId', '==', selectedChildId),
            where('weekStart', '==', weekStart),
          ),
        ),
        getDoc(doc(weeksCollection(familyId), weekStart)),
      ])
      if (cancelled) return

      if (scoreSnap.docs.length > 0) {
        const d = scoreSnap.docs[0]
        setWeeklyScore({ ...(d.data() as WeeklyScore), id: d.id })
      } else {
        setWeeklyScore(null)
      }

      if (weekPlanSnap.exists()) {
        const plan = weekPlanSnap.data()
        const goals =
          plan.childGoals?.find((g) => g.childId === selectedChildId)?.goals ??
          []
        setChildGoals(goals)
      } else {
        setChildGoals([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, weekStart])

  const weekSessions = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.childId === selectedChildId &&
          s.date >= weekStart &&
          s.date <= weekEnd,
      ),
    [sessions, selectedChildId, weekStart, weekEnd],
  )

  // XP from DayLogs
  const today = new Date().toISOString().slice(0, 10)

  const todayLog = useMemo(
    () =>
      dayLogs.find(
        (d) => d.childId === selectedChildId && d.date === today,
      ),
    [dayLogs, selectedChildId, today],
  )

  const weekDayLogs = useMemo(
    () =>
      dayLogs.filter(
        (d) =>
          d.childId === selectedChildId &&
          d.date >= weekStart &&
          d.date <= weekEnd,
      ),
    [dayLogs, selectedChildId, weekStart, weekEnd],
  )

  const todayXp = todayLog ? calculateXp(todayLog) : 0
  const weeklyXp = weekDayLogs.reduce((sum, d) => sum + calculateXp(d), 0)

  // Streak: count consecutive days (going backwards from today) with >= 1 logged category
  const streak = useMemo(() => {
    const childLogs = dayLogs
      .filter((d) => d.childId === selectedChildId)
      .sort((a, b) => b.date.localeCompare(a.date))

    let count = 0
    const currentDate = new Date(today)
    for (let i = 0; i < 365; i++) {
      const dateStr = currentDate.toISOString().slice(0, 10)
      const log = childLogs.find((d) => d.date === dateStr)
      if (log && countLoggedCategories(log) >= 1) {
        count++
      } else if (i > 0) {
        break
      }
      currentDate.setDate(currentDate.getDate() - 1)
    }
    return count
  }, [dayLogs, selectedChildId, today])

  // Per-stream summary
  const streamSummaries = useMemo(() => {
    return allStreams.map((stream) => {
      const lid = ladderIdForChild(selectedChildId, stream)
      const streamSessions = weekSessions.filter((s) => s.streamId === stream)
      const hits = streamSessions.filter(
        (s) => s.result === SessionResult.Hit,
      ).length
      const nears = streamSessions.filter(
        (s) => s.result === SessionResult.Near,
      ).length
      const misses = streamSessions.filter(
        (s) => s.result === SessionResult.Miss,
      ).length
      const total = streamSessions.length

      // Find current rung (most common targetRungOrder this week)
      const rungCounts = new Map<number, number>()
      for (const s of streamSessions) {
        rungCounts.set(s.targetRungOrder, (rungCounts.get(s.targetRungOrder) ?? 0) + 1)
      }
      const currentRung = [...rungCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1

      const isLevelUp = checkLevelUp(
        sessions.filter((s) => s.childId === selectedChildId),
        lid,
        currentRung,
      )

      return {
        stream,
        ladderId: lid,
        hits,
        nears,
        misses,
        total,
        currentRung,
        isLevelUp,
      }
    })
  }, [weekSessions, selectedChildId, sessions])

  // Goal results — merge saved results with current week's goals
  const goalResults: GoalResult[] = useMemo(() => {
    const saved = weeklyScore?.goalResults ?? []
    return childGoals.map((goal) => {
      const existing = saved.find((g) => g.goal === goal)
      return existing ?? { goal, result: 'na' as const }
    })
  }, [childGoals, weeklyScore?.goalResults])

  const handleGoalResultChange = useCallback(
    (index: number, result: SessionResultType | 'na') => {
      const updated = goalResults.map((g, i) =>
        i === index ? { ...g, result } : g,
      )
      setWeeklyScore((prev) =>
        prev
          ? { ...prev, goalResults: updated }
          : {
              childId: selectedChildId,
              weekStart,
              metrics: defaultWeeklyMetricLabels.map((label) => ({
                label,
                result: 'na' as const,
              })),
              goalResults: updated,
              createdAt: new Date().toISOString(),
            },
      )
    },
    [goalResults, selectedChildId, weekStart],
  )

  // Metrics (from weekly score or defaults)
  const metrics: ScoreMetric[] = weeklyScore?.metrics ??
    defaultWeeklyMetricLabels.map((label) => ({ label, result: 'na' as const }))

  const handleMetricChange = useCallback(
    (index: number, result: SessionResultType | 'na') => {
      const updated = metrics.map((m, i) =>
        i === index ? { ...m, result } : m,
      )
      setWeeklyScore((prev) =>
        prev ? { ...prev, metrics: updated } : null,
      )
    },
    [metrics],
  )

  const handleReflectionChange = useCallback(
    (field: 'reflectionWorked' | 'reflectionFriction' | 'reflectionTweak', value: string) => {
      setWeeklyScore((prev) =>
        prev ? { ...prev, [field]: value } : null,
      )
    },
    [],
  )

  const handleSaveScoreboard = useCallback(async () => {
    if (!selectedChildId) return
    setIsSaving(true)

    const score: WeeklyScore = {
      childId: selectedChildId,
      weekStart,
      metrics,
      goalResults: goalResults.length > 0 ? goalResults : undefined,
      reflectionWorked: weeklyScore?.reflectionWorked ?? '',
      reflectionFriction: weeklyScore?.reflectionFriction ?? '',
      reflectionTweak: weeklyScore?.reflectionTweak ?? '',
      createdAt: weeklyScore?.createdAt ?? new Date().toISOString(),
    }

    if (weeklyScore?.id) {
      await setDoc(doc(weeklyScoresCollection(familyId), weeklyScore.id), score)
      setWeeklyScore({ ...score, id: weeklyScore.id })
    } else {
      const ref = await addDoc(weeklyScoresCollection(familyId), score)
      setWeeklyScore({ ...score, id: ref.id })
    }

    setIsSaving(false)
  }, [familyId, goalResults, metrics, selectedChildId, weekStart, weeklyScore])

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Weekly Scoreboard
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Week of {weekStart}
      </Typography>

      <ChildSelector
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        onChildAdded={(child) => {
          setChildren((prev) => [...prev, child])
          setSelectedChildId(child.id)
        }}
        isLoading={isLoading}
      />

      {!isLoading && selectedChildId && (
        <>
          {/* XP Summary */}
          <SectionCard title="XP Score">
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Card variant="outlined" sx={{ flex: 1, minWidth: 100 }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" color="primary.main" fontWeight={700}>
                    {todayXp}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Today XP
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1, minWidth: 100 }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" color="secondary.main" fontWeight={700}>
                    {weeklyXp}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    This Week
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1, minWidth: 100 }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                    <LocalFireDepartmentIcon
                      color={streak > 0 ? 'error' : 'disabled'}
                      fontSize="small"
                    />
                    <Typography variant="h4" fontWeight={700}>
                      {streak}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Day Streak
                  </Typography>
                </CardContent>
              </Card>
            </Stack>
          </SectionCard>

          <SectionCard title="Stream Progress">
            <Stack spacing={1.5}>
              {streamSummaries.map((s) => (
                <Card key={s.stream} variant="outlined">
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      flexWrap="wrap"
                      spacing={1}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography>{streamIcon[s.stream]}</Typography>
                        <Typography variant="subtitle2">
                          {streamLabel[s.stream]}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Rung {s.currentRung}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5}>
                        {s.total === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            No sessions
                          </Typography>
                        ) : (
                          <>
                            <Chip
                              size="small"
                              label={`${s.hits} \u2714`}
                              color="success"
                              variant="outlined"
                            />
                            <Chip
                              size="small"
                              label={`${s.nears} \u25B3`}
                              color="warning"
                              variant="outlined"
                            />
                            <Chip
                              size="small"
                              label={`${s.misses} \u2716`}
                              color="error"
                              variant="outlined"
                            />
                          </>
                        )}
                        {s.isLevelUp && (
                          <Chip
                            size="small"
                            label="Level up!"
                            color="success"
                          />
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </SectionCard>

          {streamSummaries.some((s) => s.isLevelUp) && (
            <Alert severity="success">
              <Typography variant="subtitle2">Level-up candidates:</Typography>
              {streamSummaries
                .filter((s) => s.isLevelUp)
                .map((s) => (
                  <Typography key={s.stream} variant="body2">
                    {streamIcon[s.stream]} {streamLabel[s.stream]} — 3 hits in a row at Rung{' '}
                    {s.currentRung}
                  </Typography>
                ))}
            </Alert>
          )}

          {goalResults.length > 0 && (
            <SectionCard title="Weekly Goals">
              <Stack spacing={2}>
                {goalResults.map((g, idx) => (
                  <Stack
                    key={idx}
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {g.goal}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      {canEdit ? (
                        (['hit', 'near', 'miss', 'na'] as const).map((r) => (
                          <Chip
                            key={r}
                            size="small"
                            label={r === 'na' ? '\u2014' : resultEmoji(r as SessionResultType)}
                            variant={g.result === r ? 'filled' : 'outlined'}
                            color={
                              r === 'hit'
                                ? 'success'
                                : r === 'near'
                                  ? 'warning'
                                  : r === 'miss'
                                    ? 'error'
                                    : 'default'
                            }
                            onClick={() =>
                              handleGoalResultChange(idx, r as SessionResultType | 'na')
                            }
                          />
                        ))
                      ) : (
                        g.result !== 'na' && (
                          <Chip
                            size="small"
                            label={resultEmoji(g.result as SessionResultType)}
                            color={
                              g.result === 'hit'
                                ? 'success'
                                : g.result === 'near'
                                  ? 'warning'
                                  : g.result === 'miss'
                                    ? 'error'
                                    : 'default'
                            }
                          />
                        )
                      )}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          )}

          {canEdit && (
            <SectionCard title="Weekly Metrics">
              <Stack spacing={2}>
                {metrics.map((metric, idx) => (
                  <Stack
                    key={idx}
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {metric.label}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      {(['hit', 'near', 'miss', 'na'] as const).map((r) => (
                        <Chip
                          key={r}
                          size="small"
                          label={r === 'na' ? '\u2014' : resultEmoji(r as SessionResultType)}
                          variant={metric.result === r ? 'filled' : 'outlined'}
                          color={
                            r === 'hit'
                              ? 'success'
                              : r === 'near'
                                ? 'warning'
                                : r === 'miss'
                                  ? 'error'
                                  : 'default'
                          }
                          onClick={() =>
                            handleMetricChange(idx, r as SessionResultType | 'na')
                          }
                        />
                      ))}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          )}

          {canEdit && (
            <SectionCard title="Weekly Reflection">
              <Stack spacing={2}>
                <TextField
                  label="What worked?"
                  multiline
                  minRows={2}
                  value={weeklyScore?.reflectionWorked ?? ''}
                  onChange={(e) =>
                    handleReflectionChange('reflectionWorked', e.target.value)
                  }
                  fullWidth
                />
                <TextField
                  label="What caused friction?"
                  multiline
                  minRows={2}
                  value={weeklyScore?.reflectionFriction ?? ''}
                  onChange={(e) =>
                    handleReflectionChange('reflectionFriction', e.target.value)
                  }
                  fullWidth
                />
                <TextField
                  label="One tweak for next week"
                  multiline
                  minRows={2}
                  value={weeklyScore?.reflectionTweak ?? ''}
                  onChange={(e) =>
                    handleReflectionChange('reflectionTweak', e.target.value)
                  }
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={handleSaveScoreboard}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Scoreboard'}
                </Button>
              </Stack>
            </SectionCard>
          )}
        </>
      )}
    </Page>
  )
}
