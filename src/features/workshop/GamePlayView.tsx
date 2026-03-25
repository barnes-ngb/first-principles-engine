import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { doc, updateDoc } from 'firebase/firestore'
import { stripUndefined } from '../../core/firebase/firestore'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import type { ActiveSession, GeneratedArt, GeneratedGame, VoiceRecordingMap } from '../../core/types'
import { db } from '../../core/firebase/firestore'
import { useTTS } from '../../core/hooks/useTTS'
import { TurnPhase } from '../../core/types/workshop'
import GameBoard from './GameBoard'
import ChallengeCard from './ChallengeCard'
import Confetti from './Confetti'
import DiceRoller from './DiceRoller'
import type { StoryPlayer } from '../../core/types'
import { useGameSession } from './useGameSession'
import type { Player } from './useGameSession'
import { useGameSounds } from './useGameSounds'

export interface GamePlayResult {
  winner: string | null
  durationMinutes: number
  cardsEncountered: string[]
  playerIds: string[]
}

const PLAYER_COLORS = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00']

/** Milliseconds per space during movement animation */
const MOVE_STEP_MS = 250

interface GamePlayViewProps {
  game: GeneratedGame
  gameId?: string
  familyId: string
  storyPlayers?: StoryPlayer[]
  generatedArt?: GeneratedArt
  activeSession?: ActiveSession | null
  voiceRecordings?: VoiceRecordingMap
  onFinished: (result: GamePlayResult) => void
}

