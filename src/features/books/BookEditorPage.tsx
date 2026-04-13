import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import EditIcon from '@mui/icons-material/Edit'
import MicIcon from '@mui/icons-material/Mic'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import StarIcon from '@mui/icons-material/Star'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DrawIcon from '@mui/icons-material/Draw'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PrintIcon from '@mui/icons-material/Print'

import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import ImageList from '@mui/material/ImageList'
import ImageListItem from '@mui/material/ImageListItem'
import Switch from '@mui/material/Switch'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

import Alert from '@mui/material/Alert'
import CloseIcon from '@mui/icons-material/Close'
import CollectionsIcon from '@mui/icons-material/Collections'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import { getDocs, orderBy, query } from 'firebase/firestore'
import CreativeTimer from '../../components/CreativeTimer'
import Page from '../../components/Page'
import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import SaveIndicator from '../../components/SaveIndicator'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { SubjectBucket } from '../../core/types/enums'
import { useAI } from '../../core/ai/useAI'
import type { Book, BookPage, BookTheme, Sticker } from '../../core/types'
import { BOOK_THEMES } from '../../core/types'
import type { EnhanceSketchRequest, ImageGenRequest } from '../../core/ai/useAI'
import PageEditor from './PageEditor'
import StickerPicker from './StickerPicker'
import DrawingChoiceDialog from './DrawingChoiceDialog'
import type { DrawingChoice } from './DrawingChoiceDialog'
import { cleanSketchBackground } from './cleanSketch'
import type { ImagePosition } from './DraggableImage'
import { useBook } from './useBook'
import { printBook } from './printBook'
import PrintSettingsDialog from './PrintSettingsDialog'
import type { PrintSettings } from './PrintSettingsDialog'
import { useBackgroundReimagine } from './useBackgroundReimagine'
import ReimagineResultDialog from './ReimagineResultDialog'
import { useEditorHistory, useUndoRedoKeys } from './useEditorHistory'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'

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
  { value: 'garden-warfare', label: 'Garden Battle' },
  { value: 'storybook', label: 'Storybook' },
  { value: 'comic', label: 'Comic Book' },
  { value: 'realistic', label: 'Realistic' },
] as const

const AI_SCENE_STYLES_LONDON = [
  { value: 'storybook', label: 'Storybook' },
  { value: 'platformer', label: 'Platformer World' },
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
  { emoji: '\u{1F33B}', label: 'Garden battle' },
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
  { emoji: '\u{1F344}', label: 'Platformer world' },
  { emoji: '\u{2B50}', label: 'Power-up land' },
] as const

