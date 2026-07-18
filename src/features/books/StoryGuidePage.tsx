import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useBookGenerator, inferBookTheme } from './useBookGenerator'
import { useSightWordProgress } from './useSightWordProgress'
import StoryGuideQuestion from './StoryGuideQuestion'
import GenerationProgress from './GenerationProgress'
import StoryLengthSelector from './StoryLengthSelector'
import { useStoryGuide, assembleStoryPrompt } from './useStoryGuide'
import { DEFAULT_TARGET_PAGE_COUNT } from './storyPageTargets'

/** Compute age in years from a YYYY-MM-DD birthdate string. */
function ageFromBirthdate(birthdate: string | undefined, fallback: number): number {
  if (!birthdate) return fallback
  try {
    const birth = new Date(birthdate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age > 0 ? age : fallback
  } catch {
    return fallback
  }
}

type WizardStep = 'questions' | 'questions-done' | 'brief-preview' | 'generating'

export default function StoryGuidePage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const childName = activeChild?.name ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const childAge = ageFromBirthdate(activeChild?.birthdate, isLincoln ? 10 : 6)
  // Target page count is a product decision (FEAT-97) — default to the priced
  // product size (10), let the kid pick Short / Normal / Long.
  const [pageCount, setPageCount] = useState<number>(DEFAULT_TARGET_PAGE_COUNT)
  const genStyle = isLincoln ? 'minecraft' : 'storybook'

  const { generateBook, progress, generating, resetProgress } = useBookGenerator()
  const { getWeakWords, loading: sightWordsLoading } = useSightWordProgress(familyId, childId)

  const guide = useStoryGuide(isLincoln)
  const [wizardStep, setWizardStep] = useState<WizardStep>('questions')
  const [generationError, setGenerationError] = useState<string | null>(null)

  const accentColor = isLincoln ? '#4caf50' : '#f06292'
  const accentHover = isLincoln ? '#388e3c' : '#e91e8c'

  // Derive transition: once questions are done, jump straight to brief-preview
  // (AI shaping step removed per Story Gen V2 §6.3).
  const effectiveWizardStep: WizardStep =
    guide.isDone && wizardStep === 'questions' ? 'brief-preview' : wizardStep

  // ── Story generation ─────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!familyId || !childId) return
    setGenerationError(null)
    setWizardStep('generating')

    const sightWords = getWeakWords().slice(0, 10)
    const brief = guide.assembleBrief(childId, childAge, sightWords)
    const storyIdea = assembleStoryPrompt(brief, pageCount)
    const words = brief.sightWords ?? []
    const bookTheme = inferBookTheme(
      [brief.hero, brief.setting, brief.problem, brief.solution, brief.ending].filter(Boolean).join(' '),
      words,
      genStyle,
    )

    const bookId = await generateBook(familyId, childId, storyIdea, words, genStyle, pageCount, bookTheme)

    if (bookId) {
      setTimeout(() => {
        resetProgress()
        navigate(`/books/${bookId}`)
      }, 1500)
    } else {
      setGenerationError('Failed to generate the book. Please try again.')
      setWizardStep('brief-preview')
    }
  }, [
    familyId,
    childId,
    childAge,
    pageCount,
    genStyle,
    getWeakWords,
    guide,
    generateBook,
    resetProgress,
    navigate,
  ])

  // ── Render: generation in progress ───────────────────────────

  if (effectiveWizardStep === 'generating' && progress) {
    return (
      <Page>
        <GenerationProgress progress={progress} isLincoln={isLincoln} />
        {progress.phase === 'error' && (
          <Stack alignItems="center" sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              onClick={() => {
                resetProgress()
                setWizardStep('brief-preview')
              }}
            >
              Back to Story
            </Button>
          </Stack>
        )}
      </Page>
    )
  }

  // ── Render: questions wizard ─────────────────────────────────

  if (effectiveWizardStep === 'questions') {
    return (
      <Page>
        <Stack spacing={2} sx={{ py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('/books')}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              Bookshelf
            </Button>
            <Box sx={{ flex: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Question {guide.currentIndex + 1} of {guide.questions.length}
            </Typography>
          </Stack>

          <Typography
            variant="h5"
            component="h1"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              ...(isLincoln
                ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.85rem', lineHeight: 2 }
                : {}),
            }}
          >
            {isLincoln ? "Let's make your story!" : "Let's tell a story together!"}
          </Typography>

          <StoryGuideQuestion
            question={guide.questions[guide.currentIndex]}
            questionNumber={guide.currentIndex + 1}
            totalQuestions={guide.questions.length}
            inputMode={guide.inputMode}
            onSetInputMode={guide.setInputMode}
            typedValue={guide.typedValue}
            onTypedChange={guide.setTypedValue}
            voiceState={guide.voiceState}
            transcription={guide.transcription}
            onStartRecording={guide.startRecording}
            onStopRecording={guide.stopRecording}
            onConfirmTranscription={guide.confirmTranscription}
            onRetryRecording={guide.retryRecording}
            onAdvance={guide.advanceWithTyped}
            onSkip={guide.skip}
            onBack={guide.goBack}
            canGoBack={guide.currentIndex > 0}
            isLincoln={isLincoln}
          />
        </Stack>
      </Page>
    )
  }

  // ── Render: brief preview + Generate button ──────────────────

  const sightWords = getWeakWords().slice(0, 10)
  const brief = guide.assembleBrief(childId, childAge, sightWords)
  const storyPromptPreview = assembleStoryPrompt(brief, pageCount)

  return (
    <Page>
      <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            textAlign: 'center',
            ...(isLincoln
              ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.85rem', lineHeight: 2 }
              : {}),
          }}
        >
          Your Story
        </Typography>

        {/* Story brief summary */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: isLincoln ? 'grey.900' : '#fff8f0',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {[
            { label: 'Hero', value: brief.hero },
            { label: 'Setting', value: brief.setting },
            { label: 'Problem', value: brief.problem },
            { label: 'Solution', value: brief.solution },
            { label: 'Ending', value: brief.ending },
            ...(brief.extraDetail ? [{ label: 'Extra detail', value: brief.extraDetail }] : []),
          ].map(({ label, value }) =>
            value ? (
              <Box key={label} sx={{ mb: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, display: 'block' }}
                >
                  {label}
                </Typography>
                <Typography variant="body2">{value}</Typography>
              </Box>
            ) : null,
          )}
          {sightWords.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, display: 'block' }}
              >
                Sight words to practice
              </Typography>
              <Typography variant="body2">{sightWords.join(', ')}</Typography>
            </Box>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          "{storyPromptPreview.length > 120 ? storyPromptPreview.slice(0, 120) + '...' : storyPromptPreview}"
        </Typography>

        <StoryLengthSelector value={pageCount} onChange={setPageCount} disabled={generating} />

        {generationError && (
          <Alert severity="error" onClose={() => setGenerationError(null)}>
            {generationError}
          </Alert>
        )}

        <Stack spacing={2}>
          <Button
            variant="contained"
            size="large"
            startIcon={
              generating ? <CircularProgress size={20} color="inherit" /> : <AutoStoriesIcon />
            }
            onClick={handleGenerate}
            disabled={generating || sightWordsLoading}
            sx={{
              minHeight: 56,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '1.1rem',
              bgcolor: accentColor,
              '&:hover': { bgcolor: accentHover },
            }}
          >
            Generate My Book! →
          </Button>

          <Button
            variant="text"
            onClick={() => {
              setWizardStep('questions')
            }}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            ← Change my answers
          </Button>
        </Stack>
      </Stack>
    </Page>
  )
}
