import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import type { GeneratedGame, StoryGame, StoryInputs } from '../../core/types'
import { GamePhase, WorkshopStatus } from '../../core/types/workshop'
import { useAI, TaskType } from '../../core/ai/useAI'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addDoc } from 'firebase/firestore'
import { storyGamesCollection } from '../../core/firebase/firestore'
import WorkshopWizard from './WorkshopWizard'
import GamePlayView from './GamePlayView'
import type { GamePlayResult } from './GamePlayView'
import { logWorkshopHours, createGameArtifact, recordPlaySession } from './workshopUtils'
import MyGamesGallery from './MyGamesGallery'

/** Extract JSON from <game> tags in AI response */
function extractGameJson(text: string): GeneratedGame | null {
  const match = text.match(/<game>\s*([\s\S]*?)\s*<\/game>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim()) as GeneratedGame
  } catch {
    return null
  }
}

export default function WorkshopPage() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.Idle)
  const [, setStoryInputs] = useState<StoryInputs | null>(null)
  const [currentGame, setCurrentGame] = useState<StoryGame | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const { chat } = useAI()
  const familyId = useFamilyId()
  const { activeChildId } = useActiveChild()

  const handleStartWizard = useCallback(() => {
    setPhase(GamePhase.Wizard)
    setGenerateError(null)
  }, [])

  const handleWizardComplete = useCallback(
    async (inputs: StoryInputs) => {
      setStoryInputs(inputs)
      setPhase(GamePhase.Generating)
      setGenerateError(null)

      if (!familyId || !activeChildId) {
        setGenerateError('Missing family or child context.')
        setPhase(GamePhase.Wizard)
        return
      }

      const response = await chat({
        familyId,
        childId: activeChildId,
        taskType: TaskType.Workshop,
        messages: [{ role: 'user', content: JSON.stringify(inputs) }],
      })

      if (!response) {
        setGenerateError('Failed to generate game. Please try again.')
        setPhase(GamePhase.Wizard)
        return
      }

      const generatedGame = extractGameJson(response.message)
      if (!generatedGame) {
        setGenerateError('The AI response could not be parsed. Please try again.')
        setPhase(GamePhase.Wizard)
        return
      }

      // Save to Firestore
      const now = new Date().toISOString()
      const gameDoc: Omit<StoryGame, 'id'> = {
        childId: activeChildId,
        createdAt: now,
        updatedAt: now,
        status: WorkshopStatus.Ready,
        storyInputs: inputs,
        generatedGame,
        playSessions: [],
      }

      const docRef = await addDoc(storyGamesCollection(familyId), gameDoc)
      setCurrentGame({ ...gameDoc, id: docRef.id })
      setPhase(GamePhase.Ready)
    },
    [chat, familyId, activeChildId],
  )

  const handleWizardCancel = useCallback(() => {
    setPhase(GamePhase.Idle)
    setStoryInputs(null)
    setGenerateError(null)
  }, [])

  const handlePlay = useCallback(() => {
    setPhase(GamePhase.Playing)
  }, [])

  const handleGameFinished = useCallback(
    async (result: GamePlayResult) => {
      setPhase(GamePhase.Finished)

      if (!familyId || !activeChildId || !currentGame?.generatedGame || !currentGame.id) return

      // Fire-and-forget: log hours, create artifact, record play session
      try {
        await Promise.all([
          logWorkshopHours(
            familyId,
            activeChildId,
            currentGame.generatedGame,
            result.durationMinutes,
            result.cardsEncountered,
          ),
          createGameArtifact(familyId, activeChildId, currentGame.generatedGame),
          recordPlaySession(
            familyId,
            currentGame.id,
            result.playerIds,
            result.winner ?? undefined,
            result.durationMinutes,
            result.cardsEncountered,
          ),
        ])
      } catch (err) {
        console.warn('Failed to log workshop results:', err)
      }
    },
    [familyId, activeChildId, currentGame],
  )

  const handleSelectExistingGame = useCallback((game: StoryGame) => {
    setCurrentGame(game)
    setPhase(GamePhase.Ready)
  }, [])

  const handleBackToWorkshop = useCallback(() => {
    setPhase(GamePhase.Idle)
    setCurrentGame(null)
    setStoryInputs(null)
  }, [])

  return (
    <Box sx={{ p: 2, maxWidth: 700, mx: 'auto' }}>
      {phase === GamePhase.Idle && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            Game Workshop
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, fontSize: '1.1rem' }}>
            Create your own board games! Tell a story and turn it into a game the whole family can
            play.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={handleStartWizard}
            sx={{
              py: 2,
              px: 5,
              fontSize: '1.2rem',
              fontWeight: 700,
              borderRadius: 3,
            }}
          >
            Create a New Game
          </Button>

          {/* My Games gallery */}
          {familyId && activeChildId && (
            <MyGamesGallery
              familyId={familyId}
              childId={activeChildId}
              onSelectGame={handleSelectExistingGame}
            />
          )}
        </Box>
      )}

      {phase === GamePhase.Wizard && (
        <>
          {generateError && (
            <Typography color="error" sx={{ mb: 2, textAlign: 'center' }}>
              {generateError}
            </Typography>
          )}
          <WorkshopWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
        </>
      )}

      {phase === GamePhase.Generating && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Creating your game...
          </Typography>
          <Typography color="text.secondary">
            The Story Wizard is building your board game!
          </Typography>
        </Box>
      )}

      {phase === GamePhase.Ready && currentGame?.generatedGame && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            {currentGame.generatedGame.title}
          </Typography>
          {currentGame.generatedGame.storyIntro && (
            <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
              {currentGame.generatedGame.storyIntro}
            </Typography>
          )}
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {currentGame.generatedGame.board.totalSpaces} spaces
            {' \u2022 '}
            {currentGame.generatedGame.challengeCards.length} challenge cards
            {' \u2022 '}
            {currentGame.generatedGame.rules.length} rules
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {currentGame.generatedGame.metadata.estimatedMinutes} min
            {' \u2022 '}
            {currentGame.generatedGame.metadata.playerCount.min}-
            {currentGame.generatedGame.metadata.playerCount.max} players
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="contained"
              size="large"
              onClick={handlePlay}
              sx={{ py: 1.5, px: 4, fontSize: '1.1rem', fontWeight: 700, borderRadius: 3 }}
            >
              Play Now!
            </Button>
            <Button variant="outlined" onClick={handleBackToWorkshop}>
              Back
            </Button>
          </Box>
        </Box>
      )}

      {phase === GamePhase.Playing && currentGame?.generatedGame && (
        <GamePlayView
          game={currentGame.generatedGame}
          gameId={currentGame.id}
          onFinished={handleGameFinished}
        />
      )}

      {phase === GamePhase.Finished && currentGame?.generatedGame && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            Game Over!
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
            {currentGame.generatedGame.title} — Played by the Barnes Family!
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" onClick={handlePlay}>
              Play Again
            </Button>
            <Button variant="outlined" onClick={handleBackToWorkshop}>
              Back to Workshop
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
