import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import Typography from '@mui/material/Typography'
import type { StoryInputs } from '../../core/types'
import type { GameType } from '../../core/types/workshop'
import { useTTS } from '../../core/hooks/useTTS'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useWorkshopWizard, getTotalSteps } from './useWorkshopWizard'
import type { WizardState } from './useWorkshopWizard'
import GameTypeStep from './steps/GameTypeStep'
import ThemeStep from './steps/ThemeStep'
import PlayersStep from './steps/PlayersStep'
import GoalStep from './steps/GoalStep'
import ChallengesStep from './steps/ChallengesStep'
import BoardStyleStep from './steps/BoardStyleStep'
import StorySetupStep from './steps/StorySetupStep'
import ChoicesStep from './steps/ChoicesStep'
import AdventureLengthStep from './steps/AdventureLengthStep'
import { useEffect, useRef } from 'react'
import type { TapToHearRef } from './workshopTypes'

function getStepLabels(gameType: GameType | ''): string[] {
  if (gameType === 'adventure') {
    return ['Game Type', 'Theme', 'Players', 'Story', 'Choices', 'Length']
  }
  return ['Game Type', 'Theme', 'Players', 'Goal', 'Challenges', 'Board']
}

function getStepPrompts(gameType: GameType | ''): string[] {
  if (gameType === 'adventure') {
    return [
      "What kind of game do you want to make? A board game where you race to the finish, or an adventure story where everyone picks what happens?",
      "Hey Story Keeper! What's your new adventure about?",
      "Who's going on this adventure? Pick your players!",
      "Tell me about your adventure! Who is it about and what happens to them?",
      "In your story, what choices do people get to make? Like... do they go left or right? Do they open the chest or leave it?",
      "How long should your adventure be?",
    ]
  }
  return [
    "What kind of game do you want to make? A board game where you race to the finish, or an adventure story where everyone picks what happens?",
    "Hey Story Keeper! What's your new game about?",
    "Who's going to play your game? Pick your players!",
    'What are they trying to do?',
    'Every good game has tricky parts! What kinds of challenges should players face?',
    "Almost done! What shape should your game board be?",
  ]
}

interface WorkshopWizardProps {
  onComplete: (inputs: StoryInputs, gameType: GameType) => void
  onCancel: () => void
  /** Called after each step "Next" — saves draft to Firestore */
  onStepSave?: (state: WizardState, step: number) => Promise<string | null>
  /** Initial state for resuming a draft */
  initialState?: Partial<WizardState>
}

