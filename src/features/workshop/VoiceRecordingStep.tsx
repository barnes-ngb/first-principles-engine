import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import MicIcon from '@mui/icons-material/Mic'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../core/firebase/firestore'
import { useAudioRecorder } from '../../core/hooks/useAudioRecorder'
import type {
  AdventureTree,
  BoardSpace,
  GeneratedGame,
  VoiceRecording,
  VoiceRecordingMap,
} from '../../core/types'
import { uploadVoiceRecording } from './voiceRecordingUpload'

// ── Types ─────────────────────────────────────────────────────────

interface RecordableItem {
  id: string
  text: string
  label: string
}

interface VoiceRecordingStepProps {
  game: GeneratedGame | AdventureTree
  gameId: string
  familyId: string
  childId: string
  childName: string
  /** Existing recordings (for re-record mode) */
  existingRecordings?: VoiceRecordingMap
  /** Called when user finishes or skips */
  onDone: (recordings: VoiceRecordingMap) => void
  /** Called when user skips entirely */
  onSkip: () => void
}

// ── Helpers ───────────────────────────────────────────────────────

function isAdventureTree(game: GeneratedGame | AdventureTree): game is AdventureTree {
  return 'nodes' in game && 'rootNodeId' in game
}

/** Build the list of recordable items from game data */
function buildRecordableItems(game: GeneratedGame | AdventureTree): RecordableItem[] {
  if (isAdventureTree(game)) {
    return buildAdventureRecordableItems(game)
  }
  return buildBoardRecordableItems(game)
}

function buildBoardRecordableItems(game: GeneratedGame): RecordableItem[] {
  const items: RecordableItem[] = []

  // Challenge cards
  for (const card of game.challengeCards) {
    items.push({
      id: card.id,
      text: card.readAloudText,
      label: `${cardTypeEmoji(card.type)} ${card.type}`,
    })
  }

  // Special board spaces (bonus, setback, special) that have labels
  for (const space of game.board.spaces) {
    if (isRecordableSpace(space) && space.label) {
      items.push({
        id: `space-${space.index}`,
        text: space.label,
        label: spaceTypeLabel(space.type),
      })
    }
  }

  return items
}

function buildAdventureRecordableItems(adventure: AdventureTree): RecordableItem[] {
  const items: RecordableItem[] = []

  for (const node of Object.values(adventure.nodes)) {
    // Narrative nodes
    items.push({
      id: `node-${node.id}`,
      text: node.spokenText,
      label: node.isEnding
        ? `\u2B50 ${node.endingType === 'victory' ? 'Victory' : 'Ending'}`
        : '\uD83D\uDCD6 Scene',
    })

    // Choice labels
    if (node.choices) {
      for (const choice of node.choices) {
        items.push({
          id: `choice-${choice.id}`,
          text: choice.spokenText,
          label: '\u2934\uFE0F Choice',
        })
      }
    }
  }

  return items
}

function isRecordableSpace(space: BoardSpace): boolean {
  return space.type === 'bonus' || space.type === 'setback' || space.type === 'special'
}

function cardTypeEmoji(type: string): string {
  const map: Record<string, string> = {
    reading: '\uD83D\uDCDA',
    math: '\uD83E\uDDEE',
    story: '\uD83D\uDCAC',
    action: '\uD83C\uDFC3',
  }
  return map[type] ?? '\uD83C\uDFB4'
}

function spaceTypeLabel(type: string): string {
  const map: Record<string, string> = {
    bonus: '\u2B50 Bonus',
    setback: '\uD83D\uDE48 Setback',
    special: '\u2728 Special',
  }
  return map[type] ?? type
}

// ── Component ─────────────────────────────────────────────────────

