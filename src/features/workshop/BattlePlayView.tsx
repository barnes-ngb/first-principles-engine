import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
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

export interface BattlePlayResult {
  durationMinutes: number
  playerIds: string[]
  winner: string | null
}

interface BattlePlayViewProps {
  cardGame: CardGameData
  gameId?: string
  familyId: string
  storyPlayers: StoryPlayer[]
  generatedArt?: GeneratedArt
  activeSession?: ActiveCardGameSession | null
  voiceRecordings?: VoiceRecordingMap
  onFinished: (result: BattlePlayResult) => void
  onSaveSession: (session: ActiveCardGameSession) => void
}

interface RoundResult {
  playedCards: Record<string, CardGameCard>
  winnerId: string | null
  isTie: boolean
}

export default function BattlePlayView({
  cardGame,
  storyPlayers,
  generatedArt,
  activeSession,
  onFinished,
  onSaveSession,
}: BattlePlayViewProps) {
  const tts = useTTS()
  const startTime = useRef(Date.now())
  const players = storyPlayers
  const maxRounds = 15

  const [playerHands, setPlayerHands] = useState<Record<string, string[]>>({})
  const [wonCards, setWonCards] = useState<Record<string, string[]>>({})
  const [currentRound, setCurrentRound] = useState(1)
  const [roundPhase, setRoundPhase] = useState<'play' | 'reveal' | 'result'>('play')
  const [playedCards, setPlayedCards] = useState<Record<string, string>>({})
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [showChallenge, setShowChallenge] = useState<{ card: CardGameCard; playerId: string } | null>(null)
  const [challengeBonus, setChallengeBonus] = useState<Record<string, number>>({})
  const [gameOver, setGameOver] = useState(false)

  const getCardById = useCallback(
    (id: string) => cardGame.cards.find((c) => c.id === id),
    [cardGame.cards],
  )

  const getCardFaceUrl = useCallback(
    (card: CardGameCard): string | undefined => {
      if (!generatedArt?.cardFaces) return undefined
      return generatedArt.cardFaces[card.id] ?? generatedArt.cardFaces['generic']
    },
    [generatedArt],
  )

  // Initialize
  useEffect(() => {
    if (activeSession && activeSession.status === 'playing') {
      setPlayerHands(activeSession.playerHands)
      setWonCards(activeSession.wonCards)
      setCurrentRound(activeSession.currentRound)
    } else {
      // Deal cards evenly
      const shuffled = cardGame.cards.map((c) => c.id).sort(() => Math.random() - 0.5)
      const hands: Record<string, string[]> = {}
      const won: Record<string, string[]> = {}
      for (let i = 0; i < players.length; i++) {
        hands[players[i].id] = []
        won[players[i].id] = []
      }
      shuffled.forEach((cardId, index) => {
        const player = players[index % players.length]
        hands[player.id].push(cardId)
      })
      setPlayerHands(hands)
      setWonCards(won)
      tts.speak(`Battle time! Everyone plays a card. Highest power wins! Round 1!`)
    }
    startTime.current = Date.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveState = useCallback(() => {
    const session: ActiveCardGameSession = {
      mechanic: 'battle',
      players: players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
      currentPlayerIndex: 0,
      revealedCardIds: [],
      matchedCardIds: [],
      drawPile: [],
      playerHands,
      completedSets: {},
      wonCards,
      currentRound,
      maxRounds,
      scores: Object.fromEntries(
        players.map((p) => [p.id, wonCards[p.id]?.length ?? 0]),
      ),
      status: 'playing',
      startedAt: activeSession?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    onSaveSession(session)
  }, [players, playerHands, wonCards, currentRound, activeSession, onSaveSession])

  // Auto-play cards for all players (random selection for simplicity in pass-and-play)
  const handlePlayRound = () => {
    const played: Record<string, string> = {}
    const newHands = { ...playerHands }

    for (const p of players) {
      const hand = newHands[p.id] ?? []
      if (hand.length === 0) continue
      // Random card from hand
      const idx = Math.floor(Math.random() * hand.length)
      played[p.id] = hand[idx]
      newHands[p.id] = hand.filter((_, i) => i !== idx)
    }

    setPlayerHands(newHands)
    setPlayedCards(played)
    setRoundPhase('reveal')

    // Check for learning challenges on played cards
    for (const [playerId, cardId] of Object.entries(played)) {
      const card = getCardById(cardId)
      if (card?.learningElement) {
        setShowChallenge({ card, playerId })
        return // Handle one challenge at a time
      }
    }

    resolveRound(played, {})
  }

  const resolveRound = (played: Record<string, string>, bonuses: Record<string, number>) => {
    // Compare power values
    const results: Record<string, CardGameCard> = {}
    let maxPower = -1
    let winnerId: string | null = null
    let isTie = false

    for (const [playerId, cardId] of Object.entries(played)) {
      const card = getCardById(cardId)
      if (!card) continue
      results[playerId] = card
      const power = (card.value ?? 0) + (bonuses[playerId] ?? 0)
      if (power > maxPower) {
        maxPower = power
        winnerId = playerId
        isTie = false
      } else if (power === maxPower) {
        isTie = true
      }
    }

    const result: RoundResult = { playedCards: results, winnerId: isTie ? null : winnerId, isTie }
    setRoundResult(result)
    setRoundPhase('result')

    if (isTie) {
      tts.speak("It's a tie! War!")
    } else {
      const winnerName = players.find((p) => p.id === winnerId)?.name ?? 'Someone'
      const winCard = winnerId ? results[winnerId] : null
      tts.speak(`${winnerName} wins with ${winCard?.name ?? 'a card'}, power ${(winCard?.value ?? 0) + (bonuses[winnerId ?? ''] ?? 0)}!`)
    }

    // Award cards to winner
    if (!isTie && winnerId) {
      const allPlayed = Object.values(played)
      setWonCards((prev) => ({
        ...prev,
        [winnerId]: [...(prev[winnerId] ?? []), ...allPlayed],
      }))
    }
  }

  const handleChallengeAnswer = () => {
    // Grant +2 bonus
    const bonus = { ...challengeBonus }
    if (showChallenge) {
      bonus[showChallenge.playerId] = (bonus[showChallenge.playerId] ?? 0) + 2
    }
    setChallengeBonus(bonus)
    setShowChallenge(null)

    // Check if more challenges
    for (const [playerId, cardId] of Object.entries(playedCards)) {
      if (bonus[playerId] !== undefined && playerId === showChallenge?.playerId) continue
      const card = getCardById(cardId)
      if (card?.learningElement && !bonus[playerId]) {
        setShowChallenge({ card, playerId })
        return
      }
    }

    resolveRound(playedCards, bonus)
  }

  const handleNextRound = () => {
    const nextRound = currentRound + 1
    setChallengeBonus({})
    setPlayedCards({})
    setRoundResult(null)
    setRoundPhase('play')

    // Check game end conditions
    const hasCards = players.some((p) => (playerHands[p.id]?.length ?? 0) > 0)
    if (!hasCards || nextRound > maxRounds) {
      setGameOver(true)
      const elapsed = Math.round((Date.now() - startTime.current) / 60000)
      const winner = players.reduce((best, p) =>
        (wonCards[p.id]?.length ?? 0) >= (wonCards[best.id]?.length ?? 0) ? p : best,
      )
      tts.speak(`Game over! ${winner.name} wins with ${wonCards[winner.id]?.length ?? 0} cards!`)
      onFinished({
        durationMinutes: Math.max(elapsed, 1),
        playerIds: players.map((p) => p.id),
        winner: winner.id,
      })
    } else {
      setCurrentRound(nextRound)
      tts.speak(`Round ${nextRound}!`)
      saveState()
    }
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      {gameOver && <Confetti active />}

      {/* Scoreboard */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
        {players.map((p) => (
          <Box
            key={p.id}
            sx={{
              textAlign: 'center',
              p: 1,
              borderRadius: 2,
              border: '2px solid',
              borderColor: roundResult?.winnerId === p.id ? 'success.main' : 'divider',
              bgcolor: roundResult?.winnerId === p.id ? 'success.light' : 'background.paper',
              minWidth: 80,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {p.name}
            </Typography>
            <Typography variant="h6">{wonCards[p.id]?.length ?? 0}</Typography>
            <Typography variant="caption">cards won</Typography>
            <Typography variant="caption" display="block" color="text.secondary">
              {playerHands[p.id]?.length ?? 0} in hand
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Round indicator */}
      <Typography
        variant="subtitle1"
        sx={{ textAlign: 'center', mb: 2, fontWeight: 600 }}
      >
        Round {currentRound} of {maxRounds}
      </Typography>

      {/* Play phase */}
      {roundPhase === 'play' && !gameOver && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Everyone plays a card!
          </Typography>
          <Button variant="contained" size="large" onClick={handlePlayRound}>
            Play Cards!
          </Button>
        </Box>
      )}

      {/* Reveal / Result phase */}
      {(roundPhase === 'reveal' || roundPhase === 'result') && roundResult && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
            {Object.entries(roundResult.playedCards).map(([playerId, card]) => {
              const player = players.find((p) => p.id === playerId)
              const faceUrl = getCardFaceUrl(card)
              const isWinner = roundResult.winnerId === playerId
              const bonus = challengeBonus[playerId] ?? 0

              return (
                <Box
                  key={playerId}
                  sx={{
                    textAlign: 'center',
                    p: 1.5,
                    borderRadius: 2,
                    border: '3px solid',
                    borderColor: isWinner ? 'success.main' : 'divider',
                    bgcolor: isWinner ? 'success.light' : 'background.paper',
                    width: 140,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {player?.name}
                  </Typography>
                  {faceUrl ? (
                    <Box
                      component="img"
                      src={faceUrl}
                      alt={card.name}
                      sx={{
                        width: '100%',
                        height: 100,
                        objectFit: 'cover',
                        borderRadius: 1,
                        my: 0.5,
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: '100%',
                        height: 100,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        my: 0.5,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center' }}>
                        {card.name}
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Power: {(card.value ?? 0) + bonus}
                    {bonus > 0 && (
                      <Typography component="span" color="success.main">
                        {' '}(+{bonus})
                      </Typography>
                    )}
                  </Typography>
                  {card.specialAbility && (
                    <Typography variant="caption" color="secondary.main" sx={{ fontStyle: 'italic' }}>
                      {card.specialAbility}
                    </Typography>
                  )}
                </Box>
              )
            })}
          </Box>

          {roundResult.isTie && (
            <Typography
              variant="h6"
              color="warning.main"
              sx={{ textAlign: 'center', fontWeight: 700, mb: 1 }}
            >
              War! It&apos;s a tie!
            </Typography>
          )}

          {roundPhase === 'result' && (
            <Box sx={{ textAlign: 'center' }}>
              <Button variant="contained" onClick={handleNextRound}>
                {currentRound >= maxRounds ? 'See Results' : 'Next Round'}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Learning challenge dialog */}
      <Dialog open={!!showChallenge} onClose={() => {}}>
        <DialogTitle>
          Challenge for {players.find((p) => p.id === showChallenge?.playerId)?.name}!
        </DialogTitle>
        <DialogContent>
          {showChallenge?.card.learningElement && (
            <>
              <Typography sx={{ mb: 1 }}>
                {showChallenge.card.learningElement.content}
              </Typography>
              <Typography variant="body2" color="success.main">
                Answer correctly for +2 power bonus!
              </Typography>
              {showChallenge.card.learningElement.options && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                  {showChallenge.card.learningElement.options.map((opt, i) => (
                    <Button key={i} variant="outlined" onClick={handleChallengeAnswer}>
                      {opt}
                    </Button>
                  ))}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        {!showChallenge?.card.learningElement?.options && (
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
