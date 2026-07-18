import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useChildren } from '../../core/hooks/useChildren'
import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import { extractYouTubeId } from '../../core/utils/youtubeId'
import type { NewWatchVideo } from './useWatchLibrary'

/**
 * Subjects a curated watch video plausibly carries, most-likely first. History
 * folds into SocialStudies (the owner's primary use case), so it leads and is
 * the default. Any bucket is selectable — the vehicle serves any subject.
 */
const SUBJECT_ORDER: SubjectBucket[] = [
  SubjectBucket.SocialStudies,
  SubjectBucket.Science,
  SubjectBucket.Art,
  SubjectBucket.Music,
  SubjectBucket.Reading,
  SubjectBucket.LanguageArts,
  SubjectBucket.Math,
  SubjectBucket.PracticalArts,
  SubjectBucket.PE,
  SubjectBucket.Other,
]

const DEFAULT_MINUTES = 12

interface WatchVetInFormProps {
  onSave: (video: NewWatchVideo) => Promise<void>
}

/**
 * Parent vet-in form (FEAT-100 slice 1, design §9/1). Curation is a parent job.
 * Flow: paste a YouTube URL or id → the extracted id is shown as confirmation
 * (the library never stores an unvalidated string, §4) → parent authors the
 * kid-facing title (D4) → planned minutes (typed, no API fetch — §10/D5) →
 * subject (SocialStudies default) → scope (this child / both, D7) → optional
 * "why". Save writes one `WatchVideo`. No player, no planning — later slices.
 */
export default function WatchVetInForm({ onSave }: WatchVetInFormProps) {
  const { children } = useChildren()
  const [urlOrId, setUrlOrId] = useState('')
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES))
  const [subjectBucket, setSubjectBucket] = useState<SubjectBucket>(SubjectBucket.SocialStudies)
  const [scope, setScope] = useState<string | 'both'>('both')
  const [why, setWhy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live-extracted id: the single source of truth for "is this a real, storable
  // video". `null` while the paste doesn't resolve to a valid 11-char id.
  const youtubeId = useMemo(() => extractYouTubeId(urlOrId), [urlOrId])
  const pasteTouched = urlOrId.trim() !== ''
  const minutesNum = Number(minutes)
  // Require a positive integer. A fractional value (e.g. 0.1) would otherwise
  // pass a `> 0` check yet round to 0 on save — and plannedMinutes flows into
  // the checklist/hours path in later slices, so a 0 must never be storable.
  const minutesValid = Number.isInteger(minutesNum) && minutesNum >= 1

  const canSave =
    youtubeId != null && title.trim() !== '' && minutesValid && !saving

  const handleSave = async () => {
    if (!canSave || !youtubeId) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        youtubeId,
        title: title.trim(),
        plannedMinutes: Math.round(minutesNum),
        subjectBucket,
        childId: scope,
        addedBy: 'parent',
        ...(why.trim() !== '' ? { why: why.trim() } : {}),
      })
      // Reset for the next vet-in.
      setUrlOrId('')
      setTitle('')
      setMinutes(String(DEFAULT_MINUTES))
      setSubjectBucket(SubjectBucket.SocialStudies)
      setScope('both')
      setWhy('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the video.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Vet a video in</Typography>

      <TextField
        label="YouTube link or video id"
        value={urlOrId}
        onChange={(e) => setUrlOrId(e.target.value)}
        placeholder="Paste a youtube.com / youtu.be link"
        fullWidth
        required
        error={pasteTouched && youtubeId == null}
        helperText={
          pasteTouched && youtubeId == null
            ? "That's not a valid YouTube link or id."
            : youtubeId != null
              ? `Video id: ${youtubeId}`
              : 'Only vetted YouTube videos can be added.'
        }
      />

      <TextField
        label="Title (your words)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. How people first made cities"
        helperText="The kid-facing title — say it your way, not YouTube's."
        fullWidth
        required
      />

      <TextField
        label="Planned minutes"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        type="number"
        inputMode="numeric"
        error={minutes.trim() !== '' && !minutesValid}
        slotProps={{
          input: { endAdornment: <InputAdornment position="end">min</InputAdornment> },
          htmlInput: { min: 1, step: 1 },
        }}
        sx={{ maxWidth: 200 }}
      />

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Subject
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {SUBJECT_ORDER.map((s) => (
            <Chip
              key={s}
              label={SubjectBucketLabel[s]}
              color={s === subjectBucket ? 'primary' : 'default'}
              variant={s === subjectBucket ? 'filled' : 'outlined'}
              onClick={() => setSubjectBucket(s)}
            />
          ))}
        </Box>
      </Box>

      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Who is it for?
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {children.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={scope === c.id ? 'primary' : 'default'}
              variant={scope === c.id ? 'filled' : 'outlined'}
              onClick={() => setScope(c.id)}
            />
          ))}
          <Chip
            label="Both"
            color={scope === 'both' ? 'primary' : 'default'}
            variant={scope === 'both' ? 'filled' : 'outlined'}
            onClick={() => setScope('both')}
          />
        </Box>
      </Box>

      <TextField
        label="Why we're watching (optional)"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="One line of framing (optional)"
        multiline
        minRows={2}
        fullWidth
      />

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Box>
        <Button variant="contained" disabled={!canSave} onClick={handleSave}>
          {saving ? 'Saving…' : 'Add to library'}
        </Button>
      </Box>
    </Stack>
  )
}
