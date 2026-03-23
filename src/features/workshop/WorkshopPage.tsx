import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { addDoc, deleteField, doc, updateDoc } from 'firebase/firestore'
import type {
  ActiveAdventureSession,
  ActiveCardGameSession,
  AdventureTree,
  CardGameData,
  ChallengeCard,
  GeneratedArt,
  GeneratedGame,
  PlaytestFeedback,
  PlaytestSession,
  StoryGame,
  StoryInputs,
  VoiceRecordingMap,
} from '../../core/types'
import { GamePhase, GameType, PlaytestStatus, WorkshopStatus } from '../../core/types/workshop'
import type { CardRevision } from '../../core/types/workshop'
import type { WizardState } from './useWorkshopWizard'
import { useAI, TaskType } from '../../core/ai/useAI'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { db, storyGamesCollection } from '../../core/firebase/firestore'
import WorkshopWizard from './WorkshopWizard'
import GamePlayView from './GamePlayView'
import type { GamePlayResult } from './GamePlayView'
import AdventurePlayView from './AdventurePlayView'
import type { AdventurePlayResult } from './AdventurePlayView'
import MatchingPlayView from './MatchingPlayView'
import type { MatchingPlayResult } from './MatchingPlayView'
import CollectingPlayView from './CollectingPlayView'
import type { CollectingPlayResult } from './CollectingPlayView'
import BattlePlayView from './BattlePlayView'
import type { BattlePlayResult } from './BattlePlayView'
import {
  logWorkshopHours,
  logAdventureHours,
  logPlaytestHours,
  logAdventurePlaytestHours,
  logCardGameHours,
  logCardGamePlaytestHours,
  createGameArtifact,
  createAdventureArtifact,
  createCardGameArtifact,
  createVoiceRecordingArtifacts,
  markWorkshopPlayed,
  recordPlaySession,
  recordAdventurePlaySession,
  recordCardGamePlaySession,
} from './workshopUtils'
import MyGamesGallery from './MyGamesGallery'
import GameCreationScreen from './GameCreationScreen'
import VoiceRecordingStep from './VoiceRecordingStep'
import { generateAllArt, generateAdventureArt, generateCardGameArt } from './workshopArt'
import PlaytestView from './PlaytestView'
import AdventurePlaytestView from './AdventurePlaytestView'
import PlaytestSummaryView from './PlaytestSummaryView'
import { computeSummary } from './playtestUtils'
import PlaytestReviewView from './PlaytestReviewView'

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

/** Extract JSON from <adventure> tags in AI response */
function extractAdventureJson(text: string): AdventureTree | null {
  const match = text.match(/<adventure>\s*([\s\S]*?)\s*<\/adventure>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim()) as AdventureTree
  } catch {
    return null
  }
}

/** Extract JSON from <cardgame> tags in AI response */
function extractCardGameJson(text: string): CardGameData | null {
  const match = text.match(/<cardgame>\s*([\s\S]*?)\s*<\/cardgame>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim()) as CardGameData
  } catch {
    return null
  }
}

