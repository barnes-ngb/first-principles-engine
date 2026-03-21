import { useCallback, useEffect, useState } from 'react'
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
import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { useBookGenerator } from './useBookGenerator'
import { useSightWordProgress } from './useSightWordProgress'
import StoryGuideQuestion from './StoryGuideQuestion'
import GenerationProgress from './GenerationProgress'
import { useStoryGuide, assembleStoryPrompt } from './useStoryGuide'

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

type WizardStep = 'questions' | 'questions-done' | 'ai-shaping' | 'brief-preview' | 'generating'

export default function StoryGuidePage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const childName = activeChild?.name ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const childAge = ageFromBirthdate(activeChild?.birthdate, isLincoln ? 10 : 6)
  const pageCount = isLincoln ? 10 : 6
  const genStyle = isLincoln ? 'minecraft' : 'storybook'

  const { chat } = useAI()
  const { generateBook, progress, generating, resetProgress } = useBookGenerator()
  const { getWeakWords, loading: sightWordsLoading } = useSightWordProgress(familyId, childId)

  const guide = useStoryGuide(isLincoln)
  const [wizardStep, setWizardStep] = useState<WizardStep>('questions')
  const [aiShapingLoading, setAiShapingLoading] = useState(false)
  const [aiShapingError, setAiShapingError] = useState<string | null>(null)
  const [shapingTyped, setShapingTyped] = useState('')
  const [generationError, setGenerationError] = useState<string | null>(null)

  const accentColor = isLincoln ? '#4caf50' : '#f06292'
  const accentHover = isLincoln ? '#388e3c' : '#e91e8c'

  // ── Watch for wizard completion ──────────────────────────────

  useEffect(() => {
    if (guide.isDone && wizardStep === 'questions') {
      setWizardStep('questions-done')
    }
  }, [guide.isDone, wizardStep])

  // ── AI shaping step ──────────────────────────────────────────

  const handleRequestAiShaping = useCallback(async () => {
    if (!familyId || !childId) return
    setAiShapingLoading(true)
    setAiShapingError(null)

    const answersText = [
      `Hero: ${guide.answers[0] || '(skipped)'}`,
      `Setting: ${guide.answers[1] || '(skipped)'}`,
      `Problem: ${guide.answers[2] || '(skipped)'}`,
      `Solution: ${guide.answers[3] || '(skipped)'}`,
      `Ending: ${guide.answers[4] || '(skipped)'}`,
    ].join('\n')

    const prompt = `You are a kind story helper for a ${childAge}-year-old child. They answered these questions about their story:\n${answersText}\n\nIn 2-3 sentences, suggest one fun detail they could add to make the story more exciting. Ask it as a simple question they can answer yes or no, or with one word. Ask only ONE follow-up question. Keep it very simple.`

    const result = await chat({
      familyId,
      childId,
      taskType: 'chat' as TaskType,
      messages: [{ role: 'user', content: prompt }],
    })

    setAiShapingLoading(false)

    if (result?.message) {
      guide.setAiShapingQuestion(result.message)
      guide.speakText(result.message)
      setWizardStep('ai-shaping')
    } else {
      setAiShapingError('Could not get a suggestion — you can skip this step.')
    }
  }, [familyId, childId, childAge, chat, guide])

  const handleAiShapingSubmit = useCallback(() => {
    if (shapingTyped.trim()) {
      guide.setAiShapingAnswer(shapingTyped.trim())
    }
    setWizardStep('brief-preview')
  }, [shapingTyped, guide])

  // ── Story generation ─────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!familyId || !childId) return
    setGenerationError(null)
    setWizardStep('generating')

    const sightWords = getWeakWords().slice(0, 10)
    const brief = guide.assembleBrief(childId, childAge, sightWords)
    const storyIdea = assembleStoryPrompt(brief, pageCount)
    const words = brief.sightWords ?? []

    const bookId = await generateBook(familyId, childId, storyIdea, words, genStyle, pageCount)

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

  if (wizardStep === 'generating' && progress) {
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

  if (wizardStep === 'questions') {
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

  // ── Render: questions done — offer AI shaping ────────────────

  if (wizardStep === 'questions-done') {
    return (
      <Page>
        <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              ...(isLincoln
                ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.9rem' }
                : {}),
            }}
          >
            {isLincoln ? 'Story ready! 🎮' : 'Your story is ready! 🌟'}
          </Typography>

          {aiShapingError && (
            <Alert severity="warning" onClose={() => setAiShapingError(null)}>
              {aiShapingError}
            </Alert>
          )}

          <Typography variant="body1" textAlign="center" color="text.secondary">
            {isLincoln
              ? 'Want to make it even more epic? Let AI suggest one more cool detail!'
              : 'Want to make it even more magical? I can suggest one more special detail!'}
          </Typography>

          <Stack spacing={2}>
            <Button
              variant="outlined"
              size="large"
              onClick={handleRequestAiShaping}
              disabled={aiShapingLoading || sightWordsLoading}
              sx={{ minHeight: 52, textTransform: 'none' }}
            >
              {aiShapingLoading && <CircularProgress size={18} sx={{ mr: 1 }} />}
              {isLincoln ? 'Make it even more epic! →' : 'Make it even more magical! →'}
            </Button>
            <Button
              variant="contained"
              size="large"
              startIcon={<AutoStoriesIcon />}
              onClick={() => setWizardStep('brief-preview')}
              sx={{
                minHeight: 52,
                textTransform: 'none',
                bgcolor: accentColor,
                '&:hover': { bgcolor: accentHover },
              }}
            >
              Skip → Review My Story
            </Button>
          </Stack>
        </Stack>
      </Page>
    )
  }

  // ── Render: AI shaping question ──────────────────────────────

  if (wizardStep === 'ai-shaping') {
    return (
      <Page>
        <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              ...(isLincoln
                ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.75rem', lineHeight: 2 }
                : {}),
            }}
          >
            {isLincoln ? 'One more idea...' : 'One more magical idea...'}
          </Typography>

          {guide.aiShapingQuestion && (
            <Box
              sx={{
                p: 3,
                borderRadius: 3,
                bgcolor: isLincoln ? 'grey.900' : '#fff8f0',
                border: '2px solid',
                borderColor: accentColor,
                textAlign: 'center',
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                {guide.aiShapingQuestion}
              </Typography>
            </Box>
          )}

          <textarea
            value={shapingTyped}
            onChange={(e) => setShapingTyped(e.target.value)}
            placeholder="Type your answer..."
            rows={3}
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid #ccc',
              padding: 12,
              fontSize: '1rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />

          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              onClick={handleAiShapingSubmit}
              disabled={!shapingTyped.trim()}
              sx={{
                bgcolor: accentColor,
                '&:hover': { bgcolor: accentHover },
                textTransform: 'none',
              }}
            >
              Add this detail!
            </Button>
            <Button
              variant="outlined"
              onClick={() => setWizardStep('brief-preview')}
              sx={{ textTransform: 'none' }}
            >
              Skip
            </Button>
          </Stack>
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
