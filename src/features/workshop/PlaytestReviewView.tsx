import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EditIcon from '@mui/icons-material/Edit'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import type { ChallengeCard, PlaytestFeedback, PlaytestSession, StoryGame } from '../../core/types'
import { PlaytestReaction } from '../../core/types/workshop'
import type { CardRevision } from '../../core/types/workshop'
import { useAI, TaskType } from '../../core/ai/useAI'

const REACTION_EMOJI: Record<string, string> = {
  good: '\uD83D\uDC4D',
  confusing: '\uD83E\uDD14',
  'too-hard': '\uD83D\uDE2C',
  'too-easy': '\uD83D\uDE34',
  change: '\uD83D\uDD04',
}

interface PlaytestReviewViewProps {
  game: StoryGame
  playtestSession: PlaytestSession
  familyId: string
  childId: string
  onSaveRevisions: (
    updatedCards: ChallengeCard[],
    revisions: CardRevision[],
    playtestId: string,
  ) => Promise<void>
  onRequestRetest: () => void
  onBack: () => void
}

interface CardReviewState {
  status: 'pending' | 'fixing' | 'kept' | 'fixed'
  newContent?: string
}

export default function PlaytestReviewView({
  game,
  playtestSession,
  familyId,
  childId,
  onSaveRevisions,
  onRequestRetest,
  onBack,
}: PlaytestReviewViewProps) {
  const generatedGame = game.generatedGame!
  const flaggedFeedback = playtestSession.feedback.filter(
    (f) => f.reaction !== PlaytestReaction.Good,
  )

  const [reviewStates, setReviewStates] = useState<Record<string, CardReviewState>>(() => {
    const states: Record<string, CardReviewState> = {}
    for (const fb of flaggedFeedback) {
      states[fb.cardId] = { status: 'pending' }
    }
    return states
  })

  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [aiFixingCardId, setAiFixingCardId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { chat } = useAI()

  const allReviewed = flaggedFeedback.every(
    (fb) => reviewStates[fb.cardId]?.status === 'kept' || reviewStates[fb.cardId]?.status === 'fixed',
  )

  const handleKeepIt = useCallback((cardId: string) => {
    setReviewStates((prev) => ({
      ...prev,
      [cardId]: { status: 'kept' },
    }))
  }, [])

  const handleStartEdit = useCallback(
    (cardId: string) => {
      const card = generatedGame.challengeCards.find((c) => c.id === cardId)
      setEditingCardId(cardId)
      setEditContent(card?.content ?? '')
    },
    [generatedGame],
  )

  const handleSaveEdit = useCallback(() => {
    if (!editingCardId) return
    setReviewStates((prev) => ({
      ...prev,
      [editingCardId]: { status: 'fixed', newContent: editContent },
    }))
    setEditingCardId(null)
    setEditContent('')
  }, [editingCardId, editContent])

  const handleAiFix = useCallback(
    async (cardId: string, feedback: PlaytestFeedback) => {
      const card = generatedGame.challengeCards.find((c) => c.id === cardId)
      if (!card || !familyId) return

      setAiFixingCardId(cardId)
      try {
        const response = await chat({
          familyId,
          childId,
          taskType: TaskType.Workshop,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                action: 'fix-card',
                card: {
                  id: card.id,
                  type: card.type,
                  content: card.content,
                  difficulty: card.difficulty,
                },
                feedback: {
                  reaction: feedback.reaction,
                  comment: feedback.comment,
                },
                theme: game.storyInputs.theme,
              }),
            },
          ],
        })

        if (response?.message) {
          // Try to extract revised card content from response
          let revisedContent = response.message
          // Check for JSON response with revisedCard
          try {
            const parsed = JSON.parse(response.message)
            if (parsed.content) revisedContent = parsed.content
            else if (parsed.revisedCard?.content) revisedContent = parsed.revisedCard.content
          } catch {
            // Try to extract from <card> tags
            const match = response.message.match(/<card>([\s\S]*?)<\/card>/)
            if (match) {
              try {
                const parsed = JSON.parse(match[1])
                revisedContent = parsed.content ?? match[1]
              } catch {
                revisedContent = match[1].trim()
              }
            }
          }

          setReviewStates((prev) => ({
            ...prev,
            [cardId]: { status: 'fixed', newContent: revisedContent },
          }))
        }
      } catch (err) {
        console.warn('AI card fix failed:', err)
      } finally {
        setAiFixingCardId(null)
      }
    },
    [generatedGame, familyId, childId, chat, game.storyInputs.theme],
  )

  const handleSaveAllRevisions = useCallback(async () => {
    setSaving(true)
    try {
      const revisions: CardRevision[] = []
      const updatedCards = generatedGame.challengeCards.map((card) => {
        const state = reviewStates[card.id]
        if (state?.status === 'fixed' && state.newContent) {
          const feedback = flaggedFeedback.find((f) => f.cardId === card.id)
          revisions.push({
            cardId: card.id,
            oldContent: card.content,
            newContent: state.newContent,
            reason: feedback?.comment ?? feedback?.reaction ?? 'playtest feedback',
          })
          return {
            ...card,
            content: state.newContent,
            readAloudText: state.newContent,
          }
        }
        return card
      })

      await onSaveRevisions(updatedCards, revisions, playtestSession.id)
    } finally {
      setSaving(false)
    }
  }, [generatedGame, reviewStates, flaggedFeedback, onSaveRevisions, playtestSession.id])

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" sx={{ textAlign: 'center', fontWeight: 700, mb: 1 }}>
        Playtest Results
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mb: 0.5 }}>
        {playtestSession.testerName} tested your game!
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', mb: 3 }}>
        <Chip label={`${playtestSession.summary.totalCards} cards`} size="small" variant="outlined" />
        {playtestSession.summary.good > 0 && (
          <Chip label={`${playtestSession.summary.good} \uD83D\uDC4D`} size="small" color="success" variant="outlined" />
        )}
        <Chip
          label={`${flaggedFeedback.length} to review`}
          size="small"
          color={flaggedFeedback.length > 0 ? 'warning' : 'success'}
          variant="outlined"
        />
      </Box>

      {flaggedFeedback.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            All cards passed!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {playtestSession.testerName} thought everything made sense.
          </Typography>
          <Button variant="contained" onClick={onBack}>
            Back to Workshop
          </Button>
        </Box>
      )}

      {/* Flagged cards for review */}
      {flaggedFeedback.map((fb) => {
        const card = generatedGame.challengeCards.find((c) => c.id === fb.cardId)
        const state = reviewStates[fb.cardId]
        const isEditing = editingCardId === fb.cardId
        const isAiFix = aiFixingCardId === fb.cardId

        return (
          <Box
            key={fb.cardId}
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor:
                state?.status === 'fixed'
                  ? 'success.light'
                  : state?.status === 'kept'
                    ? 'grey.300'
                    : 'warning.light',
              bgcolor:
                state?.status === 'fixed'
                  ? 'success.50'
                  : state?.status === 'kept'
                    ? 'grey.50'
                    : 'background.paper',
            }}
          >
            {/* Card header */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
              <Typography sx={{ fontSize: '1.3rem', lineHeight: 1 }}>
                {REACTION_EMOJI[fb.reaction] ?? '?'}
              </Typography>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {state?.status === 'fixed' && state.newContent
                    ? state.newContent
                    : card?.content ?? fb.cardId}
                </Typography>
                {state?.status === 'fixed' && state.newContent && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textDecoration: 'line-through', display: 'block', mt: 0.5 }}
                  >
                    Was: {card?.content}
                  </Typography>
                )}
              </Box>
              {(state?.status === 'fixed' || state?.status === 'kept') && (
                <CheckCircleIcon
                  color={state.status === 'fixed' ? 'success' : 'disabled'}
                  fontSize="small"
                />
              )}
            </Box>

            {/* Tester's feedback */}
            {fb.comment && (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                {playtestSession.testerName}: &ldquo;{fb.comment}&rdquo;
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
                sx={{ ml: 3, mb: 1, textTransform: 'none', fontSize: '0.75rem' }}
              >
                Hear feedback
              </Button>
            )}

            {/* Edit inline */}
            {isEditing && (
              <Box sx={{ ml: 4, mt: 1 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  size="small"
                  sx={{ mb: 1 }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" variant="contained" onClick={handleSaveEdit}>
                    Save
                  </Button>
                  <Button size="small" onClick={() => setEditingCardId(null)}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}

            {/* Action buttons (only if pending) */}
            {state?.status === 'pending' && !isEditing && (
              <Box sx={{ display: 'flex', gap: 1, ml: 4, mt: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<EditIcon />}
                  onClick={() => handleStartEdit(fb.cardId)}
                >
                  Fix It
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={isAiFix ? <CircularProgress size={14} /> : <AutoFixHighIcon />}
                  onClick={() => handleAiFix(fb.cardId, fb)}
                  disabled={isAiFix}
                >
                  {isAiFix ? 'Fixing...' : 'Ask AI to fix'}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => handleKeepIt(fb.cardId)}
                >
                  Keep It
                </Button>
              </Box>
            )}
          </Box>
        )
      })}

      {/* Bottom actions */}
      {flaggedFeedback.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              onClick={handleSaveAllRevisions}
              disabled={!allReviewed || saving}
              sx={{ py: 1.5, px: 4, fontWeight: 700, borderRadius: 3 }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outlined" onClick={onRequestRetest}>
              Ask {playtestSession.testerName} to test again
            </Button>
            <Button variant="text" onClick={onBack} color="inherit">
              Back
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}
