import { useEffect, useMemo, useState } from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getDocs } from 'firebase/firestore'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { DEFAULT_FAMILY_ID } from '../../core/firebase/config'
import { daysCollection } from '../../core/firebase/firestore'
import type { DayLog, HoursEntry } from '../../core/types/domain'

const toHoursEntries = (dayLogs: DayLog[]): HoursEntry[] =>
  dayLogs.flatMap((log) =>
    log.blocks
      .map((block, index) => {
        const minutes = block.actualMinutes ?? block.plannedMinutes ?? 0
        if (minutes === 0 && !block.quickCapture) {
          return null
        }
        return {
          id: `${log.date}-${block.type}-${index}`,
          date: log.date,
          blockType: block.type,
          subjectBucket: block.subjectBucket,
          location: block.location,
          minutes,
          quickCapture: block.quickCapture ?? false,
          notes: block.notes,
        }
      })
      .filter((entry): entry is HoursEntry => entry !== null),
  )

export default function RecordsPage() {
  const familyId = DEFAULT_FAMILY_ID
  const [dayLogs, setDayLogs] = useState<DayLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadDayLogs = async () => {
      const snapshot = await getDocs(daysCollection(familyId))
      if (!isMounted) return
      const logs = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as DayLog),
      }))
      setDayLogs(logs)
      setIsLoading(false)
    }

    loadDayLogs()

    return () => {
      isMounted = false
    }
  }, [familyId])

  const hoursEntries = useMemo(() => toHoursEntries(dayLogs), [dayLogs])
  const totalMinutes = useMemo(
    () => hoursEntries.reduce((sum, entry) => sum + entry.minutes, 0),
    [hoursEntries],
  )
  const totalHours = (totalMinutes / 60).toFixed(1)

  return (
    <Page>
      <SectionCard title="Records">
        {isLoading ? (
          <Typography color="text.secondary">Loading records...</Typography>
        ) : (
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Total minutes: {totalMinutes}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                Total hours: {totalHours}
              </Typography>
            </Stack>
            {hoursEntries.length === 0 ? (
              <Typography color="text.secondary">
                No tracked blocks yet.
              </Typography>
            ) : (
              <List dense>
                {hoursEntries.map((entry) => (
                  <ListItem key={entry.id} disableGutters>
                    <Stack spacing={0.5}>
                      <Typography variant="subtitle2">
                        {entry.date} · {entry.blockType}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {entry.subjectBucket ?? 'Unassigned'} ·{' '}
                        {entry.location ?? 'Unknown location'} · {entry.minutes} min
                        {entry.quickCapture ? ' · Quick capture' : ''}
                      </Typography>
                      {entry.notes ? (
                        <Typography variant="body2" color="text.secondary">
                          {entry.notes}
                        </Typography>
                      ) : null}
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        )}
      </SectionCard>
    </Page>
  )
}
