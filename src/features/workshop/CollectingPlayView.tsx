import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
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

export interface CollectingPlayResult {
  durationMinutes: number
  playerIds: string[]
  winner: string | null
}

interface CollectingPlayViewProps {
  cardGame: CardGameData
  gameId?: string
  familyId: string
  storyPlayers: StoryPlayer[]
  generatedArt?: GeneratedArt
  activeSession?: ActiveCardGameSession | null
  voiceRecordings?: VoiceRecordingMap
  onFinished: (result: CollectingPlayResult) => void
  onSaveSession: (session: ActiveCardGameSession) => void
}

export default function CollectingPlayView({
  cardGame,
  storyPlayers,
  activeSession,
  onFinished,
  onSaveSession,
}: CollectingPlayViewProps) {
  const tts = useTTS()
  const startTime = useRef(Date.now())
  const players = storyPlayers

  const [drawPile, setDrawPile] = useState<string[]>([])
  const [playerHands, setPlayerHands] = useState<Record<string, string[]>>({})
  const [completedSets, setCompletedSets] = useState<Record<string, string[][]>>({})
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [showAskDialog, setShowAskDialog] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showChallenge, setShowChallenge] = useState<CardGameCard | null>(null)
  const [gameOver, setGameOver] = useState(false)

  // Get all unique categories (sets)
  const categories = useMemo(
    () => [...new Set(cardGame.cards.map((c) => c.category).filter(Boolean))] as string[],
    [cardGame.cards],
  )

  const getCardById = useCallback(
    (id: string) => cardGame.cards.find((c) => c.id === id),
    [cardGame.cards],
  )

  // Initialize game
  useEffect(() => {
    if (activeSession && activeSession.status === 'playing') {
      setDrawPile(activeSession.drawPile)
      setPlayerHands(activeSession.playerHands)
      setCompletedSets(activeSession.completedSets)
      setCurrentPlayerIndex(activeSession.currentPlayerIndex)
    } else {
      // Deal cards
      const shuffled = cardGame.cards.map((c) => c.id).sort(() => Math.random() - 0.5)
      const cardsPerPlayer = Math.min(5, Math.floor(shuffled.length / players.length))
      const hands: Record<string, string[]> = {}
      let dealt = 0
      for (const p of players) {
        hands[p.id] = shuffled.slice(dealt, dealt + cardsPerPlayer)
        dealt += cardsPerPlayer
      }
      setPlayerHands(hands)
      setDrawPile(shuffled.slice(dealt))
      setCompletedSets(Object.fromEntries(players.map((p) => [p.id, []])))
      tts.speak(`Time to play! ${players[0].name} goes first. Try to collect complete sets!`)
    }
    startTime.current = Date.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentPlayer = players[currentPlayerIndex]

  const checkForSets = useCallback(
    (_playerId: string, hand: string[]) => {
      const newSets: string[][] = []
      const remaining = [...hand]

      for (const cat of categories) {
        const catCards = remaining.filter((id) => getCardById(id)?.category === cat)
        // Need all cards of this category to complete a set
        const totalInCat = cardGame.cards.filter((c) => c.category === cat).length
        if (catCards.length >= totalInCat && totalInCat > 0) {
          newSets.push(catCards)
          for (const id of catCards) {
            const idx = remaining.indexOf(id)
            if (idx >= 0) remaining.splice(idx, 1)
          }
        }
      }

      return { newSets, remaining }
    },
    [categories, cardGame.cards, getCardById],
  )

  const saveState = useCallback(() => {
    const session: ActiveCardGameSession = {
      mechanic: 'collecting',
      players: players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
      currentPlayerIndex,
      revealedCardIds: [],
      matchedCardIds: [],
      drawPile,
      playerHands,
      completedSets,
      wonCards: {},
      currentRound: 0,
      maxRounds: 0,
      scores: Object.fromEntries(
        players.map((p) => [p.id, completedSets[p.id]?.length ?? 0]),
      ),
      status: 'playing',
      startedAt: activeSession?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    onSaveSession(session)
  }, [players, currentPlayerIndex, drawPile, playerHands, completedSets, activeSession, onSaveSession])

  const endTurn = useCallback(() => {
    setCurrentPlayerIndex((prev) => (prev + 1) % players.length)
    saveState()
  }, [players.length, saveState])

  const checkGameEnd = useCallback(() => {
    const allSetsCollected = categories.every((cat) => {
      return Object.values(completedSets).some((sets) =>
        sets.some((set) => set.some((id) => getCardById(id)?.category === cat)),
      )
    })
    const noCardsLeft = drawPile.length === 0 &&
      Object.values(playerHands).every((h) => h.length === 0)

    if (allSetsCollected || noCardsLeft) {
      setGameOver(true)
      const elapsed = Math.round((Date.now() - startTime.current) / 60000)
      const winner = players.reduce((best, p) =>
        (completedSets[p.id]?.length ?? 0) >= (completedSets[best.id]?.length ?? 0) ? p : best,
      )
      tts.speak(`Game over! ${winner.name} wins with ${completedSets[winner.id]?.length ?? 0} sets!`)
      onFinished({
        durationMinutes: Math.max(elapsed, 1),
        playerIds: players.map((p) => p.id),
        winner: winner.id,
      })
      return true
    }
    return false
  }, [categories, completedSets, drawPile, playerHands, getCardById, players, tts, onFinished])

  const handleDraw = () => {
    if (drawPile.length === 0) return
    const [drawn, ...rest] = drawPile
    const drawnCard = getCardById(drawn)

    // Check for learning element
    if (drawnCard?.learningElement) {
      setShowChallenge(drawnCard)
    }

    const newHand = [...(playerHands[currentPlayer.id] ?? []), drawn]
    const { newSets, remaining } = checkForSets(currentPlayer.id, newHand)

    setDrawPile(rest)
    setPlayerHands((prev) => ({ ...prev, [currentPlayer.id]: remaining }))

    if (newSets.length > 0) {
      setCompletedSets((prev) => ({
        ...prev,
        [currentPlayer.id]: [...(prev[currentPlayer.id] ?? []), ...newSets],
      }))
      tts.speak(`${currentPlayer.name} completed a set! Amazing!`)
    }

    setTimeout(() => {
      if (!checkGameEnd()) endTurn()
    }, 500)
  }

  const handleAsk = () => {
    if (!selectedTarget || !selectedCategory) return
    const targetHand = playerHands[selectedTarget] ?? []
    const matchingCards = targetHand.filter((id) => getCardById(id)?.category === selectedCategory)

    if (matchingCards.length > 0) {
      // Got cards!
      tts.speak(`Yes! Got ${matchingCards.length} cards!`)
      const newTargetHand = targetHand.filter((id) => !matchingCards.includes(id))
      const newHand = [...(playerHands[currentPlayer.id] ?? []), ...matchingCards]
      const { newSets, remaining } = checkForSets(currentPlayer.id, newHand)

      setPlayerHands((prev) => ({
        ...prev,
        [selectedTarget]: newTargetHand,
        [currentPlayer.id]: remaining,
      }))

      if (newSets.length > 0) {
        setCompletedSets((prev) => ({
          ...prev,
          [currentPlayer.id]: [...(prev[currentPlayer.id] ?? []), ...newSets],
        }))
        tts.speak(`${currentPlayer.name} completed a set!`)
      }
    } else {
      // Go Fish!
      tts.speak("Go Fish! Draw a card.")
      if (drawPile.length > 0) {
        const [drawn, ...rest] = drawPile
        const newHand = [...(playerHands[currentPlayer.id] ?? []), drawn]
        const { newSets, remaining } = checkForSets(currentPlayer.id, newHand)
        setDrawPile(rest)
        setPlayerHands((prev) => ({ ...prev, [currentPlayer.id]: remaining }))
        if (newSets.length > 0) {
          setCompletedSets((prev) => ({
            ...prev,
            [currentPlayer.id]: [...(prev[currentPlayer.id] ?? []), ...newSets],
          }))
        }
      }
    }

    setShowAskDialog(false)
    setSelectedTarget(null)
    setSelectedCategory(null)
    setTimeout(() => {
      if (!checkGameEnd()) endTurn()
    }, 500)
  }

  const myHand = playerHands[currentPlayer?.id] ?? []
  const myCategories = [...new Set(myHand.map((id) => getCardById(id)?.category).filter(Boolean))]

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      {gameOver && <Confetti active />}

      {/* Scoreboard */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
        {players.map((p, i) => (
          <Box
            key={p.id}
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
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {p.name}
            </Typography>
            <Typography variant="h6">{completedSets[p.id]?.length ?? 0}</Typography>
            <Typography variant="caption">sets</Typography>
          </Box>
        ))}
      </Box>

      {/* Turn indicator */}
      {!gameOver && (
        <Typography
          variant="subtitle1"
          sx={{ textAlign: 'center', mb: 2, fontWeight: 600 }}
        >
          {currentPlayer?.name}&apos;s turn
        </Typography>
      )}

      {/* Current player's hand */}
      {!gameOver && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Your hand ({myHand.length} cards):
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {myHand.map((id) => {
              const card = getCardById(id)
              return (
                <Chip
                  key={id}
                  label={card?.name ?? id}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )
            })}
          </Box>
        </Box>
      )}

      {/* Actions */}
      {!gameOver && (
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2 }}>
          <Button
            variant="contained"
            onClick={handleDraw}
            disabled={drawPile.length === 0}
          >
            Draw Card ({drawPile.length} left)
          </Button>
          <Button
            variant="outlined"
            onClick={() => setShowAskDialog(true)}
            disabled={myHand.length === 0}
          >
            Ask for a Card
          </Button>
        </Box>
      )}

      {/* Completed sets display */}
      {Object.entries(completedSets).some(([, sets]) => sets.length > 0) && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Completed sets:
          </Typography>
          {players.map((p) => {
            const sets = completedSets[p.id] ?? []
            if (sets.length === 0) return null
            return (
              <Box key={p.id} sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {p.name}:
                </Typography>
                {sets.map((set, i) => {
                  const cat = getCardById(set[0])?.category
                  return (
                    <Chip
                      key={i}
                      label={`${cat ?? 'Set'} (${set.length})`}
                      size="small"
                      color="success"
                      sx={{ ml: 0.5 }}
                    />
                  )
                })}
              </Box>
            )
          })}
        </Box>
      )}

      {/* Ask dialog */}
      <Dialog open={showAskDialog} onClose={() => setShowAskDialog(false)}>
        <DialogTitle>Ask for a card</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Pick a player and a type of card to ask for:
          </Typography>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Ask who?
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
            {players
              .filter((p) => p.id !== currentPlayer?.id)
              .map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  onClick={() => setSelectedTarget(p.id)}
                  color={selectedTarget === p.id ? 'primary' : 'default'}
                  variant={selectedTarget === p.id ? 'filled' : 'outlined'}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Ask for what?
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {myCategories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                onClick={() => setSelectedCategory(cat as string)}
                color={selectedCategory === cat ? 'primary' : 'default'}
                variant={selectedCategory === cat ? 'filled' : 'outlined'}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAskDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAsk}
            disabled={!selectedTarget || !selectedCategory}
          >
            Ask!
          </Button>
        </DialogActions>
      </Dialog>

      {/* Learning challenge dialog */}
      <Dialog open={!!showChallenge} onClose={() => setShowChallenge(null)}>
        <DialogTitle>Challenge!</DialogTitle>
        <DialogContent>
          {showChallenge?.learningElement && (
            <Typography>{showChallenge.learningElement.content}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setShowChallenge(null)}>
            Got it!
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
