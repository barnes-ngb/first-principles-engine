import { useEffect, useMemo } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import type { AdventureTree, ChallengeCard, PlaytestFeedback } from '../../core/types'
import { PlaytestReaction } from '../../core/types/workshop'
import { useTTS } from '../../core/hooks/useTTS'
import { computeSummary } from './playtestUtils'

const REACTION_EMOJI: Record<string, string> = {
  good: '\uD83D\uDC4D',
  confusing: '\uD83E\uDD14',
  'too-hard': '\uD83D\uDE2C',
  'too-easy': '\uD83D\uDE34',
  change: '\uD83D\uDD04',
}

interface PlaytestSummaryViewProps {
  feedback: PlaytestFeedback[]
  cards: ChallengeCard[]
  /** Optional adventure tree — when provided, feedback items are looked up as nodes */
  adventureTree?: AdventureTree
  testerName: string
  gameTitle: string
  onSendToCreator: () => void
  onPlayAgain: () => void
  onBack: () => void
}

export default function PlaytestSummaryView({
  feedback,
  cards,
  adventureTree,
  testerName,
  gameTitle,
  onSendToCreator,
  onPlayAgain,
  onBack,
}: PlaytestSummaryViewProps) {
  const tts = useTTS()
  const summary = useMemo(() => computeSummary(feedback), [feedback])
  const flaggedFeedback = useMemo(
    () => feedback.filter((f) => f.reaction !== PlaytestReaction.Good),
    [feedback],
  )

  const flaggedCount = flaggedFeedback.length

  // Announce summary
  useEffect(() => {
    tts.speak(
      `Nice job testing! You found ${flaggedCount} ${flaggedCount === 1 ? 'thing' : 'things'} to look at. London can decide what to change.`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" sx={{ textAlign: 'center', fontWeight: 700, mb: 1 }}>
        Playtest Complete!
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
        {testerName} tested &ldquo;{gameTitle}&rdquo;
      </Typography>

      {/* Summary breakdown */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: 'center',
          mb: 3,
        }}
      >
        <Chip label={`${summary.totalCards} total`} variant="outlined" />
        {summary.good > 0 && <Chip label={`${summary.good} \uD83D\uDC4D`} color="success" variant="outlined" />}
        {summary.confusing > 0 && <Chip label={`${summary.confusing} \uD83E\uDD14`} color="warning" variant="outlined" />}
        {summary.tooHard > 0 && <Chip label={`${summary.tooHard} \uD83D\uDE2C`} color="error" variant="outlined" />}
        {summary.tooEasy > 0 && <Chip label={`${summary.tooEasy} \uD83D\uDE34`} color="info" variant="outlined" />}
        {summary.change > 0 && <Chip label={`${summary.change} \uD83D\uDD04`} color="secondary" variant="outlined" />}
      </Box>

      {/* Flagged cards list */}
      {flaggedFeedback.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            {adventureTree ? 'Scenes' : 'Cards'} to review ({flaggedFeedback.length}):
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
            {flaggedFeedback.map((fb) => {
              const card = cards.find((c) => c.id === fb.cardId)
              const adventureNode = adventureTree?.nodes[fb.cardId]
              const itemContent = card?.content ?? adventureNode?.text ?? fb.cardId
              return (
                <Box
                  key={fb.cardId}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Typography sx={{ fontSize: '1.3rem', lineHeight: 1 }}>
                      {REACTION_EMOJI[fb.reaction] ?? '?'}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {itemContent.length > 150 ? itemContent.slice(0, 150) + '...' : itemContent}
                      </Typography>
                      {fb.comment && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          &ldquo;{fb.comment}&rdquo;
                        </Typography>
                      )}
                      {fb.audioUrl && (
                        <Button
                          size="small"
                          startIcon={<PlayArrowIcon />}
                          onClick={() => {
                            const audio = new Audio(fb.audioUrl!)
                            audio.play().catch(() => {})
                          }}
                          sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          Play feedback
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </>
      )}

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="large"
          onClick={onSendToCreator}
          sx={{ py: 1.5, px: 4, fontWeight: 700, borderRadius: 3 }}
        >
          Send to London
        </Button>
        <Button variant="outlined" onClick={onPlayAgain}>
          Playtest Again
        </Button>
        <Button variant="text" onClick={onBack} color="inherit">
          Back
        </Button>
      </Box>
    </Box>
  )
}
