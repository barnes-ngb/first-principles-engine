import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import type { DayLog } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

interface TeachBackSectionProps {
  dayLog: DayLog
  selectedChild: { name: string }
  familyId: string
  selectedChildId: string
  today: string
  persistDayLogImmediate: (updated: DayLog) => void
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
}

export default function TeachBackSection({
  dayLog,
  selectedChild,
  familyId,
  selectedChildId,
  today,
  persistDayLogImmediate,
  onSnackMessage,
}: TeachBackSectionProps) {
  const [teachBackText, setTeachBackText] = useState('')
  const [teachBackSaved, setTeachBackSaved] = useState(false)

  // Sync teachBackSaved from dayLog on load
  useEffect(() => {
    if (dayLog?.teachBackDone) setTeachBackSaved(true)
    else setTeachBackSaved(false)
  }, [dayLog?.teachBackDone])

  const isLincolnChild = selectedChild?.name?.toLowerCase() === 'lincoln'
  const checklist = dayLog?.checklist ?? []
  const rawItems = dayLog?.checklist ?? []
  const essentialItems = rawItems.filter((i) => i.category === 'must-do' || i.mvdEssential)
  const mustDoItems = essentialItems.length > 0
    ? essentialItems
    : rawItems.slice(0, 3)
  const mustDoCompleted = mustDoItems.filter((i) => i.completed).length
  const totalCompleted = checklist.filter((i) => i.completed).length
  const halfMustDoDone = mustDoItems.length > 0 && mustDoCompleted >= Math.ceil(mustDoItems.length / 2)
  const enoughDone = totalCompleted >= 3 || halfMustDoDone
  console.log('[TeachBack] guard:', { childName: selectedChild?.name, isLincolnChild, checklistLen: checklist.length, totalCompleted, mustDoCompleted, halfMustDoDone, enoughDone, teachBackDone: dayLog?.teachBackDone, teachBackSaved })
  if (!isLincolnChild || checklist.length === 0 || !enoughDone || teachBackSaved) return null

  return (
    <SectionCard title="Teach London">
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          Tell London one thing you learned today!
        </Typography>
        <TextField
          multiline
          rows={2}
          placeholder="What did you explain to London?"
          value={teachBackText}
          onChange={(e) => setTeachBackText(e.target.value)}
          size="small"
        />
        <Button
          variant="contained"
          size="small"
          disabled={!teachBackText.trim()}
          onClick={async () => {
            try {
              await addDoc(artifactsCollection(familyId), {
                childId: selectedChildId,
                title: `Teach-back ${today}`,
                type: EvidenceType.Note,
                tags: { engineStage: EngineStage.Explain, subjectBucket: SubjectBucket.Other, domain: 'speech', location: LearningLocation.Home },
                content: `Teach-back: ${teachBackText.trim()}`,
                createdAt: new Date().toISOString(),
              })
              persistDayLogImmediate({ ...dayLog, teachBackDone: true })
              setTeachBackSaved(true)
              onSnackMessage({ text: 'Lincoln explained something to London!', severity: 'success' })
            } catch (err) {
              console.error('Teach-back save failed:', err)
              onSnackMessage({ text: 'Failed to save. Try again.', severity: 'error' })
            }
          }}
          sx={{ alignSelf: 'flex-start' }}
        >
          Save
        </Button>
      </Stack>
    </SectionCard>
  )
}