export default function GamePlayView({
  game,
  gameId,
  familyId,
  storyPlayers,
  generatedArt,
  activeSession,
  voiceRecordings,
  onFinished,
}: GamePlayViewProps) {
  const session = useGameSession(game)
  const tts = useTTS()
  const sounds = useGameSounds()
  const [hasStarted, setHasStarted] = useState(false)
  const gameStartTime = useRef<number>(Date.now())

  // Animation state
  const [animatingPosition, setAnimatingPosition] = useState<number | null>(null)
  const [landingSpaceIndex, setLandingSpaceIndex] = useState<number | null>(null)
  const [spaceAnimation, setSpaceAnimation] = useState<{ index: number; type: 'bonus' | 'setback' | 'shortcut' } | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showSmallConfetti, setShowSmallConfetti] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [showFinalCelebration, setShowFinalCelebration] = useState(false)
  const [turnTransition, setTurnTransition] = useState(false)

  // Save activeSession to Firestore after each turn
  const saveActiveSession = useCallback(
    async (sessionData: ActiveSession) => {
      if (!gameId || !familyId) return
      try {
        await updateDoc(
          doc(db, `families/${familyId}/storyGames/${gameId}`),
          stripUndefined({ activeSession: sessionData, updatedAt: new Date().toISOString() }),
        )
      } catch (err) {
        console.warn('Failed to save active session:', err)
      }
    },
    [gameId, familyId],
  )

  const buildActiveSessionData = useCallback((): ActiveSession => ({
    players: session.state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      position: p.position,
    })),
    currentTurnIndex: session.state.currentPlayerIndex,
    usedCardIds: session.state.cardsEncountered,
    status: session.state.winner ? 'finished' : 'playing',
    startedAt: session.state.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), [session.state])

  // Start game on mount — restore from activeSession if available, otherwise use wizard players
  useEffect(() => {
    if (!hasStarted) {
      if (activeSession?.status === 'playing') {
        // Restore from saved session
        const restoredPlayers: Player[] = activeSession.players.map((sp, i) => ({
          id: sp.id,
          name: sp.name,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length],
          position: sp.position,
          avatarUrl: sp.avatarUrl,
        }))
        session.restore(
          restoredPlayers,
          activeSession.currentTurnIndex,
          activeSession.usedCardIds,
        )
        gameStartTime.current = new Date(activeSession.startedAt).getTime()
      } else {
        // Fresh game — use selected players from wizard
        const gamePlayers: Player[] | undefined = storyPlayers?.map((sp, i) => ({
          id: sp.id,
          name: sp.name,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length],
          position: 0,
          avatarUrl: sp.avatarUrl || generatedArt?.parentTokens?.[sp.id],
        }))
        session.startGame(gamePlayers)
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
      setHasStarted(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Movement animation ──────────────────────────────────────────
  useEffect(() => {
    if (
      session.state.turnPhase !== TurnPhase.Move ||
      session.state.previousPosition === null ||
      session.state.targetPosition === null
    ) {
      return
    }

    const from = session.state.previousPosition
    const to = session.state.targetPosition
    const steps = to - from

    if (steps <= 0) {
      // No movement needed
      session.moveComplete()
      return
    }

    let step = 0
    setAnimatingPosition(from)

    const interval = setInterval(() => {
      step++
      const currentPos = from + step
      setAnimatingPosition(currentPos)
      sounds.playTokenStep()

      if (step >= steps) {
        clearInterval(interval)
        // Landing effect
        setLandingSpaceIndex(to)
        setTimeout(() => setLandingSpaceIndex(null), 600)

        // Check space type for special effects
        const space = game.board.spaces[to]
        if (space) {
          if (space.type === 'bonus') {
            sounds.playBonusMove()
            setSpaceAnimation({ index: to, type: 'bonus' })
            setTimeout(() => setSpaceAnimation(null), 1000)
          } else if (space.type === 'setback') {
            sounds.playSetbackSlide()
            setSpaceAnimation({ index: to, type: 'setback' })
            setTimeout(() => setSpaceAnimation(null), 800)
          } else if (space.type === 'special') {
            sounds.playShortcutSparkle()
            setSpaceAnimation({ index: to, type: 'shortcut' })
            setTimeout(() => setSpaceAnimation(null), 1000)
          } else if (space.challengeCardId) {
            sounds.playChallengeChime()
          }
        }

        // Pause briefly before resolving (let landing effect play)
        const delay = space?.challengeCardId ? 600 : 300
        setTimeout(() => {
          setAnimatingPosition(null)
          session.moveComplete()
        }, delay)
      }
    }, MOVE_STEP_MS)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.turnPhase, session.state.previousPosition, session.state.targetPosition])

  const handleRoll = useCallback(
    (value: number) => {
      session.roll(value)
    },
    [session],
  )

  const handleDismissCard = useCallback((correct?: boolean) => {
    if (correct) {
      sounds.playSuccess()
    }
    session.dismissCard()
  }, [session, sounds])

  // ── Game over handling ──────────────────────────────────────────
  const handleNextTurn = useCallback(() => {
    if (session.allFinished) {
      // Final celebration — everyone finished!
      setShowSmallConfetti(true)
      setShowFinalCelebration(true)
      sounds.playApplause()
      tts.speak(
        `What an amazing adventure! Everyone finished ${game.title}! Played by the Barnes Family!`,
      )
      setTimeout(() => setShowSmallConfetti(false), 4000)
      return
    }

    if (session.isGameOver && !showCelebration) {
      // First winner celebration
      setShowConfetti(true)
      setShowCelebration(true)
      sounds.playFanfare()
      tts.speak(
        `Amazing! ${session.state.winner} is the Story Keeper's Champion! Everyone keep going!`,
      )
      setTimeout(() => setShowConfetti(false), 4000)
      return
    }

    if (showCelebration) {
      // After winner celebration, continue game for remaining players
      setShowCelebration(false)
    }

    session.nextTurn()
  }, [session, tts, sounds, game.title, showCelebration])

  const handleFinishGame = useCallback(() => {
    const durationMinutes = Math.round((Date.now() - gameStartTime.current) / 60000)
    onFinished({
      winner: session.state.winner,
      durationMinutes: Math.max(durationMinutes, 1),
      cardsEncountered: session.state.cardsEncountered,
      playerIds: session.state.players.map((p) => p.id),
    })
  }, [session, onFinished])

  // Save session to Firestore after each turn completes (when turnPhase transitions to Roll for next player)
  useEffect(() => {
    if (!hasStarted) return
    if (session.state.turnPhase === TurnPhase.Roll && session.state.currentPlayerIndex >= 0) {
      saveActiveSession(buildActiveSessionData())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.currentPlayerIndex, session.state.turnPhase])

  // Also save when game starts (initial playing state)
  useEffect(() => {
    if (hasStarted && !activeSession && session.state.startedAt) {
      saveActiveSession(buildActiveSessionData())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted])

  // ── Turn transition announcement ───────────────────────────────
  useEffect(() => {
    if (session.state.turnPhase === TurnPhase.Roll && session.currentPlayer && hasStarted) {
      setTurnTransition(true)
      tts.speak(`${session.currentPlayer.name}'s turn! Tap Roll!`)
      setTimeout(() => setTurnTransition(false), 1200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.currentPlayerIndex, session.state.turnPhase])

  // Announce board events on landing — use voice recording if available
  useEffect(() => {
    if (session.state.turnPhase === TurnPhase.Resolve && session.state.lastRoll && !session.isGameOver) {
      const player = session.currentPlayer
      if (!player) return
      const space = game.board.spaces[player.position]
      if ((space?.type === 'bonus' || space?.type === 'setback' || space?.type === 'special') && space.label) {
        const spaceRecKey = `space-${space.index}`
        const rec = voiceRecordings?.[spaceRecKey]
        if (rec?.url && !sounds.muted) {
          const audio = new Audio(rec.url)
          audio.play().catch(() => tts.speak(space.label!))
        } else {
          tts.speak(space.label)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.turnPhase])

  const { state, currentPlayer, isGameOver } = session

  // Build player positions — use animating position during movement
  const displayPlayers = state.players.map((p, i) => ({
    name: p.name,
    color: p.color,
    position:
      i === state.currentPlayerIndex && animatingPosition !== null
        ? animatingPosition
        : p.position,
    avatarUrl: p.avatarUrl,
  }))

  const theme = game.metadata?.theme

  return (
    <Box>
      {/* Confetti overlays */}
      <Confetti active={showConfetti} />
      <Confetti active={showSmallConfetti} small />

      {/* Mute toggle */}
      <IconButton
        onClick={sounds.toggleMute}
        size="small"
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          bgcolor: 'background.paper',
          boxShadow: 1,
          '&:hover': { bgcolor: 'background.paper' },
        }}
        aria-label={sounds.muted ? 'Unmute sounds' : 'Mute sounds'}
      >
        {sounds.muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
      </IconButton>

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
              // Turn transition pulse
              ...(turnTransition && i === state.currentPlayerIndex
                ? {
                    animation: 'turnPulse 0.6s ease-in-out 2',
                    '@keyframes turnPulse': {
                      '0%, 100%': { transform: 'scale(1)' },
                      '50%': { transform: 'scale(1.15)', boxShadow: '0 0 8px rgba(0,0,0,0.3)' },
                    },
                  }
                : {}),
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none !important',
              },
            }}
          />
        ))}
      </Box>

      {/* Board */}
      <GameBoard
        game={game}
        players={displayPlayers}
        activeSpaceIndex={currentPlayer?.position}
        boardBackground={generatedArt?.boardBackground}
        landingSpaceIndex={landingSpaceIndex}
        spaceAnimation={spaceAnimation}
        theme={theme}
      />

      {/* Controls */}
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        {state.turnPhase === TurnPhase.Roll && !isGameOver && (
          <>
            <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
              {currentPlayer?.name}&apos;s turn!
            </Typography>
            <DiceRoller
              onRoll={handleRoll}
              onRollStart={sounds.playDiceRoll}
              onRollLand={sounds.playDiceLand}
            />
          </>
        )}

        {state.turnPhase === TurnPhase.Move && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Moving {state.lastRoll} spaces...
          </Typography>
        )}

        {state.turnPhase === TurnPhase.Resolve && (
          <Box>
            {state.lastRoll && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Rolled a {state.lastRoll}!
              </Typography>
            )}
            {showFinalCelebration ? (
              // Final celebration — all players finished
              <Box
                sx={{
                  animation: 'celebrationFade 0.5s ease-out',
                  '@keyframes celebrationFade': {
                    '0%': { opacity: 0, transform: 'scale(0.9)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
                  {game.title}
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Played by the Barnes Family!
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  {state.players.map((p) => (
                    <Chip
                      key={p.id}
                      avatar={
                        p.avatarUrl ? (
                          <img src={p.avatarUrl} alt={p.name} style={{ borderRadius: '50%' }} />
                        ) : undefined
                      }
                      label={p.name}
                      sx={{ bgcolor: p.color, color: 'white', fontWeight: 700 }}
                    />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                  <Button variant="outlined" onClick={() => { session.reset(); setShowFinalCelebration(false) }}>
                    Play Again!
                  </Button>
                  <Button variant="contained" onClick={handleFinishGame}>
                    Back to Workshop
                  </Button>
                </Box>
              </Box>
            ) : showCelebration ? (
              // First winner celebration
              <Box
                sx={{
                  animation: 'winnerPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  '@keyframes winnerPop': {
                    '0%': { opacity: 0, transform: 'scale(0.3)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <EmojiEventsIcon sx={{ fontSize: 48, color: '#ffd700', mb: 1 }} />
                <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
                  {state.winner} wins!
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Everyone keep going!
                </Typography>
                <Button variant="contained" size="large" onClick={handleNextTurn}>
                  Continue
                </Button>
              </Box>
            ) : isGameOver && !showCelebration ? (
              // Game over for remaining players
              <Box>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                  {state.winner} won! Keep going!
                </Typography>
                {session.allFinished ? (
                  <Button variant="contained" size="large" onClick={handleNextTurn}>
                    Celebrate!
                  </Button>
                ) : (
                  <Button variant="contained" onClick={handleNextTurn}>
                    Next Player
                  </Button>
                )}
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
        cardArt={generatedArt?.cardArt}
        voiceRecordings={voiceRecordings}
        onFlipStart={sounds.playCardFlip}
        onBossReveal={sounds.playBossReveal}
        onCorrectAnswer={sounds.playSuccess}
        onWrongAnswer={sounds.playSetbackSlide}
        muted={sounds.muted}
      />
    </Box>
  )
}