export default function WorkshopWizard({ onComplete, onCancel, onStepSave, initialState }: WorkshopWizardProps) {
  const wizard = useWorkshopWizard(initialState)
  const tts = useTTS()
  const lastSpokenStep = useRef(-1)
  const { activeChildId } = useActiveChild()

  // Refs for steps that use tap-to-hear (to auto-confirm on Next)
  const gameTypeRef = useRef<TapToHearRef>(null)
  const themeRef = useRef<TapToHearRef>(null)
  const goalRef = useRef<TapToHearRef>(null)
  const challengesRef = useRef<TapToHearRef>(null)
  const boardRef = useRef<TapToHearRef>(null)
  const adventureLengthRef = useRef<TapToHearRef>(null)

  const isAdventure = wizard.state.gameType === 'adventure'

  // Map step index to ref — depends on game type
  const getStepRef = (step: number): React.RefObject<TapToHearRef | null> | null => {
    switch (step) {
      case 0: return gameTypeRef
      case 1: return themeRef
      case 2: return null // Players
      case 3: return isAdventure ? null : goalRef // StorySetup has no tap-to-hear
      case 4: return isAdventure ? null : challengesRef // Choices has no tap-to-hear
      case 5: return isAdventure ? adventureLengthRef : boardRef
      default: return null
    }
  }

  const stepLabels = getStepLabels(wizard.state.gameType)
  const stepPrompts = getStepPrompts(wizard.state.gameType)
  const totalSteps = getTotalSteps(wizard.state.gameType)

  // Speak the prompt when the step changes
  useEffect(() => {
    if (wizard.state.step !== lastSpokenStep.current) {
      lastSpokenStep.current = wizard.state.step
      tts.speak(stepPrompts[wizard.state.step])
    }
  }, [wizard.state.step, tts, stepPrompts])

  const handleNext = () => {
    // Auto-confirm any highlighted-but-unconfirmed tile before advancing
    const ref = getStepRef(wizard.state.step)
    if (ref?.current) {
      ref.current.confirmHighlighted()
    }

    if (wizard.isFinalStep()) {
      // Final step — complete the wizard
      tts.cancel()
      onComplete(wizard.buildStoryInputs(), wizard.state.gameType as GameType)
    } else {
      // Save draft after each step
      const nextStep = wizard.state.step + 1
      wizard.nextStep()
      onStepSave?.(wizard.state, nextStep)
    }
  }

  const handleBack = () => {
    wizard.prevStep()
  }

  const handleCancel = () => {
    // Save current progress before cancelling (draft persists)
    onStepSave?.(wizard.state, wizard.state.step)
    tts.cancel()
    wizard.reset()
    onCancel()
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      {/* Stepper */}
      <Stepper activeStep={wizard.state.step} sx={{ mb: 3 }}>
        {stepLabels.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step content */}
      <Box sx={{ minHeight: 300, mb: 3 }}>
        {wizard.state.step === 0 && (
          <GameTypeStep
            value={wizard.state.gameType}
            onChange={(v) => wizard.setGameType(v as GameType)}
            stepRef={gameTypeRef}
          />
        )}
        {wizard.state.step === 1 && (
          <ThemeStep value={wizard.state.theme} onChange={wizard.setTheme} stepRef={themeRef} />
        )}
        {wizard.state.step === 2 && (
          <PlayersStep
            value={wizard.state.players}
            onChange={wizard.setPlayers}
            creatorChildId={activeChildId}
          />
        )}

        {/* Board game steps 3-5 */}
        {wizard.state.step === 3 && !isAdventure && (
          <GoalStep value={wizard.state.goal} onChange={wizard.setGoal} stepRef={goalRef} />
        )}
        {wizard.state.step === 4 && !isAdventure && (
          <ChallengesStep
            value={wizard.state.challenges}
            onChange={wizard.setChallenges}
            stepRef={challengesRef}
          />
        )}
        {wizard.state.step === 5 && !isAdventure && (
          <BoardStyleStep
            boardStyle={wizard.state.boardStyle}
            boardLength={wizard.state.boardLength}
            onStyleChange={wizard.setBoardStyle}
            onLengthChange={wizard.setBoardLength}
            stepRef={boardRef}
          />
        )}

        {/* Adventure steps 3-5 */}
        {wizard.state.step === 3 && isAdventure && (
          <StorySetupStep
            value={wizard.state.storySetup}
            onChange={wizard.setStorySetup}
          />
        )}
        {wizard.state.step === 4 && isAdventure && (
          <ChoicesStep
            value={wizard.state.choiceSeeds}
            onChange={wizard.setChoiceSeeds}
          />
        )}
        {wizard.state.step === 5 && isAdventure && (
          <AdventureLengthStep
            value={wizard.state.adventureLength}
            onChange={wizard.setAdventureLength}
            stepRef={adventureLengthRef}
          />
        )}
      </Box>

      {/* Navigation buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Button variant="text" color="inherit" onClick={handleCancel}>
          Cancel
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {wizard.state.step > 0 && (
            <Button variant="outlined" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!wizard.canProceed()}
            size="large"
            sx={{ minWidth: 120 }}
          >
            {wizard.isFinalStep() ? (
              <Typography sx={{ fontWeight: 700 }}>
                {isAdventure ? 'Create My Adventure!' : 'Create My Game!'}
              </Typography>
            ) : (
              'Next'
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
