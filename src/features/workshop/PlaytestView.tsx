import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import type { GeneratedGame, PlaytestFeedback } from '../../core/types'
import { PlaytestReaction } from '../../core/types/workshop'
import { useTTS } from '../../core/hooks/useTTS'
import { useAudioRecorder } from '../../core/hooks/useAudioRecorder'
import { uploadVoiceRecording } from './voiceRecordingUpload'
import ChallengeCardDisplay from './ChallengeCard'
import type { GeneratedArt, VoiceRecordingMap } from '../../core/types'

const REACTION_OPTIONS: Array<{
  value: PlaytestReaction
  emoji: string
  label: string
}> = [
  { value: PlaytestReaction.Good, emoji: '\uD83D\uDC4D', label: 'Makes sense' },
  { value: PlaytestReaction.Confusing, emoji: '\uD83E\uDD14', label: 'Confusing' },
  { value: PlaytestReaction.TooHard, emoji: '\uD83D\uDE2C', label: 'Too hard' },
  { value: PlaytestReaction.TooEasy, emoji: '\uD83D\uDE34', label: 'Too easy' },
  { value: PlaytestReaction.Change, emoji: '\uD83D\uDD04', label: 'Change this' },
]

interface PlaytestViewProps {
  game: GeneratedGame
  gameId: string
  familyId: string
  testerId: string
  testerName: string
  generatedArt?: GeneratedArt
  voiceRecordings?: VoiceRecordingMap
  onComplete: (feedback: PlaytestFeedback[], durationMinutes: number) => void
  onCancel: () => void
}

