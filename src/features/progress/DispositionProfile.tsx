import { useCallback, useEffect, useState } from 'react'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore'

import ChildSelector from '../../components/ChildSelector'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { useAI, TaskType } from '../../core/ai/useAI'
import { db } from '../../core/firebase/firestore'
import type {
  DispositionCache,
  DispositionKey,
  DispositionNarrativeOverride,
  DispositionOverrides,
  DispositionResult,
} from '../../core/types/disposition'
import { effectiveDispositionText } from '../../core/types/disposition'

// ── Constants ─────────────────────────────────────────────────

const DISPOSITION_META: Array<{
  key: DispositionKey
  label: string
  icon: string
}> = [
  { key: 'curiosity', label: 'Curiosity', icon: '\uD83D\uDD0D' },
  { key: 'persistence', label: 'Persistence', icon: '\uD83D\uDCAA' },
  { key: 'articulation', label: 'Articulation', icon: '\uD83D\uDDE3\uFE0F' },
  { key: 'selfAwareness', label: 'Self-Awareness', icon: '\uD83E\uDE9E' },
  { key: 'ownership', label: 'Ownership', icon: '\u2728' },
]

const levelColor: Record<string, 'success' | 'primary' | 'warning' | 'default'> = {
  growing: 'success',
  steady: 'primary',
  emerging: 'warning',
  'not-yet-visible': 'default',
}

const trendDisplay: Record<string, { symbol: string; color: string }> = {
  up: { symbol: '\u2191', color: '#16a34a' },
  stable: { symbol: '\u2192', color: '#2563eb' },
  down: { symbol: '\u2193', color: '#d97706' },
  'insufficient-data': { symbol: '?', color: '#9ca3af' },
}

function formatCacheAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// ── Component ─────────────────────────────────────────────────

