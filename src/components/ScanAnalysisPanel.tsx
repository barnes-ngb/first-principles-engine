import { useCallback, useState } from 'react'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { doc, updateDoc } from 'firebase/firestore'

import { useFamilyId } from '../core/auth/useAuth'
import { scansCollection } from '../core/firebase/firestore'
import type { Recommendation, ScanRecord } from '../core/types'
import { effectiveRecommendation, isWorksheetScan } from '../core/types/planning'

const RECOMMENDATION_LABEL: Record<string, string> = {
  'do': 'DO',
  'skip': 'SKIP',
  'quick-review': 'QUICK REVIEW',
  'modify': 'MODIFY',
}

const RECOMMENDATION_COLOR: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
  'do': 'error',
  'skip': 'success',
  'quick-review': 'warning',
  'modify': 'warning',
}

interface ScanAnalysisPanelProps {
  scan: ScanRecord
  /** Start expanded (default: collapsed). */
  defaultExpanded?: boolean
  /** Called after a parent override is saved, with the updated scan. */
  onOverrideSaved?: (updated: ScanRecord) => void
}

export default function ScanAnalysisPanel({
  scan,
  defaultExpanded = false,
  onOverrideSaved,
}: ScanAnalysisPanelProps) {
  const familyId = useFamilyId()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [overrideAnchor, setOverrideAnchor] = useState<null | HTMLElement>(null)
  const [overrideNote, setOverrideNote] = useState('')
  const [showNoteField, setShowNoteField] = useState(false)
  const [pendingOverride, setPendingOverride] = useState<Recommendation | null>(null)
  const [localOverride, setLocalOverride] = useState(scan.parentOverride ?? null)
  const [saving, setSaving] = useState(false)

  const handleOverrideSave = useCallback(async () => {
    if (!pendingOverride || !scan.id || !familyId) return
    setSaving(true)
    try {
      const override = {
        recommendation: pendingOverride,
        overriddenBy: 'parent',
        overriddenAt: new Date().toISOString(),
        ...(overrideNote.trim() ? { note: overrideNote.trim() } : {}),
      }
      await updateDoc(doc(scansCollection(familyId), scan.id), { parentOverride: override })
      setLocalOverride(override)
      setShowNoteField(false)
      setPendingOverride(null)
      setOverrideNote('')
      onOverrideSaved?.({ ...scan, parentOverride: override })
    } catch (err) {
      console.error('[ScanAnalysisPanel] Failed to save override:', err)
    } finally {
      setSaving(false)
    }
  }, [pendingOverride, scan, familyId, overrideNote, onOverrideSaved])

  const handleRevert = useCallback(async () => {
    if (!scan.id || !familyId) return
    setSaving(true)
    try {
      const { deleteField } = await import('firebase/firestore')
      await updateDoc(doc(scansCollection(familyId), scan.id), { parentOverride: deleteField() })
      setLocalOverride(null)
      onOverrideSaved?.({ ...scan, parentOverride: undefined })
    } catch (err) {
      console.error('[ScanAnalysisPanel] Failed to revert override:', err)
    } finally {
      setSaving(false)
    }
  }, [scan, familyId, onOverrideSaved])

  // Early return after all hooks
  if (!scan.results || !isWorksheetScan(scan.results)) return null
  const r = scan.results
  const rec = localOverride?.recommendation ?? effectiveRecommendation(scan) ?? r.recommendation
  const topicTitle = r.specificTopic || r.subject

  const handleOverrideSelect = (recommendation: Recommendation) => {
    setPendingOverride(recommendation)
    setOverrideAnchor(null)
    setShowNoteField(true)
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      {/* Collapsed row */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        onClick={() => setExpanded(!expanded)}
        sx={{ cursor: 'pointer', py: 0.5 }}
      >
        <Typography variant="body2" sx={{ fontSize: '0.8rem', flex: 1 }} noWrap>
          {topicTitle}
        </Typography>
        <Chip
          label={RECOMMENDATION_LABEL[rec] ?? rec}
          size="small"
          color={RECOMMENDATION_COLOR[rec] ?? 'default'}
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
        {localOverride && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Overridden
          </Typography>
        )}
        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Stack>

      {/* Expanded detail */}
      {expanded && (
        <Box sx={{ pl: 1, pb: 1.5, borderLeft: '2px solid', borderLeftColor: 'divider' }}>
          {/* Photo thumbnail */}
          {scan.imageUrl && (
            <>
              <Box
                component="img"
                src={scan.imageUrl}
                alt="Scanned page"
                onClick={() => setLightboxOpen(true)}
                sx={{
                  width: '100%',
                  maxHeight: 150,
                  objectFit: 'contain',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  mt: 1,
                }}
              />
              <Dialog open={lightboxOpen} onClose={() => setLightboxOpen(false)} maxWidth="md">
                <Box
                  component="img"
                  src={scan.imageUrl}
                  alt="Scanned page (full)"
                  sx={{ width: '100%', maxHeight: '90vh', objectFit: 'contain' }}
                />
              </Dialog>
            </>
          )}

          {/* AI reasoning */}
          {r.recommendationReason && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                AI reasoning:
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.8rem', mt: 0.25 }}>
                {r.recommendationReason}
              </Typography>
            </Box>
          )}

          {/* Skills targeted */}
          {r.skillsTargeted.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Skills targeted:
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
                {r.skillsTargeted.map((s, i) => (
                  <Chip
                    key={i}
                    label={`${s.skill} · ${s.level}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Difficulty + Minutes */}
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Difficulty: <strong>{r.estimatedDifficulty}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Est. time: <strong>~{r.estimatedMinutes}m</strong>
            </Typography>
          </Stack>

          {/* Curriculum detected */}
          {r.curriculumDetected && (r.curriculumDetected.name || r.curriculumDetected.provider) && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Curriculum detected:
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.8rem', mt: 0.25 }}>
                {[
                  r.curriculumDetected.provider,
                  r.curriculumDetected.name,
                  r.curriculumDetected.lessonNumber != null && `Lesson ${r.curriculumDetected.lessonNumber}`,
                  r.curriculumDetected.pageNumber != null && `Page ${r.curriculumDetected.pageNumber}`,
                  r.curriculumDetected.levelDesignation,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>
          )}

          {/* Timestamp */}
          {scan.createdAt && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Scanned: {new Date(scan.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Typography>
          )}

          {/* Override section */}
          <Box sx={{ mt: 1.5 }}>
            {localOverride && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Overridden by Shelly
                </Typography>
                {localOverride.note && (
                  <Tooltip title={localOverride.note}>
                    <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                      (note)
                    </Typography>
                  </Tooltip>
                )}
              </Stack>
            )}

            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small"
                variant="text"
                onClick={(e) => setOverrideAnchor(e.currentTarget)}
                sx={{ textTransform: 'none', fontSize: '0.75rem', p: 0.5 }}
                disabled={saving}
              >
                Override
              </Button>
              {localOverride && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => void handleRevert()}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', p: 0.5, color: 'text.secondary' }}
                  disabled={saving}
                >
                  Revert to AI recommendation
                </Button>
              )}
            </Stack>

            <Menu
              anchorEl={overrideAnchor}
              open={Boolean(overrideAnchor)}
              onClose={() => setOverrideAnchor(null)}
            >
              {(['do', 'skip', 'quick-review', 'modify'] as Recommendation[]).map((opt) => (
                <MenuItem
                  key={opt}
                  selected={rec === opt}
                  onClick={() => handleOverrideSelect(opt)}
                >
                  {RECOMMENDATION_LABEL[opt]}
                </MenuItem>
              ))}
            </Menu>

            {/* Note field after selecting override */}
            {showNoteField && pendingOverride && (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Override to <strong>{RECOMMENDATION_LABEL[pendingOverride]}</strong>
                </Typography>
                <TextField
                  size="small"
                  placeholder="Optional note (why?)"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  sx={{ '& input': { fontSize: '0.8rem' } }}
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => void handleOverrideSave()}
                    disabled={saving}
                  >
                    Save
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setShowNoteField(false)
                      setPendingOverride(null)
                      setOverrideNote('')
                    }}
                  >
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}
