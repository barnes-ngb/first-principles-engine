import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import type { GeneratedGame } from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'
import { TurnPhase } from '../../core/types/workshop'
import GameBoard from './GameBoard'
import ChallengeCard from './ChallengeCard'
import DiceRoller from './DiceRoller'
import type { StoryPlayer } from '../../core/types'
import { useGameSession } from './useGameSession'
import type { Player } from './useGameSession'

export interface GamePlayResult {
  winner: string | null
  durationMinutes: number
  cardsEncountered: string[]
  playerIds: string[]
}

const PLAYER_COLORS = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00']

interface GamePlayViewProps {
  game: GeneratedGame
  gameId?: string
  storyPlayers?: StoryPlayer[]
  onFinished: (result: GamePlayResult) => void
}

export default function GamePlayView({ game, storyPlayers, onFinished }: GamePlayViewProps) {
  const session = useGameSession(game)
  const tts = useTTS()
  const [hasStarted, setHasStarted] = useState(false)
  const gameStartTime = useRef<number>(Date.now())

  // Start game on mount — use selected players from wizard if available
  useEffect(() => {
    if (!hasStarted) {
      const gamePlayers: Player[] | undefined = storyPlayers?.map((sp, i) => ({
        id: sp.id,
        name: sp.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        position: 0,
        avatarUrl: sp.avatarUrl,
      }))
      session.startGame(gamePlayers)
      setHasStarted(true)
      gameStartTime.current = Date.now()

      // Read rules and intro
      const texts: string[] = []
      if (game.storyIntro) texts.push(game.storyIntro)
      for (const rule of game.rules) {
        texts.push(rule.readAloudText)
      }
      if (texts.length > 0) {
        tts.speakQueue(texts)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRoll = useCallback(
    (value: number) => {
      session.roll(value)
    },
    [session],
  )

  const handleDismissCard = useCallback(() => {
    session.dismissCard()
  }, [session])

  const handleNextTurn = useCallback(() => {
    if (session.isGameOver) {
      tts.speak(
        `Game over! ${session.state.winner} reached the finish line first! Great game everyone!`,
      )
      const durationMinutes = Math.round((Date.now() - gameStartTime.current) / 60000)
      onFinished({
        winner: session.state.winner,
        durationMinutes: Math.max(durationMinutes, 1),
        cardsEncountered: session.state.cardsEncountered,
        playerIds: session.state.players.map((p) => p.id),
      })
      return
    }
    session.nextTurn()
  }, [session, tts, onFinished])

  // Announce current player's turn
  useEffect(() => {
    if (session.state.turnPhase === TurnPhase.Roll && session.currentPlayer && hasStarted) {
      tts.speak(`${session.currentPlayer.name}'s turn! Tap Roll!`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.currentPlayerIndex, session.state.turnPhase])

  // Announce board events on landing
  useEffect(() => {
    if (session.state.turnPhase === TurnPhase.Resolve && session.state.lastRoll && !session.isGameOver) {
      const player = session.currentPlayer
      if (!player) return
      const space = game.board.spaces[player.position]
      if (space?.type === 'bonus' && space.label) {
        tts.speak(space.label)
      } else if (space?.type === 'setback' && space.label) {
        tts.speak(space.label)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.turnPhase])

  const { state, currentPlayer, isGameOver } = session

  return (
    <Box>
      {/* Game title */}
      <Typography variant="h5" sx={{ textAlign: 'center', fontWeight: 700, mb: 1 }}>
        {game.title}
      </Typography>

      {/* Turn indicator */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 2, flexWrap: 'wrap' }}>
        {state.players.map((player, i) => (
          <Chip
            key={player.id}
            label={player.name}
            size="small"
            sx={{
              bgcolor: player.color,
              color: 'white',
              fontWeight: i === state.currentPlayerIndex ? 700 : 400,
              border: i === state.currentPlayerIndex ? '2px solid black' : 'none',
            }}
          />
        ))}
      </Box>

      {/* Board */}
      <GameBoard
        game={game}
        players={state.players.map((p) => ({
          name: p.name,
          color: p.color,
          position: p.position,
          avatarUrl: p.avatarUrl,
        }))}
        activeSpaceIndex={currentPlayer?.position}
      />

      {/* Controls */}
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        {state.turnPhase === TurnPhase.Roll && !isGameOver && (
          <>
            <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
              {currentPlayer?.name}&apos;s turn!
            </Typography>
            <DiceRoller onRoll={handleRoll} />
          </>
        )}

        {state.turnPhase === TurnPhase.Resolve && (
          <Box>
            {state.lastRoll && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Rolled a {state.lastRoll}!
              </Typography>
            )}
            {isGameOver ? (
              <Box>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                  {state.winner} wins!
                </Typography>
                <Button variant="contained" size="large" onClick={handleNextTurn}>
                  Finish Game
                </Button>
              </Box>
            ) : (
              <Button variant="contained" onClick={handleNextTurn}>
                Next Player
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Challenge card dialog */}
      <ChallengeCard
        card={state.currentCard}
        open={state.turnPhase === TurnPhase.Card && state.currentCard !== null}
        onClose={handleDismissCard}
      />
    </Box>
  )
}