export default function BookEditorPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const { children } = useActiveChild()
  const muiTheme = useTheme()
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'))

  const {
    book,
    loading,
    saveState,
    saveErrorMessage,
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
    addSketchToPage,
    applySketchEnhancement,
    pickSketchVersion,
    restoreImageVersion,
  } = useBook(familyId, bookId)

  const { generateImage, enhanceSketch, loading: aiLoading, error: aiError } = useAI()

  // ── Undo / Redo ───────────────────────────────────────────────
  const editorHistory = useEditorHistory()

  const bgReimagine = useBackgroundReimagine({
    familyId,
    childId: activeChild?.id ?? '',
    childName,
    bookTheme: book?.theme,
    onReplaceBackground: (pageId, imageId, url, storagePath) => {
      applySketchEnhancement(pageId, imageId, url, storagePath)
    },
    onAddSticker: (pageId, url, storagePath, label) => {
      addStickerToPage(pageId, url, storagePath, label)
    },
  })

  const [activePageIndex, setActivePageIndex] = useState(0)
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

  // Sketch enhance state
  const [sketchImageId, setSketchImageId] = useState<string | null>(null)
  const [sketchEnhancing, setSketchEnhancing] = useState(false)
  const [sketchEnhanceStyle, setSketchEnhanceStyle] = useState<EnhanceSketchRequest['style']>('storybook')
  const [showSketchCompare, setShowSketchCompare] = useState(false)
  const [sketchComparePageId, setSketchComparePageId] = useState<string | null>(null)

  // Combined drawing flow state
  const [showDrawingCapture, setShowDrawingCapture] = useState(false)
  const [drawingFile, setDrawingFile] = useState<File | null>(null)
  const [drawingPreviewUrl, setDrawingPreviewUrl] = useState<string | null>(null)
  const [showDrawingChoice, setShowDrawingChoice] = useState(false)
  const [drawingProcessing, setDrawingProcessing] = useState(false)
  const [drawingProcessingLabel, setDrawingProcessingLabel] = useState<string>('')
  const [drawingResultUrl, setDrawingResultUrl] = useState<string | null>(null)
  const [drawingResultFile, setDrawingResultFile] = useState<File | null>(null)
  const [pendingDrawingChoice, setPendingDrawingChoice] = useState<DrawingChoice | null>(null)

  // Sketch background cleanup toggle (default ON when page has existing images)
  const [autoCleanSketch, setAutoCleanSketch] = useState(true)

  // Reimagine error surfacing (visible in UI for mobile debugging)
  const [reimagineError, setReimagineError] = useState<string | null>(null)

  // Elapsed timer for drawing processing feedback
  const [drawingElapsed, setDrawingElapsed] = useState(0)
  useEffect(() => {
    if (!drawingProcessing) { setDrawingElapsed(0); return }
    const interval = setInterval(() => setDrawingElapsed((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [drawingProcessing])

  // Background replacement tracking
  const [replacingBackgroundIds, setReplacingBackgroundIds] = useState<string[]>([])

  // Background source picker state
  const [showBgSourcePicker, setShowBgSourcePicker] = useState(false)
  const [showGalleryPicker, setShowGalleryPicker] = useState(false)
  const [galleryStickers, setGalleryStickers] = useState<Sticker[]>([])
  const [galleryStickersLoading, setGalleryStickersLoading] = useState(false)

  // Load sticker library images when gallery picker opens
  useEffect(() => {
    if (!showGalleryPicker || !familyId) return
    let cancelled = false
    const load = async () => {
      setGalleryStickersLoading(true)
      try {
        const q = query(stickerLibraryCollection(familyId), orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        if (!cancelled) {
          setGalleryStickers(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
        }
      } catch {
        // Best effort — gallery still shows book backgrounds
      } finally {
        if (!cancelled) setGalleryStickersLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [showGalleryPicker, familyId])

  // Deselect signal — increment to tell PageEditor to deselect all images
  const [deselectSignal, setDeselectSignal] = useState(0)
  const deselect = useCallback(() => setDeselectSignal((n) => n + 1), [])

  // Overlay guidance (shown after placing an AI scene)
  const [showOverlayGuide, setShowOverlayGuide] = useState(false)

  // Contextual action bar: track which image is selected in PageEditor
  const [selectedEditorImageId, setSelectedEditorImageId] = useState<string | null>(null)
  const [selectedEditorImageType, setSelectedEditorImageType] = useState<'sticker' | 'background' | null>(null)
  const handleSelectedImageChange = useCallback((imageId: string | null, imageType: 'sticker' | 'background' | null) => {
    setSelectedEditorImageId(imageId)
    setSelectedEditorImageType(imageType)
  }, [])

  // Finish flow state
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<BookTheme | undefined>(undefined)
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

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      if (!activePage) return
      removeImageFromPage(activePage.id, imageId)
    },
    [activePage, removeImageFromPage],
  )

  const handleImagePositionChange = useCallback(
    (imageId: string, position: ImagePosition) => {
      if (!activePage) return
      updateImagePosition(activePage.id, imageId, position)
    },
    [activePage, updateImagePosition],
  )

  const handleAddImageFile = useCallback(
    (file: File) => {
      if (!activePage) return
      void addImageToPage(activePage.id, file, { cleanBackground: autoCleanSketch })
    },
    [activePage, addImageToPage, autoCleanSketch],
  )

  // ── History-tracked page mutations ──────────────────────────────
  /** Snapshot the active page before a mutation, push history after. */
  const trackPageChange = useCallback(
    (action: string, mutate: () => void) => {
      if (!activePage || !book) return
      const before = structuredClone(activePage)
      mutate()
      // Re-read updated page from book state (next render will have it;
      // we schedule the push via microtask so the state has settled)
      queueMicrotask(() => {
        // book may have updated by now — read latest from ref
        const updatedPage = bookRef.current?.pages.find((p) => p.id === before.id)
        if (updatedPage) {
          editorHistory.push({ pageId: before.id, action, before, after: structuredClone(updatedPage) })
        }
      })
    },
    [activePage, book, editorHistory],
  )

  // Keep a mutable ref to book for async history reads
  const bookRef = useRef(book)
  bookRef.current = book

  const handleTrackedRemoveImage = useCallback(
    (imageId: string) => {
      trackPageChange('remove_image', () => handleRemoveImage(imageId))
    },
    [trackPageChange, handleRemoveImage],
  )

  const handleTrackedPageUpdate = useCallback(
    (changes: Partial<BookPage>) => {
      // Only track non-trivial changes (not every keystroke)
      if ('text' in changes) {
        handlePageUpdate(changes)
        return
      }
      trackPageChange('page_update', () => handlePageUpdate(changes))
    },
    [trackPageChange, handlePageUpdate],
  )

  const handleUndo = useCallback(() => {
    const result = editorHistory.undo()
    if (!result) return
    updatePage(result.pageId, result.state)
  }, [editorHistory, updatePage])

  const handleRedo = useCallback(() => {
    const result = editorHistory.redo()
    if (!result) return
    updatePage(result.pageId, result.state)
  }, [editorHistory, updatePage])

  useUndoRedoKeys(handleUndo, handleRedo)

  // ── Sketch: enhance ─────────────────────────────────────────────
  const handleEnhanceSketch = useCallback(async () => {
    if (!sketchImageId || !sketchComparePageId || !book) return
    const page = book.pages.find((p) => p.id === sketchComparePageId)
    const img = page?.images.find((i) => i.id === sketchImageId)
    if (!img?.storagePath) return

    setSketchEnhancing(true)
    setReimagineError(null)
    try {
      const result = await Promise.race([
        enhanceSketch({
          familyId,
          sketchStoragePath: img.storagePath,
          style: sketchEnhanceStyle,
          theme: book?.theme,
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error(
            'Enhancement is taking too long — the image service may be busy. Please try again.'
          )), 120_000),
        ),
      ])

      if (result?.url) {
        applySketchEnhancement(sketchComparePageId, sketchImageId, result.url, result.storagePath)
        setShowSketchCompare(true)
      } else {
        const aiMsg = aiError?.message || 'AI enhancement returned no image'
        setReimagineError(`Enhancement failed: ${aiMsg}`)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('Sketch enhancement failed:', err)
      setReimagineError(`Enhancement failed: ${errMsg}`)
    } finally {
      setSketchEnhancing(false)
    }
  }, [sketchImageId, sketchComparePageId, book, enhanceSketch, familyId, sketchEnhanceStyle, applySketchEnhancement, aiError])

  const handlePickSketchVersion = useCallback(
    (version: 'original' | 'enhanced') => {
      if (!sketchImageId || !sketchComparePageId) return
      pickSketchVersion(sketchComparePageId, sketchImageId, version)
      setShowSketchCompare(false)
      setSketchImageId(null)
      setSketchComparePageId(null)
    },
    [sketchImageId, sketchComparePageId, pickSketchVersion],
  )

  // ── Combined drawing flow ───────────────────────────────────────
  const handleDrawingCapture = useCallback((file: File) => {
    setDrawingFile(file)
    setDrawingPreviewUrl(URL.createObjectURL(file))
    setShowDrawingCapture(false)
    setShowDrawingChoice(true)
    setDrawingResultUrl(null)
    setDrawingResultFile(null)
    setPendingDrawingChoice(null)
  }, [])

  const resetDrawingFlow = useCallback(() => {
    setShowDrawingChoice(false)
    setDrawingFile(null)
    setDrawingPreviewUrl(null)
    setDrawingProcessing(false)
    setDrawingResultUrl(null)
    setDrawingResultFile(null)
    setPendingDrawingChoice(null)
  }, [])

  const handleDrawingChoice = useCallback(async (choice: DrawingChoice, reimagineIntensity?: number) => {
    if (!activePage || !drawingFile) return

    if (choice === 'as-is') {
      await addImageToPage(activePage.id, drawingFile, { cleanBackground: false })
      resetDrawingFlow()
      return
    }

    setPendingDrawingChoice(choice)

    if (choice === 'cleanup') {
      setDrawingProcessing(true)
      setDrawingProcessingLabel('Removing paper background...')
      try {
        const cleaned = await cleanSketchBackground(drawingFile)
        const url = URL.createObjectURL(cleaned)
        setDrawingResultUrl(url)
        setDrawingResultFile(cleaned)
      } catch {
        // Fallback: add as-is
        await addImageToPage(activePage.id, drawingFile, { cleanBackground: false })
        resetDrawingFlow()
        return
      }
      setDrawingProcessing(false)
      return
    }

    if (choice === 'reimagine') {
      // Upload sketch first (blocking — fast), then process reimagine in background
      setReimagineError(null)
      try {
        const sketchResult = await addSketchToPage(activePage.id, drawingFile)
        if (!sketchResult) {
          setReimagineError('Sketch upload failed — check your connection and try again.')
          resetDrawingFlow()
          return
        }
        const { imageId, storagePath } = sketchResult
        const imageUrl = URL.createObjectURL(drawingFile)

        // Build caption from intensity
        const caption = (reimagineIntensity ?? 50) <= 25
          ? 'Lightly clean up this child\'s drawing, keeping their art style and line work. Just smooth edges and brighten colors.'
          : (reimagineIntensity ?? 50) >= 75
            ? 'Reimagine this child\'s drawing as a professional illustration. Keep the subject matter but create it in a polished cartoon style.'
            : 'Enhance this child\'s drawing into a polished illustration while keeping the original composition and character design.'

        // Close the dialog — kid goes back to editing
        resetDrawingFlow()

        // Start background processing (non-blocking)
        void bgReimagine.startReimagine(
          imageId,
          activePage.id,
          storagePath,
          imageUrl,
          reimagineIntensity ?? 50,
          caption,
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('Reimagine sketch upload failed:', err)
        setReimagineError(`Reimagine failed: ${errMsg}`)
        resetDrawingFlow()
      }
      return
    }

    if (choice === 'sticker') {
      setDrawingProcessing(true)
      setDrawingProcessingLabel('Creating sticker...')
      try {
        const cleaned = await cleanSketchBackground(drawingFile)
        const url = URL.createObjectURL(cleaned)
        setDrawingResultUrl(url)
        setDrawingResultFile(cleaned)
      } catch {
        // Fallback: use original as sticker
        setDrawingResultUrl(drawingPreviewUrl)
        setDrawingResultFile(drawingFile)
      }
      setDrawingProcessing(false)
      return
    }

    if (choice === 'scene') {
      // Open the AI scene dialog with the drawing as inspiration
      resetDrawingFlow()
      const prefill = 'Create a full illustrated scene inspired by this child\'s drawing'
      setAiPrompt(prefill)
      setAiResult(null)
      setShowAiDialog(true)
      return
    }
  }, [activePage, drawingFile, drawingPreviewUrl, addImageToPage, addSketchToPage, resetDrawingFlow, bgReimagine])

  const handleAcceptDrawingResult = useCallback(() => {
    if (!activePage || !drawingResultFile) return
    if (pendingDrawingChoice === 'sticker') {
      // Add as sticker — upload and add to sticker library implicitly via addStickerToPage
      const url = drawingResultUrl ?? ''
      addStickerToPage(activePage.id, url, '', drawingFile?.name ?? 'Drawing sticker')
    } else {
      // cleanup result — add as image
      void addImageToPage(activePage.id, drawingResultFile, { cleanBackground: false })
    }
    resetDrawingFlow()
  }, [activePage, drawingResultFile, drawingResultUrl, drawingFile, pendingDrawingChoice, addImageToPage, addStickerToPage, resetDrawingFlow])

  const handleRetryDrawingResult = useCallback(() => {
    setDrawingResultUrl(null)
    setDrawingResultFile(null)
    // Re-show choice dialog
    setPendingDrawingChoice(null)
  }, [])

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

  // ── Change background ───────────────────────────────────────────
  const handleChangeBackground = useCallback(() => {
    if (!activePage) return
    const bgIds = activePage.images
      .filter((img) => img.type !== 'sticker')
      .map((img) => img.id)
    setReplacingBackgroundIds(bgIds)
    setShowBgSourcePicker(true)
  }, [activePage])

  const handleBgSourceMakeScene = useCallback(() => {
    setShowBgSourcePicker(false)
    const prefill = activePage?.text
      ? `Illustrate: ${activePage.text.slice(0, 100)}`
      : ''
    setAiPrompt(prefill)
    setAiResult(null)
    setShowAiDialog(true)
  }, [activePage])

  const handleBgSourceUpload = useCallback(() => {
    setShowBgSourcePicker(false)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file && activePage) {
        // Remove old backgrounds, then add photo as full-page background
        if (replacingBackgroundIds.length > 0) {
          replacingBackgroundIds.forEach((id) => removeImageFromPage(activePage.id, id))
          setReplacingBackgroundIds([])
        }
        void addImageToPage(activePage.id, file, { cleanBackground: false })
      }
    }
    input.click()
  }, [activePage, replacingBackgroundIds, removeImageFromPage, addImageToPage])

  const handleBgSourceGallery = useCallback(() => {
    setShowBgSourcePicker(false)
    setShowGalleryPicker(true)
  }, [])

  const handleSelectGalleryBackground = useCallback(
    (url: string) => {
      if (!activePage) return
      // Remove old backgrounds
      if (replacingBackgroundIds.length > 0) {
        replacingBackgroundIds.forEach((id) => removeImageFromPage(activePage.id, id))
        setReplacingBackgroundIds([])
      }
      addAiImageToPage(activePage.id, url, '', 'From gallery')
      setShowGalleryPicker(false)
    },
    [activePage, replacingBackgroundIds, removeImageFromPage, addAiImageToPage],
  )

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
    // If replacing an existing background, remove old background images first
    if (replacingBackgroundIds.length > 0) {
      replacingBackgroundIds.forEach((id) => removeImageFromPage(activePage.id, id))
      setReplacingBackgroundIds([])
    }
    addAiImageToPage(activePage.id, aiResult.url, aiResult.storagePath, aiPrompt)
    setShowAiDialog(false)
    setAiResult(null)
    setShowOverlayGuide(true)
  }, [activePage, aiResult, aiPrompt, addAiImageToPage, replacingBackgroundIds, removeImageFromPage])

  // ── Sticker ─────────────────────────────────────────────────────
  const autoSuggestTheme = useCallback((updatedBook: Book): BookTheme | null => {
    const allTags: string[] = []
    for (const page of updatedBook.pages ?? []) {
      for (const img of page.images ?? []) {
        if (img.type === 'sticker' && img.tags) {
          allTags.push(...img.tags)
        }
      }
    }
    const tagToTheme: Record<string, BookTheme> = {
      minecraft: 'minecraft',
      animal: 'animals',
      fantasy: 'fantasy',
      nature: 'science',
      faith: 'faith',
      vehicle: 'adventure',
    }
    const themeCounts: Record<string, number> = {}
    for (const tag of allTags) {
      const theme = tagToTheme[tag]
      if (theme) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1
      }
    }
    const sorted = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? (sorted[0][0] as BookTheme) : null
  }, [])

  const handleSelectSticker = useCallback(
    (sticker: Sticker) => {
      if (!activePage) return
      addStickerToPage(activePage.id, sticker.url, sticker.storagePath, sticker.label, sticker.tags)
      // Auto-suggest theme if book has none
      if (book && !book.theme) {
        // Build what the book will look like after sticker is added
        const updatedPages = book.pages.map((p) =>
          p.id === activePage.id
            ? { ...p, images: [...p.images, { id: '', url: '', type: 'sticker' as const, tags: sticker.tags }] }
            : p,
        )
        const suggested = autoSuggestTheme({ ...book, pages: updatedPages })
        if (suggested) {
          updateBookMeta({ theme: suggested })
        }
      }
    },
    [activePage, addStickerToPage, book, autoSuggestTheme, updateBookMeta],
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

  // ── Book backgrounds (for gallery picker) ────────────────────────
  const bookBackgrounds = useMemo(() => {
    if (!book) return []
    return book.pages
      .flatMap((page) => page.images)
      .filter((img) => img.type !== 'sticker' && img.url)
      .filter((img, i, arr) => arr.findIndex((x) => x.url === img.url) === i)
  }, [book])

  // ── Finish flow ───────────────────────────────────────────────────
  const coverCandidates = useMemo(() => {
    if (!book) return []
    return book.pages
      .filter((p) => p.images.length > 0)
      .map((p) => p.images[0].url)
  }, [book])

  const handleOpenFinishDialog = useCallback(() => {
    setSelectedCoverUrl(book?.coverImageUrl ?? coverCandidates[0] ?? null)
    setSelectedTheme(book?.theme)
    setShowFinishDialog(true)
  }, [coverCandidates, book?.coverImageUrl, book?.theme])

  const handleSaveCover = useCallback(() => {
    if (!book) return
    updateBookMeta({
      ...(selectedCoverUrl ? { coverImageUrl: selectedCoverUrl } : { coverImageUrl: undefined }),
      ...(selectedTheme ? { theme: selectedTheme } : { theme: undefined }),
    })
    setShowFinishDialog(false)
  }, [book, selectedCoverUrl, selectedTheme, updateBookMeta])

  const handleFinishBook = useCallback(() => {
    if (!book) return
    updateBookMeta({
      status: 'complete',
      ...(selectedCoverUrl ? { coverImageUrl: selectedCoverUrl } : {}),
      ...(selectedTheme ? { theme: selectedTheme } : {}),
    })
    setShowFinishDialog(false)
    setShowCelebration(true)
    setTimeout(() => {
      setShowCelebration(false)
      navigate(`/books/${bookId}/read`)
    }, 2000)
  }, [book, selectedCoverUrl, selectedTheme, updateBookMeta, navigate, bookId])

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
      <CreativeTimer
        defaultSubject={SubjectBucket.LanguageArts}
        defaultDescription="Book editing"
      />
      {/* Row 1: Navigation + Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
        <IconButton onClick={() => navigate('/books')} sx={{ minWidth: 48, minHeight: 48 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, mx: 1 }}>
          {editingTitle ? (
            <TextField
              value={book.title}
              onChange={(e) => updateBookMeta({ title: e.target.value })}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false) }}
              autoFocus
              size="small"
              fullWidth
              variant="standard"
              sx={{
                '& .MuiInputBase-input': {
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  ...(isLincoln
                    ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.75rem' }
                    : {}),
                },
              }}
            />
          ) : (
            <Typography
              variant="subtitle1"
              onClick={() => setEditingTitle(true)}
              noWrap
              sx={{
                fontWeight: 700,
                cursor: 'pointer',
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                ...(isLincoln
                  ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.75rem' }
                  : {}),
              }}
            >
              {book.title}
              <EditIcon sx={{ fontSize: 14, opacity: 0.4, flexShrink: 0 }} />
            </Typography>
          )}
        </Box>
        <SaveIndicator state={saveState} errorMessage={saveErrorMessage} />
      </Box>

      {reimagineError && (
        <Alert severity="error" onClose={() => setReimagineError(null)} sx={{ mx: 2, mt: 0.5 }}>
          {reimagineError}
        </Alert>
      )}

      {/* Row 2: Action chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          px: 2,
          py: 0.5,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Chip
          icon={<UndoIcon />}
          label="Undo"
          onClick={handleUndo}
          disabled={!editorHistory.canUndo}
          variant="outlined"
          size="small"
        />
        <Chip
          icon={<RedoIcon />}
          label="Redo"
          onClick={handleRedo}
          disabled={!editorHistory.canRedo}
          variant="outlined"
          size="small"
        />
        {/* Contextual chips based on image selection */}
        {selectedEditorImageType === 'sticker' && selectedEditorImageId && (
          <Chip
            icon={<DeleteOutlineIcon />}
            label="Delete sticker"
            onClick={() => { handleTrackedRemoveImage(selectedEditorImageId); deselect() }}
            color="error"
            size="small"
          />
        )}
        {selectedEditorImageType === 'background' && selectedEditorImageId && (
          <>
            <Chip
              icon={<DeleteOutlineIcon />}
              label="Remove background"
              onClick={() => { handleTrackedRemoveImage(selectedEditorImageId); deselect() }}
              color="error"
              size="small"
            />
            {handleChangeBackground && (
              <Chip
                icon={<AutoAwesomeIcon />}
                label="Change"
                onClick={() => { handleChangeBackground(); deselect() }}
                variant="outlined"
                size="small"
              />
            )}
          </>
        )}
        <Chip
          label="Read"
          icon={<AutoStoriesIcon />}
          onClick={() => navigate(`/books/${bookId}/read`)}
          variant="outlined"
          size="small"
        />
        <Chip
          label={printing ? 'Building...' : 'Print'}
          icon={printing ? <CircularProgress size={14} /> : <PrintIcon />}
          onClick={() => setShowPrintSettings(true)}
          disabled={printing}
          variant="outlined"
          size="small"
        />
        <Chip
          label="Cover"
          icon={<CollectionsIcon />}
          onClick={handleOpenFinishDialog}
          variant="outlined"
          size="small"
        />
        <Chip
          label={book.status === 'complete' ? 'Finished!' : 'Finish'}
          icon={<CheckCircleIcon />}
          onClick={handleOpenFinishDialog}
          disabled={book.status === 'complete'}
          color="success"
          size="small"
        />
      </Box>

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
            onUpdate={handleTrackedPageUpdate}
            onAddImage={handleAddImageFile}
            onRemoveImage={handleTrackedRemoveImage}
            onChangeBackground={handleChangeBackground}
            onImagePositionChange={handleImagePositionChange}
            onReRecord={() => { setShowVoicePanel(true); setVoiceMode('record') }}
            childName={childName}
            deselectSignal={deselectSignal}
            onSelectedImageChange={handleSelectedImageChange}
            onRestoreVersion={(imageId, versionIndex) => {
              if (activePage) restoreImageVersion(activePage.id, imageId, versionIndex)
            }}
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

      {/* Combined drawing capture panel */}
      {showDrawingCapture && (
        <Box sx={{ mt: 1, p: 2, border: '2px solid', borderColor: 'secondary.main', borderRadius: 2, bgcolor: 'secondary.50' }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Take a photo or pick from gallery
          </Typography>
          <PhotoCapture onCapture={handleDrawingCapture} />
          <Button
            size="small"
            onClick={() => setShowDrawingCapture(false)}
            sx={{ mt: 1 }}
          >
            Cancel
          </Button>
        </Box>
      )}

      {/* Drawing choice dialog — shown after capture */}
      <DrawingChoiceDialog
        open={showDrawingChoice}
        capturedFile={drawingFile}
        capturedPreviewUrl={drawingPreviewUrl}
        onClose={resetDrawingFlow}
        onChoose={(choice, intensity) => { void handleDrawingChoice(choice, intensity) }}
        processing={drawingProcessing}
        processingLabel={drawingProcessingLabel}
        elapsedSeconds={drawingElapsed}
        resultPreviewUrl={drawingResultUrl}
        onAcceptResult={handleAcceptDrawingResult}
        onRetryResult={handleRetryDrawingResult}
      />

      {/* Sketch: "Use my drawing" / "Make it fancy" choice */}
      {sketchImageId && !showSketchCompare && !sketchEnhancing && (
        <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Your drawing is on the page! What next?
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              onClick={() => { setSketchImageId(null); setSketchComparePageId(null) }}
              sx={{ minHeight: 48, fontWeight: 600 }}
            >
              Use my drawing
            </Button>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => { void handleEnhanceSketch() }}
              sx={{ minHeight: 48, fontWeight: 600 }}
            >
              Make it fancy
            </Button>
          </Stack>
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Enhancement style:
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {([
                { value: 'storybook' as const, label: 'Storybook' },
                { value: 'comic' as const, label: 'Comic' },
                { value: 'realistic' as const, label: 'Realistic' },
                { value: 'minecraft' as const, label: 'Pixel Art' },
              ]).map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  size="small"
                  variant={sketchEnhanceStyle === s.value ? 'filled' : 'outlined'}
                  onClick={() => setSketchEnhanceStyle(s.value)}
                />
              ))}
            </Stack>
          </Box>
        </Box>
      )}

      {/* Sketch: Enhancing loading state */}
      {sketchEnhancing && (
        <Box sx={{ mt: 1, p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
          <CircularProgress size={36} sx={{ mb: 1 }} />
          <Typography variant="body1" fontWeight={600}>
            Making it fancy...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The AI is turning your drawing into a polished illustration
          </Typography>
        </Box>
      )}

      {/* Sketch: Side-by-side comparison after enhancement */}
      {showSketchCompare && sketchImageId && sketchComparePageId && (() => {
        const cmpPage = book?.pages.find((p) => p.id === sketchComparePageId)
        const cmpImg = cmpPage?.images.find((i) => i.id === sketchImageId)
        if (!cmpImg) return null
        return (
          <Box sx={{ mt: 1, p: 2, border: '2px solid', borderColor: 'secondary.main', borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, textAlign: 'center' }}>
              Pick your favorite!
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              {/* Original */}
              <Box sx={{ flex: 1, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Your drawing
                </Typography>
                <Box
                  component="img"
                  src={cmpImg.originalSketchUrl}
                  alt="Original sketch"
                  sx={{
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'contain',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    mb: 1,
                  }}
                />
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => handlePickSketchVersion('original')}
                  sx={{ minHeight: 44 }}
                >
                  Use this one
                </Button>
              </Box>
              {/* Enhanced */}
              <Box sx={{ flex: 1, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Fancy version
                </Typography>
                <Box
                  component="img"
                  src={cmpImg.enhancedUrl}
                  alt="AI-enhanced version"
                  sx={{
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'contain',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    mb: 1,
                  }}
                />
                <Button
                  variant="contained"
                  color="secondary"
                  fullWidth
                  onClick={() => handlePickSketchVersion('enhanced')}
                  sx={{ minHeight: 44 }}
                >
                  Use this one
                </Button>
              </Box>
            </Stack>
          </Box>
        )
      })()}

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
          variant="contained"
          color="secondary"
          startIcon={<DrawIcon />}
          onClick={() => { deselect(); setShowDrawingCapture(true) }}
          sx={{ minHeight: 48, fontWeight: 700, fontSize: '0.95rem' }}
        >
          Add My Drawing
        </Button>
        <Button
          variant="outlined"
          startIcon={<MicIcon />}
          onClick={() => { deselect(); setShowVoicePanel(true) }}
          sx={{ minHeight: 48 }}
        >
          {speechAvailable ? 'Speak / Record' : 'Record'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => { deselect(); openAiDialog() }}
          sx={{ minHeight: 48 }}
        >
          Make a scene
        </Button>
        <Button
          variant="outlined"
          startIcon={<StarIcon />}
          onClick={() => { deselect(); setShowStickerPicker(true) }}
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

      {/* Clean sketch background toggle (visible when page has images) */}
      {activePage && activePage.images.length > 0 && (
        <FormControlLabel
          control={
            <Switch
              checked={autoCleanSketch}
              onChange={(_, v) => setAutoCleanSketch(v)}
              size="small"
            />
          }
          label="Clean sketch background"
          sx={{ ml: 0, '& .MuiTypography-root': { fontSize: '0.75rem' } }}
        />
      )}

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
              onClick={() => { setShowOverlayGuide(false); setShowDrawingCapture(true) }}
              sx={{ minHeight: 36 }}
            >
              Add a drawing
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

      {/* Background source picker */}
      <Dialog
        open={showBgSourcePicker}
        onClose={() => { setShowBgSourcePicker(false); setReplacingBackgroundIds([]) }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Change Background</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} justifyContent="center" sx={{ py: 2 }}>
            <Box
              onClick={handleBgSourceMakeScene}
              sx={{
                width: 90,
                py: 2,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 32, color: 'secondary.main', mb: 0.5 }} />
              <Typography variant="caption" display="block" fontWeight={600}>
                Make a scene
              </Typography>
            </Box>
            <Box
              onClick={handleBgSourceUpload}
              sx={{
                width: 90,
                py: 2,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
              }}
            >
              <PhotoCameraIcon sx={{ fontSize: 32, color: 'info.main', mb: 0.5 }} />
              <Typography variant="caption" display="block" fontWeight={600}>
                Upload photo
              </Typography>
            </Box>
            <Box
              onClick={handleBgSourceGallery}
              sx={{
                width: 90,
                py: 2,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
                // Always enabled — gallery shows book backgrounds + sticker library
              }}
            >
              <CollectionsIcon sx={{ fontSize: 32, color: 'success.main', mb: 0.5 }} />
              <Typography variant="caption" display="block" fontWeight={600}>
                From gallery
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowBgSourcePicker(false); setReplacingBackgroundIds([]) }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Gallery background picker */}
      <Dialog
        open={showGalleryPicker}
        onClose={() => { setShowGalleryPicker(false); setReplacingBackgroundIds([]) }}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Pick a background</DialogTitle>
        <DialogContent>
          {bookBackgrounds.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                From this book
              </Typography>
              <ImageList cols={3} gap={8}>
                {bookBackgrounds.map((img) => (
                  <ImageListItem
                    key={img.id}
                    onClick={() => handleSelectGalleryBackground(img.url)}
                    sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden' }}
                  >
                    <img
                      src={img.url}
                      alt={img.prompt ?? img.label ?? 'Background'}
                      loading="lazy"
                      style={{ borderRadius: 8, objectFit: 'cover', height: 100, width: '100%' }}
                    />
                  </ImageListItem>
                ))}
              </ImageList>
            </>
          )}

          {/* Sticker library section */}
          {galleryStickersLoading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : galleryStickers.length > 0 ? (
            <>
              {bookBackgrounds.length > 0 && <Divider sx={{ my: 2 }} />}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                From your gallery
              </Typography>
              <ImageList cols={3} gap={8}>
                {galleryStickers.map((sticker) => (
                  <ImageListItem
                    key={sticker.id}
                    onClick={() => handleSelectGalleryBackground(sticker.url)}
                    sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden' }}
                  >
                    <img
                      src={sticker.url}
                      alt={sticker.label ?? 'Sticker'}
                      loading="lazy"
                      style={{ borderRadius: 8, objectFit: 'cover', height: 100, width: '100%' }}
                    />
                  </ImageListItem>
                ))}
              </ImageList>
            </>
          ) : null}

          {bookBackgrounds.length === 0 && galleryStickers.length === 0 && !galleryStickersLoading && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No backgrounds yet — add some scenes to your book first!
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowGalleryPicker(false); setReplacingBackgroundIds([]) }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* AI Scene generation dialog */}
      <Dialog open={showAiDialog} onClose={() => { setShowAiDialog(false); setReplacingBackgroundIds([]) }} maxWidth="sm" fullWidth>
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
                          setShowDrawingCapture(true)
                        }}
                      >
                        Add a drawing
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
                              void addImageToPage(activePage.id, file, { cleanBackground: autoCleanSketch })
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
          <Button onClick={() => { setShowAiDialog(false); setReplacingBackgroundIds([]) }} disabled={aiLoading}>
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
        childName={childName}
        childProfile={isLincoln ? 'lincoln' : 'london'}
        onSelectSticker={handleSelectSticker}
      />

      {/* Finish dialog */}
      <Dialog open={showFinishDialog} onClose={() => setShowFinishDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{book.status === 'complete' ? 'Edit Cover' : 'Cover & Finish'}</DialogTitle>
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
            {/* Theme picker */}
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                Pick a theme (optional):
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {BOOK_THEMES.map((t) => (
                  <Chip
                    key={t.id}
                    label={`${t.emoji} ${t.label}`}
                    size="small"
                    variant={selectedTheme === t.id ? 'filled' : 'outlined'}
                    onClick={() => setSelectedTheme(selectedTheme === t.id ? undefined : t.id)}
                  />
                ))}
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary">
              You can always come back and edit!
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowFinishDialog(false)}>Keep working</Button>
          {book.status === 'complete' ? (
            <Button variant="contained" onClick={handleSaveCover}>
              Save cover
            </Button>
          ) : (
            <Button variant="contained" color="success" onClick={handleFinishBook}>
              Finish!
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Print settings dialog */}
      <PrintSettingsDialog
        open={showPrintSettings}
        onClose={() => setShowPrintSettings(false)}
        onPrint={(s) => { void handlePrint(s) }}
        hasSightWords={(book.sightWords?.length ?? 0) > 0}
      />

      {/* ── Background reimagine: floating chip while processing ── */}
      {bgReimagine.job?.status === 'processing' && (
        <Chip
          icon={<CircularProgress size={16} />}
          label="Reimagining..."
          size="small"
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 1000,
            bgcolor: 'background.paper',
            boxShadow: 2,
          }}
        />
      )}

      {/* ── Background reimagine: success notification ── */}
      {bgReimagine.job?.status === 'done' && !bgReimagine.showChoiceDialog && (
        <Paper
          elevation={4}
          onClick={bgReimagine.openChoiceDialog}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            left: 16,
            zIndex: 1000,
            p: 2,
            borderRadius: 2,
            cursor: 'pointer',
          }}
        >
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box
              component="img"
              src={bgReimagine.job.resultUrl}
              sx={{ width: 60, height: 60, borderRadius: 1, objectFit: 'cover' }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2">Drawing reimagined!</Typography>
              <Typography variant="caption" color="text.secondary">
                Tap to see what to do with it
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); bgReimagine.dismissNotification() }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      )}

      {/* ── Background reimagine: failure snackbar ── */}
      <Snackbar
        open={bgReimagine.job?.status === 'failed'}
        autoHideDuration={6000}
        onClose={bgReimagine.dismissError}
      >
        <Alert severity="warning" onClose={bgReimagine.dismissError} sx={{ width: '100%' }}>
          {bgReimagine.job?.error ?? 'Reimagine didn\'t work this time — try again or use a different drawing'}
        </Alert>
      </Snackbar>

      {/* ── Background reimagine: auto-dismiss notification ── */}
      <Snackbar
        open={!!bgReimagine.autoDismissedMessage}
        autoHideDuration={6000}
        onClose={() => bgReimagine.setAutoDismissedMessage(null)}
      >
        <Alert severity="info" onClose={() => bgReimagine.setAutoDismissedMessage(null)} sx={{ width: '100%' }}>
          {bgReimagine.autoDismissedMessage}
        </Alert>
      </Snackbar>

      {/* ── Background reimagine: choice dialog ── */}
      <ReimagineResultDialog
        open={bgReimagine.showChoiceDialog}
        job={bgReimagine.job}
        onClose={bgReimagine.dismissNotification}
        onReplaceBackground={bgReimagine.handleReplaceBackground}
        onAddAsSticker={bgReimagine.handleAddAsSticker}
        onSaveToGallery={() => { void bgReimagine.handleSaveToGallery() }}
        onDiscard={bgReimagine.handleDiscard}
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
