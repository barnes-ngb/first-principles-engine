import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AddIcon from '@mui/icons-material/Add'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import MicIcon from '@mui/icons-material/Mic'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import StarIcon from '@mui/icons-material/Star'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PrintIcon from '@mui/icons-material/Print'

import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

import Alert from '@mui/material/Alert'
import Page from '../../components/Page'
import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import SaveIndicator from '../../components/SaveIndicator'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useAI } from '../../core/ai/useAI'
import type { BookPage, Sticker } from '../../core/types/domain'
import type { ImageGenRequest } from '../../core/ai/useAI'
import PageEditor from './PageEditor'
import StickerPicker from './StickerPicker'
import { useBook } from './useBook'
import { printBook } from './printBook'
import PrintSettingsDialog from './PrintSettingsDialog'
import type { PrintSettings } from './PrintSettingsDialog'

type VoiceMode = 'record' | 'dictate'

// Check Web Speech API availability
const SpeechRecognitionClass =
  typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    : null
const speechAvailable = !!SpeechRecognitionClass

const AI_SCENE_STYLES_LINCOLN = [
  { value: 'minecraft', label: 'Minecraft' },
  { value: 'storybook', label: 'Storybook' },
  { value: 'comic', label: 'Comic Book' },
  { value: 'realistic', label: 'Realistic' },
] as const

const AI_SCENE_STYLES_LONDON = [
  { value: 'storybook', label: 'Storybook' },
  { value: 'comic', label: 'Comic Book' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'minecraft', label: 'Pixel Art' },
] as const

const WORLD_CHIPS_LINCOLN = [
  { emoji: '\u{1F3D4}\uFE0F', label: 'Adventure world' },
  { emoji: '\u{1F3F0}', label: 'Castle / kingdom' },
  { emoji: '\u{1F30A}', label: 'Ocean / underwater' },
  { emoji: '\u{1F332}', label: 'Forest / jungle' },
  { emoji: '\u{1F680}', label: 'Space' },
  { emoji: '\u{1F3D9}\uFE0F', label: 'City' },
  { emoji: '\u{1F30B}', label: 'Lava / volcano' },
  { emoji: '\u{2744}\uFE0F', label: 'Ice / snow' },
  { emoji: '\u{1F3AA}', label: 'Fantasy' },
] as const

const WORLD_CHIPS_LONDON = [
  { emoji: '\u{1F338}', label: 'Fairy garden' },
  { emoji: '\u{1F431}', label: 'Animal kingdom' },
  { emoji: '\u{1F3F0}', label: 'Princess castle' },
  { emoji: '\u{1F30A}', label: 'Ocean / mermaids' },
  { emoji: '\u{1F308}', label: 'Rainbow land' },
  { emoji: '\u{1F3A8}', label: 'Art studio' },
  { emoji: '\u{1F332}', label: 'Enchanted forest' },
  { emoji: '\u{2601}\uFE0F', label: 'Cloud kingdom' },
] as const

