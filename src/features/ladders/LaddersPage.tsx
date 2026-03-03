import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { doc, getDocs, query, setDoc, where } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  ladderProgressCollection,
  ladderProgressDocId,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type {
  LadderCardDefinition,
  LadderProgress,
} from '../../core/types/domain'
import { SessionSymbol } from '../../core/types/enums'
import { getLaddersForChild } from './laddersCatalog'
import {
  applySession,
  createInitialProgress,
  type ApplySessionInput,
} from './ladderProgress'
import LogSessionDialog from './LogSessionDialog'

type SnackbarState = {
  open: boolean
  severity: 'success' | 'error'
  message: string
}

const RESULT_ICON: Record<string, string> = {
  [SessionSymbol.Pass]: '✔',
  [SessionSymbol.Partial]: '△',
  [SessionSymbol.Miss]: '✖',
}

/** Group ladders by their `group` field, preserving order. */
function groupLadders(
  ladders: LadderCardDefinition[],
): Array<{ group: string | null; ladders: LadderCardDefinition[] }> {
  const groups: Array<{ group: string | null; ladders: LadderCardDefinition[] }> = []
  let currentGroup: string | null | undefined
  for (const ladder of ladders) {
    const g = ladder.group ?? null
    if (groups.length === 0 || g !== currentGroup) {
      groups.push({ group: g, ladders: [ladder] })
      currentGroup = g
    } else {
      groups[groups.length - 1].ladders.push(ladder)
    }
  }
  return groups
}

