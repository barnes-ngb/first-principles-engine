import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import type { AdventureTree, PlaytestFeedback } from '../../core/types'
import { PlaytestReaction } from '../../core/types/workshop'
import { useTTS } from '../../core/hooks/useTTS'
import { useAudioRecorder } from '../../core/hooks/useAudioRecorder'
import { uploadVoiceRecording } from './voiceRecordingUpload'
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

interface AdventurePlaytestViewProps {
  adventure: AdventureTree
  gameId: string
  familyId: string
  testerId: string
  testerName: string
  generatedArt?: GeneratedArt
  voiceRecordings?: VoiceRecordingMap
  onComplete: (feedback: PlaytestFeedback[], durationMinutes: number) => void
  onCancel: () => void
}

/** Build a flat list of adventure nodes in traversal order (BFS from root) */
function buildNodeList(adventure: AdventureTree): Array<{ id: string; text: string; choiceLabels: string[] }> {
  const visited = new Set<string>()
  const queue = [adventure.rootNodeId]
  const result: Array<{ id: string; text: string; choiceLabels: string[] }> = []

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = adventure.nodes[nodeId]
    if (!node) continue

    result.push({
      id: nodeId,
      text: node.text,
      choiceLabels: node.choices?.map((c) => c.text) ?? [],
    })

    if (node.choices) {
      for (const choice of node.choices) {
        if (!visited.has(choice.nextNodeId)) {
          queue.push(choice.nextNodeId)
        }
      }
    }
  }

  return result
}

export default function AdventurePlaytestView({
  adventure,
  gameId,
  familyId,
  onComplete,
  onCancel,
}: AdventurePlaytestViewProps) {
  const nodes = useRef(buildNodeList(adventure)).current
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackMap, setFeedbackMap] = useState<Map<string, PlaytestFeedback>>(new Map())
  const [showFeedback, setShowFeedback] = useState(false)
  const [selectedReaction, setSelectedReaction] = useState<PlaytestReaction | null>(null)
  const [comment, setComment] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const tts = useTTS()
  const recorder = useAudioRecorder()
  const startTimeRef = useRef(Date.now())

  const currentNode = nodes[currentIndex] ?? null
  const totalNodes = nodes.length
  const isLastNode = currentIndex >= totalNodes - 1

  // Announce start
  useEffect(() => {
    tts.speak(
      `Time to playtest the adventure! You'll see all ${totalNodes} scenes. Tell us what you think about each one.`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReadNode = useCallback(() => {
    setShowFeedback(true)
  }, [])

  const handleReactionSelect = useCallback((reaction: PlaytestReaction) => {
    setSelectedReaction(reaction)
    if (reaction === PlaytestReaction.Good) {
      setComment('')
      setAudioUrl(null)
    }
  }, [])

  const handleRecordFeedback = useCallback(async () => {
    if (recorder.isRecording) {
      const blob = await recorder.stopRecording()
      if (blob && familyId && gameId && currentNode) {
        setUploading(true)
        try {
          const url = await uploadVoiceRecording(
            familyId,
            gameId,
            `playtest-node-${currentNode.id}`,
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
  }, [recorder, familyId, gameId, currentNode])

  const handleSubmitFeedback = useCallback(() => {
    if (!currentNode || !selectedReaction) return

    const feedback: PlaytestFeedback = {
      cardId: currentNode.id, // reuse cardId field for nodeId
      reaction: selectedReaction,
      comment: comment.trim() || undefined,
      audioUrl: audioUrl ?? undefined,
      timestamp: new Date().toISOString(),
    }

    setFeedbackMap((prev) => {
      const next = new Map(prev)
      next.set(currentNode.id, feedback)
      return next
    })

    if (isLastNode) {
      const allFeedback = Array.from(
        new Map([...feedbackMap, [currentNode.id, feedback]]).values(),
      )
      const durationMinutes = Math.max(
        Math.round((Date.now() - startTimeRef.current) / 60000),
        1,
      )
      onComplete(allFeedback, durationMinutes)
    } else {
      setCurrentIndex((i) => i + 1)
      setShowFeedback(false)
      setSelectedReaction(null)
      setComment('')
      setAudioUrl(null)
      recorder.clearRecording()
    }
  }, [currentNode, selectedReaction, comment, audioUrl, isLastNode, feedbackMap, onComplete, recorder])

  const needsComment = selectedReaction && selectedReaction !== PlaytestReaction.Good

  if (!currentNode) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="error">No adventure nodes found.</Typography>
        <Button onClick={onCancel}>Back</Button>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      {/* Progress header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Scene {currentIndex + 1} of {totalNodes}
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
            width: `${((currentIndex + (showFeedback ? 0.5 : 0)) / totalNodes) * 100}%`,
            height: '100%',
            bgcolor: 'primary.main',
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </Box>

      {/* Scene display */}
      {!showFeedback && (
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
          <Box
            sx={{
              p: 3,
              bgcolor: 'grey.50',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              mb: 2,
            }}
          >
            <Typography
              variant="body1"
              sx={{ fontSize: '1.1rem', lineHeight: 1.7, fontStyle: 'italic' }}
            >
              {currentNode.text}
            </Typography>
          </Box>

          {/* Show choices if any */}
          {currentNode.choiceLabels.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Choices at this scene:
              </Typography>
              {currentNode.choiceLabels.map((label, i) => (
                <Typography key={i} variant="body2" sx={{ ml: 2, mb: 0.25 }}>
                  &bull; {label}
                </Typography>
              ))}
            </Box>
          )}

          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleReadNode}
            sx={{ borderRadius: 2, py: 1.5, fontWeight: 700 }}
          >
            Give Feedback
          </Button>
        </Box>
      )}

      {/* Feedback widget */}
      {showFeedback && currentNode && (
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
          {/* Scene recap */}
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
              Scene:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {currentNode.text.length > 150 ? currentNode.text.slice(0, 150) + '...' : currentNode.text}
            </Typography>
          </Box>

          {/* Question prompt */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Does this part make sense? Is the choice clear?
          </Typography>

          {/* Reaction buttons */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
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

          {/* Comment field */}
          {needsComment && (
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                placeholder={
                  selectedReaction === PlaytestReaction.Confusing
                    ? "What's confusing about this scene?"
                    : 'What would you change?'
                }
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                variant="outlined"
                size="small"
              />

              {/* Audio recording */}
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
            {isLastNode ? 'Finish Playtest' : 'Next Scene'}
          </Button>
        </Box>
      )}
    </Box>
  )
}
