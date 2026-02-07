import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { doc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

import ArtifactCard from '../../components/ArtifactCard'
import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  artifactsCollection,
  childrenCollection,
  laddersCollection,
  milestoneProgressCollection,
} from '../../core/firebase/firestore'
import type {
  Artifact,
  Child,
  Ladder,
  MilestoneProgress,
  Rung,
} from '../../core/types/domain'
import {
  canMarkAchieved,
  getActiveRungId,
  getRungStatus,
  rungIdFor,
  type ProgressByRungId,
  type RungStatus,
} from './ladder.logic'

type SelectedRung = {
  ladder: Ladder
  rung: Rung
  rungId: string
  status: RungStatus
  achievedAt?: string
}

const rungRefFor = (ladderId: string, rungId: string) => `${ladderId}:${rungId}`
const milestoneDocIdFor = (childId: string, ladderId: string, rungId: string) =>
  `${childId}-${ladderId}-${rungId}`

const getStatusLabel = (status: RungStatus) => {
  if (status === 'achieved') return 'Achieved'
  if (status === 'active') return 'Active'
  return 'Locked'
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '')

const buildPlaceholderRungs = (rungs: Rung[]): Rung[] => {
  const byOrder = new Map(rungs.map((rung) => [rung.order, rung]))
  return Array.from({ length: 6 }, (_, index) => {
    const order = index + 1
    return (
      byOrder.get(order) ?? {
        id: `placeholder-${order}`,
        title: `Rung ${order}`,
        description: 'Not defined yet.',
        order,
      }
    )
  })
}

const isLadderForChild = (ladder: Ladder, childId: string) => {
  if (!childId) return false
  if (ladder.childId) return ladder.childId === childId
  return ladder.id?.startsWith(`${childId}-`) ?? false
}

