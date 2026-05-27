import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { doc, updateDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import { childrenCollection } from '../../core/firebase/firestore'

/**
 * Per-child toggle for the Whisper-backed voice input module.
 * See docs/DESIGN_VOICE_INPUT_MODULE.md §5.3.
 */
export default function VoiceInputSection() {
  const familyId = useFamilyId()
  const { children, isLoading } = useChildren()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Optimistic local override so the toggle reflects immediately. */
  const [override, setOverride] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOverride({})
  }, [children])

  const handleToggle = useCallback(
    async (childId: string, checked: boolean) => {
      setError(null)
      setSavingId(childId)
      setOverride((prev) => ({ ...prev, [childId]: checked }))
      try {
        const ref = doc(childrenCollection(familyId), childId)
        await updateDoc(ref, { voiceInputEnhanced: checked })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(`Failed to save: ${message}`)
        setOverride((prev) => {
          const next = { ...prev }
          delete next[childId]
          return next
        })
      } finally {
        setSavingId(null)
      }
    },
    [familyId],
  )

  if (isLoading) return null

  return (
    <Stack spacing={1.5}>
      <Typography variant="h6">Voice Input</Typography>
      <Typography variant="body2" color="text.secondary">
        Enhanced speech recognition uses AI to better understand a child's
        speech. Recommended for kids with speech challenges. Slightly slower
        but much more accurate. Uses small AI credits per use.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {children.map((child) => {
        const value = override[child.id] ?? child.voiceInputEnhanced === true
        return (
          <FormControlLabel
            key={child.id}
            control={
              <Switch
                checked={value}
                disabled={savingId === child.id}
                onChange={(_, checked) => void handleToggle(child.id, checked)}
                inputProps={{
                  'aria-label': `Enhanced speech recognition for ${child.name}`,
                }}
              />
            }
            label={`Enhanced speech recognition for ${child.name}`}
            slotProps={{ typography: { variant: 'body2' } }}
          />
        )
      })}
    </Stack>
  )
}