export default function VoiceRecordingStep({
  game,
  gameId,
  familyId,
  childId,
  existingRecordings,
  onDone,
  onSkip,
}: VoiceRecordingStepProps) {
  const recorder = useAudioRecorder()
  const [recordings, setRecordings] = useState<VoiceRecordingMap>(existingRecordings ?? {})
  const [recordingCardId, setRecordingCardId] = useState<string | null>(null)
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null)
  const [pendingBlobs, setPendingBlobs] = useState<Record<string, Blob>>({})
  const items = useRef(buildRecordableItems(game)).current
  const recordedCount = Object.keys(recordings).length

  // When user taps mic on a card, start recording for that card
  const handleStartRecording = useCallback(
    async (itemId: string) => {
      // If already recording a different card, stop first
      if (recorder.isRecording) {
        await recorder.stopRecording()
      }
      recorder.clearRecording()
      setRecordingCardId(itemId)
      await recorder.startRecording()
    },
    [recorder],
  )

  const handleStopRecording = useCallback(async () => {
    const blob = await recorder.stopRecording()
    if (!blob || !recordingCardId) return

    setPendingBlobs((prev) => ({ ...prev, [recordingCardId]: blob }))

    // Upload to Firebase Storage
    setUploadingCardId(recordingCardId)
    try {
      const url = await uploadVoiceRecording(familyId, gameId, recordingCardId, blob)
      const voiceRec: VoiceRecording = {
        url,
        recordedBy: childId,
        durationMs: recorder.durationMs,
        recordedAt: new Date().toISOString(),
      }
      setRecordings((prev) => ({ ...prev, [recordingCardId]: voiceRec }))
    } catch (err) {
      console.warn('Voice recording upload failed:', err)
    } finally {
      setUploadingCardId(null)
      setRecordingCardId(null)
    }
  }, [recorder, recordingCardId, familyId, gameId, childId])

  // Play back a recording (use local blob if available, otherwise remote URL)
  const handlePlay = useCallback(
    (itemId: string) => {
      const localBlob = pendingBlobs[itemId]
      if (localBlob) {
        const url = URL.createObjectURL(localBlob)
        recorder.playRecording(url)
        return
      }
      const rec = recordings[itemId]
      if (rec?.url) {
        recorder.playRecording(rec.url)
      }
    },
    [pendingBlobs, recordings, recorder],
  )

  const handleDone = useCallback(async () => {
    // Save recordings to Firestore
    if (Object.keys(recordings).length > 0) {
      try {
        await updateDoc(doc(db, `families/${familyId}/storyGames/${gameId}`), {
          voiceRecordings: recordings,
          updatedAt: new Date().toISOString(),
        })
      } catch (err) {
        console.warn('Failed to save voice recordings:', err)
      }
    }
    onDone(recordings)
  }, [recordings, familyId, gameId, onDone])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingBlobs).forEach((blob) => {
        // Blob URLs are auto-revoked when page unloads, but clean up explicitly
        try {
          URL.revokeObjectURL(URL.createObjectURL(blob))
        } catch {
          // ignore
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show permission denied message
  if (!recorder.isSupported) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          No worries! The game will read the cards for you.
        </Typography>
        <Button variant="contained" onClick={onSkip}>
          Continue
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ py: 2 }}>
      {/* Header */}
      <Typography variant="h5" sx={{ textAlign: 'center', fontWeight: 700, mb: 1 }}>
        Record Your Voice!
      </Typography>
      <Typography color="text.secondary" sx={{ textAlign: 'center', mb: 0.5 }}>
        Tap the microphone and say what the card says — or say it YOUR way!
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
        You can record as many or as few as you want!
      </Typography>

      {/* Progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={(recordedCount / items.length) * 100}
          sx={{ flex: 1, height: 8, borderRadius: 4 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {recordedCount} of {items.length} recorded
        </Typography>
      </Box>

      {/* Permission error */}
      {recorder.error && (
        <Typography color="error" sx={{ textAlign: 'center', mb: 2, fontSize: '0.875rem' }}>
          {recorder.error === 'Microphone permission was denied.'
            ? "Tap 'Allow' so I can hear your voice! No worries if not — the game will read the cards for you."
            : recorder.error}
        </Typography>
      )}

      {/* Card list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 400, overflow: 'auto', mb: 3 }}>
        {items.map((item) => {
          const hasRecording = !!recordings[item.id]
          const isCurrentlyRecording = recordingCardId === item.id && recorder.isRecording
          const isUploading = uploadingCardId === item.id

          return (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: hasRecording ? 'success.light' : 'divider',
                bgcolor: isCurrentlyRecording ? 'error.50' : hasRecording ? 'success.50' : 'background.paper',
              }}
            >
              {/* Card text */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                  <Chip label={item.label} size="small" variant="outlined" />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {item.text}
                </Typography>
              </Box>

              {/* Controls */}
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
                {/* Recorded indicator */}
                {hasRecording && !isCurrentlyRecording && (
                  <CheckCircleIcon fontSize="small" color="success" />
                )}

                {/* Play button (if has recording) */}
                {hasRecording && !isCurrentlyRecording && !isUploading && (
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => handlePlay(item.id)}
                    disabled={recorder.isPlaying}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                )}

                {/* Uploading spinner */}
                {isUploading && <CircularProgress size={20} />}

                {/* Recording indicator (pulsing red dot) */}
                {isCurrentlyRecording && (
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: 'error.main',
                      animation: 'recPulse 1s ease-in-out infinite',
                      '@keyframes recPulse': {
                        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                        '50%': { opacity: 0.5, transform: 'scale(1.3)' },
                      },
                    }}
                  />
                )}

                {/* Mic / Stop button */}
                {isCurrentlyRecording ? (
                  <IconButton size="small" color="error" onClick={handleStopRecording}>
                    <StopIcon />
                  </IconButton>
                ) : (
                  <IconButton
                    size="small"
                    color={hasRecording ? 'default' : 'primary'}
                    onClick={() => handleStartRecording(item.id)}
                    disabled={isUploading || (recorder.isRecording && recordingCardId !== item.id)}
                    aria-label={hasRecording ? 'Record again' : 'Record'}
                  >
                    <MicIcon />
                  </IconButton>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
        {recordedCount === 0 ? (
          <Button variant="contained" onClick={onSkip}>
            Skip Recording
          </Button>
        ) : (
          <>
            <Button variant="outlined" onClick={onSkip}>
              Skip
            </Button>
            <Button variant="contained" onClick={handleDone} disabled={recorder.isRecording}>
              Done
            </Button>
          </>
        )}
      </Box>
    </Box>
  )
}