export default function LaddersPage() {
  const familyId = useFamilyId()
  const {
    children,
    activeChildId: selectedChildId,
    activeChild: selectedChild,
    setActiveChildId: setSelectedChildId,
    isLoading: childrenLoading,
    addChild,
  } = useActiveChild()

  const [searchParams] = useSearchParams()
  const highlightLadder = searchParams.get('ladder')

  const [progressMap, setProgressMap] = useState<Record<string, LadderProgress>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logTarget, setLogTarget] = useState<{
    ladder: LadderCardDefinition
    progress: LadderProgress
  } | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    severity: 'success',
    message: '',
  })

  // Resolve ladder definitions for the active child
  const ladderDefinitions = useMemo(
    () => (selectedChild ? getLaddersForChild(selectedChild.name) : undefined),
    [selectedChild],
  )

  // Group ladders for display
  const ladderGroups = useMemo(
    () => ladderDefinitions ? groupLadders(ladderDefinitions) : [],
    [ladderDefinitions],
  )

  // Track which child the progress is loaded for; clear stale data on switch
  const [progressChildId, setProgressChildId] = useState(selectedChildId)
  if (progressChildId !== selectedChildId) {
    setProgressChildId(selectedChildId)
    setProgressMap({})
    setIsLoading(true)
  }

  // Load progress from Firestore for active child
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
        if (!cancelled) {
          setSnackbar({ open: true, severity: 'error', message: 'Failed to load ladder progress.' })
        }
      }
      if (!cancelled) setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [familyId, selectedChildId])

  // Auto-open log dialog if ?ladder= is set (computed, not effect)
  const autoOpenRef = useMemo(() => {
    if (!highlightLadder || !ladderDefinitions || !selectedChildId || isLoading) return null
    const ladder = ladderDefinitions.find((l) => l.ladderKey === highlightLadder)
    if (!ladder) return null
    return { ladder, ladderKey: ladder.ladderKey }
  }, [highlightLadder, ladderDefinitions, selectedChildId, isLoading])

  // Open log dialog once when autoOpenRef resolves
  const [autoOpened, setAutoOpened] = useState<string | null>(null)
  if (autoOpenRef && autoOpened !== autoOpenRef.ladderKey && !logTarget) {
    setAutoOpened(autoOpenRef.ladderKey)
    const progress = progressMap[autoOpenRef.ladder.ladderKey]
      ?? createInitialProgress(selectedChildId, autoOpenRef.ladder)
    setLogTarget({ ladder: autoOpenRef.ladder, progress })
  }

  const getProgress = useCallback(
    (ladder: LadderCardDefinition): LadderProgress => {
      return progressMap[ladder.ladderKey]
        ?? createInitialProgress(selectedChildId, ladder)
    },
    [progressMap, selectedChildId],
  )

  const handleOpenLog = useCallback(
    (ladder: LadderCardDefinition) => {
      const progress = getProgress(ladder)
      setLogTarget({ ladder, progress })
    },
    [getProgress],
  )

  const handleSaveSession = useCallback(
    async (input: ApplySessionInput) => {
      if (!logTarget || !selectedChildId) return
      setSaving(true)
      try {
        const result = applySession(logTarget.progress, input, logTarget.ladder)
        const docId = ladderProgressDocId(selectedChildId, logTarget.ladder.ladderKey)
        await setDoc(doc(ladderProgressCollection(familyId), docId), result.progress)
        setProgressMap((prev) => ({
          ...prev,
          [logTarget.ladder.ladderKey]: result.progress,
        }))
        setLogTarget(null)

        if (result.promoted) {
          setSnackbar({
            open: true,
            severity: 'success',
            message: `Promoted to ${result.newRungId}! ${logTarget.ladder.title}`,
          })
        } else {
          setSnackbar({
            open: true,
            severity: 'success',
            message: 'Session logged.',
          })
        }
      } catch (err) {
        console.error('Failed to save session', err)
        setSnackbar({ open: true, severity: 'error', message: 'Failed to save session.' })
      }
      setSaving(false)
    },
    [logTarget, selectedChildId, familyId],
  )

  const handleCloseSnackbar = () =>
    setSnackbar((prev) => ({ ...prev, open: false }))

  const renderLadderCard = (ladder: LadderCardDefinition) => {
    const progress = getProgress(ladder)
    const currentRung = ladder.rungs.find(
      (r) => r.rungId === progress.currentRungId,
    )
    const rungIndex = ladder.rungs.findIndex(
      (r) => r.rungId === progress.currentRungId,
    )
    const isComplete = rungIndex === ladder.rungs.length - 1 && progress.streakCount >= 3
    const progressPct = isComplete
      ? 100
      : ladder.rungs.length > 0
        ? (rungIndex / ladder.rungs.length) * 100
        : 0
    const isExpanded = expandedKey === ladder.ladderKey
    const lastEntry = progress.history.length > 0
      ? progress.history[progress.history.length - 1]
      : null

    return (
      <Card
        key={ladder.ladderKey}
        variant="outlined"
        sx={{
          borderColor: highlightLadder === ladder.ladderKey
            ? 'primary.main'
            : undefined,
          borderWidth: highlightLadder === ladder.ladderKey ? 2 : 1,
        }}
      >
        <CardActionArea
          onClick={() =>
            setExpandedKey(isExpanded ? null : ladder.ladderKey)
          }
        >
          <CardContent sx={{ pb: 1.5 }}>
            <Stack spacing={1}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
              >
                <Typography variant="subtitle1" fontWeight={600}>
                  {ladder.title}
                </Typography>
                {isComplete ? (
                  <Chip label="Complete" color="success" size="small" />
                ) : (
                  <Chip
                    label={currentRung
                      ? `${currentRung.rungId}: ${currentRung.name}`
                      : progress.currentRungId}
                    color="primary"
                    size="small"
                    variant="outlined"
                  />
                )}
              </Stack>

              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{ height: 6, borderRadius: 3 }}
              />

              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                flexWrap="wrap"
              >
                <Typography variant="caption" color="text.secondary">
                  Streak: {progress.streakCount}/3
                </Typography>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor:
                        i < progress.streakCount
                          ? 'success.main'
                          : 'action.disabledBackground',
                    }}
                  />
                ))}
                {lastEntry && (
                  <Typography variant="caption" color="text.secondary">
                    Last: {RESULT_ICON[lastEntry.result] ?? lastEntry.result}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {ladder.metricLabel}
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </CardActionArea>

        <Collapse in={isExpanded}>
          <CardContent sx={{ pt: 0 }}>
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                {ladder.intent}
              </Typography>

              {currentRung && (
                <Box
                  sx={{
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    p: 1.5,
                  }}
                >
                  <Typography variant="subtitle2">
                    Evidence: {currentRung.evidenceText}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Supports: {currentRung.supportsText}
                  </Typography>
                </Box>
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {ladder.rungs.map((rung) => {
                  const isActive = rung.rungId === progress.currentRungId
                  const rungIdx = ladder.rungs.indexOf(rung)
                  const currentIdx = ladder.rungs.findIndex(
                    (r) => r.rungId === progress.currentRungId,
                  )
                  const isAchieved = rungIdx < currentIdx
                    || (rungIdx === currentIdx && isComplete)
                  return (
                    <Chip
                      key={rung.rungId}
                      label={`${rung.rungId}: ${rung.name}`}
                      size="small"
                      color={
                        isAchieved
                          ? 'success'
                          : isActive
                            ? 'primary'
                            : 'default'
                      }
                      variant={isActive ? 'filled' : 'outlined'}
                    />
                  )
                })}
              </Stack>

              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                {ladder.globalRuleText}
              </Typography>

              <Button
                variant="contained"
                size="small"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  handleOpenLog(ladder)
                }}
                sx={{ alignSelf: 'flex-start' }}
              >
                Log evidence
              </Button>
            </Stack>
          </CardContent>
        </Collapse>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Page>
        <Typography variant="h4" component="h1">Ladders</Typography>
        <Typography color="text.secondary">Loading...</Typography>
      </Page>
    )
  }

  return (
    <Page>
      <Typography variant="h4" component="h1">Ladders</Typography>

      <ChildSelector
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        onChildAdded={addChild}
        isLoading={childrenLoading}
      />

      {selectedChildId && !ladderDefinitions && (
        <Typography color="text.secondary">
          No ladders defined for {selectedChild?.name ?? 'this child'} yet.
        </Typography>
      )}

      {selectedChildId && ladderDefinitions && (
        <Stack spacing={2}>
          {ladderGroups.map((section, sIdx) => (
            <Stack key={section.group ?? `ungrouped-${sIdx}`} spacing={2}>
              {section.group && (
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ mt: sIdx > 0 ? 1 : 0 }}
                >
                  {section.group}
                </Typography>
              )}
              {section.ladders.map(renderLadderCard)}
            </Stack>
          ))}
        </Stack>
      )}

      {logTarget && (
        <LogSessionDialog
          open
          onClose={() => setLogTarget(null)}
          onSave={handleSaveSession}
          ladder={logTarget.ladder}
          progress={logTarget.progress}
          saving={saving}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Page>
  )
}
