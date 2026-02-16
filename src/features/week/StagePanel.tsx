import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import BrokenImageIcon from '@mui/icons-material/BrokenImage'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'

import PhotoCapture from '../../components/PhotoCapture'
import type { Artifact } from '../../core/types/domain'
import type { EngineStage as EngineStageType } from '../../core/types/enums'
import { LAB_STAGES, labStageIndex } from './labSession.logic'

// ── Constants ──────────────────────────────────────────────────

const stagePrompt: Record<EngineStageType, string> = {
  Wonder: 'What are you wondering about?',
  Build: 'What did you build or try?',
  Explain: 'What did you discover?',
  Reflect: 'What would you change?',
  Share: 'Who should see this?',
}

// ── Props ──────────────────────────────────────────────────────

interface StagePanelProps {
  /** The engine stage this panel represents. */
  stage: EngineStageType
  /** Index of this stage within the LAB_STAGES array. */
  stageIndex: number
  /** The current active stage of the lab session. */
  currentStage: EngineStageType
  /** Whether this stage has been marked done. */
  isDone: boolean
  /** Stage notes text. */
  notes: string
  /** Photo artifacts for this stage. */
  stagePhotos: Artifact[]
  /** Resolved URLs for photo artifacts, keyed by artifact ID. */
  artifactUrls: Record<string, string | null>
  /** Whether the inline photo capture is active for this stage. */
  inlinePhotoActive: boolean
  /** Whether a media upload is in progress. */
  mediaUploading: boolean

  // Callbacks
  onNotesChange: (stage: EngineStageType, notes: string) => void
  onMarkDone: (stage: EngineStageType, done: boolean) => void
  onAdvanceStage: (nextStage: EngineStageType) => void
  onCaptureArtifact: (stage: EngineStageType) => void
  onInlinePhotoStart: (stage: EngineStageType) => void
  onInlinePhotoCancel: () => void
  onPhotoCapture: (file: File, stage: EngineStageType) => void
  onViewPhoto: (url: string) => void
}

// ── Component ──────────────────────────────────────────────────

export default function StagePanel({
  stage,
  stageIndex,
  currentStage,
  isDone,
  notes,
  stagePhotos,
  artifactUrls,
  inlinePhotoActive,
  mediaUploading,
  onNotesChange,
  onMarkDone,
  onAdvanceStage,
  onCaptureArtifact,
  onInlinePhotoStart,
  onInlinePhotoCancel,
  onPhotoCapture,
  onViewPhoto,
}: StagePanelProps) {
  const currentIdx = labStageIndex(currentStage)
  const isActive = stageIndex === currentIdx

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isDone
          ? 'success.main'
          : isActive
            ? 'primary.main'
            : undefined,
        borderWidth: isActive || isDone ? 2 : 1,
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2">{stage}</Typography>
            {isDone && <Chip label="Done" color="success" size="small" />}
            {isActive && !isDone && <Chip label="Current" color="primary" size="small" />}
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {stagePrompt[stage]}
          </Typography>

          {/* Notes */}
          <TextField
            placeholder={`Notes for ${stage}...`}
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => onNotesChange(stage, e.target.value)}
            fullWidth
            size="small"
          />

          {/* Photo thumbnails for this stage */}
          {stagePhotos.length > 0 && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              {stagePhotos.map((photo) => {
                const url = artifactUrls[photo.id!]
                return url ? (
                  <Box
                    key={photo.id}
                    component="img"
                    src={url}
                    alt={`${stage} photo`}
                    onClick={() => onViewPhoto(url)}
                    sx={{
                      width: 56,
                      height: 56,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                    }}
                  />
                ) : (
                  <Box
                    key={photo.id}
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <BrokenImageIcon fontSize="small" color="disabled" />
                  </Box>
                )
              })}
              <Typography variant="caption" color="text.secondary">
                {stagePhotos.length} photo{stagePhotos.length !== 1 ? 's' : ''}
              </Typography>
            </Stack>
          )}

          {/* Inline photo capture for this stage */}
          {inlinePhotoActive && (
            <Box sx={{ mt: 1 }}>
              <PhotoCapture
                onCapture={(file) => onPhotoCapture(file, stage)}
                uploading={mediaUploading}
              />
              <Button
                variant="text"
                size="small"
                onClick={onInlinePhotoCancel}
                sx={{ mt: 1 }}
              >
                Cancel photo
              </Button>
            </Box>
          )}

          {/* Action buttons */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {!isDone && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => onMarkDone(stage, true)}
              >
                Mark Done
              </Button>
            )}
            {isDone && (
              <Button
                variant="text"
                size="small"
                onClick={() => onMarkDone(stage, false)}
              >
                Undo Done
              </Button>
            )}
            {!inlinePhotoActive && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<PhotoCameraIcon />}
                onClick={() => onInlinePhotoStart(stage)}
              >
                Add Photo
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={() => onCaptureArtifact(stage)}
            >
              Capture Artifact
            </Button>
            {isActive && stageIndex < LAB_STAGES.length - 1 && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => onAdvanceStage(LAB_STAGES[stageIndex + 1])}
              >
                Advance to {LAB_STAGES[stageIndex + 1]}
              </Button>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