export default function DispositionProfile() {
  const familyId = useFamilyId()
  const {
    children,
    activeChildId,
    setActiveChildId,
    activeChild,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()
  const { chat, error: aiError } = useAI()

  const [result, setResult] = useState<DispositionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheAge, setCacheAge] = useState<string | null>(null)

  // Override state — loaded from Firestore `dispositionOverrides` field
  const [overrides, setOverrides] = useState<DispositionOverrides>({})

  // Per-disposition inline edit state
  const [editingKey, setEditingKey] = useState<DispositionKey | null>(null)
  const [editText, setEditText] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Track AI generatedAt so we can detect "newer AI available"
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null)

  // Load cached disposition + overrides on mount / child change
  useEffect(() => {
    if (!familyId || !activeChildId) return
    setOverrides({})
    setEditingKey(null)
    const childRef = doc(db, `families/${familyId}/children/${activeChildId}`)
    void getDoc(childRef).then((snap) => {
      const data = snap.data()
      const cached = data?.dispositionCache as DispositionCache | undefined
      if (cached?.generatedAt && cached.result) {
        const age = Date.now() - new Date(cached.generatedAt).getTime()
        const ONE_DAY = 24 * 60 * 60 * 1000
        if (age < ONE_DAY) {
          setResult(cached.result)
          setCacheAge(cached.generatedAt)
          setAiGeneratedAt(cached.generatedAt)
        }
      }
      // Load overrides (separate field, survives regeneration)
      const savedOverrides = data?.dispositionOverrides as DispositionOverrides | undefined
      if (savedOverrides) setOverrides(savedOverrides)
    })
  }, [familyId, activeChildId])

  const handleGenerate = useCallback(async (bypassCache?: boolean) => {
    if (!familyId || !activeChildId) return

    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const childRef = doc(db, `families/${familyId}/children/${activeChildId}`)
      const snap = await getDoc(childRef)
      const data = snap.data()
      const cached = data?.dispositionCache as DispositionCache | undefined
      if (cached?.generatedAt && cached.result) {
        const age = Date.now() - new Date(cached.generatedAt).getTime()
        const ONE_DAY = 24 * 60 * 60 * 1000
        if (age < ONE_DAY) {
          setResult(cached.result)
          setCacheAge(cached.generatedAt)
          setAiGeneratedAt(cached.generatedAt)
          // Also refresh overrides
          const savedOverrides = data?.dispositionOverrides as DispositionOverrides | undefined
          if (savedOverrides) setOverrides(savedOverrides)
          return
        }
      }
    }

    setLoading(true)
    setError(null)

    try {
      const response = await chat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Disposition,
        messages: [{ role: 'user', content: 'Generate the profile.' }],
      })

      if (!response?.message) {
        setError(aiError?.message ?? 'No response from AI. Please try again.')
        return
      }

      // Parse JSON from response
      const jsonMatch = response.message.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        setError('Could not parse AI response.')
        return
      }
      const parsed = JSON.parse(jsonMatch[0]) as DispositionResult
      setResult(parsed)

      // Cache the result to Firestore — only write dispositionCache,
      // NOT dispositionOverrides. Overrides persist independently.
      const now = new Date().toISOString()
      setCacheAge(now)
      setAiGeneratedAt(now)
      const childRef = doc(db, `families/${familyId}/children/${activeChildId}`)
      await updateDoc(childRef, {
        dispositionCache: {
          result: parsed,
          generatedAt: now,
        },
      })
    } catch (err) {
      console.error('Disposition generation failed:', err)
      setError('Failed to generate profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [familyId, activeChildId, chat, aiError?.message])

  // ── Override handlers ─────────────────────────────────────────

  const handleEditStart = (key: DispositionKey) => {
    if (!result) return
    const entry = result.dispositions[key]
    setEditingKey(key)
    // Pre-fill with current effective text
    setEditText(effectiveDispositionText(entry, overrides[key]))
    setEditNote('')
  }

  const handleEditCancel = () => {
    setEditingKey(null)
    setEditText('')
    setEditNote('')
  }

  const handleEditSave = useCallback(async () => {
    if (!editingKey || !familyId || !activeChildId || !editText.trim()) return
    setSaving(true)
    try {
      const override: DispositionNarrativeOverride = {
        text: editText.trim(),
        overriddenBy: 'parent',
        overriddenAt: new Date().toISOString(),
        ...(editNote.trim() ? { note: editNote.trim() } : {}),
      }
      const updated = { ...overrides, [editingKey]: override }
      const childRef = doc(db, `families/${familyId}/children/${activeChildId}`)
      await updateDoc(childRef, { dispositionOverrides: updated })
      setOverrides(updated)
      setEditingKey(null)
      setEditText('')
      setEditNote('')
    } catch (err) {
      console.error('[DispositionProfile] Failed to save override:', err)
    } finally {
      setSaving(false)
    }
  }, [editingKey, familyId, activeChildId, editText, editNote, overrides])

  const handleRevert = useCallback(async (key: DispositionKey) => {
    if (!familyId || !activeChildId) return
    setSaving(true)
    try {
      const updated = { ...overrides }
      delete updated[key]
      const childRef = doc(db, `families/${familyId}/children/${activeChildId}`)
      // If no overrides remain, remove the field entirely
      if (Object.keys(updated).length === 0) {
        await updateDoc(childRef, { dispositionOverrides: deleteField() })
      } else {
        await updateDoc(childRef, { dispositionOverrides: updated })
      }
      setOverrides(updated)
    } catch (err) {
      console.error('[DispositionProfile] Failed to revert override:', err)
    } finally {
      setSaving(false)
    }
  }, [familyId, activeChildId, overrides])

  /** Check if override is stale (AI regenerated after override was written). */
  const hasNewerAi = (override?: DispositionNarrativeOverride): boolean => {
    if (!override || !aiGeneratedAt) return false
    return new Date(aiGeneratedAt).getTime() > new Date(override.overriddenAt).getTime()
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <ChildSelector
        children={children}
        selectedChildId={activeChildId}
        onSelect={setActiveChildId}
        onChildAdded={addChild}
        isLoading={isLoadingChildren}
        emptyMessage="Add a child to view their learning profile."
      />

      {!result && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Generate a learning disposition profile from the last 4 weeks of day log data.
          </Typography>
          <Button
            variant="contained"
            onClick={() => handleGenerate()}
            disabled={!activeChildId}
            size="large"
          >
            Generate Learning Profile
          </Button>
        </Box>
      )}

      {loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">
            Analyzing 4 weeks of learning data...
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ my: 2 }} action={
          <Button color="inherit" size="small" onClick={() => handleGenerate(true)}>Retry</Button>
        }>
          {error}
        </Alert>
      )}

      {result && (
        <Stack spacing={2}>
          {/* Celebration */}
          <Card sx={{ bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {activeChild?.name}&apos;s Learning Profile
              </Typography>
              <Typography variant="body1">{result.celebration}</Typography>
            </CardContent>
          </Card>

          {/* Disposition cards */}
          {DISPOSITION_META.map(({ key, label, icon }) => {
            const d = result.dispositions[key]
            if (!d) return null
            const trend = trendDisplay[d.trend] ?? trendDisplay['insufficient-data']
            const override = overrides[key]
            const isEditing = editingKey === key
            const narrative = effectiveDispositionText(d, override)
            const newerAiAvailable = hasNewerAi(override)

            return (
              <Card key={key} variant="outlined">
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography variant="h6" component="span">{icon}</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                      {label}
                    </Typography>
                    <Chip
                      label={d.level}
                      size="small"
                      color={levelColor[d.level] ?? 'default'}
                    />
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 700, color: trend.color, minWidth: 24, textAlign: 'center' }}
                    >
                      {trend.symbol}
                    </Typography>
                  </Stack>

                  {isEditing ? (
                    /* ── Inline edit mode ──────────────────── */
                    <Stack spacing={1.5} sx={{ mt: 1 }}>
                      <TextField
                        multiline
                        minRows={3}
                        maxRows={8}
                        fullWidth
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        size="small"
                        placeholder="Edit the narrative..."
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                      />
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Reason for edit (optional)"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                      />
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => void handleEditSave()}
                          disabled={saving || !editText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={handleEditCancel}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    /* ── Display mode ─────────────────────── */
                    <>
                      <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                          {narrative}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => handleEditStart(key)}
                          disabled={saving}
                          sx={{ mt: -0.5, opacity: 0.6, '&:hover': { opacity: 1 } }}
                          aria-label={`Edit ${label} narrative`}
                        >
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>

                      {/* Override indicators */}
                      {override && (
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontStyle: 'italic' }}
                            >
                              Edited by Shelly
                              {override.note && <> &mdash; &ldquo;{override.note}&rdquo;</>}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => void handleRevert(key)}
                              disabled={saving}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.75rem',
                                p: 0,
                                minWidth: 0,
                                color: 'text.secondary',
                              }}
                            >
                              Revert to AI narrative
                            </Button>
                          </Stack>

                          {/* "Newer AI available" notice */}
                          {newerAiAvailable && (
                            <Alert
                              severity="info"
                              variant="outlined"
                              sx={{
                                py: 0,
                                px: 1,
                                fontSize: '0.75rem',
                                '& .MuiAlert-message': { py: 0.5 },
                              }}
                              action={
                                <Button
                                  size="small"
                                  color="info"
                                  onClick={() => handleEditStart(key)}
                                  sx={{ textTransform: 'none', fontSize: '0.7rem' }}
                                >
                                  View & edit
                                </Button>
                              }
                            >
                              AI has a new take &mdash; the original AI narrative has been
                              updated since your edit.
                            </Alert>
                          )}
                        </Stack>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Nudge */}
          <Card sx={{ bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Gentle Nudge</Typography>
              <Typography variant="body2">{result.nudge}</Typography>
            </CardContent>
          </Card>

          {/* Parent note */}
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', px: 1 }}>
            {result.parentNote}
          </Typography>

          {/* Cache age indicator + Refresh */}
          <Box sx={{ textAlign: 'center', pt: 1 }}>
            {cacheAge && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Generated {formatCacheAge(cacheAge)} ago · Tap Refresh for latest
              </Typography>
            )}
            <Button variant="outlined" onClick={() => handleGenerate(true)} disabled={loading}>
              Refresh Profile
            </Button>
          </Box>
        </Stack>
      )}
    </Box>
  )
}
