import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import ArtifactGallery from '../../components/ArtifactGallery'
import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import type { Child } from '../../core/types'
import { BEAT_BOTH, type LabBeat, type LabBeats } from '../../core/types/dadlab'
import { LabBeatId } from '../../core/types/enums'

// ── Beat display metadata ──────────────────────────────────────
// Three beats in kid words (FEAT-56). The up-front five-step framework moves
// behind the "Show full framework" control in LabReportForm — available, never
// demanded. Order is fixed: Predict → Try → What we saw.

const BEATS: Array<{ id: LabBeatId; icon: string; title: string; prompt: string }> = [
  { id: LabBeatId.Predict, icon: '\u{1F52E}', title: 'Predict', prompt: 'What do we think will happen?' },
  { id: LabBeatId.Try, icon: '\u{1F9EA}', title: 'Try', prompt: 'What did we do?' },
  { id: LabBeatId.Saw, icon: '\u{1F440}', title: 'What we saw', prompt: 'What happened?' },
]

// The writing line is the writing stretch — inviting, never required, never
// validated, no empty-state shame.
const WRITING_PLACEHOLDER = 'want to write one word? totally optional'

// ── Props ──────────────────────────────────────────────────────

interface LabCaptureBeatsProps {
  /** Driving question, rendered read-only above the beats. */
  question: string
  beats: LabBeats
  children: Child[]
  familyId: string
  /** Read-only (completed report view). */
  disabled?: boolean
  /** Beat currently uploading an artifact, if any. */
  uploadingBeat?: LabBeatId | null
  onTextChange: (beat: LabBeatId, text: string) => void
  onTextChildChange: (beat: LabBeatId, child: string) => void
  onPhotoCapture: (beat: LabBeatId, file: File) => void
  onAudioCapture: (beat: LabBeatId, blob: Blob) => void
  onItemChildChange: (beat: LabBeatId, artifactId: string, child: string) => void
}

// ── Attribution control ────────────────────────────────────────
// One set of beats, per-item attribution — a captured item (or the writing line)
// is credited to Both (default) or a single child. Kept name-agnostic (ARCH-40):
// options are derived from the passed children, never hardcoded.

interface AttributionOption {
  value: string
  label: string
}

function attributionOptions(children: Child[]): AttributionOption[] {
  return [
    { value: BEAT_BOTH, label: 'Both' },
    ...children.map((c) => ({ value: c.id, label: c.name })),
  ]
}

function attributionLabel(value: string | undefined, options: AttributionOption[]): string {
  return options.find((o) => o.value === (value ?? BEAT_BOTH))?.label ?? 'Both'
}

function AttributionControl({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string | undefined
  options: AttributionOption[]
  disabled?: boolean
  onChange?: (child: string) => void
}) {
  const current = value ?? BEAT_BOTH
  if (disabled || !onChange) {
    return <Chip label={attributionLabel(current, options)} size="small" variant="outlined" />
  }
  return (
    <ToggleButtonGroup
      value={current}
      exclusive
      size="small"
      onChange={(_, val) => val && onChange(val)}
    >
      {options.map((o) => (
        <ToggleButton key={o.value} value={o.value} sx={{ px: 1.25, py: 0.25, textTransform: 'none' }}>
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

// ── Component ──────────────────────────────────────────────────

export default function LabCaptureBeats({
  question,
  beats,
  children,
  familyId,
  disabled,
  uploadingBeat,
  onTextChange,
  onTextChildChange,
  onPhotoCapture,
  onAudioCapture,
  onItemChildChange,
}: LabCaptureBeatsProps) {
  // Attribution controls only make sense with more than one child.
  const showAttribution = children.length > 1
  const options = attributionOptions(children)

  return (
    <Box>
      {/* Driving question — read-only context for the beats. */}
      {question.trim() && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
            Our question
          </Typography>
          <Typography variant="body2">{question.trim()}</Typography>
        </Box>
      )}

      <Stack spacing={2}>
        {BEATS.map(({ id, icon, title, prompt }) => {
          const beat: LabBeat = beats[id] ?? { items: [] }
          const hasText = (beat.text?.trim().length ?? 0) > 0
          const isUploading = uploadingBeat === id

          // In read-only view, a wholly empty beat renders nothing (keeps a
          // legacy/lightly-used report from showing three blank cards).
          if (disabled && !hasText && beat.items.length === 0) return null

          return (
            <Box
              key={id}
              sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {icon} {title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {prompt}
              </Typography>

              <Stack spacing={1.5}>
                {/* Writing line — the optional stretch. */}
                {disabled ? (
                  hasText && (
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography variant="body2">{beat.text}</Typography>
                      {showAttribution && (
                        <AttributionControl value={beat.textChild} options={options} disabled />
                      )}
                    </Stack>
                  )
                ) : (
                  <Box>
                    <TextField
                      placeholder={WRITING_PLACEHOLDER}
                      value={beat.text ?? ''}
                      onChange={(e) => onTextChange(id, e.target.value)}
                      fullWidth
                      size="small"
                    />
                    {showAttribution && hasText && (
                      <Box sx={{ mt: 0.75 }}>
                        <AttributionControl
                          value={beat.textChild}
                          options={options}
                          onChange={(child) => onTextChildChange(id, child)}
                        />
                      </Box>
                    )}
                  </Box>
                )}

                {/* Captured items — each with its own attribution beside its media. */}
                {beat.items.map((item) => (
                  <Stack
                    key={item.artifactId}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <ArtifactGallery
                        familyId={familyId}
                        artifactIds={[item.artifactId]}
                        thumbnailSize={56}
                      />
                    </Box>
                    {showAttribution && (
                      <AttributionControl
                        value={item.child}
                        options={options}
                        disabled={disabled}
                        onChange={(child) => onItemChildChange(id, item.artifactId, child)}
                      />
                    )}
                  </Stack>
                ))}

                {/* Capture buttons — audio (the child's primary channel) + photo. */}
                {!disabled && (
                  <Stack spacing={1}>
                    <AudioRecorder
                      onCapture={(blob) => onAudioCapture(id, blob)}
                      uploading={isUploading}
                    />
                    <PhotoCapture
                      onCapture={(file) => onPhotoCapture(id, file)}
                      uploading={isUploading}
                      multiple
                    />
                  </Stack>
                )}
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
