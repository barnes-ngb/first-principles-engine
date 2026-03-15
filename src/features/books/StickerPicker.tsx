import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { addDoc, getDocs, orderBy, query } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { Sticker } from '../../core/types/domain'
import { StickerCategory } from '../../core/types/enums'

interface StickerPickerProps {
  open: boolean
  onClose: () => void
  familyId: string
  onSelectSticker: (sticker: Sticker) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  animals: 'Animals',
  minecraft: 'Minecraft',
  nature: 'Nature',
  people: 'People',
  fantasy: 'Fantasy',
  vehicles: 'Vehicles',
  custom: 'Custom',
}

export default function StickerPicker({
  open,
  onClose,
  familyId,
  onSelectSticker,
}: StickerPickerProps) {
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [loadingStickers, setLoadingStickers] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createPrompt, setCreatePrompt] = useState('')
  const { generateImage, loading: generating } = useAI()

  // Load stickers from Firestore
  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    const load = async () => {
      setLoadingStickers(true)
      const q = query(stickerLibraryCollection(familyId), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      if (cancelled) return
      setStickers(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      setLoadingStickers(false)
    }
    void load()
    return () => { cancelled = true }
  }, [open, familyId])

  const filteredStickers = activeCategory
    ? stickers.filter((s) => s.category === activeCategory)
    : stickers

  const handleSelectSticker = useCallback(
    (sticker: Sticker) => {
      onSelectSticker(sticker)
      onClose()
    },
    [onSelectSticker, onClose],
  )

  const handleCreateSticker = useCallback(async () => {
    if (!createPrompt.trim()) return
    const result = await generateImage({
      familyId,
      prompt: createPrompt.trim(),
      style: 'book-sticker',
      size: '1024x1024',
    })
    if (!result) return

    const newSticker: Omit<Sticker, 'id'> = {
      url: result.url,
      storagePath: result.storagePath,
      label: createPrompt.trim(),
      category: StickerCategory.Custom,
      childId: null,
      prompt: createPrompt.trim(),
      createdAt: new Date().toISOString(),
    }
    const docRef = await addDoc(stickerLibraryCollection(familyId), newSticker as Sticker)
    const saved = { ...newSticker, id: docRef.id }
    setStickers((prev) => [saved, ...prev])
    setShowCreateDialog(false)
    setCreatePrompt('')
    onSelectSticker(saved)
    onClose()
  }, [createPrompt, familyId, generateImage, onSelectSticker, onClose])

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Stickers</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* Category chips */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label="All"
              variant={activeCategory === null ? 'filled' : 'outlined'}
              onClick={() => setActiveCategory(null)}
              size="small"
            />
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                variant={activeCategory === key ? 'filled' : 'outlined'}
                onClick={() => setActiveCategory(key)}
                size="small"
              />
            ))}
          </Box>

          {/* Sticker grid */}
          {loadingStickers ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={32} />
            </Stack>
          ) : filteredStickers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No stickers yet — make one!
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1,
              }}
            >
              {filteredStickers.map((sticker) => (
                <Box
                  key={sticker.id}
                  onClick={() => handleSelectSticker(sticker)}
                  sx={{
                    aspectRatio: '1',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                  }}
                >
                  <Box
                    component="img"
                    src={sticker.url}
                    alt={sticker.label}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {/* Make a sticker button */}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateDialog(true)}
            sx={{ minHeight: 48 }}
          >
            Make a sticker
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Create sticker dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Make a Sticker</DialogTitle>
        <DialogContent>
          <TextField
            label="Describe your sticker"
            placeholder="A cute dragon..."
            value={createPrompt}
            onChange={(e) => setCreatePrompt(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
            disabled={generating}
          />
          {generating && (
            <Stack alignItems="center" spacing={1} sx={{ mt: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Creating your sticker...
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)} disabled={generating}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => { void handleCreateSticker() }}
            disabled={!createPrompt.trim() || generating}
          >
            Create!
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
