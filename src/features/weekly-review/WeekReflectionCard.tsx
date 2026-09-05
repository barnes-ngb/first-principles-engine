import { useCallback, useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { WeeklyReview } from '../../core/types'
import type { WeekReflectionAnswer } from '../../core/types/enums'
import {
  REFLECTION_CHOICES,
  REFLECTION_NOTE_MAX,
  WEEK_QUESTION,
  buildWeekReflection,
  normalizeWeekReflection,
  pastReflections,
} from './weekReflection'
import { writeWeekReflection } from './writeWeekReflection'

export interface WeekReflectionCardProps {
  familyId: string
  childId: string
  weekKey: string
  review: WeeklyReview
  history: WeeklyReview[]
  onSaved: (snack: { text: string; severity: 'success' | 'error' }) => void
}

/**
 * The week's one question, answered by a person (UX-214).
 *
 * Three taps and an optional line, and then the app remembers. It is **not**
 * computed, not scored, not AI-generated and not pre-answered — nothing selects
 * a choice on the parent's behalf, because a machine-generated verdict on
 * whether a week was enough would be the quota again, wearing a sentence.
 *
 * The answer goes nowhere else: it does not reach planning, does not gate
 * anything, and cannot change a plan, an hours figure or the position snapshot.
 * Its whole job is to be visible again — three *"we can do more"* in a row, in
 * the parent's own words, is the urgency, and it comes from their judgement
 * rather than a threshold the app invented.
 *
 * Parent-only by capability, above the write path, for the same reason
 * `WeekPaceSection` is: a child must never be asked to grade the week.
 */
export default function WeekReflectionCard(props: WeekReflectionCardProps) {
  const { isChildProfile } = useActiveChild()
  if (isChildProfile) return null
  return <WeekReflectionBody {...props} />
}

function WeekReflectionBody({
  familyId,
  childId,
  weekKey,
  review,
  history,
  onSaved,
}: WeekReflectionCardProps) {
  const saved = useMemo(
    () => normalizeWeekReflection(review.reflection),
    [review.reflection],
  )
  const [answer, setAnswer] = useState<WeekReflectionAnswer | null>(
    saved?.answer ?? null,
  )
  const [note, setNote] = useState(saved?.note ?? '')
  const [isSaving, setIsSaving] = useState(false)

  // Re-seed when the stored answer changes underneath (child switch, snapshot).
  const [seededFor, setSeededFor] = useState(review.id ?? weekKey)
  const currentKey = review.id ?? weekKey
  if (seededFor !== currentKey) {
    setSeededFor(currentKey)
    setAnswer(saved?.answer ?? null)
    setNote(saved?.note ?? '')
  }

  const earlier = useMemo(() => pastReflections(history), [history])

  const handleSave = useCallback(async () => {
    if (!answer) return
    setIsSaving(true)
    try {
      await writeWeekReflection(
        familyId,
        childId,
        weekKey,
        buildWeekReflection(answer, note, new Date()),
      )
      onSaved({ text: 'Answer saved.', severity: 'success' })
    } catch (err) {
      console.error('[UX-214] Failed to save week reflection', err)
      onSaved({ text: 'Failed to save. Try again.', severity: 'error' })
    }
    setIsSaving(false)
  }, [answer, note, familyId, childId, weekKey, onSaved])

  const isUnchanged =
    saved !== null &&
    saved.answer === answer &&
    (saved.note ?? '') === note.trim()

  return (
    <SectionCard title={WEEK_QUESTION}>
      <Typography variant="body2" color="text.secondary">
        Your read on the week. Nothing is calculated from this — it is just kept,
        so you can see what you have been saying.
      </Typography>

      <ToggleButtonGroup
        exclusive
        value={answer}
        onChange={(_e, next: WeekReflectionAnswer | null) => {
          if (next !== null) setAnswer(next)
        }}
        aria-label={WEEK_QUESTION}
        sx={{ flexWrap: 'wrap' }}
      >
        {REFLECTION_CHOICES.map((choice) => (
          <ToggleButton key={choice.answer} value={choice.answer}>
            {choice.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <TextField
        label="Anything worth remembering (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, REFLECTION_NOTE_MAX))}
        multiline
        minRows={2}
        fullWidth
        size="small"
      />

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!answer || isSaving || isUnchanged}
        >
          {isSaving ? 'Saving…' : 'Save answer'}
        </Button>
        {saved && (
          <Typography variant="caption" color="text.secondary">
            Answered {saved.answeredAt.slice(0, 10)}
          </Typography>
        )}
      </Stack>

      {earlier.length > 0 && (
        <>
          <Divider />
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Earlier weeks</Typography>
            {earlier.map((entry) => (
              <Typography key={entry.weekKey} variant="body2">
                {entry.weekLabel} — {entry.label}
                {entry.note ? `: ${entry.note}` : ''}
              </Typography>
            ))}
          </Stack>
        </>
      )}
    </SectionCard>
  )
}
