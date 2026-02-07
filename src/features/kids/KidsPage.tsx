import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { deleteField, doc, getDocs, setDoc } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import {
  childrenCollection,
  laddersCollection,
  milestoneProgressCollection,
} from '../../core/firebase/firestore'
import type { Child, Ladder, MilestoneProgress, Rung } from '../../core/types/domain'

type MilestoneStatus = MilestoneProgress['status']

const milestoneStatusOrder: MilestoneStatus[] = [
  'locked',
  'active',
  'achieved',
]

const milestoneProgressId = (childId: string, ladderId: string, rungId: string) =>
  `${childId}-${ladderId}-${rungId}`

const getLadderId = (ladder: Ladder, index: number) =>
  ladder.id ?? `ladder-${index + 1}`

const getRungId = (rung: Rung, index: number) => rung.id ?? `rung-${index + 1}`

const nextMilestoneStatus = (current: MilestoneStatus | undefined) => {
  if (!current) {
    return 'active'
  }
  const currentIndex = milestoneStatusOrder.indexOf(current)
  const nextIndex =
    currentIndex >= 0 && currentIndex < milestoneStatusOrder.length - 1
      ? currentIndex + 1
      : 0
  return milestoneStatusOrder[nextIndex]
}

export default function KidsPage() {
  const familyId = DEFAULT_FAMILY_ID
  const [children, setChildren] = useState<Child[]>([])
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [progressEntries, setProgressEntries] = useState<MilestoneProgress[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      setIsLoading(true)
      const [childrenSnapshot, laddersSnapshot, progressSnapshot] =
        await Promise.all([
          getDocs(childrenCollection(familyId)),
          getDocs(laddersCollection(familyId)),
          getDocs(milestoneProgressCollection(familyId)),
        ])

      if (!isMounted) return

      setChildren(
        childrenSnapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Child),
        })),
      )
      setLadders(
        laddersSnapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Ladder),
        })),
      )
      setProgressEntries(
        progressSnapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as MilestoneProgress),
        })),
      )
      setIsLoading(false)
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [familyId])

  const progressByKey = useMemo(() => {
    return new Map(
      progressEntries
        .filter((entry) => entry.childId && entry.ladderId && entry.rungId)
        .map((entry) => [
          milestoneProgressId(entry.childId, entry.ladderId, entry.rungId),
          entry,
        ]),
    )
  }, [progressEntries])

  const handleAdvanceStatus = useCallback(
    async ({
      childId,
      ladderId,
      rungId,
      label,
      currentStatus,
    }: {
      childId: string
      ladderId: string
      rungId: string
      label: string
      currentStatus: MilestoneStatus | undefined
    }) => {
      const nextStatus = nextMilestoneStatus(currentStatus)
      const progressId = milestoneProgressId(childId, ladderId, rungId)
      const achievedAt =
        nextStatus === 'achieved' ? new Date().toISOString() : undefined
      const payload: MilestoneProgress = {
        id: progressId,
        childId,
        ladderId,
        rungId,
        label,
        status: nextStatus,
        achievedAt,
      }

      await setDoc(
        doc(milestoneProgressCollection(familyId), progressId),
        {
          ...payload,
          achievedAt: achievedAt ?? deleteField(),
        },
        { merge: true },
      )

      setProgressEntries((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.id === progressId)
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], ...payload }
          return updated
        }
        return [...prev, payload]
      })
    },
    [familyId],
  )

  return (
    <Page>
      <SectionCard title="Milestone Progress">
        <Typography color="text.secondary" gutterBottom>
          Track ladder milestones per child and rung. Tap a milestone to advance
          its status.
        </Typography>
        {isLoading ? (
          <Typography color="text.secondary">Loading milestones...</Typography>
        ) : (
          <Stack spacing={3}>
            {children.map((child) => (
              <Stack key={child.id} spacing={2}>
                <Typography variant="h6">{child.name}</Typography>
                <Stack spacing={2}>
                  {ladders.map((ladder, ladderIndex) => {
                    const ladderId = getLadderId(ladder, ladderIndex)
                    return (
                      <Stack key={ladderId} spacing={1}>
                        <Typography variant="subtitle1">
                          {ladder.title}
                        </Typography>
                        <Stack spacing={1} sx={{ pl: 2 }}>
                          {ladder.rungs.map((rung, rungIndex) => {
                            const rungId = getRungId(rung, rungIndex)
                            const progressKey = milestoneProgressId(
                              child.id,
                              ladderId,
                              rungId,
                            )
                            const progress = progressByKey.get(progressKey)
                            const status = progress?.status
                            return (
                              <Stack
                                key={rungId}
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={1}
                                alignItems={{ sm: 'center' }}
                              >
                                <Typography sx={{ flex: 1 }}>
                                  {rung.title}
                                </Typography>
                                <Typography
                                  color="text.secondary"
                                  sx={{ minWidth: 120 }}
                                >
                                  {status ?? 'active'}
                                </Typography>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() =>
                                    handleAdvanceStatus({
                                      childId: child.id,
                                      ladderId,
                                      rungId,
                                      label: rung.title,
                                      currentStatus: status,
                                    })
                                  }
                                >
                                  Advance
                                </Button>
                              </Stack>
                            )
                          })}
                        </Stack>
                        <Divider />
                      </Stack>
                    )
                  })}
                </Stack>
              </Stack>
            ))}
            {children.length === 0 && (
              <Typography color="text.secondary">
                Add a child to begin tracking ladder milestones.
              </Typography>
            )}
          </Stack>
        )}
      </SectionCard>
    </Page>
  )
}
