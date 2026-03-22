import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { updateDoc, doc } from 'firebase/firestore'
import type { GeneratedArt, GeneratedGame, StoryGame, StoryInputs } from '../../core/types'
import { GamePhase, WorkshopStatus } from '../../core/types/workshop'
import { useAI, TaskType } from '../../core/ai/useAI'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addDoc } from 'firebase/firestore'
import { db, storyGamesCollection } from '../../core/firebase/firestore'
import WorkshopWizard from './WorkshopWizard'
import GamePlayView from './GamePlayView'
import type { GamePlayResult } from './GamePlayView'
import { logWorkshopHours, createGameArtifact, recordPlaySession } from './workshopUtils'
import MyGamesGallery from './MyGamesGallery'
import GameCreationScreen from './GameCreationScreen'
import { generateAllArt } from './workshopArt'

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

  const { chat, generateImage } = useAI()
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

      // Fire game generation and initial art generation in parallel
      const [response, artResult] = await Promise.all([
        chat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Workshop,
          messages: [{ role: 'user', content: JSON.stringify(inputs) }],
        }),
        // Start art generation without title (we don't have it yet)
        generateAllArt(generateImage, familyId, inputs).catch((err) => {
          console.warn('Art generation batch failed:', err)
          return null
        }),
      ])

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

      // Build generatedArt from the parallel result
      let generatedArt: GeneratedArt | undefined
      if (artResult) {
        generatedArt = artResult.art
      }

      // Now generate the title screen with the actual game title (slight delay is fine)
      // This runs after game data is available so we can include the real title
      try {
        const titleResult = await generateImage({
          familyId,
          prompt: `A title card illustration for a children's board game called '${generatedGame.title}', ${inputs.theme} themed, exciting, colorful, storybook illustration style, centered composition, no text`,
          style: 'general',
          size: '1024x1024',
        })
        if (titleResult?.url) {
          generatedArt = { ...generatedArt, titleScreen: titleResult.url }
        }
      } catch (err) {
        console.warn('Title screen generation failed:', err)
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
        generatedArt,
      }

      const docRef = await addDoc(storyGamesCollection(familyId), gameDoc)
      setCurrentGame({ ...gameDoc, id: docRef.id })
      setPhase(GamePhase.Ready)
    },
    [chat, generateImage, familyId, activeChildId],
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

  const handleRegenerateArt = useCallback(
    async (game: StoryGame) => {
      if (!familyId || !game.id) return
      try {
        const result = await generateAllArt(
          generateImage,
          familyId,
          game.storyInputs,
          game.generatedGame?.title,
        )
        if (result.art) {
          const merged: GeneratedArt = { ...game.generatedArt, ...result.art }
          await updateDoc(
            doc(db, `families/${familyId}/storyGames/${game.id}`),
            { generatedArt: merged, updatedAt: new Date().toISOString() },
          )
          // Update local state if this is the current game
          if (currentGame?.id === game.id) {
            setCurrentGame({ ...currentGame, generatedArt: merged })
          }
        }
      } catch (err) {
        console.warn('Art regeneration failed:', err)
      }
    },
    [familyId, generateImage, currentGame],
  )

  const titleArt = currentGame?.generatedArt?.titleScreen

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
              onRegenerateArt={handleRegenerateArt}
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

      {phase === GamePhase.Generating && <GameCreationScreen />}

      {phase === GamePhase.Ready && currentGame?.generatedGame && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          {/* Title screen hero image */}
          {titleArt ? (
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                maxWidth: 500,
                mx: 'auto',
                mb: 3,
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <Box
                component="img"
                src={titleArt}
                alt={currentGame.generatedGame.title}
                sx={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />
              {/* Overlay with game info */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  p: 2,
                  color: 'white',
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {currentGame.generatedGame.title}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {currentGame.generatedGame.board.totalSpaces} spaces
                  {' \u2022 '}
                  {currentGame.generatedGame.challengeCards.length} cards
                  {' \u2022 '}
                  {currentGame.generatedGame.metadata.estimatedMinutes} min
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                {currentGame.generatedGame.title}
              </Typography>
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
            </>
          )}

          {currentGame.generatedGame.storyIntro && (
            <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
              {currentGame.generatedGame.storyIntro}
            </Typography>
          )}

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
          storyPlayers={currentGame.storyInputs.players}
          generatedArt={currentGame.generatedArt}
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
