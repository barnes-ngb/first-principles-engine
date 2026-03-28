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
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { cleanSketchBackground } from './cleanSketch'
import { StickerCategory } from '../../core/types/enums'
import type { StickerTag } from '../../core/types/books'

interface SketchScannerProps {
  open: boolean
  onClose: () => void
  familyId: string
  childId: string
  childName: string
  /** Called when user chooses "Add to Book" — passes the cleaned file */
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

async function saveAsSticker(
  familyId: string,
  childId: string,
  file: File,
  label: string,
  category: StickerCategory,
  tag: StickerTag,
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
  })
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
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null)
  const [cleanedFile, setCleanedFile] = useState<File | null>(null)
  const [label, setLabel] = useState(`${childName}'s drawing`)
  const [category, setCategory] = useState<StickerCategory>(StickerCategory.Custom)
  const [tag, setTag] = useState<StickerTag>('object')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStage('capture')
    setOriginalUrl(null)
    setCleanedUrl(null)
    setCleanedFile(null)
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
      setOriginalUrl(URL.createObjectURL(file))
      setStage('cleaning')

      try {
        const cleaned = await cleanSketchBackground(file)
        setCleanedFile(cleaned)
        setCleanedUrl(URL.createObjectURL(cleaned))
        setStage('preview')
      } catch {
        setError('Failed to process image. Please try again.')
        setStage('capture')
      }
    },
    [],
  )

  const handleSaveAsSticker = useCallback(async () => {
    if (!cleanedFile) return
    setStage('saving')
    setError(null)
    try {
      await saveAsSticker(familyId, childId, cleanedFile, label, category, tag)
      setStage('done')
    } catch {
      setError('Failed to save sticker. Please try again.')
      setStage('preview')
    }
  }, [cleanedFile, familyId, childId, label, category, tag])

  const handleAddToBook = useCallback(() => {
    if (!cleanedFile || !onAddToBook) return
    onAddToBook(cleanedFile)
    handleClose()
  }, [cleanedFile, onAddToBook, handleClose])

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
            {/* Before / After */}
            <Stack direction="row" spacing={1}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Original
                </Typography>
                <Box
                  component="img"
                  src={originalUrl ?? undefined}
                  alt="Original drawing"
                  sx={{
                    width: '100%',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'block',
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Cleaned
                </Typography>
                <Box
                  sx={{
                    width: '100%',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    background: CHECKERBOARD_BG,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    component="img"
                    src={cleanedUrl ?? undefined}
                    alt="Cleaned drawing"
                    sx={{ width: '100%', display: 'block' }}
                  />
                </Box>
              </Box>
            </Stack>

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
                disabled={stage === 'saving'}
                sx={{ minHeight: 44 }}
              >
                Add to Book
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSaveAsSticker}
              disabled={stage === 'saving' || !label.trim()}
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
