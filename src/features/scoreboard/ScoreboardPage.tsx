import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import { addDoc, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import {
  daysCollection,
  ladderProgressCollection,
  weeksCollection,
  weeklyScoresCollection,
} from '../../core/firebase/firestore'
import type {
  DayLog,
  GoalResult,
  LadderCardDefinition,
  LadderProgress,
  ScoreMetric,
  WeeklyScore,
} from '../../core/types/domain'
import type { SessionResult as SessionResultType, StreamKey } from '../../core/types/enums'
import { getWeekRange } from '../engine/engine.logic'
import { resultEmoji } from '../sessions/sessions.logic'
import { defaultWeeklyMetricLabels } from '../sessions/sessions.model'
import { calculateXp, countLoggedCategories } from '../today/xp'
import { getLaddersForChild } from '../ladders/laddersCatalog'
import { createInitialProgress } from '../ladders/ladderProgress'
import {
  buildLadderStreamSummary,
  getStreamLadders,
  streamKeyIcon,
  streamKeyLabel,
  type LadderStreamSummary,
} from '../ladders/ladderStreamHelpers'

export default function ScoreboardPage() {
  const familyId = useFamilyId()
  const { canEdit } = useProfile()
  const weekRange = useMemo(() => getWeekRange(new Date()), [])
  const weekStart = weekRange.start
  const weekEnd = weekRange.end

  const {
    children,
    activeChildId: selectedChildId,
    activeChild: selectedChild,
    setActiveChildId: setSelectedChildId,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()
  const [dayLogs, setDayLogs] = useState<DayLog[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, LadderProgress>>({})
  const [weeklyScore, setWeeklyScore] = useState<WeeklyScore | null>(null)
  const [childGoals, setChildGoals] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Resolve ladder definitions for the active child
  const ladderDefinitions = useMemo(
    () => (selectedChild ? getLaddersForChild(selectedChild.name) : undefined),
    [selectedChild],
  )
  const streamLadders = useMemo(
    () => (ladderDefinitions ? getStreamLadders(ladderDefinitions) : []),
    [ladderDefinitions],
  )

  // Track which child progress is loaded for; clear stale data on switch
  const [progressChildId, setProgressChildId] = useState(selectedChildId)
  if (progressChildId !== selectedChildId) {
    setProgressChildId(selectedChildId)
    setProgressMap({})
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const dayLogsSnap = await getDocs(daysCollection(familyId))
      if (cancelled) return
      setDayLogs(dayLogsSnap.docs.map((d) => d.data()))
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [familyId])

  // Load ladder progress for active child
  useEffect(() => {
    if (!selectedChildId || !familyId) return

    let cancelled = false
    const load = async () => {
      try {
        const q = query(
          ladderProgressCollection(familyId),
          where('childId', '==', selectedChildId),
        )
        const snapshot = await getDocs(q)
        if (cancelled) return
        const map: Record<string, LadderProgress> = {}
        for (const d of snapshot.docs) {
          const data = d.data() as LadderProgress
          map[data.ladderKey] = data
        }
        setProgressMap(map)
      } catch (err) {
        console.error('Failed to load ladder progress', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId])

  // Load weekly score for selected child
  useEffect(() => {
    if (!selectedChildId) return
    let cancelled = false
    const load = async () => {
      const scoreSnap = await getDocs(
        query(
          weeklyScoresCollection(familyId),
          where('childId', '==', selectedChildId),
          where('weekStart', '==', weekStart),
        ),
      )
      if (cancelled) return

      if (scoreSnap.docs.length > 0) {
        const d = scoreSnap.docs[0]
        setWeeklyScore({ ...(d.data() as WeeklyScore), id: d.id })
      } else {
        setWeeklyScore(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId, weekStart])

  // Load child goals from WeekPlan (real-time)
  useEffect(() => {
    if (!selectedChildId) return
    const ref = doc(weeksCollection(familyId), weekStart)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const plan = snap.data()
          const goals =
            plan.childGoals?.find((g) => g.childId === selectedChildId)?.goals ??
            []
          setChildGoals(goals)
        } else {
          setChildGoals([])
        }
      },
      (err) => {
        console.error('Failed to load week plan', err)
        setChildGoals([])
      },
    )
    return unsubscribe
  }, [familyId, selectedChildId, weekStart])

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

  // Per-stream summary from card-based ladder progress
  const ladderSummaries: LadderStreamSummary[] = useMemo(() => {
    return streamLadders.map((ladder) => {
      const progress = progressMap[ladder.ladderKey]
        ?? createInitialProgress(selectedChildId, ladder)
      return buildLadderStreamSummary(
        ladder as LadderCardDefinition & { streamKey: StreamKey },
        progress,
        weekStart,
        weekEnd,
      )
    })
  }, [streamLadders, progressMap, selectedChildId, weekStart, weekEnd])

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
        onChildAdded={addChild}
        isLoading={childrenLoading}
      />

      {!childrenLoading && !isLoading && selectedChildId && (
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
              {ladderSummaries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No stream ladders defined for this child.
                </Typography>
              ) : (
                ladderSummaries.map((s) => (
                  <Card key={s.ladderKey} variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          flexWrap="wrap"
                          spacing={1}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography>{streamKeyIcon[s.streamKey]}</Typography>
                            <Typography variant="subtitle2">
                              {streamKeyLabel[s.streamKey]}
                            </Typography>
                            <Chip
                              size="small"
                              label={`${s.currentRungId}: ${s.currentRungName}`}
                              color="primary"
                              variant="outlined"
                            />
                          </Stack>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={1.5}
                          alignItems="center"
                          flexWrap="wrap"
                        >
                          {s.weekSessionCount === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                              No sessions
                            </Typography>
                          ) : (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                This week: {s.weekSessionCount}
                              </Typography>
                              <Chip
                                size="small"
                                label={`${s.weekPasses} \u2714`}
                                color="success"
                                variant="outlined"
                              />
                              <Chip
                                size="small"
                                label={`${s.weekPartials} \u25B3`}
                                color="warning"
                                variant="outlined"
                              />
                              <Chip
                                size="small"
                                label={`${s.weekMisses} \u2716`}
                                color="error"
                                variant="outlined"
                              />
                            </>
                          )}
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}>
                            <Typography variant="caption" color="text.secondary">
                              Streak: {s.streakCount}/3
                            </Typography>
                            {Array.from({ length: 3 }).map((_, i) => (
                              <Box
                                key={i}
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  bgcolor:
                                    i < s.streakCount
                                      ? 'success.main'
                                      : 'action.disabledBackground',
                                }}
                              />
                            ))}
                          </Stack>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {s.title}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                ))
              )}
            </Stack>
          </SectionCard>

          {ladderSummaries.some((s) => s.streakCount >= 3) && (
            <Alert severity="success">
              <Typography variant="subtitle2">Level-up candidates:</Typography>
              {ladderSummaries
                .filter((s) => s.streakCount >= 3)
                .map((s) => (
                  <Typography key={s.ladderKey} variant="body2">
                    {streamKeyIcon[s.streamKey]} {streamKeyLabel[s.streamKey]} — 3{' '}
                    passes in a row at {s.currentRungId}
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