export default function WorkshopPage() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.Idle)
  const [currentGame, setCurrentGame] = useState<StoryGame | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  // Draft doc ID for auto-save during wizard
  const [draftDocId, setDraftDocId] = useState<string | null>(null)
  // Resume dialog state
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false)
  // Playtest state
  const [playtestFeedback, setPlaytestFeedback] = useState<PlaytestFeedback[] | null>(null)
  const [playtestDuration, setPlaytestDuration] = useState(0)
  const [activePlaytestSession, setActivePlaytestSession] = useState<PlaytestSession | null>(null)

  const { chat, generateImage } = useAI()
  const familyId = useFamilyId()
  const { activeChildId, children } = useActiveChild()

  const isAdventure = currentGame?.gameType === GameType.Adventure
  const isCards = currentGame?.gameType === GameType.Cards

  // ── Draft auto-save helpers ──────────────────────────────────────

  const saveDraftStep = useCallback(
    async (wizardState: WizardState, step: number) => {
      if (!familyId || !activeChildId) return null
      const now = new Date().toISOString()

      const partialInputs = {
        theme: wizardState.theme || '',
        players: wizardState.players,
        goal: wizardState.goal || '',
        challenges: wizardState.challenges,
        boardStyle: wizardState.boardStyle || '',
        boardLength: wizardState.boardLength || '',
        storySetup: wizardState.storySetup || '',
        choiceSeeds: wizardState.choiceSeeds,
        adventureLength: wizardState.adventureLength || '',
        cardMechanic: wizardState.cardMechanic || undefined,
        cardDescriptions: wizardState.cardDescriptions,
        cardBackStyle: wizardState.cardBackStyle || undefined,
        cardBackCustom: wizardState.cardBackCustom || undefined,
      } as StoryInputs

      if (draftDocId) {
        // Update existing draft
        try {
          await updateDoc(
            doc(db, `families/${familyId}/storyGames/${draftDocId}`),
            {
              storyInputs: partialInputs,
              gameType: wizardState.gameType || undefined,
              currentWizardStep: step,
              updatedAt: now,
            },
          )
        } catch (err) {
          console.warn('Failed to update draft:', err)
        }
        return draftDocId
      } else {
        // Create new draft
        try {
          const draftDoc: Omit<StoryGame, 'id'> = {
            childId: activeChildId,
            createdAt: now,
            updatedAt: now,
            status: WorkshopStatus.Draft,
            gameType: (wizardState.gameType as GameType) || undefined,
            storyInputs: partialInputs,
            currentWizardStep: step,
          }
          const docRef = await addDoc(storyGamesCollection(familyId), draftDoc)
          setDraftDocId(docRef.id)
          return docRef.id
        } catch (err) {
          console.warn('Failed to create draft:', err)
          return null
        }
      }
    },
    [familyId, activeChildId, draftDocId],
  )

  // ── Wizard flow ──────────────────────────────────────────────────

  const handleStartWizard = useCallback(() => {
    setPhase(GamePhase.Wizard)
    setGenerateError(null)
    setDraftDocId(null)
  }, [])

  const handleResumeDraft = useCallback((game: StoryGame) => {
    setCurrentGame(game)
    setDraftDocId(game.id ?? null)
    setPhase(GamePhase.Wizard)
    setGenerateError(null)
  }, [])

  const handleWizardComplete = useCallback(
    async (inputs: StoryInputs, gameType: GameType) => {
      setPhase(GamePhase.Generating)
      setGenerateError(null)

      if (!familyId || !activeChildId) {
        setGenerateError('Missing family or child context.')
        setPhase(GamePhase.Wizard)
        return
      }

      if (gameType === GameType.Cards) {
        // ── Card game generation ─────────────────────────────
        const response = await chat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Workshop,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ ...inputs, gameType: 'cards' }),
            },
          ],
        })

        if (!response) {
          setGenerateError('Failed to generate card game. Please try again.')
          setPhase(GamePhase.Wizard)
          return
        }

        const cardGameData = extractCardGameJson(response.message)
        if (!cardGameData) {
          setGenerateError('The AI response could not be parsed. Please try again.')
          setPhase(GamePhase.Wizard)
          return
        }

        // Generate art for card game
        let generatedArt: GeneratedArt | undefined
        try {
          const artResult = await generateCardGameArt(
            generateImage,
            familyId,
            inputs,
            cardGameData,
          )
          if (artResult) {
            generatedArt = artResult.art
          }
        } catch (err) {
          console.warn('Card game art generation failed:', err)
        }

        const now = new Date().toISOString()

        if (draftDocId) {
          try {
            await updateDoc(
              doc(db, `families/${familyId}/storyGames/${draftDocId}`),
              {
                status: WorkshopStatus.Ready,
                gameType: GameType.Cards,
                storyInputs: inputs,
                cardGame: cardGameData,
                generatedArt: generatedArt ?? null,
                playSessions: [],
                updatedAt: now,
                currentWizardStep: deleteField(),
              },
            )
            setCurrentGame({
              id: draftDocId,
              childId: activeChildId,
              createdAt: now,
              updatedAt: now,
              status: WorkshopStatus.Ready,
              gameType: GameType.Cards,
              storyInputs: inputs,
              cardGame: cardGameData,
              playSessions: [],
              generatedArt,
            })
          } catch (err) {
            console.warn('Failed to upgrade draft:', err)
          }
        } else {
          const gameDoc: Omit<StoryGame, 'id'> = {
            childId: activeChildId,
            createdAt: now,
            updatedAt: now,
            status: WorkshopStatus.Ready,
            gameType: GameType.Cards,
            storyInputs: inputs,
            cardGame: cardGameData,
            playSessions: [],
            generatedArt,
          }
          const docRef = await addDoc(storyGamesCollection(familyId), gameDoc)
          setCurrentGame({ ...gameDoc, id: docRef.id })
        }

        setDraftDocId(null)
        setPhase(GamePhase.Recording)
      } else if (gameType === GameType.Adventure) {
        // ── Adventure generation ───────────────────────────────
        const response = await chat({
          familyId,
          childId: activeChildId,
          taskType: TaskType.Workshop,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({ ...inputs, gameType: 'adventure' }),
            },
          ],
        })

        if (!response) {
          setGenerateError('Failed to generate adventure. Please try again.')
          setPhase(GamePhase.Wizard)
          return
        }

        const adventureTree = extractAdventureJson(response.message)
        if (!adventureTree) {
          setGenerateError('The AI response could not be parsed. Please try again.')
          setPhase(GamePhase.Wizard)
          return
        }

        // Generate art for adventure
        let generatedArt: GeneratedArt | undefined
        try {
          const artResult = await generateAdventureArt(
            generateImage,
            familyId,
            inputs,
            adventureTree,
          )
          if (artResult) {
            generatedArt = artResult.art
          }
        } catch (err) {
          console.warn('Adventure art generation failed:', err)
        }

        const now = new Date().toISOString()

        if (draftDocId) {
          try {
            await updateDoc(
              doc(db, `families/${familyId}/storyGames/${draftDocId}`),
              {
                status: WorkshopStatus.Ready,
                gameType: GameType.Adventure,
                storyInputs: inputs,
                adventureTree,
                generatedArt: generatedArt ?? null,
                playSessions: [],
                updatedAt: now,
                currentWizardStep: deleteField(),
              },
            )
            setCurrentGame({
              id: draftDocId,
              childId: activeChildId,
              createdAt: now,
              updatedAt: now,
              status: WorkshopStatus.Ready,
              gameType: GameType.Adventure,
              storyInputs: inputs,
              adventureTree,
              playSessions: [],
              generatedArt,
            })
          } catch (err) {
            console.warn('Failed to upgrade draft:', err)
          }
        } else {
          const gameDoc: Omit<StoryGame, 'id'> = {
            childId: activeChildId,
            createdAt: now,
            updatedAt: now,
            status: WorkshopStatus.Ready,
            gameType: GameType.Adventure,
            storyInputs: inputs,
            adventureTree,
            playSessions: [],
            generatedArt,
          }
          const docRef = await addDoc(storyGamesCollection(familyId), gameDoc)
          setCurrentGame({ ...gameDoc, id: docRef.id })
        }

        setDraftDocId(null)
        setPhase(GamePhase.Recording)
      } else {
        // ── Board game generation (existing flow) ──────────────
        const [response, artResult] = await Promise.all([
          chat({
            familyId,
            childId: activeChildId,
            taskType: TaskType.Workshop,
            messages: [{ role: 'user', content: JSON.stringify(inputs) }],
          }),
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

        let generatedArt: GeneratedArt | undefined
        if (artResult) {
          generatedArt = artResult.art
        }

        // Generate title screen with the actual game title
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

        const now = new Date().toISOString()

        if (draftDocId) {
          try {
            await updateDoc(
              doc(db, `families/${familyId}/storyGames/${draftDocId}`),
              {
                status: WorkshopStatus.Ready,
                gameType: GameType.Board,
                storyInputs: inputs,
                generatedGame,
                generatedArt: generatedArt ?? null,
                playSessions: [],
                updatedAt: now,
                currentWizardStep: deleteField(),
              },
            )
            setCurrentGame({
              id: draftDocId,
              childId: activeChildId,
              createdAt: now,
              updatedAt: now,
              status: WorkshopStatus.Ready,
              gameType: GameType.Board,
              storyInputs: inputs,
              generatedGame,
              playSessions: [],
              generatedArt,
            })
          } catch (err) {
            console.warn('Failed to upgrade draft:', err)
          }
        } else {
          const gameDoc: Omit<StoryGame, 'id'> = {
            childId: activeChildId,
            createdAt: now,
            updatedAt: now,
            status: WorkshopStatus.Ready,
            gameType: GameType.Board,
            storyInputs: inputs,
            generatedGame,
            playSessions: [],
            generatedArt,
          }
          const docRef = await addDoc(storyGamesCollection(familyId), gameDoc)
          setCurrentGame({ ...gameDoc, id: docRef.id })
        }

        setDraftDocId(null)
        setPhase(GamePhase.Recording)
      }
    },
    [chat, generateImage, familyId, activeChildId, draftDocId],
  )

  const handleRecordingDone = useCallback(
    (voiceRecordings: VoiceRecordingMap) => {
      if (currentGame) {
        setCurrentGame({ ...currentGame, voiceRecordings })

        // Create speech practice artifacts for voice recordings
        if (familyId && activeChildId && Object.keys(voiceRecordings).length > 0) {
          const gameTitle = currentGame.generatedGame?.title
            ?? currentGame.storyInputs?.theme
            ?? 'Workshop Game'
          createVoiceRecordingArtifacts(familyId, activeChildId, gameTitle, voiceRecordings)
            .catch((err) => console.warn('Failed to create voice recording artifacts:', err))
        }
      }
      setPhase(GamePhase.Ready)
    },
    [currentGame, familyId, activeChildId],
  )

  const handleRecordingSkip = useCallback(() => {
    setPhase(GamePhase.Ready)
  }, [])

  const handleWizardCancel = useCallback(() => {
    setPhase(GamePhase.Idle)
    setCurrentGame(null)
    setDraftDocId(null)
    setGenerateError(null)
  }, [])

  // ── Game selection & resume ──────────────────────────────────────

  const handleSelectExistingGame = useCallback((game: StoryGame) => {
    setCurrentGame(game)
    const isAdv = game.gameType === GameType.Adventure
    const isCrd = game.gameType === GameType.Cards
    if (isAdv && game.activeAdventureSession?.status === 'playing') {
      setResumeDialogOpen(true)
    } else if (isCrd && game.activeCardGameSession?.status === 'playing') {
      setResumeDialogOpen(true)
    } else if (!isAdv && !isCrd && game.activeSession?.status === 'playing') {
      setResumeDialogOpen(true)
    } else {
      setPhase(GamePhase.Ready)
    }
  }, [])

  const handleContinueGame = useCallback(() => {
    setResumeDialogOpen(false)
    setPhase(GamePhase.Playing)
  }, [])

  const handleStartOver = useCallback(() => {
    setResumeDialogOpen(false)
    setConfirmRestartOpen(true)
  }, [])

  const handleConfirmRestart = useCallback(async () => {
    setConfirmRestartOpen(false)
    if (currentGame?.id && familyId) {
      const isAdv = currentGame.gameType === GameType.Adventure
      const isCrd = currentGame.gameType === GameType.Cards
      const clearField = isCrd
        ? { activeCardGameSession: null }
        : isAdv
          ? { activeAdventureSession: null }
          : { activeSession: null }
      try {
        await updateDoc(
          doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
          { ...clearField, updatedAt: new Date().toISOString() },
        )
        setCurrentGame({ ...currentGame, ...clearField })
      } catch (err) {
        console.warn('Failed to clear active session:', err)
      }
    }
    setPhase(GamePhase.Ready)
  }, [currentGame, familyId])

  const handleCancelRestart = useCallback(() => {
    setConfirmRestartOpen(false)
    setResumeDialogOpen(true)
  }, [])

  // ── Play ─────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    setPhase(GamePhase.Playing)
  }, [])

  const handleGameFinished = useCallback(
    async (result: GamePlayResult) => {
      setPhase(GamePhase.Finished)

      if (!familyId || !activeChildId || !currentGame?.generatedGame || !currentGame.id) return

      try {
        await Promise.all([
          updateDoc(
            doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
            { activeSession: null, updatedAt: new Date().toISOString() },
          ),
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
          markWorkshopPlayed(familyId, activeChildId, currentGame.generatedGame.title),
        ])
        setCurrentGame({ ...currentGame, activeSession: null })
      } catch (err) {
        console.warn('Failed to log workshop results:', err)
      }
    },
    [familyId, activeChildId, currentGame],
  )

  const handleAdventureFinished = useCallback(
    async (result: AdventurePlayResult) => {
      setPhase(GamePhase.Finished)

      if (!familyId || !activeChildId || !currentGame?.adventureTree || !currentGame.id) return

      try {
        await Promise.all([
          updateDoc(
            doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
            { activeAdventureSession: null, updatedAt: new Date().toISOString() },
          ),
          logAdventureHours(
            familyId,
            activeChildId,
            currentGame.adventureTree,
            result.durationMinutes,
            result.challengeResults,
          ),
          createAdventureArtifact(
            familyId,
            activeChildId,
            currentGame.adventureTree,
            currentGame.storyInputs.theme,
            result.pathTaken,
          ),
          recordAdventurePlaySession(
            familyId,
            currentGame.id,
            result.playerIds,
            result.durationMinutes,
            result.pathTaken,
            result.choicesMade,
            result.challengeResults,
          ),
          markWorkshopPlayed(familyId, activeChildId, currentGame.storyInputs.theme + ' Adventure'),
        ])
        setCurrentGame({ ...currentGame, activeAdventureSession: null })
      } catch (err) {
        console.warn('Failed to log adventure results:', err)
      }
    },
    [familyId, activeChildId, currentGame],
  )

  const handleSaveAdventureSession = useCallback(
    async (session: ActiveAdventureSession) => {
      if (!currentGame?.id || !familyId) return
      try {
        await updateDoc(
          doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
          { activeAdventureSession: session, updatedAt: new Date().toISOString() },
        )
      } catch (err) {
        console.warn('Failed to save adventure session:', err)
      }
    },
    [currentGame, familyId],
  )

  // ── Card game handlers ──────────────────────────────────────────

  const handleCardGameFinished = useCallback(
    async (result: MatchingPlayResult | CollectingPlayResult | BattlePlayResult) => {
      setPhase(GamePhase.Finished)

      if (!familyId || !activeChildId || !currentGame?.cardGame || !currentGame.id) return

      try {
        await Promise.all([
          updateDoc(
            doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
            { activeCardGameSession: null, updatedAt: new Date().toISOString() },
          ),
          logCardGameHours(
            familyId,
            activeChildId,
            currentGame.cardGame,
            result.durationMinutes,
          ),
          createCardGameArtifact(
            familyId,
            activeChildId,
            currentGame.cardGame,
            currentGame.storyInputs.theme,
          ),
          recordCardGamePlaySession(
            familyId,
            currentGame.id,
            result.playerIds,
            result.winner ?? undefined,
            result.durationMinutes,
          ),
          markWorkshopPlayed(familyId, activeChildId, currentGame.storyInputs.theme + ' Card Game'),
        ])
        setCurrentGame({ ...currentGame, activeCardGameSession: null })
      } catch (err) {
        console.warn('Failed to log card game results:', err)
      }
    },
    [familyId, activeChildId, currentGame],
  )

  const handleSaveCardGameSession = useCallback(
    async (session: ActiveCardGameSession) => {
      if (!currentGame?.id || !familyId) return
      try {
        await updateDoc(
          doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
          { activeCardGameSession: session, updatedAt: new Date().toISOString() },
        )
      } catch (err) {
        console.warn('Failed to save card game session:', err)
      }
    },
    [currentGame, familyId],
  )

  // ── Playtest flow ───────────────────────────────────────────────

  const handleStartPlaytest = useCallback((game: StoryGame) => {
    setCurrentGame(game)
    setPlaytestFeedback(null)
    setPlaytestDuration(0)
    setPhase(GamePhase.Playtesting)
  }, [])

  const handlePlaytestComplete = useCallback(
    async (feedback: PlaytestFeedback[], durationMinutes: number) => {
      setPlaytestFeedback(feedback)
      setPlaytestDuration(durationMinutes)
    },
    [],
  )

  const handleSendPlaytest = useCallback(async () => {
    if (!familyId || !activeChildId || !currentGame?.id || !playtestFeedback) return
    if (!currentGame.generatedGame && !currentGame.adventureTree && !currentGame.cardGame) return

    const childName = children.find((c) => c.id === activeChildId)?.name ?? 'Tester'
    const summary = computeSummary(playtestFeedback)
    const sessionId = `pt-${Date.now()}`

    const session: PlaytestSession = {
      id: sessionId,
      testerId: activeChildId,
      testerName: childName,
      completedAt: new Date().toISOString(),
      feedback: playtestFeedback,
      summary,
      status: PlaytestStatus.Complete,
    }

    try {
      const existingSessions = currentGame.playtestSessions ?? []
      await updateDoc(
        doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
        {
          playtestSessions: [...existingSessions, session],
          updatedAt: new Date().toISOString(),
        },
      )

      // Log hours for tester
      const hasAudio = playtestFeedback.some((f) => !!f.audioUrl)
      if (currentGame.generatedGame) {
        await logPlaytestHours(
          familyId,
          activeChildId,
          currentGame.generatedGame,
          playtestDuration,
          hasAudio,
        )
      } else if (currentGame.adventureTree) {
        await logAdventurePlaytestHours(
          familyId,
          activeChildId,
          currentGame.adventureTree,
          playtestDuration,
          hasAudio,
        )
      } else if (currentGame.cardGame) {
        await logCardGamePlaytestHours(
          familyId,
          activeChildId,
          currentGame.cardGame,
          playtestDuration,
          hasAudio,
        )
      }

      setCurrentGame({
        ...currentGame,
        playtestSessions: [...existingSessions, session],
      })
    } catch (err) {
      console.warn('Failed to save playtest session:', err)
    }

    setPhase(GamePhase.Idle)
    setPlaytestFeedback(null)
    setCurrentGame(null)
  }, [familyId, activeChildId, currentGame, playtestFeedback, playtestDuration, children])

  const handlePlaytestAgain = useCallback(() => {
    setPlaytestFeedback(null)
    setPlaytestDuration(0)
    setPhase(GamePhase.Playtesting)
  }, [])

  const handleReviewPlaytest = useCallback((game: StoryGame) => {
    setCurrentGame(game)
    const unreviewed = game.playtestSessions?.find((s) => s.status === PlaytestStatus.Complete)
    setActivePlaytestSession(unreviewed ?? null)
    setPhase(GamePhase.PlaytestReview)
  }, [])

  const handleSaveRevisions = useCallback(
    async (
      updatedCards: ChallengeCard[],
      revisions: CardRevision[],
      playtestId: string,
    ) => {
      if (!familyId || !currentGame?.id || !currentGame.generatedGame) return

      const newVersion = (currentGame.version ?? 1) + (revisions.length > 0 ? 1 : 0)
      const existingHistory = currentGame.revisionHistory ?? []
      const newHistoryEntry = revisions.length > 0
        ? {
            version: newVersion,
            revisedAt: new Date().toISOString(),
            changes: revisions,
            playtestId,
          }
        : null

      const updatedSessions = (currentGame.playtestSessions ?? []).map((s) =>
        s.id === playtestId ? { ...s, status: PlaytestStatus.Reviewed } : s,
      )

      const updatedGame = {
        ...currentGame.generatedGame,
        challengeCards: updatedCards,
      }

      const updatePayload: Record<string, unknown> = {
        generatedGame: updatedGame,
        playtestSessions: updatedSessions,
        updatedAt: new Date().toISOString(),
      }

      if (revisions.length > 0) {
        updatePayload.version = newVersion
        updatePayload.revisionHistory = [
          ...existingHistory,
          ...(newHistoryEntry ? [newHistoryEntry] : []),
        ]
      }

      await updateDoc(
        doc(db, `families/${familyId}/storyGames/${currentGame.id}`),
        updatePayload,
      )

      setCurrentGame({
        ...currentGame,
        generatedGame: updatedGame,
        playtestSessions: updatedSessions,
        version: newVersion,
        revisionHistory: newHistoryEntry
          ? [...existingHistory, newHistoryEntry]
          : existingHistory,
      })

      setPhase(GamePhase.Idle)
      setCurrentGame(null)
      setActivePlaytestSession(null)
    },
    [familyId, currentGame],
  )

  const handleRequestRetest = useCallback(() => {
    setPhase(GamePhase.Idle)
    setCurrentGame(null)
    setActivePlaytestSession(null)
  }, [])

  const handleBackToWorkshop = useCallback(() => {
    setPhase(GamePhase.Idle)
    setCurrentGame(null)
    setDraftDocId(null)
    setPlaytestFeedback(null)
    setActivePlaytestSession(null)
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

  // Build current player name for resume dialog
  const resumePlayerNames = isCards
    ? currentGame?.activeCardGameSession?.players.map((p) => p.name).join(', ') ?? currentGame?.storyInputs.players.map((p) => p.name).join(', ') ?? ''
    : isAdventure
      ? currentGame?.storyInputs.players.map((p) => p.name).join(', ') ?? ''
      : currentGame?.activeSession?.players.map((p) => p.name).join(', ') ?? ''

  // Get the game title for display
  const gameTitle = isCards
    ? `${currentGame?.storyInputs.theme ?? ''} Card Game`
    : isAdventure
      ? (currentGame?.adventureTree ? `${currentGame.storyInputs.theme} Adventure` : currentGame?.storyInputs.theme)
      : currentGame?.generatedGame?.title ?? currentGame?.storyInputs.theme

  return (
    <Box sx={{ p: 2, maxWidth: 700, mx: 'auto' }}>
      {phase === GamePhase.Idle && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            Game Workshop
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4, fontSize: '1.1rem' }}>
            Create your own games! Tell a story and turn it into a game the whole family can
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
              children={children}
              onSelectGame={handleSelectExistingGame}
              onPlaytestGame={handleStartPlaytest}
              onReviewPlaytest={handleReviewPlaytest}
              onResumeDraft={handleResumeDraft}
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
          <WorkshopWizard
            onComplete={handleWizardComplete}
            onCancel={handleWizardCancel}
            onStepSave={saveDraftStep}
            initialState={currentGame?.status === WorkshopStatus.Draft ? {
              step: currentGame.currentWizardStep ?? 0,
              gameType: (currentGame.gameType ?? '') as GameType | '',
              theme: currentGame.storyInputs.theme ?? '',
              players: currentGame.storyInputs.players ?? [],
              goal: currentGame.storyInputs.goal ?? '',
              challenges: currentGame.storyInputs.challenges ?? [],
              boardStyle: currentGame.storyInputs.boardStyle ?? '',
              boardLength: currentGame.storyInputs.boardLength ?? '',
              storySetup: currentGame.storyInputs.storySetup ?? '',
              choiceSeeds: currentGame.storyInputs.choiceSeeds ?? [],
              adventureLength: currentGame.storyInputs.adventureLength ?? '',
              cardMechanic: (currentGame.storyInputs.cardMechanic ?? '') as '' | 'matching' | 'collecting' | 'battle',
              cardDescriptions: currentGame.storyInputs.cardDescriptions ?? [],
              cardBackStyle: (currentGame.storyInputs.cardBackStyle ?? '') as '' | 'classic' | 'decorated' | 'custom',
              cardBackCustom: currentGame.storyInputs.cardBackCustom ?? '',
            } : undefined}
          />
        </>
      )}

      {phase === GamePhase.Generating && <GameCreationScreen />}

      {phase === GamePhase.Recording && currentGame?.id && activeChildId && familyId && (
        <>
          {currentGame.generatedGame && (
            <VoiceRecordingStep
              game={currentGame.generatedGame}
              gameId={currentGame.id}
              familyId={familyId}
              childId={activeChildId}
              childName={children.find((c) => c.id === activeChildId)?.name ?? 'You'}
              existingRecordings={currentGame.voiceRecordings}
              onDone={handleRecordingDone}
              onSkip={handleRecordingSkip}
            />
          )}
          {currentGame.adventureTree && (
            <VoiceRecordingStep
              game={currentGame.adventureTree}
              gameId={currentGame.id}
              familyId={familyId}
              childId={activeChildId}
              childName={children.find((c) => c.id === activeChildId)?.name ?? 'You'}
              existingRecordings={currentGame.voiceRecordings}
              onDone={handleRecordingDone}
              onSkip={handleRecordingSkip}
            />
          )}
          {currentGame.cardGame && !currentGame.generatedGame && !currentGame.adventureTree && (
            // Card games skip voice recording step for now — go straight to ready
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Your card game is ready!</Typography>
              <Button variant="contained" onClick={handleRecordingSkip}>
                Let&apos;s Play!
              </Button>
            </Box>
          )}
        </>
      )}

      {phase === GamePhase.Ready && (currentGame?.generatedGame || currentGame?.adventureTree || currentGame?.cardGame) && (
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
                alt={gameTitle}
                sx={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />
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
                  {gameTitle}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {isCards && currentGame.cardGame
                    ? `${currentGame.cardGame.metadata.deckSize} cards \u2022 ${currentGame.cardGame.mechanic} \u2022 ${currentGame.cardGame.metadata.estimatedMinutes} min`
                    : isAdventure
                      ? `${currentGame.adventureTree!.totalNodes} scenes \u2022 ${currentGame.adventureTree!.totalEndings} endings`
                      : `${currentGame.generatedGame!.board.totalSpaces} spaces \u2022 ${currentGame.generatedGame!.challengeCards.length} cards \u2022 ${currentGame.generatedGame!.metadata.estimatedMinutes} min`}
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                {gameTitle}
              </Typography>
              {isCards && currentGame.cardGame ? (
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                  {currentGame.cardGame.metadata.deckSize} cards
                  {' \u2022 '}
                  {currentGame.cardGame.mechanic}
                  {' \u2022 '}
                  {currentGame.cardGame.metadata.estimatedMinutes} min
                  {' \u2022 '}
                  {currentGame.cardGame.rules.length} rules
                </Typography>
              ) : isAdventure ? (
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                  {currentGame.adventureTree!.totalNodes} scenes
                  {' \u2022 '}
                  {currentGame.adventureTree!.totalEndings} endings
                  {currentGame.adventureTree!.challengeCount > 0
                    ? ` \u2022 ${currentGame.adventureTree!.challengeCount} challenges`
                    : ''}
                </Typography>
              ) : (
                <>
                  <Typography color="text.secondary" sx={{ mb: 1 }}>
                    {currentGame.generatedGame!.board.totalSpaces} spaces
                    {' \u2022 '}
                    {currentGame.generatedGame!.challengeCards.length} challenge cards
                    {' \u2022 '}
                    {currentGame.generatedGame!.rules.length} rules
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {currentGame.generatedGame!.metadata.estimatedMinutes} min
                    {' \u2022 '}
                    {currentGame.generatedGame!.metadata.playerCount.min}-
                    {currentGame.generatedGame!.metadata.playerCount.max} players
                  </Typography>
                </>
              )}
            </>
          )}

          {!isAdventure && currentGame.generatedGame?.storyIntro && (
            <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
              {currentGame.generatedGame.storyIntro}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              onClick={handlePlay}
              sx={{ py: 1.5, px: 4, fontSize: '1.1rem', fontWeight: 700, borderRadius: 3 }}
            >
              {isCards ? 'Play Card Game!' : isAdventure ? 'Start Adventure!' : 'Play Now!'}
            </Button>
            {currentGame.id && familyId && activeChildId && (
              <Button
                variant="outlined"
                onClick={() => setPhase(GamePhase.Recording)}
              >
                Record Voices
              </Button>
            )}
            <Button variant="outlined" onClick={handleBackToWorkshop}>
              Back
            </Button>
          </Box>
        </Box>
      )}

      {phase === GamePhase.Playing && !isAdventure && currentGame?.generatedGame && (
        <GamePlayView
          game={currentGame.generatedGame}
          gameId={currentGame.id}
          familyId={familyId ?? ''}
          storyPlayers={currentGame.storyInputs.players}
          generatedArt={currentGame.generatedArt}
          activeSession={currentGame.activeSession}
          voiceRecordings={currentGame.voiceRecordings}
          onFinished={handleGameFinished}
        />
      )}

      {phase === GamePhase.Playing && isAdventure && currentGame?.adventureTree && (
        <AdventurePlayView
          adventure={currentGame.adventureTree}
          gameTitle={gameTitle ?? 'Adventure'}
          gameId={currentGame.id}
          familyId={familyId ?? ''}
          storyPlayers={currentGame.storyInputs.players}
          generatedArt={currentGame.generatedArt}
          activeAdventureSession={currentGame.activeAdventureSession}
          voiceRecordings={currentGame.voiceRecordings}
          onFinished={handleAdventureFinished}
          onSaveSession={handleSaveAdventureSession}
        />
      )}

      {phase === GamePhase.Playing && isCards && currentGame?.cardGame && currentGame.cardGame.mechanic === 'matching' && (
        <MatchingPlayView
          cardGame={currentGame.cardGame}
          gameId={currentGame.id}
          familyId={familyId ?? ''}
          storyPlayers={currentGame.storyInputs.players}
          generatedArt={currentGame.generatedArt}
          activeSession={currentGame.activeCardGameSession}
          voiceRecordings={currentGame.voiceRecordings}
          onFinished={handleCardGameFinished}
          onSaveSession={handleSaveCardGameSession}
        />
      )}

      {phase === GamePhase.Playing && isCards && currentGame?.cardGame && currentGame.cardGame.mechanic === 'collecting' && (
        <CollectingPlayView
          cardGame={currentGame.cardGame}
          gameId={currentGame.id}
          familyId={familyId ?? ''}
          storyPlayers={currentGame.storyInputs.players}
          generatedArt={currentGame.generatedArt}
          activeSession={currentGame.activeCardGameSession}
          voiceRecordings={currentGame.voiceRecordings}
          onFinished={handleCardGameFinished}
          onSaveSession={handleSaveCardGameSession}
        />
      )}

      {phase === GamePhase.Playing && isCards && currentGame?.cardGame && currentGame.cardGame.mechanic === 'battle' && (
        <BattlePlayView
          cardGame={currentGame.cardGame}
          gameId={currentGame.id}
          familyId={familyId ?? ''}
          storyPlayers={currentGame.storyInputs.players}
          generatedArt={currentGame.generatedArt}
          activeSession={currentGame.activeCardGameSession}
          voiceRecordings={currentGame.voiceRecordings}
          onFinished={handleCardGameFinished}
          onSaveSession={handleSaveCardGameSession}
        />
      )}

      {phase === GamePhase.Playtesting && !isAdventure && currentGame?.generatedGame && currentGame.id && familyId && activeChildId && !playtestFeedback && (
        <PlaytestView
          game={currentGame.generatedGame}
          gameId={currentGame.id}
          familyId={familyId}
          testerId={activeChildId}
          testerName={children.find((c) => c.id === activeChildId)?.name ?? 'Tester'}
          generatedArt={currentGame.generatedArt}
          voiceRecordings={currentGame.voiceRecordings}
          onComplete={handlePlaytestComplete}
          onCancel={handleBackToWorkshop}
        />
      )}

      {phase === GamePhase.Playtesting && isAdventure && currentGame?.adventureTree && currentGame.id && familyId && activeChildId && !playtestFeedback && (
        <AdventurePlaytestView
          adventure={currentGame.adventureTree}
          gameId={currentGame.id}
          familyId={familyId}
          testerId={activeChildId}
          testerName={children.find((c) => c.id === activeChildId)?.name ?? 'Tester'}
          generatedArt={currentGame.generatedArt}
          voiceRecordings={currentGame.voiceRecordings}
          onComplete={handlePlaytestComplete}
          onCancel={handleBackToWorkshop}
        />
      )}

      {phase === GamePhase.Playtesting && playtestFeedback && (currentGame?.generatedGame || currentGame?.adventureTree || currentGame?.cardGame) && (
        <PlaytestSummaryView
          feedback={playtestFeedback}
          cards={currentGame?.generatedGame?.challengeCards ?? []}
          adventureTree={currentGame?.adventureTree}
          testerName={children.find((c) => c.id === activeChildId)?.name ?? 'Tester'}
          gameTitle={gameTitle ?? 'Game'}
          onSendToCreator={handleSendPlaytest}
          onPlayAgain={handlePlaytestAgain}
          onBack={handleBackToWorkshop}
        />
      )}

      {phase === GamePhase.PlaytestReview && currentGame && activePlaytestSession && familyId && activeChildId && (
        <PlaytestReviewView
          game={currentGame}
          playtestSession={activePlaytestSession}
          familyId={familyId}
          childId={activeChildId}
          onSaveRevisions={handleSaveRevisions}
          onRequestRetest={handleRequestRetest}
          onBack={handleBackToWorkshop}
        />
      )}

      {phase === GamePhase.Finished && (currentGame?.generatedGame || currentGame?.adventureTree || currentGame?.cardGame) && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            {isCards ? 'Card Game Complete!' : isAdventure ? 'Adventure Complete!' : 'Game Over!'}
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
            {gameTitle} — Played by the Barnes Family!
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

      {/* Resume dialog */}
      <Dialog open={resumeDialogOpen} onClose={() => setResumeDialogOpen(false)}>
        <DialogTitle>Pick up where you left off?</DialogTitle>
        <DialogContent>
          <Typography>
            You were playing <strong>{gameTitle}</strong> with{' '}
            {resumePlayerNames}.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleStartOver}>Start Over</Button>
          <Button variant="contained" onClick={handleContinueGame}>
            Continue {isCards ? 'Card Game' : isAdventure ? 'Adventure' : 'Game'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm restart dialog */}
      <Dialog open={confirmRestartOpen} onClose={handleCancelRestart}>
        <DialogTitle>Start Over?</DialogTitle>
        <DialogContent>
          <Typography>
            Start a brand new {isCards ? 'card game' : isAdventure ? 'adventure' : 'game'}? The old one won&apos;t be saved.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelRestart}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmRestart}>
            Start Over
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
