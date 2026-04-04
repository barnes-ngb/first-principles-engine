import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { ScanResult, CertificateScanResult, CurriculumDetected } from '../core/types'
import { isCertificateScan } from '../core/types/planning'
import GatbLessonInfo from './GatbLessonInfo'

const ALIGNMENT_ICON: Record<string, string> = {
  'ahead': '🟢',
  'at-level': '🟡',
  'behind': '🔴',
  'unknown': '⚪',
}

const ALIGNMENT_LABEL: Record<string, string> = {
  'ahead': 'mastered',
  'at-level': 'at level',
  'behind': 'new — teach first',
  'unknown': 'unknown',
}

const DIFFICULTY_COLOR: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  'easy': 'success',
  'appropriate': 'info',
  'challenging': 'warning',
  'too-hard': 'error',
}

const RECOMMENDATION_LABEL: Record<string, string> = {
  'do': 'DO',
  'skip': 'SKIP',
  'quick-review': 'QUICK REVIEW',
  'modify': 'MODIFY',
}

interface ScanResultsPanelProps {
  results: ScanResult
  imageUrl?: string
  onAddToPlan?: () => void
  onSkip?: () => void
  onScanAnother?: () => void
  /** Called when user wants to apply certificate data to workbook config. */
  onApplyCertificate?: (result: CertificateScanResult) => void
  /** Called when user wants to update workbook position from detected curriculum. */
  onUpdatePosition?: (curriculum: CurriculumDetected) => void
  /** Child name for the "Update Progress" button label. */
  childName?: string
  /** Hide action buttons (e.g. when viewing history). */
  hideActions?: boolean
}

