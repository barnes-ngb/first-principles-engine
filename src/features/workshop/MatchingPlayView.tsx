import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type {
  ActiveCardGameSession,
  CardGameCard,
  CardGameData,
  GeneratedArt,
  StoryPlayer,
  VoiceRecordingMap,
} from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'
import Confetti from './Confetti'
import { useAvatarProfiles } from './useAvatarProfiles'
import AvatarThumbnail from '../avatar/AvatarThumbnail'

export interface MatchingPlayResult {
  durationMinutes: number
  playerIds: string[]
  winner: string | null
}

interface MatchingPlayViewProps {
  cardGame: CardGameData
  gameId?: string
  familyId: string
  storyPlayers: StoryPlayer[]
  generatedArt?: GeneratedArt
  activeSession?: ActiveCardGameSession | null
  voiceRecordings?: VoiceRecordingMap
  onFinished: (result: MatchingPlayResult) => void
  onSaveSession: (session: ActiveCardGameSession) => void
}

interface PlayerScore {
  id: string
  name: string
  pairs: number
}

export default function MatchingPlayView({
  cardGame,
  familyId,
  storyPlayers,
  generatedArt,
  activeSession,
  onFinished,
  onSaveSession,
}: MatchingPlayViewProps) {
  const tts = useTTS()
  const avatarProfiles = useAvatarProfiles(familyId, storyPlayers)
  const startTime = useRef(Date.now())

  // Shuffle cards for the grid (each card appears once; pairs share category)
  const [shuffledCards, setShuffledCards] = useState<CardGameCard[]>([])
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set())
  const [firstFlip, setFirstFlip] = useState<string | null>(null)
  const [secondFlip, setSecondFlip] = useState<string | null>(null)
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [showChallenge, setShowChallenge] = useState<CardGameCard | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const players = storyPlayers

  // Initialize game
  useEffect(() => {
    if (activeSession && activeSession.status === 'playing') {
      // Resume from saved session
      const cards = [...cardGame.cards].sort(() => Math.random() - 0.5)
      setShuffledCards(cards)
      setMatchedIds(new Set(activeSession.matchedCardIds))
      setRevealedIds(new Set(activeSession.matchedCardIds))
      setCurrentPlayerIndex(activeSession.currentPlayerIndex)
      setScores(
        players.map((p) => ({
          id: p.id,
          name: p.name,
          pairs: activeSession.scores[p.id] ?? 0,
        })),
      )
    } else {
      // New game — shuffle all cards
      const cards = [...cardGame.cards].sort(() => Math.random() - 0.5)
      setShuffledCards(cards)
      setScores(players.map((p) => ({ id: p.id, name: p.name, pairs: 0 })))
      tts.speak(`Time to play! ${players[0].name} goes first. Flip two cards and find a match!`)
    }
    startTime.current = Date.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentPlayer = players[currentPlayerIndex]
  const cardBackUrl = generatedArt?.cardBack

  const getCardFaceUrl = useCallback(
    (card: CardGameCard): string | undefined => {
      if (!generatedArt?.cardFaces) return undefined
      // Try card-specific, then category, then generic
      return generatedArt.cardFaces[card.id]
        ?? (card.category ? generatedArt.cardFaces[card.category] : undefined)
        ?? generatedArt.cardFaces['generic']
    },
    [generatedArt],
  )

  const saveSession = useCallback(() => {
    const session: ActiveCardGameSession = {
      mechanic: 'matching',
      players: players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
      currentPlayerIndex,
      revealedCardIds: Array.from(revealedIds),
      matchedCardIds: Array.from(matchedIds),
      drawPile: [],
      playerHands: {},
      completedSets: {},
      wonCards: {},
      currentRound: 0,
      maxRounds: 0,
      scores: Object.fromEntries(scores.map((s) => [s.id, s.pairs])),
      status: 'playing',
      startedAt: activeSession?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    onSaveSession(session)
  }, [players, currentPlayerIndex, revealedIds, matchedIds, scores, activeSession, onSaveSession])

  const handleFlip = (cardId: string) => {
    // Ignore if already matched or currently revealed or processing
    if (matchedIds.has(cardId) || revealedIds.has(cardId) || secondFlip !== null) return

    if (firstFlip === null) {
      // First card flip
      setFirstFlip(cardId)
      setRevealedIds((prev) => new Set([...prev, cardId]))
    } else {
      // Second card flip
      setSecondFlip(cardId)
      setRevealedIds((prev) => new Set([...prev, cardId]))

      const card1 = shuffledCards.find((c) => c.id === firstFlip)
      const card2 = shuffledCards.find((c) => c.id === cardId)

      if (card1 && card2 && card1.category === card2.category && card1.id !== card2.id) {
        // Match found!
        const matchedCard = card1.learningElement ? card1 : card2.learningElement ? card2 : null
        if (matchedCard?.learningElement) {
          setShowChallenge(matchedCard)
        } else {
          confirmMatch(firstFlip, cardId)
        }
      } else {
        // No match — flip back after delay
        tts.speak("Not a match! Try again.")
        flipTimer.current = setTimeout(() => {
          setRevealedIds((prev) => {
            const next = new Set(prev)
            next.delete(firstFlip!)
            next.delete(cardId)
            return next
          })
          setFirstFlip(null)
          setSecondFlip(null)
          // Next player
          setCurrentPlayerIndex((prev) => (prev + 1) % players.length)
        }, 2000)
      }
    }
  }

  const confirmMatch = (id1: string, id2: string) => {
    const card1 = shuffledCards.find((c) => c.id === id1)
    const card2 = shuffledCards.find((c) => c.id === id2)
    tts.speak(`${currentPlayer.name} found a match! ${card1?.name ?? ''} and ${card2?.name ?? ''}!`)

    const newMatched = new Set([...matchedIds, id1, id2])
    setMatchedIds(newMatched)
    setScores((prev) =>
      prev.map((s) =>
        s.id === currentPlayer.id ? { ...s, pairs: s.pairs + 1 } : s,
      ),
    )
    setFirstFlip(null)
    setSecondFlip(null)

    // Check if game is over
    if (newMatched.size >= shuffledCards.length) {
      setTimeout(() => {
        setGameOver(true)
        const elapsed = Math.round((Date.now() - startTime.current) / 60000)
        const updatedScores = scores.map((s) =>
          s.id === currentPlayer.id ? { ...s, pairs: s.pairs + 1 } : s,
        )
        const winner = updatedScores.reduce((a, b) => (a.pairs >= b.pairs ? a : b))
        tts.speak(`Game over! ${winner.name} wins with ${winner.pairs} pairs!`)
        onFinished({
          durationMinutes: Math.max(elapsed, 1),
          playerIds: players.map((p) => p.id),
          winner: winner.id,
        })
      }, 500)
    } else {
      saveSession()
    }
  }

  const handleChallengeAnswer = () => {
    // Challenge answered (simplified — always accept)
    if (firstFlip && secondFlip) {
      confirmMatch(firstFlip, secondFlip)
    }
    setShowChallenge(null)
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flipTimer.current) clearTimeout(flipTimer.current)
    }
  }, [])

  const totalPairs = Math.floor(shuffledCards.length / 2)

  const handleExit = useCallback(() => {
    const elapsed = Math.max(Math.round((Date.now() - startTime.current) / 60000), 1)
    const best = scores.reduce((a, b) => (a.pairs >= b.pairs ? a : b), scores[0])
    onFinished({
      durationMinutes: elapsed,
      playerIds: players.map((p) => p.id),
      winner: best?.id ?? null,
    })
  }, [scores, players, onFinished])

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', position: 'relative' }}>
      {gameOver && <Confetti active />}

      {/* Exit button */}
      <IconButton
        onClick={() => setShowExitDialog(true)}
        size="medium"
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 20,
          bgcolor: 'rgba(255,255,255,0.9)',
          boxShadow: 2,
          '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
        }}
        aria-label="Exit game"
      >
        <ArrowBackIcon />
      </IconButton>

      {/* Exit confirmation dialog */}
      <Dialog open={showExitDialog} onClose={() => setShowExitDialog(false)}>
        <DialogTitle>Leave game?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your progress is saved. You can come back and continue later.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExitDialog(false)}>Keep Playing</Button>
          <Button onClick={handleExit} variant="contained">Leave Game</Button>
        </DialogActions>
      </Dialog>

      {/* Scoreboard */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
        {scores.map((s, i) => {
          const profile = avatarProfiles[s.id]
          const player = players.find((p) => p.id === s.id)
          return (
            <Box
              key={s.id}
              sx={{
                textAlign: 'center',
                p: 1,
                borderRadius: 2,
                border: '2px solid',
                borderColor: i === currentPlayerIndex ? 'primary.main' : 'divider',
                bgcolor: i === currentPlayerIndex ? 'primary.light' : 'background.paper',
                minWidth: 80,
              }}
            >
              {profile ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
                  <AvatarThumbnail
                    features={profile.characterFeatures}
                    ageGroup={profile.ageGroup ?? 'older'}
                    faceGrid={profile.faceGrid}
                    size={32}
                    showArmor={false}
                  />
                </Box>
              ) : player?.avatarUrl ? (
                <Box
                  component="img"
                  src={player.avatarUrl}
                  alt={s.name}
                  sx={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', mb: 0.5 }}
                />
              ) : null}
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {s.name}
              </Typography>
              <Typography variant="h6">{s.pairs}</Typography>
              <Typography variant="caption">pairs</Typography>
            </Box>
          )
        })}
      </Box>

      {/* Turn indicator */}
      {!gameOver && (
        <Typography
          variant="subtitle1"
          sx={{ textAlign: 'center', mb: 2, fontWeight: 600 }}
        >
          {currentPlayer.name}&apos;s turn — find a match!
        </Typography>
      )}

      {/* Card grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          mb: 2,
        }}
      >
        {shuffledCards.map((card) => {
          const isRevealed = revealedIds.has(card.id)
          const isMatched = matchedIds.has(card.id)
          const faceUrl = getCardFaceUrl(card)

          return (
            <Box
              key={card.id}
              onClick={() => !gameOver && handleFlip(card.id)}
              sx={{
                aspectRatio: '3 / 4',
                borderRadius: 2,
                border: '2px solid',
                borderColor: isMatched ? 'success.main' : isRevealed ? 'primary.main' : 'divider',
                bgcolor: isMatched
                  ? 'success.light'
                  : isRevealed
                    ? 'background.paper'
                    : 'primary.dark',
                cursor: isMatched || gameOver ? 'default' : 'pointer',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.3s, background-color 0.3s',
                transform: isRevealed ? 'rotateY(0deg)' : 'rotateY(0deg)',
                opacity: isMatched ? 0.6 : 1,
                '&:hover': !isMatched && !gameOver ? { transform: 'scale(1.05)' } : {},
                '&:active': !isMatched && !gameOver ? { transform: 'scale(0.95)' } : {},
              }}
            >
              {isRevealed || isMatched ? (
                // Card face
                faceUrl ? (
                  <Box
                    component="img"
                    src={faceUrl}
                    alt={card.name}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Box sx={{ textAlign: 'center', p: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem' }}>
                      {card.name}
                    </Typography>
                  </Box>
                )
              ) : (
                // Card back
                cardBackUrl ? (
                  <Box
                    component="img"
                    src={cardBackUrl}
                    alt="card"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Typography sx={{ fontSize: '1.5rem' }}>{'\uD83C\uDCC3'}</Typography>
                )
              )}
            </Box>
          )
        })}
      </Box>

      {/* Progress */}
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {matchedIds.size / 2} of {totalPairs} pairs found
      </Typography>

      {/* Learning challenge dialog */}
      <Dialog open={!!showChallenge} onClose={() => {}}>
        <DialogTitle>Challenge!</DialogTitle>
        <DialogContent>
          {showChallenge?.learningElement && (
            <>
              <Typography sx={{ mb: 1 }}>
                {showChallenge.learningElement.content}
              </Typography>
              {showChallenge.learningElement.options && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                  {showChallenge.learningElement.options.map((opt, i) => (
                    <Button
                      key={i}
                      variant="outlined"
                      onClick={handleChallengeAnswer}
                    >
                      {opt}
                    </Button>
                  ))}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        {!showChallenge?.learningElement?.options && (
          <DialogActions>
            <Button variant="contained" onClick={handleChallengeAnswer}>
              Got it!
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  )
}
