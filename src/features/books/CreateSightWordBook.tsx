import { useCallback, useMemo, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import EditIcon from '@mui/icons-material/Edit'
import PublishIcon from '@mui/icons-material/Publish'

import Page from '../../components/Page'
import { ErrorState } from '../../components/states'
import { practiceWordsUsedIn, storyReadabilityClause } from './storyPracticeWords'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Book, BookPage } from '../../core/types'
import { booksCollection } from '../../core/firebase/firestore'
import { addDoc } from 'firebase/firestore'
import { generatePageId } from './bookTypes'
import { inferBookTheme } from './bookThemeInference'
import { useStoryGenerator } from './useStoryGenerator'
import type { GeneratedStory } from './useStoryGenerator'
import { useSightWordProgress } from './useSightWordProgress'
import {
  DOLCH_PRE_PRIMER,
  DOLCH_PRIMER,
  LONDON_STARTER_WORDS,
  CHILD_BOOK_DEFAULTS,
} from './sightWordMastery'
import { DEFAULT_TARGET_PAGE_COUNT } from './storyPageTargets'
import { SAMPLE_STORY } from './sampleStory'

interface LocationState {
  prefillWords?: string[]
  source?: string
  childId?: string
  theme?: string
}

export default function CreateSightWordBook() {
  const navigate = useNavigate()
  const location = useLocation()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''

  const { generateStory, loading: generating, error: genError } = useStoryGenerator()
  const { getWeakWords, loading: progressLoading } = useSightWordProgress(familyId, childId)

  const isLincoln = (activeChild?.name ?? '').toLowerCase() === 'lincoln'
  const childDefaults = isLincoln ? CHILD_BOOK_DEFAULTS.lincoln : CHILD_BOOK_DEFAULTS.london

  const [wordsInput, setWordsInput] = useState('')
  const [theme, setTheme] = useState('')
  // Default to the shared priced-product size (FEAT-97); the slider still lets a
  // parent target any length in the 5–15 range for this sight-word tool.
  const [pageCount, setPageCount] = useState<number>(DEFAULT_TARGET_PAGE_COUNT)
  const [preview, setPreview] = useState<GeneratedStory | null>(null)
  /** The named failure from the last generate attempt (UX-117); `null` when none. */
  const [genFailure, setGenFailure] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Pre-fill words from navigation state (e.g., from Word Wall)
  useEffect(() => {
    const state = location.state as LocationState | null
    if (state?.prefillWords && state.prefillWords.length > 0) {
      setWordsInput(state.prefillWords.join(', '))
      if (!theme) setTheme(state.theme ?? childDefaults.defaultTheme)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wordList = wordsInput
    .split(/[,\n]+/)
    .map(w => w.trim().toLowerCase())
    .filter(Boolean)

  const handlePresetList = useCallback((words: readonly string[]) => {
    setWordsInput(words.join(', '))
  }, [])

  const handleWeakWords = useCallback(() => {
    const weak = getWeakWords()
    if (weak.length > 0) {
      setWordsInput(weak.join(', '))
    }
  }, [getWeakWords])

  const handleGenerate = useCallback(async () => {
    if (wordList.length === 0) return
    // A failure here used to be an unhandled rejection: the button un-spun and
    // the screen said nothing (UX-117). The hook now names which of the three
    // failures happened; this shows that name.
    setGenFailure(null)
    try {
      const result = await generateStory(
        familyId,
        childId,
        wordList,
        theme || childDefaults.defaultTheme,
        pageCount,
      )
      setPreview(result)
    } catch (err) {
      setPreview(null)
      setGenFailure(err instanceof Error ? err.message : String(err))
    }
  }, [familyId, childId, wordList, theme, pageCount, generateStory, childDefaults.defaultTheme])

  /**
   * Which requested words the pages actually hold, and therefore which they do
   * not (UX-119). `preview.missedWords` is whatever the model said it missed;
   * FEAT-169 stopped trusting that claim in the chat and computes it from the
   * text instead. Same task, so: same standard.
   */
  const missedWords = useMemo(() => {
    if (!preview) return []
    // The requested list is the parent's typed/picked words and ONLY those —
    // the same `wordList` the publish path writes as `book.sightWords`. It
    // deliberately does not union in `preview.allSightWordsUsed`: that is the
    // model's own claim about what it used, which is exactly the number
    // UX-119 exists to stop repeating, and it is absent on a real reply
    // anyway (the server emits `allWordsUsed` — Codex P1, PR #1748).
    const requested = [...new Set(wordList)]
    const used = new Set(
      practiceWordsUsedIn(preview.pages, requested).map((w) => w.toLowerCase()),
    )
    return requested.filter((w) => !used.has(w.toLowerCase()))
  }, [preview, wordList])

  const readabilityClause = useMemo(
    () => storyReadabilityClause(activeChild?.name ?? 'this reader', preview?.readability),
    [activeChild?.name, preview?.readability],
  )

  const handleUseSample = useCallback(() => {
    setPreview(SAMPLE_STORY)
    setWordsInput(SAMPLE_STORY.allSightWordsUsed.join(', '))
    setTheme('Minecraft adventure with a cat')
  }, [])

  const handlePublish = useCallback(async () => {
    if (!preview || !familyId || !childId) return
    setPublishing(true)
    try {
      const now = new Date().toISOString()
      const pages: BookPage[] = preview.pages.map((p) => ({
        id: generatePageId(),
        pageNumber: p.pageNumber,
        text: p.text,
        images: [],
        layout: 'text-only' as const,
        createdAt: now,
        updatedAt: now,
        sightWordsOnPage: p.sightWordsOnPage,
      }))

      const newBook: Omit<Book, 'id'> = {
        childId,
        title: preview.title,
        pages,
        status: 'complete',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['Reading', 'LanguageArts'],
        bookType: 'sight-word',
        source: 'ai-generated',
        sightWords: [...new Set(wordList)],
        theme: inferBookTheme('', wordList, 'storybook'),
        createdBy: 'parent',
        createdFor: childId,
        generationConfig: {
          words: wordList,
          theme: theme || childDefaults.defaultTheme,
          difficulty: childDefaults.difficulty,
          pageCount,
        },
      }

      const docRef = await addDoc(booksCollection(familyId), newBook as Book)
      navigate(`/books/${docRef.id}/read`)
    } finally {
      setPublishing(false)
    }
  }, [preview, familyId, childId, wordList, theme, pageCount, navigate, childDefaults])

  const handleEditInEditor = useCallback(async () => {
    if (!preview || !familyId || !childId) return
    setPublishing(true)
    try {
      const now = new Date().toISOString()
      const pages: BookPage[] = preview.pages.map((p) => ({
        id: generatePageId(),
        pageNumber: p.pageNumber,
        text: p.text,
        images: [],
        layout: 'text-only' as const,
        createdAt: now,
        updatedAt: now,
        sightWordsOnPage: p.sightWordsOnPage,
      }))

      const newBook: Omit<Book, 'id'> = {
        childId,
        title: preview.title,
        pages,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['Reading', 'LanguageArts'],
        bookType: 'sight-word',
        source: 'ai-generated',
        sightWords: [...new Set(wordList)],
        theme: inferBookTheme('', wordList, 'storybook'),
        createdBy: 'parent',
        createdFor: childId,
        generationConfig: {
          words: wordList,
          theme: theme || childDefaults.defaultTheme,
          difficulty: childDefaults.difficulty,
          pageCount,
        },
      }

      const docRef = await addDoc(booksCollection(familyId), newBook as Book)
      navigate(`/books/${docRef.id}`)
    } finally {
      setPublishing(false)
    }
  }, [preview, familyId, childId, wordList, theme, pageCount, navigate, childDefaults])

  return (
    <Page>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/books')}
          sx={{ minHeight: 44 }}
        >
          My Books
        </Button>
      </Stack>

      <Typography variant="h5" fontWeight={700}>
        Make a sight word book
      </Typography>

      {/* Prefill banner from Word Wall */}
      {(location.state as LocationState | null)?.source === 'word-wall' && (
        <Alert severity="info" sx={{ mb: 0 }}>
          These words come from {activeChild?.name ?? 'your child'}&apos;s quest work \u2014 the patterns
          {' '}{activeChild?.name ?? 'your child'} is practicing right now.
        </Alert>
      )}

      {/* Word input */}
      <Box>
        <TextField
          label="Sight words (type or paste, comma-separated)"
          placeholder="the, is, was, and, he, she, cat, dog, run, sun, water, where, could"
          value={wordsInput}
          onChange={(e) => setWordsInput(e.target.value)}
          multiline
          rows={3}
          fullWidth
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Word count: {wordList.length}
        </Typography>
      </Box>

      {/* Preset word lists */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Or pick a list:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label="Dolch Pre-Primer"
            onClick={() => handlePresetList(DOLCH_PRE_PRIMER)}
            variant="outlined"
            sx={{ minHeight: 40 }}
          />
          <Chip
            label="Dolch Primer"
            onClick={() => handlePresetList(DOLCH_PRIMER)}
            variant="outlined"
            sx={{ minHeight: 40 }}
          />
          {!isLincoln && (
            <Chip
              label="London's Starter Words"
              onClick={() => handlePresetList(LONDON_STARTER_WORDS)}
              variant="outlined"
              color="secondary"
              sx={{ minHeight: 40 }}
            />
          )}
          <Chip
            label="Words needing work"
            onClick={handleWeakWords}
            variant="outlined"
            color="warning"
            disabled={progressLoading}
            sx={{ minHeight: 40 }}
          />
          <Chip
            label="Try sample story"
            onClick={handleUseSample}
            variant="outlined"
            color="info"
            sx={{ minHeight: 40 }}
          />
        </Stack>
      </Box>

      {/* Theme */}
      <TextField
        label="Story idea"
        placeholder="Minecraft adventure with a cat"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        fullWidth
      />

      {/* Page count slider */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Pages: {pageCount}
        </Typography>
        <Slider
          value={pageCount}
          onChange={(_, val) => setPageCount(val as number)}
          min={5}
          max={15}
          step={1}
          marks
          valueLabelDisplay="auto"
        />
      </Box>

      {/* Generate button */}
      <Button
        variant="contained"
        size="large"
        startIcon={generating ? <CircularProgress size={20} /> : <AutoFixHighIcon />}
        onClick={() => { void handleGenerate() }}
        disabled={wordList.length === 0 || generating}
        sx={{ minHeight: 56 }}
      >
        {generating ? 'Making\u2026' : 'Make the story'}
      </Button>

      {/* The named failure (UX-117) takes precedence: it says which of the
          three shapes happened and what to tap next. `genError` is `useAI`'s
          own transport error and still shows when there is nothing better. */}
      {genFailure ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {genFailure}
        </Alert>
      ) : (
        genError && <ErrorState message={genError.message} />
      )}

      {/* Preview */}
      {preview && (
        <Box>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Preview: {preview.title}
          </Typography>

          {/* The honest line (UX-117): the server measured this story against
              the child's level here exactly as it does in the chat, and this
              screen used to drop the answer on the floor. It reports on the
              STORY, never on the child, and the story is still perfectly
              usable — it just doesn't pretend. */}
          {readabilityClause && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {readabilityClause}
            </Alert>
          )}

          {/* Checked against the page text, not the model's own claim (UX-119)
              — the chat computes it this way for the same reason: the list the
              model returned was not to be trusted. */}
          {missedWords.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Missed words: {missedWords.join(', ')}
            </Alert>
          )}

          <Stack spacing={2}>
            {preview.pages.map((page) => (
              <Box
                key={page.pageNumber}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Page {page.pageNumber}
                </Typography>
                <Typography variant="body1" sx={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
                  {page.text}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  {page.sightWordsOnPage.slice(0, 15).map((w, i) => (
                    <Chip key={`${w}-${i}`} label={w} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => { void handleEditInEditor() }}
              disabled={publishing}
              sx={{ minHeight: 48 }}
            >
              Edit in Book Editor
            </Button>
            <Button
              variant="contained"
              startIcon={publishing ? <CircularProgress size={18} /> : <PublishIcon />}
              onClick={() => { void handlePublish() }}
              disabled={publishing}
              sx={{ minHeight: 48 }}
            >
              {publishing ? 'Finishing\u2026' : 'Finish book'}
            </Button>
          </Stack>
        </Box>
      )}
    </Page>
  )
}
