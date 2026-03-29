import { useState, useCallback, useRef } from 'react'
import { addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useAI } from '../../core/ai/useAI'
import { cleanSketchBackground } from './cleanSketch'
import { StickerCategory } from '../../core/types/enums'
import type { StickerTag } from '../../core/types/books'

interface SketchScannerProps {
  open: boolean
  onClose: () => void
  familyId: string
  childId: string
  childName: string
  /** Called when user chooses "Add to Book" — passes the selected file */
  onAddToBook?: (file: File) => void
  /** Hide the "Add to Book" option (when opened outside book editor) */
  hideAddToBook?: boolean
}

const STICKER_CATEGORIES = [
  { value: StickerCategory.Animals, label: 'Animals' },
  { value: StickerCategory.Nature, label: 'Nature' },
  { value: StickerCategory.People, label: 'People' },
  { value: StickerCategory.Fantasy, label: 'Fantasy' },
  { value: StickerCategory.Vehicles, label: 'Vehicles' },
  { value: StickerCategory.Minecraft, label: 'Minecraft' },
  { value: StickerCategory.Custom, label: 'Custom' },
] as const

const TAG_OPTIONS: { value: StickerTag; label: string }[] = [
  { value: 'animal', label: 'Animal' },
  { value: 'nature', label: 'Nature' },
  { value: 'character', label: 'Character' },
  { value: 'object', label: 'Object' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'food', label: 'Food' },
  { value: 'minecraft', label: 'Minecraft' },
]

const CHECKERBOARD_BG =
  'repeating-conic-gradient(#e0e0e0 0% 25%, transparent 0% 50%) 50% / 16px 16px'

type Stage = 'capture' | 'cleaning' | 'preview' | 'saving' | 'done'
type PreviewTab = 'original' | 'cleaned' | 'reimagined'

async function saveAsSticker(
  familyId: string,
  childId: string,
  file: File,
  label: string,
  category: StickerCategory,
  tag: StickerTag,
  extraFields?: {
    originalUrl?: string
    cleanedUrl?: string
    reimaginedUrl?: string
    selectedVersion?: PreviewTab
  },
) {
  const path = `families/${familyId}/stickers/${Date.now()}_${file.name}`
  const storageRef = ref(storage, path)
  const snap = await uploadBytes(storageRef, file)
  const url = await getDownloadURL(snap.ref)

  await addDoc(stickerLibraryCollection(familyId), {
    url,
    storagePath: path,
    label,
    category,
    childId,
    createdAt: new Date().toISOString(),
    tags: [tag],
    childProfile: childId.includes('london')
      ? 'london'
      : childId.includes('lincoln')
        ? 'lincoln'
        : 'both',
    ...(extraFields?.originalUrl && { originalUrl: extraFields.originalUrl }),
    ...(extraFields?.cleanedUrl && { cleanedUrl: extraFields.cleanedUrl }),
    ...(extraFields?.reimaginedUrl && { reimaginedUrl: extraFields.reimaginedUrl }),
    ...(extraFields?.selectedVersion && { selectedVersion: extraFields.selectedVersion }),
  })
}

/** Upload a file to Firebase Storage and return { url, storagePath }. */
async function uploadToStorage(familyId: string, file: File, subfolder: string) {
  const ts = Date.now()
  const path = `families/${familyId}/${subfolder}/${ts}_${file.name}`
  const storageRef = ref(storage, path)
  const snap = await uploadBytes(storageRef, file)
  const url = await getDownloadURL(snap.ref)
  return { url, storagePath: path, ref: snap.ref }
}