export default function PlaytestView({
  game,
  gameId,
  familyId,
  generatedArt,
  voiceRecordings,
  onComplete,
  onCancel,
}: PlaytestViewProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [feedbackMap, setFeedbackMap] = useState<Map<string, PlaytestFeedback>>(new Map())
  const [showFeedback, setShowFeedback] = useState(false)
  const [selectedReaction, setSelectedReaction] = useState<PlaytestReaction | null>(null)
  const [comment, setComment] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showCard, setShowCard] = useState(true)

  const tts = useTTS()
  const recorder = useAudioRecorder()
  const startTimeRef = useRef(Date.now())

  const cards = game.challengeCards
  const currentCard = cards[currentCardIndex] ?? null
  const totalCards = cards.length
  const isLastCard = currentCardIndex >= totalCards - 1

  // Announce start
  useEffect(() => {
    tts.speak(`Time to playtest! You'll see all ${totalCards} cards. Tell us what you think about each one.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCardDismiss = useCallback(() => {
    setShowCard(false)
    setShowFeedback(true)
  }, [])

  const handleReactionSelect = useCallback((reaction: PlaytestReaction) => {
    setSelectedReaction(reaction)
    if (reaction === PlaytestReaction.Good) {
      // No comment needed for thumbs up
      setComment('')
      setAudioUrl(null)
    }
  }, [])

  const handleRecordFeedback = useCallback(async () => {
    if (recorder.isRecording) {
      const blob = await recorder.stopRecording()
      if (blob && familyId && gameId && currentCard) {
        setUploading(true)
        try {
          const url = await uploadVoiceRecording(
            familyId,
            gameId,
            `playtest-${currentCard.id}`,
            blob,
          )
          setAudioUrl(url)
        } catch (err) {
          console.warn('Failed to upload feedback audio:', err)
        } finally {
          setUploading(false)
        }
      }
    } else {
      await recorder.startRecording()
    }
  }, [recorder, familyId, gameId, currentCard])

  const handleSubmitFeedback = useCallback(() => {
    if (!currentCard || !selectedReaction) return

    const feedback: PlaytestFeedback = {
      cardId: currentCard.id,
      reaction: selectedReaction,
      comment: comment.trim() || undefined,
      audioUrl: audioUrl ?? undefined,
      timestamp: new Date().toISOString(),
    }

    setFeedbackMap((prev) => {
      const next = new Map(prev)
      next.set(currentCard.id, feedback)
      return next
    })

    // Move to next card or complete
    if (isLastCard) {
      const allFeedback = Array.from(
        new Map([...feedbackMap, [currentCard.id, feedback]]).values(),
      )
      const durationMinutes = Math.max(
        Math.round((Date.now() - startTimeRef.current) / 60000),
        1,
      )
      onComplete(allFeedback, durationMinutes)
    } else {
      setCurrentCardIndex((i) => i + 1)
      setShowFeedback(false)
      setSelectedReaction(null)
      setComment('')
      setAudioUrl(null)
      setShowCard(true)
      recorder.clearRecording()
    }
  }, [currentCard, selectedReaction, comment, audioUrl, isLastCard, feedbackMap, onComplete, recorder])

  const needsComment = selectedReaction && selectedReaction !== PlaytestReaction.Good

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      {/* Progress header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Card {currentCardIndex + 1} of {totalCards}
        </Typography>
        <Button size="small" onClick={onCancel} color="inherit">
          Exit Playtest
        </Button>
      </Box>

      {/* Progress bar */}
      <Box
        sx={{
          width: '100%',
          height: 6,
          bgcolor: 'grey.200',
          borderRadius: 3,
          mb: 3,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${((currentCardIndex + (showFeedback ? 0.5 : 0)) / totalCards) * 100}%`,
            height: '100%',
            bgcolor: 'primary.main',
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </Box>

      {/* Challenge card display */}
      <ChallengeCardDisplay
        card={currentCard}
        open={showCard && currentCard !== null}
        onClose={handleCardDismiss}
        cardArt={generatedArt?.cardArt}
        voiceRecordings={voiceRecordings}
      />

      {/* Feedback widget */}
      {showFeedback && currentCard && (
        <Box
          sx={{
            animation: 'fadeIn 0.3s ease-out',
            '@keyframes fadeIn': {
              '0%': { opacity: 0, transform: 'translateY(10px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
            },
          }}
        >
          {/* Card content recap */}
          <Box
            sx={{
              p: 2,
              mb: 2,
              bgcolor: 'grey.50',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {currentCard.type.charAt(0).toUpperCase() + currentCard.type.slice(1)} card:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {currentCard.content}
            </Typography>
          </Box>

          {/* Reaction buttons */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            What do you think?
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              mb: 2,
            }}
          >
            {REACTION_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={selectedReaction === opt.value ? 'contained' : 'outlined'}
                onClick={() => handleReactionSelect(opt.value)}
                sx={{
                  minWidth: 0,
                  px: 1.5,
                  py: 1,
                  fontSize: '0.85rem',
                  borderRadius: 2,
                  flex: '1 1 auto',
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                  <span style={{ fontSize: '1.3rem' }}>{opt.emoji}</span>
                  <span style={{ fontSize: '0.7rem' }}>{opt.label}</span>
                </Box>
              </Button>
            ))}
          </Box>

          {/* Comment field (for non-good reactions) */}
          {needsComment && (
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                placeholder={
                  selectedReaction === PlaytestReaction.Confusing
                    ? "What's confusing about this one?"
                    : 'What would you change?'
                }
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                variant="outlined"
                size="small"
              />

              {/* Audio recording for feedback */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <IconButton
                  onClick={handleRecordFeedback}
                  color={recorder.isRecording ? 'error' : 'primary'}
                  disabled={uploading}
                  size="small"
                >
                  {recorder.isRecording ? <StopIcon /> : <MicIcon />}
                </IconButton>
                <Typography variant="caption" color="text.secondary">
                  {recorder.isRecording
                    ? 'Recording... tap to stop'
                    : uploading
                      ? 'Uploading...'
                      : audioUrl
                        ? 'Recorded!'
                        : 'Or record your feedback'}
                </Typography>
                {audioUrl && (
                  <IconButton
                    size="small"
                    onClick={() => recorder.playRecording(audioUrl)}
                    disabled={recorder.isPlaying}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>
          )}

          {/* Submit button */}
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSubmitFeedback}
            disabled={!selectedReaction || uploading}
            sx={{ borderRadius: 2, py: 1.5, fontWeight: 700 }}
          >
            {isLastCard ? 'Finish Playtest' : 'Next Card'}
          </Button>
        </Box>
      )}
    </Box>
  )
}