export default function KidsPage() {
  const familyId = DEFAULT_FAMILY_ID
  const [children, setChildren] = useState<Child[]>([])
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [milestoneProgress, setMilestoneProgress] = useState<MilestoneProgress[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRung, setSelectedRung] = useState<SelectedRung | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const [childrenSnapshot, laddersSnapshot, milestoneSnapshot, artifactsSnapshot] =
      await Promise.all([
        getDocs(childrenCollection(familyId)),
        getDocs(laddersCollection(familyId)),
        getDocs(milestoneProgressCollection(familyId)),
        getDocs(artifactsCollection(familyId)),
      ])

    const loadedChildren = childrenSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Child
      return { ...data, id: data.id ?? docSnapshot.id }
    })
    const loadedLadders = laddersSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Ladder
      return { ...data, id: data.id ?? docSnapshot.id }
    })
    const loadedMilestones = milestoneSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as MilestoneProgress
      return {
        ...data,
        status: data.status ?? (data.achieved ? 'achieved' : 'locked'),
        id: data.id ?? docSnapshot.id,
      }
    })
    const loadedArtifacts = artifactsSnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data() as Artifact
      return { ...data, id: data.id ?? docSnapshot.id }
    })

    const dedupedMilestones = Object.values(
      loadedMilestones.reduce<Record<string, MilestoneProgress>>((acc, entry) => {
        if (!entry.childId || !entry.ladderId || !entry.rungId) {
          return acc
        }
        const key = rungRefFor(entry.ladderId, entry.rungId)
        const existing = acc[`${entry.childId}:${key}`]
        if (!existing) {
          acc[`${entry.childId}:${key}`] = entry
          return acc
        }
        const existingAchievedAt = existing.achievedAt
          ? Date.parse(existing.achievedAt)
          : 0
        const incomingAchievedAt = entry.achievedAt ? Date.parse(entry.achievedAt) : 0
        const shouldReplace =
          (entry.achieved && !existing.achieved) ||
          incomingAchievedAt > existingAchievedAt
        if (shouldReplace) {
          acc[`${entry.childId}:${key}`] = entry
        }
        return acc
      }, {}),
    )

    return { loadedChildren, loadedLadders, dedupedMilestones, loadedArtifacts }
  }, [familyId])

  useEffect(() => {
    let cancelled = false
    fetchData().then((data) => {
      if (!cancelled) {
        setChildren(data.loadedChildren)
        setLadders(data.loadedLadders)
        setMilestoneProgress(data.dedupedMilestones)
        setArtifacts(data.loadedArtifacts)
        setSelectedChildId((current) => current || data.loadedChildren[0]?.id || '')
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [fetchData])

  const activeChild = useMemo(
    () => children.find((child) => child.id === selectedChildId),
    [children, selectedChildId],
  )

  const laddersForChild = useMemo(
    () => ladders.filter((ladder) => isLadderForChild(ladder, selectedChildId)),
    [ladders, selectedChildId],
  )

  const progressByRung = useMemo(() => {
    return milestoneProgress.reduce<Record<string, MilestoneProgress>>((acc, entry) => {
      if (!entry.childId || !entry.ladderId || !entry.rungId) {
        return acc
      }
      if (entry.childId !== selectedChildId) {
        return acc
      }
      acc[`${entry.ladderId}:${entry.rungId}`] = entry
      return acc
    }, {})
  }, [milestoneProgress, selectedChildId])

  const laddersByDomain = useMemo(() => {
    return laddersForChild.reduce<Record<string, Ladder[]>>((acc, ladder) => {
      const domain = ladder.domain ?? 'General'
      acc[domain] = acc[domain] ? [...acc[domain], ladder] : [ladder]
      return acc
    }, {})
  }, [laddersForChild])

  const handleRungClick = (ladder: Ladder, rung: Rung, status: RungStatus) => {
    const rungId = rungIdFor(rung)
    const ladderId = ladder.id ?? ''
    const progress = progressByRung[rungRefFor(ladderId, rungId)]
    setSelectedRung({
      ladder,
      rung,
      rungId,
      status,
      achievedAt: progress?.achievedAt,
    })
  }

  const linkedArtifacts = useMemo(() => {
    if (!selectedRung || !selectedChildId) return []
    const ladderId = selectedRung.ladder.id ?? ''
    return artifacts.filter(
      (artifact) =>
        artifact.childId === selectedChildId &&
        artifact.tags?.ladderRef?.ladderId === ladderId &&
        artifact.tags?.ladderRef?.rungId === selectedRung.rungId,
    )
  }, [artifacts, selectedChildId, selectedRung])

  const handleMarkAchieved = useCallback(async () => {
    if (!selectedRung || !canMarkAchieved(linkedArtifacts) || !selectedChildId) {
      return
    }
    const ladderId = selectedRung.ladder.id ?? ''
    const rungRef = rungRefFor(ladderId, selectedRung.rungId)
    const existing = progressByRung[rungRef]
    const achievedAt = new Date().toISOString()
    const milestoneDocId = milestoneDocIdFor(
      selectedChildId,
      ladderId,
      selectedRung.rungId,
    )

    setIsSaving(true)

    if (existing?.id) {
      await updateDoc(doc(milestoneProgressCollection(familyId), existing.id), {
        childId: selectedChildId,
        ladderId,
        rungId: selectedRung.rungId,
        achieved: true,
        status: 'achieved',
        achievedAt,
        label: selectedRung.rung.title,
      })
      setMilestoneProgress((prev) =>
        prev.map((entry) =>
          entry.id === existing.id
            ? {
                ...entry,
                childId: selectedChildId,
                ladderId,
                rungId: selectedRung.rungId,
                achieved: true,
                status: 'achieved',
                achievedAt,
                label: selectedRung.rung.title,
              }
            : entry,
        ),
      )
    } else {
      await setDoc(doc(milestoneProgressCollection(familyId), milestoneDocId), {
        childId: selectedChildId,
        ladderId,
        rungId: selectedRung.rungId,
        label: selectedRung.rung.title,
        achieved: true,
        status: 'achieved',
        achievedAt,
      })
      setMilestoneProgress((prev) => [
        ...prev,
        {
          id: milestoneDocId,
          childId: selectedChildId,
          ladderId,
          rungId: selectedRung.rungId,
          label: selectedRung.rung.title,
          achieved: true,
          status: 'achieved',
          achievedAt,
        },
      ])
    }

    setIsSaving(false)
  }, [
    familyId,
    linkedArtifacts,
    progressByRung,
    selectedChildId,
    selectedRung,
  ])

  const renderLadder = (ladder: Ladder) => {
    const ladderId = ladder.id ?? ''
    const rungs = buildPlaceholderRungs(
      [...ladder.rungs].sort((a, b) => a.order - b.order),
    )
    const progressByRungId = rungs.reduce<ProgressByRungId>((acc, rung) => {
      const rungId = rungIdFor(rung)
      acc[rungId] = progressByRung[rungRefFor(ladderId, rungId)]
      return acc
    }, {})
    const activeRungId = getActiveRungId(
      rungs.filter((rung) => !rung.id?.startsWith('placeholder-')),
      progressByRungId,
    )

    return (
      <Card key={ladderId} variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6">{ladder.title}</Typography>
              {ladder.description && (
                <Typography variant="body2" color="text.secondary">
                  {ladder.description}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              {rungs.map((rung) => {
                const rungId = rungIdFor(rung)
                const isPlaceholder = rung.id?.startsWith('placeholder-')
                const progress = progressByRungId[rungId]
                const status = getRungStatus(rung, progressByRungId, activeRungId)
                const achievedAt = progress?.achievedAt

                return (
                  <Card
                    key={rungId}
                    variant="outlined"
                    sx={{
                      width: 200,
                      opacity: isPlaceholder ? 0.5 : 1,
                    }}
                  >
                    <CardActionArea
                      disabled={isPlaceholder}
                      onClick={() => handleRungClick(ladder, rung, status)}
                    >
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1">{rung.title}</Typography>
                          <Chip size="small" label={getStatusLabel(status)} />
                          {achievedAt && (
                            <Typography variant="caption" color="text.secondary">
                              Achieved {formatDate(achievedAt)}
                            </Typography>
                          )}
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                )
              })}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  return (
    <Page>
      <Typography variant="h4" component="h1">
        Kids
      </Typography>
      <SectionCard title="Select Child">
        {isLoading ? (
          <Typography color="text.secondary">Loading kids...</Typography>
        ) : children.length === 0 ? (
          <Typography color="text.secondary">
            No children added yet. Add a child to see ladders.
          </Typography>
        ) : (
          <Tabs
            value={selectedChildId}
            onChange={(_, value) => setSelectedChildId(value)}
          >
            {children.map((child) => (
              <Tab key={child.id} value={child.id} label={child.name} />
            ))}
          </Tabs>
        )}
      </SectionCard>
      {!isLoading && activeChild && (
        <Stack spacing={3}>
          {Object.entries(laddersByDomain).length === 0 ? (
            <SectionCard title="Ladders">
              <Typography color="text.secondary">
                No ladders found for {activeChild.name}.
              </Typography>
            </SectionCard>
          ) : (
            Object.entries(laddersByDomain).map(([domain, domainLadders]) => (
              <SectionCard key={domain} title={`${domain} Ladders`}>
                <Stack spacing={2}>{domainLadders.map(renderLadder)}</Stack>
              </SectionCard>
            ))
          )}
        </Stack>
      )}
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
              <Stack spacing={2} divider={<Divider flexItem />}>
                <Stack spacing={1}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Definition
                  </Typography>
                  <Typography variant="body1">
                    {selectedRung.rung.description || 'No definition provided yet.'}
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Proof examples
                  </Typography>
                  {selectedRung.rung.proofExamples?.length ? (
                    <Stack spacing={0.5}>
                      {selectedRung.rung.proofExamples.map((example) => (
                        <Typography key={example} variant="body2">
                          • {example}
                        </Typography>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Add proof examples to guide evidence collection.
                    </Typography>
                  )}
                </Stack>
                <Stack spacing={1}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Evidence artifacts
                  </Typography>
                  {linkedArtifacts.length > 0 ? (
                    <Stack spacing={1.5}>
                      {linkedArtifacts.map((artifact) => (
                        <ArtifactCard key={artifact.id} artifact={artifact} />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No artifacts linked yet. Add evidence to unlock achievement.
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedRung(null)}>Close</Button>
              <Button
                variant="contained"
                disabled={!canMarkAchieved(linkedArtifacts) || isSaving}
                onClick={handleMarkAchieved}
              >
                Mark Achieved
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Page>
  )
}
