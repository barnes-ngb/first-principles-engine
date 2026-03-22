import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import Typography from '@mui/material/Typography'
import type { StoryInputs } from '../../core/types'
import { useTTS } from '../../core/hooks/useTTS'
import { useWorkshopWizard } from './useWorkshopWizard'
import ThemeStep from './steps/ThemeStep'
import CharactersStep from './steps/CharactersStep'
import GoalStep from './steps/GoalStep'
import ChallengesStep from './steps/ChallengesStep'
import BoardStyleStep from './steps/BoardStyleStep'
import { useEffect, useRef } from 'react'
import type { TapToHearRef } from './workshopTypes'

const STEP_LABELS = ['Theme', 'Characters', 'Goal', 'Challenges', 'Board']

const STEP_PROMPTS = [
  "Hey Story Keeper! What's your new game about?",
  "Who's in your story? Tell me their names!",
  'What are they trying to do?',
  'Every good game has tricky parts! What kinds of challenges should players face?',
  "Almost done! What shape should your game board be?",
]

interface WorkshopWizardProps {
  onComplete: (inputs: StoryInputs) => void
  onCancel: () => void
}

export default function WorkshopWizard({ onComplete, onCancel }: WorkshopWizardProps) {
  const wizard = useWorkshopWizard()
  const tts = useTTS()
  const lastSpokenStep = useRef(-1)

  // Refs for steps that use tap-to-hear (to auto-confirm on Next)
  const themeRef = useRef<TapToHearRef>(null)
  const goalRef = useRef<TapToHearRef>(null)
  const challengesRef = useRef<TapToHearRef>(null)
  const boardRef = useRef<TapToHearRef>(null)

  const stepRefs = [themeRef, null, goalRef, challengesRef, boardRef]

  // Speak the prompt when the step changes
  useEffect(() => {
    if (wizard.state.step !== lastSpokenStep.current) {
      lastSpokenStep.current = wizard.state.step
      tts.speak(STEP_PROMPTS[wizard.state.step])
    }
  }, [wizard.state.step, tts])

  const handleNext = () => {
    // Auto-confirm any highlighted-but-unconfirmed tile before advancing
    const ref = stepRefs[wizard.state.step]
    if (ref?.current) {
      ref.current.confirmHighlighted()
    }

    if (wizard.state.step === 4) {
      // Final step — complete the wizard
      tts.cancel()
      onComplete(wizard.buildStoryInputs())
    } else {
      wizard.nextStep()
    }
  }

  const handleBack = () => {
    wizard.prevStep()
  }

  const handleCancel = () => {
    tts.cancel()
    wizard.reset()
    onCancel()
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      {/* Stepper */}
      <Stepper activeStep={wizard.state.step} sx={{ mb: 3 }}>
        {STEP_LABELS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step content */}
      <Box sx={{ minHeight: 300, mb: 3 }}>
        {wizard.state.step === 0 && (
          <ThemeStep value={wizard.state.theme} onChange={wizard.setTheme} stepRef={themeRef} />
        )}
        {wizard.state.step === 1 && (
          <CharactersStep value={wizard.state.characters} onChange={wizard.setCharacters} />
        )}
        {wizard.state.step === 2 && (
          <GoalStep value={wizard.state.goal} onChange={wizard.setGoal} stepRef={goalRef} />
        )}
        {wizard.state.step === 3 && (
          <ChallengesStep
            value={wizard.state.challenges}
            onChange={wizard.setChallenges}
            stepRef={challengesRef}
          />
        )}
        {wizard.state.step === 4 && (
          <BoardStyleStep
            boardStyle={wizard.state.boardStyle}
            boardLength={wizard.state.boardLength}
            onStyleChange={wizard.setBoardStyle}
            onLengthChange={wizard.setBoardLength}
            stepRef={boardRef}
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
            {wizard.state.step === 4 ? (
              <Typography sx={{ fontWeight: 700 }}>Create My Game!</Typography>
            ) : (
              'Next'
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
