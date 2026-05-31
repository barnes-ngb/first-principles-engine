import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import { updateChildSoftProfile } from '../../core/family/updateChildSoftProfile'

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
type Draft = Record<FieldKey, string>

const emptyDraft = (): Draft => ({ motivators: '', interests: '', strengths: '' })

/**
 * Per-child editor for the soft-profile fields (motivators / interests /
 * strengths) on `children/{childId}`. These are human-owned stable identity
 * (FUNC-01) and are surfaced to AI prompts via the `childProfile` context
 * slice so plans, stories, and chat reflect what motivates each child.
 * Kept deliberately small — plain text inputs, one save per child.
 * See docs/barnes-shelly-chat-portal-design.md §3.
 */
export default function SoftProfileSection() {
  const familyId = useFamilyId()
  const { children, isLoading } = useChildren()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Seed drafts from the loaded children docs.
  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const child of children) {
      next[child.id] = {
        motivators: child.motivators ?? '',
        interests: child.interests ?? '',
        strengths: child.strengths ?? '',
      }
    }
    setDrafts(next)
  }, [children])

  const handleChange = useCallback(
    (childId: string, field: FieldKey, value: string) => {
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
        Tell the app what motivates and interests each child. This helps AI
        plans, stories, and chat feel personal. Plain text — keep it short.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {children.map((child) => {
        const draft = drafts[child.id] ?? emptyDraft()
        return (
          <Stack key={child.id} spacing={1.5}>
            <Typography variant="subtitle2">{child.name}</Typography>
            {FIELDS.map(({ key, label, placeholder }) => (
              <TextField
                key={key}
                label={label}
                placeholder={placeholder}
                value={draft[key]}
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
