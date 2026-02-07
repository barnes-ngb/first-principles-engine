import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  childrenCollection,
  sessionsCollection,
  weeklyScoresCollection,
} from '../../core/firebase/firestore'
import type {
  Child,
  ScoreMetric,
  Session,
  WeeklyScore,
} from '../../core/types/domain'
import { SessionResult, StreamId } from '../../core/types/enums'
import type { SessionResult as SessionResultType } from '../../core/types/enums'
import { checkLevelUp, resultEmoji } from '../sessions/sessions.logic'
import {
  defaultWeeklyMetricLabels,
  ladderIdForChild,
  streamIcon,
  streamLabel,
} from '../sessions/sessions.model'

function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

const allStreams = Object.values(StreamId) as StreamId[]

export default function ScoreboardPage() {
  const familyId = useFamilyId()
  const today = new Date()
  const weekStart = getWeekStart(today)
  const weekEnd = getWeekEnd(weekStart)

  const [children, setChildren] = useState<Child[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [weeklyScore, setWeeklyScore] = useState<WeeklyScore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const [childrenSnap, sessionsSnap] = await Promise.all([
      getDocs(childrenCollection(familyId)),
      getDocs(sessionsCollection(familyId)),
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
    }
  }, [familyId])

  useEffect(() => {
    let cancelled = false
    fetchData().then((data) => {
      if (cancelled) return
      setChildren(data.children)
      setSessions(data.sessions)
      setSelectedChildId((cur) => cur || data.children[0]?.id || '')
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchData])

  // Load weekly score for selected child
  useEffect(() => {
    if (!selectedChildId) return
    let cancelled = false
    const load = async () => {
      const q = query(
        weeklyScoresCollection(familyId),
        where('childId', '==', selectedChildId),
        where('weekStart', '==', weekStart),
      )
      const snap = await getDocs(q)
      if (cancelled) return
      if (snap.docs.length > 0) {
        const d = snap.docs[0]
        setWeeklyScore({ ...(d.data() as WeeklyScore), id: d.id })
      } else {
        setWeeklyScore(null)
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
  }, [familyId, metrics, selectedChildId, weekStart, weeklyScore])

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Weekly Scoreboard
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Week of {weekStart}
      </Typography>

      <SectionCard title="Select Child">
        {isLoading ? (
          <Typography color="text.secondary">Loading...</Typography>
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
        </>
      )}
    </Page>
  )
}
