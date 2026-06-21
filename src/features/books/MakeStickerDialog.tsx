import { useCallback, useState } from 'react'
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
import Alert from '@mui/material/Alert'
import { addDoc, doc, setDoc } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { Sticker, StickerTag } from '../../core/types'
import { STICKER_TAG_LABELS } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import { STICKER_TAGS_ORDERED, suggestTagsFromPrompt } from './stickerTagging'

interface MakeStickerDialogProps {
  open: boolean
  onClose: () => void
  familyId: string
  /** Pre-selects the "For" target on the tagging step. */
  childProfile?: 'lincoln' | 'london'
  /** Fired after a sticker is generated/saved to the library. */
  onSaved?: (sticker: Sticker) => void
}

/**
 * Standalone "Make a Sticker" flow: describe → generate → preview → tag →
 * save to the sticker library. Unlike {@link StickerPicker}, this does not
 * require an open book — it reuses the same image-generation backend and the
 * same `stickerLibrary` write, then reports the saved sticker via `onSaved`.
 */
export default function MakeStickerDialog({
  open,
  onClose,
  familyId,
  childProfile,
  onSaved,
}: MakeStickerDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [generationPreview, setGenerationPreview] = useState<{ url: string; storagePath: string } | null>(null)
  const [generationError, setGenerationError] = useState(false)
  const [saving, setSaving] = useState(false)

  // Post-generation tagging state
  const [pendingSticker, setPendingSticker] = useState<Sticker | null>(null)
  const [pendingTags, setPendingTags] = useState<StickerTag[]>([])
  const [pendingProfile, setPendingProfile] = useState<'lincoln' | 'london' | 'both'>('both')

  const { generateImage, loading: generating, error: generateError } = useAI()

  const resetAll = useCallback(() => {
    setPrompt('')
    setGenerationPreview(null)
    setGenerationError(false)
    setPendingSticker(null)
    setPendingTags([])
    setPendingProfile('both')
  }, [])

  const handleClose = useCallback(() => {
    if (generating || saving) return
    resetAll()
    onClose()
  }, [generating, saving, resetAll, onClose])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return
    setGenerationError(false)
    const result = await generateImage({
      familyId,
      prompt: prompt.trim(),
      style: 'book-sticker',
      size: '1024x1024',
    })
    if (!result) {
      setGenerationError(true)
      return
    }
    setGenerationPreview({ url: result.url, storagePath: result.storagePath })
  }, [prompt, familyId, generateImage])

  const handleTryAgain = useCallback(() => {
    setGenerationPreview(null)
    setGenerationError(false)
    // Keep the prompt pre-filled so they can tweak it.
  }, [])

  const handleUseGenerated = useCallback(async () => {
    if (!generationPreview) return
    const suggestedTags = suggestTagsFromPrompt(prompt)
    const autoProfile: 'lincoln' | 'london' | 'both' = childProfile ?? 'both'

    const newSticker: Omit<Sticker, 'id'> = {
      url: generationPreview.url,
      storagePath: generationPreview.storagePath,
      label: prompt.trim(),
      category: StickerCategory.Custom,
      childId: null,
      prompt: prompt.trim(),
      createdAt: new Date().toISOString(),
      tags: suggestedTags,
      childProfile: autoProfile,
    }
    setSaving(true)
    try {
      const docRef = await addDoc(stickerLibraryCollection(familyId), newSticker as Sticker)
      const saved = { ...newSticker, id: docRef.id } as Sticker
      setGenerationPreview(null)
      // Move to the quick tagging step.
      setPendingSticker(saved)
      setPendingTags(suggestedTags)
      setPendingProfile(autoProfile)
      onSaved?.(saved)
    } finally {
      setSaving(false)
    }
  }, [generationPreview, prompt, childProfile, familyId, onSaved])

  const handleConfirmTagging = useCallback(async () => {
    if (!pendingSticker?.id) {
      handleClose()
      return
    }
    const updated: Sticker = { ...pendingSticker, tags: pendingTags, childProfile: pendingProfile }
    setSaving(true)
    try {
      await setDoc(doc(stickerLibraryCollection(familyId), pendingSticker.id), updated)
      onSaved?.(updated)
    } catch {
      // Tag save failed — the sticker is already in the library with suggested tags.
    } finally {
      setSaving(false)
    }
    resetAll()
    onClose()
  }, [pendingSticker, pendingTags, pendingProfile, familyId, onSaved, resetAll, onClose, handleClose])

  if (!open) return null

  // ── Post-generation tagging screen ────────────────────────────
  if (pendingSticker) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>What kind of sticker is this?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Box
                component="img"
                src={pendingSticker.url}
                alt={pendingSticker.label}
                sx={{
                  width: 120, height: 120, objectFit: 'contain', borderRadius: 2,
                  background: CHECKERBOARD_BG,
                }}
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags (tap to select):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STICKER_TAGS_ORDERED.map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant={pendingTags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() =>
                      setPendingTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                      )
                    }
                  />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                For:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(['lincoln', 'london', 'both'] as const).map((p) => (
                  <Chip
                    key={p}
                    label={p === 'both' ? 'Both' : p.charAt(0).toUpperCase() + p.slice(1)}
                    size="small"
                    variant={pendingProfile === p ? 'filled' : 'outlined'}
                    onClick={() => setPendingProfile(p)}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => { void handleConfirmTagging() }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Sticker!'}
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  // ── Generate / preview screen ─────────────────────────────────
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Make a Sticker</DialogTitle>
      <DialogContent>
        {generationPreview ? (
          <Stack spacing={2} alignItems="center" sx={{ pt: 1 }}>
            <Box
              component="img"
              src={generationPreview.url}
              alt="Generated sticker"
              sx={{
                width: 160, height: 160, objectFit: 'contain', borderRadius: 2,
                border: '1px solid', borderColor: 'divider',
                background: CHECKERBOARD_BG,
              }}
            />
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={handleTryAgain} disabled={saving}>
                Try Again
              </Button>
              <Button
                variant="contained"
                onClick={() => { void handleUseGenerated() }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Use This'}
              </Button>
            </Stack>
          </Stack>
        ) : generationError ? (
          <Stack spacing={2} alignItems="center" sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Couldn&apos;t make that sticker. Try describing it differently.
            </Typography>
            <Button variant="outlined" onClick={handleTryAgain}>
              Try Again
            </Button>
          </Stack>
        ) : (
          <>
            <TextField
              label="Describe your sticker"
              placeholder="A cute dragon..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleGenerate() }}
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
          </>
        )}
        {generateError && !generating && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {generateError.message.includes('blocked') || generateError.message.includes('safety')
              ? 'That description was blocked — try describing what it looks like instead of using a character name!'
              : `Something went wrong: ${generateError.message}`}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {!generationPreview && !generationError && (
          <>
            <Button onClick={handleClose} disabled={generating}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => { void handleGenerate() }}
              disabled={!prompt.trim() || generating}
            >
              Create!
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