export default function SketchScanner({
  open,
  onClose,
  familyId,
  childId,
  childName,
  onAddToBook,
  hideAddToBook,
}: SketchScannerProps) {
  const [stage, setStage] = useState<Stage>('capture')
  const [previewTab, setPreviewTab] = useState<PreviewTab>('cleaned')

  // File / URL state for all three versions
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [originalStoragePath, setOriginalStoragePath] = useState<string | null>(null)

  const [cleanedFile, setCleanedFile] = useState<File | null>(null)
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null)

  const [reimaginedUrl, setReimaginedUrl] = useState<string | null>(null)
  const [reimaginedFile, setReimaginedFile] = useState<File | null>(null)
  const [reimagining, setReimagining] = useState(false)
  const [reimagineError, setReimagineError] = useState<string | null>(null)

  // Sticker metadata
  const [label, setLabel] = useState(`${childName}'s drawing`)
  const [category, setCategory] = useState<StickerCategory>(StickerCategory.Custom)
  const [tag, setTag] = useState<StickerTag>('object')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { enhanceSketch } = useAI()

  const reset = useCallback(() => {
    setStage('capture')
    setPreviewTab('cleaned')
    setOriginalFile(null)
    setOriginalUrl(null)
    setOriginalStoragePath(null)
    setCleanedUrl(null)
    setCleanedFile(null)
    setReimaginedUrl(null)
    setReimaginedFile(null)
    setReimagining(false)
    setReimagineError(null)
    setLabel(`${childName}'s drawing`)
    setCategory(StickerCategory.Custom)
    setTag('object')
    setError(null)
  }, [childName])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setError(null)
      setOriginalFile(file)
      setOriginalUrl(URL.createObjectURL(file))
      setStage('cleaning')

      try {
        const cleaned = await cleanSketchBackground(file)
        setCleanedFile(cleaned)
        setCleanedUrl(URL.createObjectURL(cleaned))
        setStage('preview')
        setPreviewTab('cleaned')
      } catch {
        setError('Failed to process image. Please try again.')
        setStage('capture')
      }
    },
    [],
  )

  // Upload original to storage (lazy — only when reimagine is first requested)
  const ensureOriginalUploaded = useCallback(async (): Promise<string | null> => {
    if (originalStoragePath) return originalStoragePath
    if (!originalFile) return null
    try {
      const { storagePath } = await uploadToStorage(familyId, originalFile, 'sketches')
      setOriginalStoragePath(storagePath)
      return storagePath
    } catch {
      return null
    }
  }, [originalFile, originalStoragePath, familyId])

  const handleReimagine = useCallback(async () => {
    if (reimaginedUrl || reimagining) return

    setReimagining(true)
    setReimagineError(null)
    setPreviewTab('reimagined')

    try {
      const storagePath = await ensureOriginalUploaded()
      if (!storagePath) {
        setReimagineError('Failed to upload sketch. Please try again.')
        setReimagining(false)
        return
      }

      const result = await enhanceSketch({
        familyId,
        sketchStoragePath: storagePath,
        style: 'storybook',
      })

      if (result?.url) {
        setReimaginedUrl(result.url)
        // Fetch the image as a File so it can be saved as sticker / added to book
        try {
          const resp = await fetch(result.url)
          const blob = await resp.blob()
          setReimaginedFile(new File([blob], 'reimagined.png', { type: 'image/png' }))
        } catch {
          // URL is still valid for display even if we can't create a File
        }
      } else {
        setReimagineError('Enhancement returned no image. Please try again.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enhancement failed'
      setReimagineError(msg)
    } finally {
      setReimagining(false)
    }
  }, [reimaginedUrl, reimagining, ensureOriginalUploaded, enhanceSketch, familyId])

  /** Get the file for the currently selected preview tab. */
  const getActiveFile = useCallback((): File | null => {
    if (previewTab === 'original') return originalFile
    if (previewTab === 'reimagined') return reimaginedFile
    return cleanedFile
  }, [previewTab, originalFile, cleanedFile, reimaginedFile])

  const handleSaveAsSticker = useCallback(async () => {
    const file = getActiveFile()
    if (!file) return
    setStage('saving')
    setError(null)
    try {
      await saveAsSticker(familyId, childId, file, label, category, tag, {
        originalUrl: originalUrl ?? undefined,
        cleanedUrl: cleanedUrl ?? undefined,
        reimaginedUrl: reimaginedUrl ?? undefined,
        selectedVersion: previewTab,
      })
      setStage('done')
    } catch {
      setError('Failed to save sticker. Please try again.')
      setStage('preview')
    }
  }, [getActiveFile, familyId, childId, label, category, tag, originalUrl, cleanedUrl, reimaginedUrl, previewTab])

  const handleAddToBook = useCallback(() => {
    const file = getActiveFile()
    if (!file || !onAddToBook) return
    onAddToBook(file)
    handleClose()
  }, [getActiveFile, onAddToBook, handleClose])

  const showTransparencyBg = previewTab === 'cleaned' || previewTab === 'reimagined'

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Sketch Scanner</DialogTitle>

      <DialogContent>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Capture stage */}
        {stage === 'capture' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <Button
              variant="outlined"
              size="large"
              startIcon={<CameraAltIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ py: 2, px: 4, fontSize: '1.1rem' }}
            >
              Take Photo of Drawing
            </Button>
            <Typography variant="body2" color="text.secondary">
              Photograph a drawing on paper to turn it into a sticker
            </Typography>
          </Stack>
        )}

        {/* Cleaning stage */}
        {stage === 'cleaning' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography>Removing paper background...</Typography>
          </Stack>
        )}

        {/* Preview stage */}
        {(stage === 'preview' || stage === 'saving') && (
          <Stack spacing={2}>
            {/* Tab selector: Original | Cleaned | Reimagined */}
            <Tabs
              value={previewTab}
              onChange={(_, v: PreviewTab) => {
                setPreviewTab(v)
                if (v === 'reimagined' && !reimaginedUrl && !reimagining) {
                  void handleReimagine()
                }
              }}
              variant="fullWidth"
              sx={{ minHeight: 36 }}
            >
              <Tab label="Original" value="original" sx={{ minHeight: 36, py: 0.5 }} />
              <Tab label="Cleaned" value="cleaned" sx={{ minHeight: 36, py: 0.5 }} />
              <Tab
                label="Reimagined"
                value="reimagined"
                icon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                iconPosition="start"
                sx={{ minHeight: 36, py: 0.5 }}
              />
            </Tabs>

            {/* Image preview */}
            <Box
              sx={{
                width: '100%',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...(showTransparencyBg && { background: CHECKERBOARD_BG }),
              }}
            >
              {/* Original tab */}
              {previewTab === 'original' && originalUrl && (
                <Box
                  component="img"
                  src={originalUrl}
                  alt="Original drawing"
                  sx={{ width: '100%', display: 'block' }}
                />
              )}

              {/* Cleaned tab */}
              {previewTab === 'cleaned' && cleanedUrl && (
                <Box
                  component="img"
                  src={cleanedUrl}
                  alt="Cleaned drawing"
                  sx={{ width: '100%', display: 'block' }}
                />
              )}

              {/* Reimagined tab */}
              {previewTab === 'reimagined' && (
                <>
                  {reimagining && (
                    <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary">
                        Reimagining {childName}&apos;s drawing...
                      </Typography>
                    </Stack>
                  )}
                  {!reimagining && reimaginedUrl && (
                    <Box
                      component="img"
                      src={reimaginedUrl}
                      alt="AI-reimagined illustration"
                      sx={{ width: '100%', display: 'block' }}
                    />
                  )}
                  {!reimagining && reimagineError && (
                    <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
                      <Typography variant="body2" color="error">
                        {reimagineError}
                      </Typography>
                      <Button size="small" onClick={handleReimagine}>
                        Try Again
                      </Button>
                    </Stack>
                  )}
                </>
              )}
            </Box>

            {/* Label */}
            <TextField
              label="Sticker label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              fullWidth
              size="small"
            />

            {/* Category */}
            <TextField
              label="Category"
              select
              value={category}
              onChange={(e) => setCategory(e.target.value as StickerCategory)}
              fullWidth
              size="small"
            >
              {STICKER_CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>

            {/* Tag */}
            <TextField
              label="Tag"
              select
              value={tag}
              onChange={(e) => setTag(e.target.value as StickerTag)}
              fullWidth
              size="small"
            >
              {TAG_OPTIONS.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}

        {/* Done stage */}
        {stage === 'done' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <Typography variant="h6">Sticker saved!</Typography>
            <Typography variant="body2" color="text.secondary">
              You can find it in the sticker library.
            </Typography>
          </Stack>
        )}

        {/* Error */}
        {error && (
          <Typography color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {stage === 'capture' && (
          <Button onClick={handleClose}>Cancel</Button>
        )}

        {(stage === 'preview' || stage === 'saving') && (
          <>
            <Button onClick={reset} disabled={stage === 'saving'}>
              Retake
            </Button>
            <Box sx={{ flex: 1 }} />
            {!hideAddToBook && onAddToBook && (
              <Button
                variant="outlined"
                onClick={handleAddToBook}
                disabled={stage === 'saving' || (previewTab === 'reimagined' && reimagining)}
                sx={{ minHeight: 44 }}
              >
                Add to Book
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSaveAsSticker}
              disabled={stage === 'saving' || !label.trim() || (previewTab === 'reimagined' && reimagining)}
              sx={{ minHeight: 44 }}
            >
              {stage === 'saving' ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                'Save as Sticker'
              )}
            </Button>
          </>
        )}

        {stage === 'done' && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
