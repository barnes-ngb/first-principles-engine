import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { doc, getDocs, setDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import { useProfile } from '../../core/profile/useProfile'
import {
  artifactsCollection,
  laddersCollection,
  milestoneProgressCollection,
} from '../../core/firebase/firestore'
import type {
  Artifact,
  Ladder,
  MilestoneProgress,
  Rung,
} from '../../core/types/domain'
import { UserProfile } from '../../core/types/enums'
import {
  getActiveRungId,
  getRungStatus,
  rungIdFor,
  type ProgressByRungId,
} from '../kids/ladder.logic'
import { streamIcon, streamLabel, streamLadderSuffix } from '../sessions/sessions.model'
import type { StreamId } from '../../core/types/enums'
import { createDefaultLadders } from './ladder.templates'

const rungRefFor = (ladderId: string, rungId: string) => `${ladderId}:${rungId}`

const isLadderForChild = (ladder: Ladder, childId: string) => {
  if (!childId) return false
  if (ladder.childId) return ladder.childId === childId
  return ladder.id?.startsWith(`${childId}-`) ?? false
}

/** Detect which StreamId a ladder belongs to by matching its ID suffix. */
const streamForLadder = (ladder: Ladder, childId: string): StreamId | undefined => {
  const ladderId = ladder.id ?? ''
  const prefix = `${childId}-`
  if (!ladderId.startsWith(prefix)) return undefined
  const suffix = ladderId.slice(prefix.length)
  const entry = Object.entries(streamLadderSuffix).find(([, v]) => v === suffix)
  return entry ? (entry[0] as StreamId) : undefined
}

type SnackbarState = {
  open: boolean
  severity: 'success' | 'error'
  message: string
}

export default function LaddersPage() {
  const familyId = useFamilyId()
  const { canEdit, profile } = useProfile()
  const {
    children,
    selectedChildId,
    setSelectedChildId,
    isLoading: childrenLoading,
    addChild,
  } = useChildren()
  const isKid = profile === UserProfile.Lincoln || profile === UserProfile.London

  const [ladders, setLadders] = useState<Ladder[]>([])
  const [milestoneProgress, setMilestoneProgress] = useState<MilestoneProgress[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [selectedRung, setSelectedRung] = useState<{
    ladder: Ladder
    rung: Rung
    rungId: string
  } | null>(null)
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    severity: 'success',
    message: '',
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [laddersSnap, milestoneSnap, artifactsSnap] = await Promise.all([
          getDocs(laddersCollection(familyId)),
          getDocs(milestoneProgressCollection(familyId)),
          getDocs(artifactsCollection(familyId)),
        ])
        if (cancelled) return
        setLadders(laddersSnap.docs.map((d) => ({ ...(d.data() as Ladder), id: d.id })))
        setMilestoneProgress(
          milestoneSnap.docs.map((d) => ({
            ...(d.data() as MilestoneProgress),
            id: d.id,
            status: (d.data() as MilestoneProgress).status ?? 'locked',
          })),
        )
        setArtifacts(artifactsSnap.docs.map((d) => ({ ...(d.data() as Artifact), id: d.id })))
      } catch (err) {
        console.error('Failed to load ladders', err)
        setSnackbar({ open: true, severity: 'error', message: 'Failed to load ladders.' })
      }
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [familyId])

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId),
    [children, selectedChildId],
  )

  const laddersForChild = useMemo(
    () => ladders.filter((l) => isLadderForChild(l, selectedChildId)),
    [ladders, selectedChildId],
  )

  const progressByRung = useMemo(() => {
    return milestoneProgress.reduce<Record<string, MilestoneProgress>>((acc, entry) => {
      if (entry.childId !== selectedChildId || !entry.ladderId || !entry.rungId) return acc
      acc[rungRefFor(entry.ladderId, entry.rungId)] = entry
      return acc
    }, {})
  }, [milestoneProgress, selectedChildId])

  /** For each ladder, find the active rung and compute progress fraction. */
  const ladderSummaries = useMemo(() => {
    return laddersForChild.map((ladder) => {
      const ladderId = ladder.id ?? ''
      const sortedRungs = [...ladder.rungs].sort((a, b) => a.order - b.order)

      const progressByRungId: ProgressByRungId = {}
      for (const rung of sortedRungs) {
        const rid = rungIdFor(rung)
        progressByRungId[rid] = progressByRung[rungRefFor(ladderId, rid)]
      }

      const activeRungId = getActiveRungId(sortedRungs, progressByRungId)
      const activeRung = activeRungId
        ? sortedRungs.find((r) => rungIdFor(r) === activeRungId)
        : undefined

      const achievedCount = sortedRungs.filter(
        (r) => getRungStatus(r, progressByRungId, activeRungId) === 'achieved',
      ).length

      const stream = streamForLadder(ladder, selectedChildId)

      return {
        ladder,
        ladderId,
        sortedRungs,
        activeRung,
        activeRungId,
        achievedCount,
        totalRungs: sortedRungs.length,
        progressByRungId,
        stream,
      }
    })
  }, [laddersForChild, progressByRung, selectedChildId])

  const linkedArtifacts = useMemo(() => {
    if (!selectedRung) return []
    const ladderId = selectedRung.ladder.id ?? ''
    return artifacts.filter(
      (a) =>
        a.childId === selectedChildId &&
        a.tags?.ladderRef?.ladderId === ladderId &&
        a.tags?.ladderRef?.rungId === selectedRung.rungId,
    )
  }, [artifacts, selectedChildId, selectedRung])

  const handleCreateDefaults = async () => {
    if (!selectedChildId || seeding) return
    setSeeding(true)
    try {
      const defaults = createDefaultLadders(selectedChildId)
      // Only create ladders that don't already exist locally
      const existing = new Set(laddersForChild.map((l) => l.id))
      const toCreate = defaults.filter((l) => !existing.has(l.id))
      if (toCreate.length === 0) {
        setSnackbar({ open: true, severity: 'success', message: 'Default ladders already exist.' })
        setSeeding(false)
        return
      }
      await Promise.all(
        toCreate.map((ladder) =>
          setDoc(doc(laddersCollection(familyId), ladder.id), ladder),
        ),
      )
      setLadders((prev) => [...prev, ...toCreate])
      setSnackbar({
        open: true,
        severity: 'success',
        message: `Created ${toCreate.length} default ladder${toCreate.length > 1 ? 's' : ''}.`,
      })
    } catch (err) {
      console.error('Failed to create default ladders', err)
      setSnackbar({ open: true, severity: 'error', message: 'Failed to create ladders.' })
    }
    setSeeding(false)
  }

  const handleCloseSnackbar = () =>
    setSnackbar((prev) => ({ ...prev, open: false }))

  if (isLoading) {
    return (
      <Page>
        <Typography variant="h4" component="h1">Ladders</Typography>
        <Typography color="text.secondary">Loading...</Typography>
      </Page>
    )
  }

  // ---- Kid-simplified view ----
  if (isKid) {
    return (
      <Page>
        <Typography variant="h4" component="h1">
          My Ladders
        </Typography>

        {ladderSummaries.length === 0 ? (
          <Typography color="text.secondary">
            No ladders yet. Ask a parent to set them up.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {ladderSummaries.map((s) => {
              const icon = s.stream ? streamIcon[s.stream] : ''
              const label = s.stream ? streamLabel[s.stream] : s.ladder.title
              const progressPct =
                s.totalRungs > 0 ? (s.achievedCount / s.totalRungs) * 100 : 0

              return (
                <Card key={s.ladderId} variant="outlined">
                  <CardActionArea
                    onClick={() => {
                      if (s.activeRung) {
                        setSelectedRung({
                          ladder: s.ladder,
                          rung: s.activeRung,
                          rungId: rungIdFor(s.activeRung),
                        })
                      }
                    }}
                    disabled={!s.activeRung}
                  >
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="h5">{icon}</Typography>
                          <Stack sx={{ flex: 1 }}>
                            <Typography variant="subtitle1">{label}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {s.achievedCount} / {s.totalRungs} rungs
                            </Typography>
                          </Stack>
                          {s.activeRung ? (
                            <Chip
                              label={`Rung ${s.activeRung.order}`}
                              color="primary"
                              size="small"
                            />
                          ) : (
                            <Chip label="Complete" color="success" size="small" />
                          )}
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={progressPct}
                          sx={{ height: 8, borderRadius: 4 }}
                        />
                        {s.activeRung && (
                          <Box sx={{ pl: 0.5 }}>
                            <Typography variant="body2" fontWeight={600}>
                              Current: {s.activeRung.title}
                            </Typography>
                            {s.activeRung.description && (
                              <Typography variant="body2" color="text.secondary">
                                {s.activeRung.description}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
            })}
          </Stack>
        )}

        {/* Rung detail dialog (kid view) */}
        <Dialog
          open={Boolean(selectedRung)}
          onClose={() => setSelectedRung(null)}
          maxWidth="sm"
          fullWidth
        >
          {selectedRung && (
            <>
              <DialogTitle>{selectedRung.rung.title}</DialogTitle>
              <DialogContent>
                <Stack spacing={2}>
                  {selectedRung.rung.description && (
                    <Typography>{selectedRung.rung.description}</Typography>
                  )}
                  {selectedRung.rung.proofExamples && selectedRung.rung.proofExamples.length > 0 && (
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">What counts as a win:</Typography>
                      {selectedRung.rung.proofExamples.map((ex, i) => (
                        <Typography key={i} variant="body2">
                          {'\u2022'} {ex}
                        </Typography>
                      ))}
                    </Stack>
                  )}
                  {linkedArtifacts.length > 0 && (
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">My proof:</Typography>
                      {linkedArtifacts.map((a) => (
                        <Chip key={a.id} label={a.title} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setSelectedRung(null)}>Close</Button>
                <Button variant="contained">
                  Suggest Proof
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Page>
    )
  }

  // ---- Parent full view ----
  return (
    <Page>
      <Typography variant="h4" component="h1">
        Ladders
      </Typography>

      <ChildSelector
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        onChildAdded={addChild}
        isLoading={childrenLoading}
      />

      {selectedChildId && (
        <Stack spacing={3}>
          {ladderSummaries.length === 0 ? (
            <Stack spacing={1.5} alignItems="flex-start">
              <Typography color="text.secondary">
                No ladders found for this child.
              </Typography>
              {canEdit && (
                <Button
                  variant="contained"
                  disabled={seeding}
                  onClick={handleCreateDefaults}
                >
                  {seeding
                    ? 'Creating...'
                    : `Create Default Ladders for ${selectedChild?.name ?? 'Child'}`}
                </Button>
              )}
            </Stack>
          ) : (
            ladderSummaries.map((s) => {
              const icon = s.stream ? streamIcon[s.stream] : ''
              const label = s.stream ? streamLabel[s.stream] : s.ladder.title
              const progressPct =
                s.totalRungs > 0 ? (s.achievedCount / s.totalRungs) * 100 : 0

              return (
                <SectionCard key={s.ladderId} title={`${icon} ${label}`}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        sx={{ flex: 1, height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="caption">
                        {s.achievedCount}/{s.totalRungs}
                      </Typography>
                    </Stack>

                    <Stack spacing={1}>
                      {s.sortedRungs.map((rung) => {
                        const rid = rungIdFor(rung)
                        const status = getRungStatus(rung, s.progressByRungId, s.activeRungId)
                        const isActive = s.activeRungId === rid

                        return (
                          <Card
                            key={rid}
                            variant="outlined"
                            sx={{
                              borderColor: isActive ? 'primary.main' : undefined,
                              borderWidth: isActive ? 2 : 1,
                            }}
                          >
                            <CardActionArea
                              onClick={() =>
                                setSelectedRung({ ladder: s.ladder, rung, rungId: rid })
                              }
                            >
                              <CardContent sx={{ py: 1.5 }}>
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  justifyContent="space-between"
                                >
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="body2" fontWeight={600}>
                                      {rung.order}.
                                    </Typography>
                                    <Typography variant="body2">{rung.title}</Typography>
                                  </Stack>
                                  <Chip
                                    size="small"
                                    label={
                                      status === 'achieved'
                                        ? 'Achieved'
                                        : status === 'active'
                                          ? 'Active'
                                          : 'Locked'
                                    }
                                    color={
                                      status === 'achieved'
                                        ? 'success'
                                        : status === 'active'
                                          ? 'primary'
                                          : 'default'
                                    }
                                    variant={status === 'locked' ? 'outlined' : 'filled'}
                                  />
                                </Stack>
                              </CardContent>
                            </CardActionArea>
                          </Card>
                        )
                      })}
                    </Stack>
                  </Stack>
                </SectionCard>
              )
            })
          )}
        </Stack>
      )}

      {/* Rung detail dialog (parent view) */}
      <Dialog
        open={Boolean(selectedRung)}
        onClose={() => setSelectedRung(null)}
        maxWidth="sm"
        fullWidth
      >
        {selectedRung && (
          <>
            <DialogTitle>
              Rung {selectedRung.rung.order}: {selectedRung.rung.title}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2}>
                {selectedRung.rung.description && (
                  <Typography>{selectedRung.rung.description}</Typography>
                )}
                {selectedRung.rung.proofExamples && selectedRung.rung.proofExamples.length > 0 && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Proof examples:</Typography>
                    {selectedRung.rung.proofExamples.map((ex, i) => (
                      <Typography key={i} variant="body2">
                        {'\u2022'} {ex}
                      </Typography>
                    ))}
                  </Stack>
                )}
                <Stack spacing={1}>
                  <Typography variant="subtitle2">
                    Linked evidence ({linkedArtifacts.length})
                  </Typography>
                  {linkedArtifacts.length > 0 ? (
                    linkedArtifacts.map((a) => (
                      <Chip key={a.id} label={a.title} size="small" variant="outlined" />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No evidence linked yet.
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedRung(null)}>Close</Button>
              {canEdit && (
                <Button variant="contained" color="primary">
                  Link Evidence
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
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