export default function BookEditorPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const { children } = useActiveChild()

  const {
    book,
    loading,
    saveState,
    updatePage,
    addPage,
    deletePage,
    updateBookMeta,
    addImageToPage,
    removeImageFromPage,
    uploadAudio,
    addAiImageToPage,
    addStickerToPage,
    updateImagePosition,
    reorderPages,
  } = useBook(familyId, bookId)

  const { generateImage, loading: aiLoading, error: aiError } = useAI()

  const [activePageIndex, setActivePageIndex] = useState(0)
  const [showPhotoCapture, setShowPhotoCapture] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)

  // Voice state
  const [showVoicePanel, setShowVoicePanel] = useState(false)
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('record')
  const [audioUploading, setAudioUploading] = useState(false)
  const [isDictating, setIsDictating] = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  // AI Scene state
  const [showAiDialog, setShowAiDialog] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiStyle, setAiStyle] = useState(isLincoln ? 'minecraft' : 'storybook')
  const [aiResult, setAiResult] = useState<{ url: string; storagePath: string } | null>(null)

  // Sticker state
  const [showStickerPicker, setShowStickerPicker] = useState(false)

  // Overlay guidance (shown after placing an AI scene)
  const [showOverlayGuide, setShowOverlayGuide] = useState(false)

  // Finish flow state
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)

  // Print state
  const [printing, setPrinting] = useState(false)
  const [showPrintSettings, setShowPrintSettings] = useState(false)

  const activePage = useMemo(
    () => book?.pages[activePageIndex] ?? null,
    [book, activePageIndex],
  )

  const handlePageUpdate = useCallback(
    (changes: Partial<BookPage>) => {
      if (!activePage) return
      updatePage(activePage.id, changes)
    },
    [activePage, updatePage],
  )

  const handleAddPage = useCallback(() => {
    addPage()
    if (book) setActivePageIndex(book.pages.length)
  }, [addPage, book])

  const handleDeletePage = useCallback(() => {
    if (!activePage || !book || book.pages.length <= 1) return
    deletePage(activePage.id)
    setActivePageIndex((prev) => Math.max(0, prev - 1))
  }, [activePage, book, deletePage])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      if (!activePage) return
      await addImageToPage(activePage.id, file)
      setShowPhotoCapture(false)
    },
    [activePage, addImageToPage],
  )

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      if (!activePage) return
      removeImageFromPage(activePage.id, imageId)
    },
    [activePage, removeImageFromPage],
  )

  const handleImagePositionChange = useCallback(
    (imageId: string, position: { x: number; y: number; width: number; height: number }) => {
      if (!activePage) return
      updateImagePosition(activePage.id, imageId, position)
    },
    [activePage, updateImagePosition],
  )

  const handleAddImageFile = useCallback(
    (file: File) => {
      if (!activePage) return
      void addImageToPage(activePage.id, file)
    },
    [activePage, addImageToPage],
  )

  // ── Voice: Audio recording ──────────────────────────────────────
  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      if (!activePage) return
      setAudioUploading(true)
      await uploadAudio(activePage.id, blob)
      setAudioUploading(false)
      setShowVoicePanel(false)
    },
    [activePage, uploadAudio],
  )

  // ── Voice: Speech-to-text (dictation) ───────────────────────────
  const startDictation = useCallback(() => {
    if (!SpeechRecognitionClass || !activePage) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionClass as any)() as any
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    const baseText = activePage.text ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      updatePage(activePage.id, { text: baseText + transcript })
    }
    recognition.onerror = () => {
      setIsDictating(false)
    }
    recognition.onend = () => {
      setIsDictating(false)
    }
    recognition.start()
    recognitionRef.current = recognition
    setIsDictating(true)
  }, [activePage, updatePage])

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsDictating(false)
  }, [])

  // ── AI Scene generation ─────────────────────────────────────────
  const openAiDialog = useCallback(() => {
    const prefill = activePage?.text
      ? `Illustrate: ${activePage.text.slice(0, 100)}`
      : ''
    setAiPrompt(prefill)
    setAiResult(null)
    setShowAiDialog(true)
  }, [activePage])

  const handleGenerateScene = useCallback(async () => {
    if (!aiPrompt.trim()) return
    const result = await generateImage({
      familyId,
      prompt: aiPrompt.trim(),
      style: `book-illustration-${aiStyle}` as ImageGenRequest['style'],
      size: '1024x1024',
    })
    if (result) {
      setAiResult({ url: result.url, storagePath: result.storagePath })
    }
  }, [aiPrompt, aiStyle, familyId, generateImage])

  const handleUseAiImage = useCallback(() => {
    if (!activePage || !aiResult) return
    addAiImageToPage(activePage.id, aiResult.url, aiResult.storagePath, aiPrompt)
    setShowAiDialog(false)
    setAiResult(null)
    setShowOverlayGuide(true)
  }, [activePage, aiResult, aiPrompt, addAiImageToPage])

  // ── Sticker ─────────────────────────────────────────────────────
  const handleSelectSticker = useCallback(
    (sticker: Sticker) => {
      if (!activePage) return
      addStickerToPage(activePage.id, sticker.url, sticker.storagePath, sticker.label)
    },
    [activePage, addStickerToPage],
  )

  // ── Print ───────────────────────────────────────────────────────
  const handlePrint = useCallback(async (settings: PrintSettings) => {
    if (!book) return
    setShowPrintSettings(false)
    setPrinting(true)
    try {
      await printBook(book, {
        childName,
        isLincoln,
        sightWords: book.sightWords,
        settings,
      })
    } finally {
      setPrinting(false)
    }
  }, [book, childName, isLincoln])

  // ── Finish flow ───────────────────────────────────────────────────
  const coverCandidates = useMemo(() => {
    if (!book) return []
    return book.pages
      .filter((p) => p.images.length > 0)
      .map((p) => p.images[0].url)
  }, [book])

  const handleOpenFinishDialog = useCallback(() => {
    setSelectedCoverUrl(coverCandidates[0] ?? null)
    setShowFinishDialog(true)
  }, [coverCandidates])

  const handleFinishBook = useCallback(() => {
    if (!book) return
    updateBookMeta({
      status: 'complete',
      ...(selectedCoverUrl ? { coverImageUrl: selectedCoverUrl } : {}),
    })
    setShowFinishDialog(false)
    setShowCelebration(true)
    setTimeout(() => {
      setShowCelebration(false)
      navigate(`/books/${bookId}/read`)
    }, 2000)
  }, [book, selectedCoverUrl, updateBookMeta, navigate, bookId])

  if (loading) {
    return (
      <Page>
        <Typography color="text.secondary">Loading book...</Typography>
      </Page>
    )
  }

  if (!book) {
    return (
      <Page>
        <Typography color="text.secondary">Book not found.</Typography>
        <Button onClick={() => navigate('/books')} startIcon={<ArrowBackIcon />}>
          Back to My Books
        </Button>
      </Page>
    )
  }

  return (
    <Page>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton onClick={() => navigate('/books')} sx={{ minWidth: 48, minHeight: 48 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <TextField
              value={book.title}
              onChange={(e) => updateBookMeta({ title: e.target.value })}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false) }}
              autoFocus
              size="small"
              fullWidth
              sx={{
                '& .MuiInputBase-input': {
                  fontWeight: 700,
                  fontSize: '1.2rem',
                  ...(isLincoln
                    ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.75rem' }
                    : {}),
                },
              }}
            />
          ) : (
            <Typography
              variant="h5"
              onClick={() => setEditingTitle(true)}
              sx={{
                fontWeight: 700,
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&:hover': { color: 'primary.main' },
                ...(isLincoln
                  ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.85rem' }
                  : {}),
              }}
            >
              {book.title}
            </Typography>
          )}
        </Box>
        <SaveIndicator state={saveState} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoStoriesIcon />}
          onClick={() => navigate(`/books/${bookId}/read`)}
          sx={{ minHeight: 40 }}
        >
          Read
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={printing ? <CircularProgress size={16} /> : <PrintIcon />}
          onClick={() => setShowPrintSettings(true)}
          disabled={printing}
          sx={{ minHeight: 40 }}
        >
          {printing ? 'Building...' : 'Print'}
        </Button>
        <Button
          variant="contained"
          size="small"
          color="success"
          startIcon={<CheckCircleIcon />}
          onClick={handleOpenFinishDialog}
          disabled={book.status === 'complete'}
          sx={{ minHeight: 40 }}
        >
          {book.status === 'complete' ? 'Finished!' : 'Finish My Book'}
        </Button>
      </Stack>

      {/* Together Book toggle + contributor display */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={book.isTogetherBook ?? false}
              onChange={(_, checked) => {
                const allIds = children.map((c) => c.id)
                updateBookMeta(checked
                  ? { isTogetherBook: true, contributorIds: allIds }
                  : { isTogetherBook: false, contributorIds: [] })
              }}
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              Together Book
            </Typography>
          }
          sx={{ m: 0 }}
        />
        {book.isTogetherBook && (
          <Chip
            size="small"
            label={children.map((c) => c.name).join(' + ') || 'Together'}
            sx={{ bgcolor: 'info.50', borderColor: 'info.200', border: '1px solid' }}
          />
        )}
      </Stack>

      {/* Page editor area */}
      {activePage && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: { xs: 2, md: 3 },
            bgcolor: isLincoln ? 'rgba(0,0,0,0.02)' : 'background.paper',
          }}
        >
          <PageEditor
            page={activePage}
            onUpdate={handlePageUpdate}
            onAddImage={handleAddImageFile}
            onRemoveImage={handleRemoveImage}
            onImagePositionChange={handleImagePositionChange}
            onReRecord={() => { setShowVoicePanel(true); setVoiceMode('record') }}
            childName={childName}
          />
        </Box>
      )}

      {/* Voice panel (inline below editor) */}
      {showVoicePanel && (
        <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip
              label="Record"
              variant={voiceMode === 'record' ? 'filled' : 'outlined'}
              onClick={() => setVoiceMode('record')}
            />
            {speechAvailable ? (
              <Chip
                label="Dictate"
                variant={voiceMode === 'dictate' ? 'filled' : 'outlined'}
                onClick={() => setVoiceMode('dictate')}
              />
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                Dictation not available — use Record instead
              </Typography>
            )}
          </Stack>

          {voiceMode === 'record' ? (
            <AudioRecorder
              onCapture={(blob) => { void handleAudioCapture(blob) }}
              uploading={audioUploading}
            />
          ) : (
            <Stack spacing={2} alignItems="center">
              {isDictating ? (
                <>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      bgcolor: 'error.main',
                      animation: 'pulse 1s infinite',
                      '@keyframes pulse': {
                        '0%': { opacity: 1 },
                        '50%': { opacity: 0.4 },
                        '100%': { opacity: 1 },
                      },
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Listening... speak your story
                  </Typography>
                  <Button variant="contained" color="error" onClick={stopDictation} sx={{ minHeight: 48 }}>
                    Stop
                  </Button>
                </>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<MicIcon />}
                  onClick={startDictation}
                  sx={{ minHeight: 48 }}
                >
                  Speak your story
                </Button>
              )}
            </Stack>
          )}

          <Button size="small" onClick={() => { setShowVoicePanel(false); stopDictation() }} sx={{ mt: 1 }}>
            Close
          </Button>
        </Box>
      )}

      {/* Photo capture dialog */}
      {showPhotoCapture && (
        <Box sx={{ mt: 1 }}>
          <PhotoCapture onCapture={(file) => { void handlePhotoCapture(file) }} />
          <Button
            size="small"
            onClick={() => setShowPhotoCapture(false)}
            sx={{ mt: 1 }}
          >
            Cancel
          </Button>
        </Box>
      )}

      {/* Page strip */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          py: 1,
          px: 0.5,
          '&::-webkit-scrollbar': { height: 4 },
        }}
      >
        {book.pages.map((page, index) => (
          <Box
            key={page.id}
            onClick={() => setActivePageIndex(index)}
            sx={{
              minWidth: 72,
              height: 72,
              borderRadius: 1,
              border: '2px solid',
              borderColor: index === activePageIndex ? 'primary.main' : 'divider',
              bgcolor: index === activePageIndex
                ? 'primary.50'
                : page.images.length > 0
                  ? 'grey.100'
                  : 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
              '&:hover': { borderColor: 'primary.light' },
            }}
          >
            {page.images[0] ? (
              <Box
                component="img"
                src={page.images[0].url}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontSize: '0.65rem',
                  textAlign: 'center',
                  px: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {page.text ? page.text.slice(0, 20) : `Page ${page.pageNumber}`}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                bottom: 1,
                right: 4,
                fontSize: '0.6rem',
                color: 'text.disabled',
              }}
            >
              {page.pageNumber}
            </Typography>
          </Box>
        ))}

        {/* Add page button */}
        <Box
          onClick={handleAddPage}
          sx={{
            minWidth: 72,
            height: 72,
            borderRadius: 1,
            border: '2px dashed',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
          }}
        >
          <AddIcon color="action" />
        </Box>
      </Box>

      {/* Page reorder arrows */}
      {book.pages.length > 1 && (
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 0.5 }}>
          <IconButton
            size="small"
            disabled={activePageIndex === 0}
            onClick={() => {
              reorderPages(activePageIndex, activePageIndex - 1)
              setActivePageIndex(activePageIndex - 1)
            }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Move page
          </Typography>
          <IconButton
            size="small"
            disabled={activePageIndex === book.pages.length - 1}
            onClick={() => {
              reorderPages(activePageIndex, activePageIndex + 1)
              setActivePageIndex(activePageIndex + 1)
            }}
          >
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}

      {/* Action buttons */}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<PhotoCameraIcon />}
          onClick={() => setShowPhotoCapture(true)}
          sx={{ minHeight: 48 }}
        >
          Photo
        </Button>
        <Button
          variant="outlined"
          startIcon={<MicIcon />}
          onClick={() => setShowVoicePanel(true)}
          sx={{ minHeight: 48 }}
        >
          {speechAvailable ? 'Speak / Record' : 'Record'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={openAiDialog}
          sx={{ minHeight: 48 }}
        >
          Make a scene
        </Button>
        <Button
          variant="outlined"
          startIcon={<StarIcon />}
          onClick={() => setShowStickerPicker(true)}
          sx={{ minHeight: 48 }}
        >
          Sticker
        </Button>

        {/* Delete page (only if > 1 page) */}
        {book.pages.length > 1 && (
          <Button
            variant="text"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleDeletePage}
            sx={{ minHeight: 48, ml: 'auto' }}
          >
            Delete page
          </Button>
        )}
      </Stack>

      {/* Overlay guidance banner (shown after placing an AI scene) */}
      {showOverlayGuide && (
        <Alert
          severity="info"
          onClose={() => setShowOverlayGuide(false)}
          sx={{ mt: 1 }}
        >
          <Typography variant="body2" gutterBottom fontWeight={600}>
            Scene added! Now add your characters:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PhotoCameraIcon />}
              onClick={() => { setShowOverlayGuide(false); setShowPhotoCapture(true) }}
              sx={{ minHeight: 36 }}
            >
              Upload a photo
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<StarIcon />}
              onClick={() => { setShowOverlayGuide(false); setShowStickerPicker(true) }}
              sx={{ minHeight: 36 }}
            >
              Add a sticker
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled
              sx={{ minHeight: 36 }}
            >
              Draw a character (coming soon)
            </Button>
          </Stack>
        </Alert>
      )}

      {/* AI Scene generation dialog */}
      <Dialog open={showAiDialog} onClose={() => setShowAiDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Make a Scene</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* World type quick-pick chips */}
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                What kind of world?
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {(isLincoln ? WORLD_CHIPS_LINCOLN : WORLD_CHIPS_LONDON).map((w) => (
                  <Chip
                    key={w.label}
                    label={`${w.emoji} ${w.label}`}
                    variant="outlined"
                    onClick={() => setAiPrompt((prev) => prev ? prev : `${w.label} with `)}
                    disabled={aiLoading}
                    size="small"
                    sx={{ mb: 0.5 }}
                  />
                ))}
              </Stack>
            </Box>

            <TextField
              label="Describe the scene"
              placeholder="Describe the world your character will explore..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              disabled={aiLoading}
            />

            <Typography variant="caption" color="text.secondary">
              Tip: Describe the world — add your own characters after!
            </Typography>

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Style
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {(isLincoln ? AI_SCENE_STYLES_LINCOLN : AI_SCENE_STYLES_LONDON).map((s) => (
                  <Chip
                    key={s.value}
                    label={s.label}
                    variant={aiStyle === s.value ? 'filled' : 'outlined'}
                    onClick={() => setAiStyle(s.value)}
                    disabled={aiLoading}
                  />
                ))}
              </Stack>
            </Box>

            {aiLoading && (
              <Stack alignItems="center" spacing={1}>
                <CircularProgress size={32} />
                <Typography variant="body2" color="text.secondary">
                  Creating your scene...
                </Typography>
              </Stack>
            )}

            {aiError && !aiLoading && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {aiError.message.includes('blocked') || aiError.message.includes('safety') || aiError.message.includes('safety filter') ? (
                  <Stack spacing={1.5}>
                    <Typography variant="body2">
                      The picture maker couldn&apos;t create that image.
                    </Typography>
                    <Typography variant="body2">
                      <strong>Try one of these:</strong>
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                      <li>
                        <Typography variant="body2">
                          Describe the <strong>world</strong> instead of characters
                          — &quot;a colorful world with brick castles&quot; works great
                        </Typography>
                      </li>
                      <li>
                        <Typography variant="body2">
                          Use a different style (Storybook or Comic Book work best)
                        </Typography>
                      </li>
                    </Box>
                    <Divider />
                    <Typography variant="body2" color="text.secondary">
                      Or add your own picture:
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PhotoCameraIcon />}
                        onClick={() => {
                          setShowAiDialog(false)
                          setShowPhotoCapture(true)
                        }}
                      >
                        Upload a photo
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddPhotoAlternateIcon />}
                        onClick={() => {
                          setShowAiDialog(false)
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = 'image/*'
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file && activePage) {
                              void addImageToPage(activePage.id, file)
                            }
                          }
                          input.click()
                        }}
                      >
                        Import a drawing
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Typography variant="body2">{aiError.message || 'Failed to generate image. Please try again.'}</Typography>
                )}
              </Alert>
            )}

            {aiResult && (
              <Box sx={{ textAlign: 'center' }}>
                <Box
                  component="img"
                  src={aiResult.url}
                  alt="Generated scene"
                  sx={{
                    maxWidth: '100%',
                    maxHeight: 300,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAiDialog(false)} disabled={aiLoading}>
            Cancel
          </Button>
          {aiResult ? (
            <>
              <Button onClick={() => { setAiResult(null) }} disabled={aiLoading}>
                Try again
              </Button>
              <Button variant="contained" onClick={handleUseAiImage}>
                Use this one
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              onClick={() => { void handleGenerateScene() }}
              disabled={!aiPrompt.trim() || aiLoading}
            >
              Create!
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Sticker picker */}
      <StickerPicker
        open={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        familyId={familyId}
        onSelectSticker={handleSelectSticker}
      />

      {/* Finish dialog */}
      <Dialog open={showFinishDialog} onClose={() => setShowFinishDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Your book is ready!</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {coverCandidates.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Pick a cover image:
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {coverCandidates.map((url) => (
                    <Box
                      key={url}
                      onClick={() => setSelectedCoverUrl(url)}
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: 1,
                        overflow: 'hidden',
                        border: '3px solid',
                        borderColor: selectedCoverUrl === url ? 'success.main' : 'divider',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Box component="img" src={url} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </Box>
                  ))}
                  <Box
                    onClick={() => setSelectedCoverUrl(null)}
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: 1,
                      border: '3px solid',
                      borderColor: selectedCoverUrl === null ? 'success.main' : 'divider',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'grey.100',
                      flexShrink: 0,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">None</Typography>
                  </Box>
                </Stack>
              </>
            )}
            <Typography variant="body2" color="text.secondary">
              You can always come back and edit!
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowFinishDialog(false)}>Keep working</Button>
          <Button variant="contained" color="success" onClick={handleFinishBook}>
            Finish!
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print settings dialog */}
      <PrintSettingsDialog
        open={showPrintSettings}
        onClose={() => setShowPrintSettings(false)}
        onPrint={(s) => { void handlePrint(s) }}
        hasSightWords={(book.sightWords?.length ?? 0) > 0}
      />

      {/* Celebration overlay */}
      {showCelebration && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.7)',
          }}
        >
          <Stack alignItems="center" spacing={2}>
            <Typography
              variant="h4"
              sx={{
                color: 'white',
                fontWeight: 700,
                textAlign: 'center',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.9rem' : undefined,
              }}
            >
              {isLincoln ? 'Achievement Unlocked: Author!' : 'Beautiful book!'}
            </Typography>
            <Typography sx={{ fontSize: '3rem' }}>
              {isLincoln ? '\u{2B50}' : '\u{1F338}'}
            </Typography>
          </Stack>
        </Box>
      )}
    </Page>
  )
}

