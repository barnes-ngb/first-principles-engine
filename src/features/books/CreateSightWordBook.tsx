import { useCallback, useState, useEffect } from 'react'
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
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Book, BookPage } from '../../core/types'
import { booksCollection } from '../../core/firebase/firestore'
import { addDoc } from 'firebase/firestore'
import { generatePageId } from './bookTypes'
import { inferBookTheme } from './useBookGenerator'
import { useStoryGenerator } from './useStoryGenerator'
import type { GeneratedStory } from './useStoryGenerator'
import { useSightWordProgress } from './useSightWordProgress'
import {
  DOLCH_PRE_PRIMER,
  DOLCH_PRIMER,
  LONDON_STARTER_WORDS,
  CHILD_BOOK_DEFAULTS,
} from './sightWordMastery'
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
  const [pageCount, setPageCount] = useState<number>(childDefaults.pageCount)
  const [preview, setPreview] = useState<GeneratedStory | null>(null)
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
    const result = await generateStory(
      familyId,
      childId,
      wordList,
      theme || childDefaults.defaultTheme,
      pageCount,
    )
    if (result) setPreview(result)
  }, [familyId, childId, wordList, theme, pageCount, generateStory, childDefaults.defaultTheme])

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
          Back to My Books
        </Button>
      </Stack>

      <Typography variant="h5" fontWeight={700}>
        Create a Sight Word Story
      </Typography>

      {/* Prefill banner from Word Wall */}
      {(location.state as LocationState | null)?.source === 'word-wall' && (
        <Alert severity="info" sx={{ mb: 0 }}>
          These words come from {activeChild?.name ?? 'your child'}&apos;s quest data. They&apos;re struggling with these patterns.
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
        label="Theme"
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
        {generating ? 'Generating...' : 'Generate Story'}
      </Button>

      {genError && (
        <Alert severity="error">{genError.message}</Alert>
      )}

      {/* Preview */}
      {preview && (
        <Box>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Preview: {preview.title}
          </Typography>

          {preview.missedWords.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Missed words: {preview.missedWords.join(', ')}
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
              {publishing ? 'Publishing...' : 'Publish'}
            </Button>
          </Stack>
        </Box>
      )}
    </Page>
  )
}
