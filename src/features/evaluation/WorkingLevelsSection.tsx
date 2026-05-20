import { useCallback, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { skillSnapshotsCollection } from '../../core/firebase/firestore'
import type { WorkingLevel, WorkingLevels } from '../../core/types/evaluation'
import { QUEST_MODE_LEVEL_CAP } from '../quest/questTypes'

type ModeKey = 'phonics' | 'comprehension' | 'math'

interface ModeConfig {
  key: ModeKey
  label: string
  icon: string
  cap: number
}

const MODES: ModeConfig[] = [
  { key: 'phonics', label: 'Phonics', icon: '\u26CF\uFE0F', cap: QUEST_MODE_LEVEL_CAP.phonics ?? 8 },
  { key: 'comprehension', label: 'Comprehension', icon: '\uD83E\uDDE0', cap: QUEST_MODE_LEVEL_CAP.comprehension ?? 6 },
  { key: 'math', label: 'Math', icon: '\u2795', cap: QUEST_MODE_LEVEL_CAP.math ?? 6 },
]

const SOURCE_LABEL: Record<WorkingLevel['source'], string> = {
  quest: 'quest',
  evaluation: 'evaluation',
  curriculum: 'curriculum',
  manual: 'manual',
}

const SOURCE_COLOR: Record<WorkingLevel['source'], 'primary' | 'success' | 'info' | 'warning'> = {
  quest: 'primary',
  evaluation: 'success',
  curriculum: 'info',
  manual: 'warning',
}

const NOTE_SUGGESTIONS = [
  "He's further along than this",
  "He's struggling at this level",
  'Starting fresh',
]

const DEFAULT_FALLBACK_LEVEL = 2

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) {
    const hours = Math.floor(ms / 3_600_000)
    if (hours < 1) return 'just now'
    return `${hours}h ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface WorkingLevelsSectionProps {
  childId: string | null
  workingLevels: WorkingLevels | undefined
  onSaved?: (message: string) => void
  onError?: (message: string) => void
}

export default function WorkingLevelsSection({
  childId,
  workingLevels,
  onSaved,
  onError,
}: WorkingLevelsSectionProps) {
  const familyId = useFamilyId()
  const [editingMode, setEditingMode] = useState<ModeKey | null>(null)
  const [editLevel, setEditLevel] = useState<number>(DEFAULT_FALLBACK_LEVEL)
  const [editNote, setEditNote] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const snapshotRef = childId ? doc(skillSnapshotsCollection(familyId), childId) : null

  const startEdit = useCallback(
    (mode: ModeConfig) => {
      const current = workingLevels?.[mode.key]
      setEditingMode(mode.key)
      setEditLevel(current?.level ?? DEFAULT_FALLBACK_LEVEL)
      setEditNote('')
    },
    [workingLevels],
  )

  const cancelEdit = useCallback(() => {
    setEditingMode(null)
    setEditNote('')
  }, [])

  const handleSave = useCallback(
    async (mode: ModeConfig) => {
      if (!snapshotRef || !childId) return
      const clamped = Math.max(1, Math.min(editLevel, mode.cap))
      const evidence = editNote.trim() || `Parent set to Level ${clamped}`
      const next: WorkingLevel = {
        level: clamped,
        updatedAt: new Date().toISOString(),
        source: 'manual',
        evidence,
      }
      setSaving(true)
      try {
        await setDoc(
          snapshotRef,
          {
            childId,
            workingLevels: { [mode.key]: next },
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        )
        setEditingMode(null)
        setEditNote('')
        onSaved?.(`Level updated. Next ${mode.label.toLowerCase()} quest will start at Level ${clamped}.`)
      } catch (err) {
        console.error('[WorkingLevelsSection] save failed', err)
        onError?.('Failed to update level.')
      } finally {
        setSaving(false)
      }
    },
    [snapshotRef, editLevel, editNote, childId, onSaved, onError],
  )

  const handleRevert = useCallback(
    async (mode: ModeConfig) => {
      if (!snapshotRef) return
      setSaving(true)
      try {
        await updateDoc(snapshotRef, {
          [`workingLevels.${mode.key}`]: deleteField(),
          updatedAt: new Date().toISOString(),
        })
        onSaved?.(`${mode.label} level cleared. System will re-derive it from the next quest or evaluation.`)
      } catch (err) {
        console.error('[WorkingLevelsSection] revert failed', err)
        onError?.('Failed to revert level.')
      } finally {
        setSaving(false)
      }
    },
    [snapshotRef, onSaved, onError],
  )

  return (
    <SectionCard title="Working Levels">
      <Typography variant="body2" color="text.secondary">
        Where each Knowledge Mine quest starts. Updated automatically after quests, evaluations, and
        curriculum scans — or adjust manually below.
      </Typography>

      <Stack spacing={1.5}>
        {MODES.map((mode) => {
          const current = workingLevels?.[mode.key]
          const isEditing = editingMode === mode.key
          return (
            <Box
              key={mode.key}
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Typography sx={{ fontSize: '1.5rem' }} aria-hidden>
                  {mode.icon}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <Typography variant="subtitle1" component="div">
                    {mode.label}
                  </Typography>
                  {current ? (
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                        Level {current.level}
                      </Typography>
                      <Chip
                        label={SOURCE_LABEL[current.source]}
                        size="small"
                        color={SOURCE_COLOR[current.source]}
                        variant="outlined"
                      />
                      <Typography variant="caption" color="text.secondary">
                        {formatRelative(current.updatedAt)}
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Not set &mdash; will default to Level {DEFAULT_FALLBACK_LEVEL}
                    </Typography>
                  )}
                </Box>
                {!isEditing && (
                  <Button size="small" variant="outlined" onClick={() => startEdit(mode)}>
                    {current ? 'Adjust' : 'Set level'}
                  </Button>
                )}
              </Stack>

              {current?.evidence && !isEditing && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.75, fontStyle: 'italic' }}
                >
                  {current.evidence}
                </Typography>
              )}

              {current?.source === 'manual' && !isEditing && (
                <Box sx={{ mt: 0.75 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => handleRevert(mode)}
                    disabled={saving}
                    sx={{ textTransform: 'none', px: 0, minWidth: 0 }}
                  >
                    Revert to last auto level
                  </Button>
                </Box>
              )}

              {isEditing && (
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton
                      size="small"
                      onClick={() => setEditLevel((l) => Math.max(1, l - 1))}
                      disabled={editLevel <= 1 || saving}
                      aria-label="decrease level"
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="h5"
                      component="div"
                      sx={{ minWidth: 80, textAlign: 'center', fontWeight: 600 }}
                    >
                      Level {editLevel}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setEditLevel((l) => Math.min(mode.cap, l + 1))}
                      disabled={editLevel >= mode.cap || saving}
                      aria-label="increase level"
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                    {editLevel >= mode.cap && (
                      <Typography variant="caption" color="text.secondary">
                        Maximum level
                      </Typography>
                    )}
                    {editLevel <= 1 && (
                      <Typography variant="caption" color="text.secondary">
                        Minimum level
                      </Typography>
                    )}
                  </Stack>
                  <TextField
                    label="Why are you adjusting? (optional)"
                    size="small"
                    fullWidth
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    helperText={`Range: 1 to ${mode.cap}`}
                  />
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {NOTE_SUGGESTIONS.map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        size="small"
                        variant="outlined"
                        onClick={() => setEditNote(s)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleSave(mode)}
                      disabled={saving}
                    >
                      Save
                    </Button>
                    <Button size="small" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Box>
          )
        })}
      </Stack>

      {!childId && (
        <Alert severity="info" variant="outlined">
          Select a child to view working levels.
        </Alert>
      )}
    </SectionCard>
  )
}
