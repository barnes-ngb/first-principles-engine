import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren, getCanonicalIdentity } from '../../core/hooks/useChildren'
import { updateChildSoftProfile } from '../../core/family/updateChildSoftProfile'
import { updateChildIdentity } from '../../core/family/updateChildIdentity'
import { computeAge } from '../../core/profile/childIdentity'

/** The three human-owned soft-profile fields stored on the `children` doc. */
const FIELDS = [
  {
    key: 'motivators',
    label: 'Motivators',
    placeholder: 'e.g. Minecraft, Lego, art',
  },
  {
    key: 'interests',
    label: 'Interests',
    placeholder: 'e.g. stories, dinosaurs, building',
  },
  {
    key: 'strengths',
    label: 'Strengths',
    placeholder: 'e.g. persistence, visual memory',
  },
] as const

type FieldKey = (typeof FIELDS)[number]['key']
interface Draft {
  birthdate: string
  grade: string
  motivators: string
  interests: string
  strengths: string
}

const emptyDraft = (): Draft => ({
  birthdate: '',
  grade: '',
  motivators: '',
  interests: '',
  strengths: '',
})

/**
 * Per-child editor for the child's identity (birthdate / grade — ARCH-15) and
 * the human-owned soft-profile fields (motivators / interests / strengths) on
 * `children/{childId}`. All are stable identity owned by `children` (FUNC-01)
 * and surfaced to AI prompts via the `childProfile` context slice so plans,
 * stories, and chat reflect each child.
 *
 * Identity (birthdate/grade) is DATA, never a gate: it feeds records/display
 * and seeds sensible defaults, but no feature is gated on age/grade/name.
 * Empty identity fields are pre-filled with the canonical default for a known
 * profile child so backfilling is one tap — the parent still confirms by
 * tapping Save (propose → confirm → write).
 */
export default function SoftProfileSection() {
  const familyId = useFamilyId()
  const { children, isLoading } = useChildren()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Seed drafts from the loaded children docs. For a known profile child whose
  // identity fields are still empty, pre-fill the canonical default (a
  // suggestion the parent confirms by saving — never an auto-write).
  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const child of children) {
      const canonical = getCanonicalIdentity(child.name)
      next[child.id] = {
        birthdate: child.birthdate ?? canonical?.birthdate ?? '',
        grade: child.grade ?? canonical?.grade ?? '',
        motivators: child.motivators ?? '',
        interests: child.interests ?? '',
        strengths: child.strengths ?? '',
      }
    }
    setDrafts(next)
  }, [children])

  const handleChange = useCallback(
    (childId: string, field: keyof Draft, value: string) => {
      setDrafts((prev) => ({
        ...prev,
        [childId]: { ...(prev[childId] ?? emptyDraft()), [field]: value },
      }))
    },
    [],
  )

  const handleSave = useCallback(
    async (childId: string) => {
      setError(null)
      setSavingId(childId)
      const draft = drafts[childId] ?? emptyDraft()
      try {
        await updateChildIdentity(familyId, childId, {
          birthdate: draft.birthdate.trim(),
          grade: draft.grade.trim(),
        })
        await updateChildSoftProfile(familyId, childId, {
          motivators: draft.motivators.trim(),
          interests: draft.interests.trim(),
          strengths: draft.strengths.trim(),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(`Failed to save: ${message}`)
      } finally {
        setSavingId(null)
      }
    },
    [drafts, familyId],
  )

  if (isLoading) return null

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Child Profile</Typography>
      <Typography variant="body2" color="text.secondary">
        Set each child's birthdate and grade (for records — these never lock any
        feature), and tell the app what motivates and interests them. This helps
        AI plans, stories, and chat feel personal. Keep it short.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {children.map((child) => {
        const draft = drafts[child.id] ?? emptyDraft()
        const age = computeAge(draft.birthdate)
        return (
          <Stack key={child.id} spacing={1.5}>
            <Typography variant="subtitle2">{child.name}</Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Birthdate"
                type="date"
                value={draft.birthdate}
                onChange={(e) => handleChange(child.id, 'birthdate', e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                helperText={age !== undefined ? `Age ${age}` : 'For records only'}
                inputProps={{ 'aria-label': `Birthdate for ${child.name}` }}
              />
              <TextField
                label="Grade"
                placeholder="e.g. 4th grade"
                value={draft.grade}
                onChange={(e) => handleChange(child.id, 'grade', e.target.value)}
                size="small"
                fullWidth
                inputProps={{ 'aria-label': `Grade for ${child.name}` }}
              />
            </Stack>
            {FIELDS.map(({ key, label, placeholder }) => (
              <TextField
                key={key}
                label={label}
                placeholder={placeholder}
                value={draft[key as FieldKey]}
                onChange={(e) => handleChange(child.id, key, e.target.value)}
                size="small"
                fullWidth
                inputProps={{
                  'aria-label': `${label} for ${child.name}`,
                }}
              />
            ))}
            <Button
              variant="outlined"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              disabled={savingId === child.id}
              onClick={() => void handleSave(child.id)}
            >
              {savingId === child.id ? 'Saving…' : `Save ${child.name}'s profile`}
            </Button>
          </Stack>
        )
      })}
    </Stack>
  )
}