export default function ScanResultsPanel({
  results,
  imageUrl,
  onAddToPlan,
  onSkip,
  onScanAnother,
  onApplyCertificate,
  onUpdatePosition,
  childName,
  hideActions,
}: ScanResultsPanelProps) {
  if (isCertificateScan(results)) {
    return (
      <CertificateResultsView
        results={results}
        imageUrl={imageUrl}
        onApplyCertificate={onApplyCertificate}
        onScanAnother={onScanAnother}
        childName={childName}
        hideActions={hideActions}
      />
    )
  }

  const isUnreadable = results.pageType === 'other'

  if (isUnreadable) {
    return (
      <Alert severity="warning" sx={{ mt: 1 }}>
        I couldn&apos;t read this page clearly. {results.recommendationReason || 'Try taking the photo in better light or holding the camera steady.'}
      </Alert>
    )
  }

  return (
    <Box
      sx={{
        mt: 1,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" fontWeight={700}>
          Workbook Scan Results
        </Typography>

        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt="Scanned page"
            sx={{
              width: '100%',
              maxHeight: 180,
              objectFit: 'contain',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
        )}

        <Divider />

        {/* Subject + Topic */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" color="text.secondary">
            Subject:
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
            {results.subject}
          </Typography>
        </Stack>
        <Typography variant="body2">
          <strong>Topic:</strong> {results.specificTopic}
        </Typography>

        {/* Difficulty + Recommendation */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={results.estimatedDifficulty}
            color={DIFFICULTY_COLOR[results.estimatedDifficulty] ?? 'default'}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`${RECOMMENDATION_LABEL[results.recommendation] ?? results.recommendation}`}
            color={results.recommendation === 'do' ? 'success' : results.recommendation === 'skip' ? 'error' : 'warning'}
            variant="filled"
          />
          <Chip
            size="small"
            label={`~${results.estimatedMinutes} min`}
            variant="outlined"
          />
        </Stack>

        {/* Skills */}
        {results.skillsTargeted.length > 0 && (
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              Skills found:
            </Typography>
            {results.skillsTargeted.map((s, i) => (
              <Typography key={i} variant="body2" sx={{ pl: 1 }}>
                {ALIGNMENT_ICON[s.alignsWithSnapshot] ?? '⚪'}{' '}
                {s.skill} ({ALIGNMENT_LABEL[s.alignsWithSnapshot] ?? s.alignsWithSnapshot})
              </Typography>
            ))}
          </Box>
        )}

        {/* Recommendation reason */}
        <Typography variant="body2" color="text.secondary">
          {results.recommendationReason}
        </Typography>

        {/* Teacher notes */}
        {results.teacherNotes && (
          <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: '0.875rem' } }}>
            <strong>Teacher tip:</strong> {results.teacherNotes}
          </Alert>
        )}

        {/* Curriculum position detection */}
        {results.curriculumDetected?.lessonNumber && (
          <Alert severity="info" sx={{ mt: 1 }}>
            <Typography variant="body2" fontWeight={500}>
              Detected: {results.curriculumDetected.name ?? results.curriculumDetected.provider ?? 'Unknown curriculum'} — Lesson {results.curriculumDetected.lessonNumber}
            </Typography>
            {onUpdatePosition && (
              <Button
                size="small"
                variant="outlined"
                sx={{ mt: 1 }}
                onClick={() => onUpdatePosition(results.curriculumDetected!)}
              >
                Update workbook position to Lesson {results.curriculumDetected.lessonNumber}
              </Button>
            )}
          </Alert>
        )}

        {/* GATB scope-and-sequence context */}
        {results.curriculumDetected?.provider === 'gatb' && results.curriculumDetected.lessonNumber && (
          <GatbLessonInfo
            level={results.curriculumDetected.levelDesignation}
            lessonNumber={results.curriculumDetected.lessonNumber}
          />
        )}

        {/* Action buttons */}
        {!hideActions && (
          <>
            <Divider />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {onAddToPlan && (
                <Button size="small" variant="contained" color="success" onClick={onAddToPlan}>
                  Add to Plan
                </Button>
              )}
              {onSkip && (
                <Button size="small" variant="outlined" color="inherit" onClick={onSkip}>
                  Skip
                </Button>
              )}
              {onScanAnother && (
                <Button size="small" variant="text" onClick={onScanAnother}>
                  Scan Another
                </Button>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Box>
  )
}

// ── Certificate Results Sub-component ───────────────────────────

interface CertificateResultsViewProps {
  results: CertificateScanResult
  imageUrl?: string
  onApplyCertificate?: (result: CertificateScanResult) => void
  onScanAnother?: () => void
  childName?: string
  hideActions?: boolean
}

function CertificateResultsView({
  results,
  imageUrl,
  onApplyCertificate,
  onScanAnother,
  childName,
  hideActions,
}: CertificateResultsViewProps) {
  return (
    <Box
      sx={{
        mt: 1,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={1.5}>
        <Alert severity="success" icon={false}>
          <strong>Certificate detected:</strong> {results.curriculumName} — {results.milestone}
        </Alert>

        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt="Scanned certificate"
            sx={{
              width: '100%',
              maxHeight: 180,
              objectFit: 'contain',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
        )}

        <Divider />

        {/* Level + Lesson range */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {results.level && (
            <Chip size="small" label={results.level} color="primary" variant="outlined" />
          )}
          {results.lessonRange && (
            <Chip size="small" label={results.lessonRange} variant="outlined" />
          )}
          {results.date && (
            <Chip size="small" label={results.date} variant="outlined" />
          )}
        </Stack>

        {/* Skills covered */}
        {results.skillsCovered.length > 0 && (
          <Typography variant="body2">
            <strong>Skills covered:</strong> {results.skillsCovered.join(', ')}
          </Typography>
        )}

        {/* Words read */}
        {results.wordsRead.length > 0 && (
          <Typography variant="body2">
            <strong>Words read:</strong> {results.wordsRead.join(', ')}
          </Typography>
        )}

        {/* Snapshot update notes */}
        {results.suggestedSnapshotUpdate?.notes && (
          <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: '0.875rem' } }}>
            {results.suggestedSnapshotUpdate.notes}
          </Alert>
        )}

        {/* Action buttons */}
        {!hideActions && (
          <>
            <Divider />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {onApplyCertificate && (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={() => onApplyCertificate(results)}
                >
                  Update {childName ? `${childName}'s` : ''} Progress
                </Button>
              )}
              {onScanAnother && (
                <Button size="small" variant="text" onClick={onScanAnother}>
                  Scan Another
                </Button>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Box>
  )
}
