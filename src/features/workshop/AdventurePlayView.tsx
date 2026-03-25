import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import type {
  ActiveAdventureSession,
  AdventureTree,
  GeneratedArt,
  StoryPlayer,
  VoiceRecordingMap,
} from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'
import { useGameSounds } from './useGameSounds'
import ChallengeCard from './ChallengeCard'
import Confetti from './Confetti'
import type { ChallengeCard as ChallengeCardType } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

export interface AdventurePlayResult {
  durationMinutes: number
  playerIds: string[]
  pathTaken: string[]
  choicesMade: Array<{ nodeId: string; choiceId: string }>
  challengeResults: Array<{ nodeId: string; passed: boolean }>
  endingType?: 'victory' | 'neutral' | 'retry'
}

interface AdventurePlayViewProps {
  adventure: AdventureTree
  gameTitle: string
  gameId?: string
  familyId: string
  storyPlayers?: StoryPlayer[]
  generatedArt?: GeneratedArt
  activeAdventureSession?: ActiveAdventureSession | null
  voiceRecordings?: VoiceRecordingMap
  onFinished: (result: AdventurePlayResult) => void
  onSaveSession?: (session: ActiveAdventureSession) => void
}

export default function AdventurePlayView({
  adventure,
  gameTitle,
  storyPlayers,
  generatedArt,
  activeAdventureSession,
  voiceRecordings,
  onFinished,
  onSaveSession,
}: AdventurePlayViewProps) {
  const tts = useTTS()
  const sounds = useGameSounds()
  const startTimeRef = useRef(Date.now())

  // State
  const [currentNodeId, setCurrentNodeId] = useState(
    activeAdventureSession?.currentNodeId ?? adventure.rootNodeId,
  )
  const [pathTaken, setPathTaken] = useState<string[]>(
    activeAdventureSession?.pathTaken ?? [adventure.rootNodeId],
  )
  const [choicesMade, setChoicesMade] = useState<Array<{ nodeId: string; choiceId: string }>>(
    activeAdventureSession?.choicesMade ?? [],
  )
  const [challengeResults, setChallengeResults] = useState<Array<{ nodeId: string; passed: boolean }>>(
    activeAdventureSession?.challengeResults ?? [],
  )
  const [showChallenge, setShowChallenge] = useState(false)
  const [showChoices, setShowChoices] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [fadeIn, setFadeIn] = useState(true)
  const [hasReadNarrative, setHasReadNarrative] = useState(false)

  const currentNode = adventure.nodes[currentNodeId]

  // Restore start time from session
  useEffect(() => {
    if (activeAdventureSession?.startedAt) {
      startTimeRef.current = new Date(activeAdventureSession.startedAt).getTime()
    }
  }, [activeAdventureSession])

  // Read narrative when arriving at a new node
  useEffect(() => {
    if (!currentNode) return

    setFadeIn(true)
    setHasReadNarrative(false)
    setShowChoices(false)
    setShowChallenge(false)

    // Check for voice recording first
    const rec = voiceRecordings?.[`node-${currentNodeId}`]
    if (rec?.url && !sounds.muted) {
      const audio = new Audio(rec.url)
      audio.onended = () => {
        setHasReadNarrative(true)
        if (currentNode.challenge) {
          setShowChallenge(true)
        } else {
          setShowChoices(true)
        }
      }
      audio.play().catch(() => {
        // Fallback to TTS
        tts.speak(currentNode.spokenText)
        setTimeout(() => {
          setHasReadNarrative(true)
          if (currentNode.challenge) {
            setShowChallenge(true)
          } else {
            setShowChoices(true)
          }
        }, 2000)
      })
    } else {
      tts.speak(currentNode.spokenText)
      // Show choices after a delay for TTS to read
      const wordCount = currentNode.spokenText.split(' ').length
      const delayMs = Math.max(wordCount * 200, 1500)
      const timer = setTimeout(() => {
        setHasReadNarrative(true)
        if (currentNode.challenge) {
          setShowChallenge(true)
        } else {
          setShowChoices(true)
        }
      }, delayMs)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId])

  // Save session after each transition
  useEffect(() => {
    if (!onSaveSession) return
    onSaveSession({
      currentNodeId,
      pathTaken,
      choicesMade,
      challengeResults,
      status: currentNode?.isEnding ? 'finished' : 'playing',
      startedAt: new Date(startTimeRef.current).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId])

  const handleChoice = useCallback(
    (choiceId: string, nextNodeId: string) => {
      // Read the choice aloud
      const choice = currentNode?.choices?.find((c) => c.id === choiceId)
      if (choice) {
        const choiceRec = voiceRecordings?.[`choice-${choiceId}`]
        if (choiceRec?.url && !sounds.muted) {
          new Audio(choiceRec.url).play().catch(() => {})
        }
      }

      setChoicesMade((prev) => [...prev, { nodeId: currentNodeId, choiceId }])
      setPathTaken((prev) => [...prev, nextNodeId])
      setFadeIn(false)

      // Transition to next node
      setTimeout(() => {
        setCurrentNodeId(nextNodeId)
      }, 300)
    },
    [currentNode, currentNodeId, voiceRecordings, sounds.muted],
  )

  const handleChallengeDismiss = useCallback((correct?: boolean) => {
    setChallengeResults((prev) => [...prev, { nodeId: currentNodeId, passed: correct !== false }])
    setShowChallenge(false)
    if (correct !== false) {
      sounds.playSuccess()
    }
    setShowChoices(true)
  }, [currentNodeId, sounds])

  const handleRetry = useCallback(() => {
    if (!currentNode?.retryNodeId) return
    const retryId = currentNode.retryNodeId
    setPathTaken((prev) => [...prev, retryId])
    setFadeIn(false)
    setTimeout(() => {
      setCurrentNodeId(retryId)
    }, 300)
  }, [currentNode])

  const handlePlayAgain = useCallback(() => {
    setCurrentNodeId(adventure.rootNodeId)
    setPathTaken([adventure.rootNodeId])
    setChoicesMade([])
    setChallengeResults([])
    setShowConfetti(false)
    startTimeRef.current = Date.now()
  }, [adventure.rootNodeId])

  const handleFinish = useCallback(() => {
    const durationMinutes = Math.max(Math.round((Date.now() - startTimeRef.current) / 60000), 1)
    onFinished({
      durationMinutes,
      playerIds: storyPlayers?.map((p) => p.id) ?? [],
      pathTaken,
      choicesMade,
      challengeResults,
      endingType: currentNode?.endingType,
    })
  }, [onFinished, storyPlayers, pathTaken, choicesMade, challengeResults, currentNode])

  // Show confetti on victory ending
  useEffect(() => {
    if (currentNode?.isEnding && currentNode.endingType === 'victory') {
      setShowConfetti(true)
      sounds.playFanfare()
      setTimeout(() => setShowConfetti(false), 4000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId])

  if (!currentNode) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="error">Adventure node not found.</Typography>
        <Button onClick={handleFinish}>Back to Workshop</Button>
      </Box>
    )
  }

  // Build a pseudo ChallengeCard for the existing ChallengeCard component
  const challengeCardData: ChallengeCardType | null = currentNode.challenge
    ? {
        id: `challenge-${currentNodeId}`,
        type: currentNode.challenge.type as ChallengeCardType['type'],
        subjectBucket:
          currentNode.challenge.type === 'reading'
            ? SubjectBucket.Reading
            : currentNode.challenge.type === 'math'
              ? SubjectBucket.Math
              : currentNode.challenge.type === 'story'
                ? SubjectBucket.LanguageArts
                : SubjectBucket.Other,
        content: currentNode.challenge.content,
        readAloudText: currentNode.challenge.spokenText,
        difficulty: currentNode.challenge.difficulty as ChallengeCardType['difficulty'],
        answer: currentNode.challenge.answer,
        options: currentNode.challenge.options,
      }
    : null

  const sceneArtUrl = generatedArt?.sceneArt?.[currentNodeId]

  return (
    <Box sx={{ position: 'relative' }}>
      <Confetti active={showConfetti} />

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
      <Typography variant="h5" sx={{ textAlign: 'center', fontWeight: 700, mb: 2 }}>
        {gameTitle}
      </Typography>

      {/* Scene illustration */}
      <Box
        sx={{
          animation: fadeIn ? 'adventureFadeIn 0.5s ease-out' : 'adventureFadeOut 0.3s ease-in',
          '@keyframes adventureFadeIn': {
            '0%': { opacity: 0, transform: 'translateY(10px)' },
            '100%': { opacity: 1, transform: 'translateY(0)' },
          },
          '@keyframes adventureFadeOut': {
            '0%': { opacity: 1 },
            '100%': { opacity: 0 },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      >
        {sceneArtUrl && (
          <Box
            component="img"
            src={sceneArtUrl}
            alt="Scene illustration"
            sx={{
              width: '100%',
              maxWidth: 500,
              height: 'auto',
              borderRadius: 3,
              mx: 'auto',
              display: 'block',
              mb: 2,
            }}
          />
        )}

        {/* Narrative text */}
        <Box
          sx={{
            p: 3,
            bgcolor: 'grey.50',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            mb: 3,
          }}
        >
          <Typography
            variant="body1"
            sx={{
              fontSize: '1.15rem',
              lineHeight: 1.7,
              fontStyle: 'italic',
            }}
          >
            {currentNode.text}
          </Typography>
        </Box>

        {/* Challenge card (inline, before choices) */}
        <ChallengeCard
          card={challengeCardData}
          open={showChallenge && challengeCardData !== null}
          onClose={handleChallengeDismiss}
          cardArt={generatedArt?.cardArt}
          voiceRecordings={voiceRecordings}
        />

        {/* Choices */}
        {showChoices && !currentNode.isEnding && currentNode.choices && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              animation: 'choicesFadeIn 0.4s ease-out',
              '@keyframes choicesFadeIn': {
                '0%': { opacity: 0, transform: 'translateY(15px)' },
                '100%': { opacity: 1, transform: 'translateY(0)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ textAlign: 'center' }}>
              What do you do?
            </Typography>
            {currentNode.choices.map((choice) => (
              <Button
                key={choice.id}
                variant="outlined"
                size="large"
                onClick={() => handleChoice(choice.id, choice.nextNodeId)}
                sx={{
                  py: 2,
                  px: 3,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderRadius: 2,
                  textTransform: 'none',
                  borderWidth: 2,
                  '&:hover': { borderWidth: 2, transform: 'scale(1.02)' },
                  '&:active': { transform: 'scale(0.98)' },
                  transition: 'all 0.15s',
                }}
              >
                {choice.text}
              </Button>
            ))}
          </Box>
        )}

        {/* Ending screens */}
        {currentNode.isEnding && hasReadNarrative && (
          <Box
            sx={{
              textAlign: 'center',
              py: 3,
              animation: 'endingFadeIn 0.5s ease-out',
              '@keyframes endingFadeIn': {
                '0%': { opacity: 0, transform: 'scale(0.95)' },
                '100%': { opacity: 1, transform: 'scale(1)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            {currentNode.endingType === 'victory' && (
              <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>
                You did it!
              </Typography>
            )}
            {currentNode.endingType === 'neutral' && (
              <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
                The End
              </Typography>
            )}
            {currentNode.endingType === 'retry' && (
              <>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                  Hmm, that didn't quite work out...
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Want to go back and try another way?
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleRetry}
                  sx={{ mb: 2, mr: 1, fontWeight: 700 }}
                >
                  Try Another Way
                </Button>
              </>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mt: 1 }}>
              <Button variant="outlined" onClick={handlePlayAgain}>
                Play Again
              </Button>
              <Button variant="contained" onClick={handleFinish}>
                Back to Workshop
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
